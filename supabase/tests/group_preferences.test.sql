-- Gruppi, passo 4.3: group_preferences. Solo valori aggregati, regole di media, minimo 2 con un 5,
-- vincoli più restrittivi, onboarding incompleto, ex membri, anonimo, ospiti, non membri, admin.
-- Dati creati nella transazione del test: nessuna dipendenza dal seed o dal database locale.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('dave');
select tests.create_user('carol');
select tests.create_user('ex');
select tests.create_user('outsider');
select tests.create_user('admin', true);
select tests.create_guest('guest');

create function tests.gid() returns uuid language sql stable
as $$ select current_setting('tests.gid')::uuid $$;

-- Gruppo di alice (owner), creato come lei.
select tests.authenticate_as('alice');
select set_config('tests.gid', public.create_group('Gruppo passo 4.3', null)::text, true);
reset role;

-- Membri: bob, dave, carol (non ha completato l'onboarding) ed ex (uscito dopo, come postgres).
insert into public.group_members (group_id, user_id, role) values
  (tests.gid(), tests.uid('bob'), 'member'),
  (tests.gid(), tests.uid('dave'), 'member'),
  (tests.gid(), tests.uid('carol'), 'member'),
  (tests.gid(), tests.uid('ex'), 'member');
delete from public.group_members where group_id = tests.gid() and user_id = tests.uid('ex');

-- Onboarding completato: alice, bob, dave (ex ha completato ma non è più nel gruppo).
update public.profiles set pace = 'relaxed', onboarding_completed_at = now() where id = tests.uid('alice');
update public.profiles set pace = 'balanced', onboarding_completed_at = now() where id = tests.uid('bob');
update public.profiles set pace = 'intense', onboarding_completed_at = now() where id = tests.uid('dave');
update public.profiles set pace = 'intense', onboarding_completed_at = now() where id = tests.uid('ex');

-- Pesi espliciti. carol (non completo) e ex (fuori dal gruppo) non devono comparire.
insert into public.preference_weights (user_id, interest_key, explicit) values
  (tests.uid('alice'), 'sea', 5),
  (tests.uid('alice'), 'food_wine', 1),
  (tests.uid('alice'), 'art', 5),
  (tests.uid('bob'), 'sea', 1),
  (tests.uid('bob'), 'history_archaeology', 3),
  (tests.uid('bob'), 'food_wine', 3),
  (tests.uid('dave'), 'nature_hiking', 4),
  (tests.uid('carol'), 'villages', 5),
  (tests.uid('ex'), 'relax', 5);

-- Vincoli. bob ha mobilità ridotta e dieta con consenso; carol (non completo) ha l'auto "none" e
-- il budget più basso; ex, fuori dal gruppo, non deve contare.
insert into public.user_constraints (user_id, budget_per_day_eur, car_access) values
  (tests.uid('alice'), 90, 'own'),
  (tests.uid('carol'), 40, 'none');
insert into public.user_constraints (user_id, budget_per_day_eur, car_access, reduced_mobility, diet, sensitive_consent_at) values
  (tests.uid('bob'), 60, 'rental', true, '{vegetarian}', now()),
  (tests.uid('dave'), 120, 'own', false, '{gluten_free}', now()),
  (tests.uid('ex'), 10, 'none', false, '{vegan}', now());

----------------------------------------------------------------------------
-- MEMBRO: ottiene l'aggregato con le regole
----------------------------------------------------------------------------
select tests.authenticate_as('alice');

select is((public.group_preferences(tests.gid()) ->> 'members')::int, 4, 'membro: members conta i membri attuali (ex escluso)');
select is((public.group_preferences(tests.gid()) ->> 'withPreferences')::int, 3, 'withPreferences: esclude carol, che non ha completato');

select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.group_preferences(tests.gid())) as k),
  array['constraints', 'members', 'private', 'weights', 'withPreferences'],
  'risposta: solo le chiavi aggregate di primo livello'
);
select is((public.group_preferences(tests.gid()) ->> 'private')::boolean, false, 'soglia k=3: tre membri con preferenze non sono privati');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.group_preferences(tests.gid()) -> 'constraints') as k),
  array['budgetPerDayEur', 'car', 'diets', 'pace', 'reducedMobility'],
  'risposta: solo le chiavi aggregate dei vincoli'
);
select ok(
  not exists (
    select 1
    from unnest(array[tests.uid('alice'), tests.uid('bob'), tests.uid('dave'), tests.uid('carol'), tests.uid('ex')]) as u(id)
    where public.group_preferences(tests.gid())::text like '%' || u.id::text || '%'
  ),
  'risposta: nessun id utente, nemmeno di chi è fuori dal gruppo'
);

-- Pesi: media sui tre membri completati (alice, bob, dave); un 5 porta l'interesse almeno a 2.
select is((public.group_preferences(tests.gid()) -> 'weights' ->> 'sea')::float8, 2::float8, 'pesi: media (5 + 1 + 0) / 3 = 2, uguale al minimo di un interesse con un 5');
select is((public.group_preferences(tests.gid()) -> 'weights' ->> 'art')::float8, 2::float8, 'pesi: un solo 5 su tre membri porta il peso a 2 (media 1,67)');
select is((public.group_preferences(tests.gid()) -> 'weights' ->> 'food_wine')::float8, 1.33::float8, 'pesi: media senza minimo, arrotondata a due decimali (1,33)');
select is((public.group_preferences(tests.gid()) -> 'weights' ->> 'history_archaeology')::float8, 1::float8, 'pesi: media con un membro senza riga (3 su 3 = 1)');
select is((public.group_preferences(tests.gid()) -> 'weights' ->> 'nature_hiking')::float8, 1.33::float8, 'pesi: un solo membro con 4 pesa 4/3 sul gruppo');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.group_preferences(tests.gid()) -> 'weights') as k),
  array['art', 'food_wine', 'history_archaeology', 'nature_hiking', 'sea'],
  'pesi: nessun interesse di carol (onboarding incompleto) né di ex (fuori dal gruppo)'
);

-- Vincoli: il più restrittivo, unione, minimo, ritmo più lento.
select is(public.group_preferences(tests.gid()) -> 'constraints' ->> 'car', 'none', 'vincoli: auto, vince chi non ha l''auto (carol)');
select is((public.group_preferences(tests.gid()) -> 'constraints' ->> 'reducedMobility')::boolean, true, 'vincoli: mobilità ridotta se almeno un membro');
select is(public.group_preferences(tests.gid()) -> 'constraints' -> 'diets', '["gluten_free","vegetarian"]'::jsonb, 'vincoli: unione delle diete dei membri, senza quella di ex');
select is((public.group_preferences(tests.gid()) -> 'constraints' ->> 'budgetPerDayEur')::int, 40, 'vincoli: budget minimo (carol), senza quello di ex');
select is(public.group_preferences(tests.gid()) -> 'constraints' ->> 'pace', 'relaxed', 'vincoli: ritmo più lento tra i completati');

----------------------------------------------------------------------------
-- SOTTO LA SOGLIA (due membri con preferenze): nessun gusto, nessun dato sensibile; logistica aggregata
----------------------------------------------------------------------------
select tests.authenticate_as('alice');
select set_config('tests.gid3', public.create_group('Gruppo in due', null)::text, true);
reset role;
insert into public.group_members (group_id, user_id, role)
values (current_setting('tests.gid3')::uuid, tests.uid('bob'), 'member');

select tests.authenticate_as('alice');
select is((public.group_preferences(current_setting('tests.gid3')::uuid) ->> 'withPreferences')::int, 2, 'due membri: withPreferences 2');
select is((public.group_preferences(current_setting('tests.gid3')::uuid) ->> 'private')::boolean, true, 'due membri con preferenze: private');
select is(public.group_preferences(current_setting('tests.gid3')::uuid) -> 'weights', '{}'::jsonb, 'due membri: nessun peso');
select is(
  (public.group_preferences(current_setting('tests.gid3')::uuid) -> 'constraints' ->> 'reducedMobility')::boolean,
  false,
  'due membri: la mobilità ridotta di bob non si rivela'
);
select is(
  public.group_preferences(current_setting('tests.gid3')::uuid) -> 'constraints' -> 'diets',
  '[]'::jsonb,
  'due membri: la dieta di bob non si rivela'
);
select is(public.group_preferences(current_setting('tests.gid3')::uuid) -> 'constraints' -> 'car', 'null'::jsonb, 'due membri: l''auto di bob non si rivela');
select is(public.group_preferences(current_setting('tests.gid3')::uuid) -> 'constraints' -> 'budgetPerDayEur', 'null'::jsonb, 'due membri: il budget di bob non si rivela');
select is(public.group_preferences(current_setting('tests.gid3')::uuid) -> 'constraints' ->> 'pace', 'balanced', 'due membri: il ritmo di bob non si rivela');

----------------------------------------------------------------------------
-- MEMBRO CHE NON HA COMPLETATO: vede il gruppo come gli altri, con gusti neutri
----------------------------------------------------------------------------
select tests.authenticate_as('carol');
select is((public.group_preferences(tests.gid()) ->> 'withPreferences')::int, 3, 'carol vede lo stesso aggregato (non ha completato)');

-- Gruppo senza nessun membro che ha completato: pesi vuoti, ritmo equilibrato.
select tests.authenticate_as('carol');
select set_config('tests.gid2', public.create_group('Gruppo senza gusti', null)::text, true);
reset role;
select tests.authenticate_as('carol');
select is((public.group_preferences(current_setting('tests.gid2')::uuid) ->> 'withPreferences')::int, 0, 'nessun completato: withPreferences 0');
select is(public.group_preferences(current_setting('tests.gid2')::uuid) -> 'weights', '{}'::jsonb, 'nessun completato: pesi vuoti');
select is(public.group_preferences(current_setting('tests.gid2')::uuid) -> 'constraints' ->> 'pace', 'balanced', 'nessun completato: ritmo equilibrato');

----------------------------------------------------------------------------
-- NEGATI: ex membro, non membro, admin non membro, ospite, anonimo
----------------------------------------------------------------------------
select tests.authenticate_as('ex');
select throws_ok(
  format($$select public.group_preferences(%L)$$, current_setting('tests.gid')),
  'P0001', 'not_group_member', 'ex membro: nessuna preferenza del gruppo'
);

select tests.authenticate_as('outsider');
select throws_ok(
  format($$select public.group_preferences(%L)$$, current_setting('tests.gid')),
  'P0001', 'not_group_member', 'non membro: nessuna preferenza del gruppo'
);

select tests.authenticate_as('admin');
select throws_ok(
  format($$select public.group_preferences(%L)$$, current_setting('tests.gid')),
  'P0001', 'not_group_member', 'admin non membro: nessuna preferenza del gruppo (la RLS admin non vale qui)'
);

select tests.authenticate_as('guest');
select throws_ok(
  format($$select public.group_preferences(%L)$$, current_setting('tests.gid')),
  'P0001', 'guest_not_allowed', 'ospite: nessuna preferenza del gruppo'
);

select tests.as_anon();
select throws_ok(
  format($$select public.group_preferences(%L)$$, current_setting('tests.gid')),
  '42501', null, 'anonimo: la funzione non è eseguibile'
);

reset role;
select is(
  has_function_privilege('anon', 'public.group_preferences(uuid)', 'EXECUTE'),
  false,
  'anon non esegue group_preferences'
);
select is(
  has_function_privilege('authenticated', 'public.group_preferences(uuid)', 'EXECUTE'),
  true,
  'authenticated esegue group_preferences'
);

select * from finish();
rollback;
