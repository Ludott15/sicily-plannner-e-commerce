-- Passo 4.3, gruppi: preferenze aggregate del gruppo (docs/spec.md, "Gruppi, inviti e voti").
-- Funzione SECURITY DEFINER che restituisce solo valori aggregati: nessun id utente, nessun valore
-- per membro. L'aggregazione avviene qui perché una funzione per membro sarebbe chiamabile via
-- PostgREST da qualunque membro.
-- Ordine dei controlli: autenticazione (42501), ospite (guest_not_allowed), membro (not_group_member).
-- Il search_path è fissato; execute solo per authenticated.
--
-- Soglia di privacy k = 3 (GROUP_PRIVACY_MIN in src/lib/group-profile.ts): con meno di 3 membri che
--   hanno completato l'onboarding (withPreferences) la risposta è "private": true, pesi {}, mobilità
--   ridotta false, diete [], auto e budget null, ritmo balanced: con due membri anche il valore più
--   restrittivo rivelerebbe la risposta dell'altro.
--
-- Regole:
--   pesi: per ogni interesse, media dei pesi effettivi clamp(explicit + implicit, 0, 5) dei membri
--     che hanno completato l'onboarding (profiles.onboarding_completed_at); un membro senza riga vale 0.
--     Un interesse a cui almeno un membro ha dato 5 (explicit = 5) ha peso minimo 2. Solo pesi > 0,
--     arrotondati a 2 decimali.
--   auto (user_constraints.car_access): il più restrittivo tra i membri che hanno risposto, con
--     l'ordine none < rental < own (none = non ha l'auto, own = ce l'ha sempre). Null se nessuno ha risposto.
--   mobilità ridotta: vera se almeno un membro la indica.
--   diete: unione delle diete di tutti i membri, in ordine alfabetico.
--   budget: il minimo dei budget giornalieri indicati; null se nessuno ne ha indicato uno.
--   ritmo: il più lento tra i membri che hanno completato l'onboarding (relaxed < balanced < intense);
--     balanced se nessuno ha completato.
--   Vincoli (auto, mobilità, diete, budget): letti da tutti i membri, anche da chi non ha completato
--     l'onboarding, perché un vincolo di sicurezza o di accessibilità non si perde per una domanda saltata.
--     Con nessun membro che ha completato: pesi {} e ritmo balanced.
create or replace function public.group_preferences(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_members integer;
  v_with integer;
  v_private boolean;
  v_weights jsonb;
  v_car text;
  v_reduced boolean;
  v_diets jsonb;
  v_budget integer;
  v_pace text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_uid
  ) then
    raise exception 'not_group_member' using errcode = 'P0001';
  end if;

  select count(*)::int into v_members
  from public.group_members
  where group_id = p_group_id;

  select count(*)::int into v_with
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and p.onboarding_completed_at is not null;

  -- Soglia di privacy k = 3 (vedi intestazione): sotto, nessun gusto e nessun dato sensibile.
  v_private := v_with < 3;

  -- Pesi: somma dei pesi effettivi diviso il numero dei membri che hanno completato. Le righe
  -- ci sono solo se v_with > 0 (il join con i completati le esclude altrimenti).
  select coalesce(jsonb_object_agg(w.interest_key, w.weight), '{}'::jsonb) into v_weights
  from (
    select
      pw.interest_key,
      round((
        case
          when bool_or(pw.explicit = 5) then greatest(sum(eff.value) / v_with, 2::float8)
          else sum(eff.value) / v_with
        end
      )::numeric, 2)::float8 as weight
    from public.preference_weights pw
    join public.group_members gm
      on gm.user_id = pw.user_id and gm.group_id = p_group_id
    join public.profiles p
      on p.id = gm.user_id and p.onboarding_completed_at is not null
    cross join lateral (
      select greatest(0::float8, least(5::float8, (pw.explicit + pw.implicit)::float8)) as value
    ) eff
    group by pw.interest_key
  ) w
  where w.weight > 0;

  if v_private then
    v_weights := '{}'::jsonb;
  end if;

  -- Auto: il più restrittivo tra chi ha risposto (none, poi rental, poi own).
  select uc.car_access::text into v_car
  from public.group_members gm
  join public.user_constraints uc on uc.user_id = gm.user_id
  where gm.group_id = p_group_id
    and uc.car_access is not null
  order by case uc.car_access when 'none' then 0 when 'rental' then 1 else 2 end
  limit 1;

  select coalesce(bool_or(uc.reduced_mobility), false) into v_reduced
  from public.group_members gm
  join public.user_constraints uc on uc.user_id = gm.user_id
  where gm.group_id = p_group_id;

  select coalesce(jsonb_agg(d.diet order by d.diet), '[]'::jsonb) into v_diets
  from (
    select distinct unnest(uc.diet) as diet
    from public.group_members gm
    join public.user_constraints uc on uc.user_id = gm.user_id
    where gm.group_id = p_group_id
  ) d;

  if v_private then
    v_reduced := false;
    v_diets := '[]'::jsonb;
  end if;

  select min(uc.budget_per_day_eur) into v_budget
  from public.group_members gm
  join public.user_constraints uc on uc.user_id = gm.user_id
  where gm.group_id = p_group_id;

  -- Ritmo: il più lento tra chi ha completato l'onboarding.
  select p.pace::text into v_pace
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and p.onboarding_completed_at is not null
    and p.pace is not null
  order by case p.pace when 'relaxed' then 0 when 'balanced' then 1 else 2 end
  limit 1;

  -- Sotto la soglia nemmeno auto, budget e ritmo: con due membri il più restrittivo coincide con il
  -- valore dell'altro quando è diverso dal proprio, quindi rivelerebbe una risposta individuale.
  if v_private then
    v_car := null;
    v_budget := null;
    v_pace := null;
  end if;

  return jsonb_build_object(
    'members', v_members,
    'withPreferences', v_with,
    'private', v_private,
    'weights', v_weights,
    'constraints', jsonb_build_object(
      'car', v_car,
      'reducedMobility', coalesce(v_reduced, false),
      'diets', v_diets,
      'budgetPerDayEur', v_budget,
      'pace', coalesce(v_pace, 'balanced')
    )
  );
end;
$$;

revoke all on function public.group_preferences(uuid) from public, anon;
grant execute on function public.group_preferences(uuid) to authenticated;
