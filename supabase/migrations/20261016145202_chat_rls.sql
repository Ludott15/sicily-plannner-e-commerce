-- Chatbot (passo 9.1): proposte di modifica, scrittura dei messaggi e conteggio giornaliero.
-- Tabelle chat_sessions e chat_messages: migrazione 20260927212454_shop_ai_audit.sql (RLS in
-- 20260927212459_shop_ai_audit_rls.sql). Qui: chat_proposals e le funzioni SECURITY DEFINER che
-- il server chiama in una transazione dbAsUser (ruolo authenticated, auth.uid() dell'utente).

alter table public.chat_proposals enable row level security;
revoke all on table public.chat_proposals from anon, authenticated;

-- Lettura al proprietario della sessione. Scritture solo dalle funzioni qui sotto.
grant select on table public.chat_proposals to authenticated;

create policy chat_proposals_select_own on public.chat_proposals
  for select to authenticated
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id and s.user_id = (select auth.uid())
  ));

----------------------------------------------------------------------------
-- APPEND_CHAT_MESSAGE: scrive un messaggio nella sessione dell'utente. Restituisce l'id.
----------------------------------------------------------------------------
create or replace function public.append_chat_message(
  p_session uuid,
  p_role text,
  p_content jsonb,
  p_tool_calls jsonb,
  p_input_tokens int,
  p_output_tokens int
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_sessions s
    where s.id = p_session and s.user_id = v_user
  ) then
    raise exception 'chat_session_not_found' using errcode = 'P0001';
  end if;

  -- Limite di dimensione: un messaggio (testo e strumenti) non supera 64 KB.
  if octet_length(p_content::text) > 65536 or coalesce(octet_length(p_tool_calls::text), 0) > 65536 then
    raise exception 'chat_message_too_large' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (session_id, role, content, tool_calls, input_tokens, output_tokens)
  values (p_session, p_role, p_content, p_tool_calls, p_input_tokens, p_output_tokens)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.append_chat_message(uuid, text, jsonb, jsonb, int, int) from public, anon;
grant execute on function public.append_chat_message(uuid, text, jsonb, jsonb, int, int) to authenticated;

----------------------------------------------------------------------------
-- CHAT_MESSAGES_TODAY: messaggi dell'utente da mezzanotte di Europe/Rome (per "rimasti oggi").
----------------------------------------------------------------------------
create or replace function public.chat_messages_today()
returns int
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_count int;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select count(*)::int into v_count
  from public.chat_messages m
  join public.chat_sessions s on s.id = m.session_id
  where s.user_id = v_user
    and m.role = 'user'
    and m.created_at >= (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome');

  return v_count;
end;
$$;

revoke all on function public.chat_messages_today() from public, anon;
grant execute on function public.chat_messages_today() to authenticated;

----------------------------------------------------------------------------
-- CREATE_CHAT_PROPOSAL: il server propone una modifica legata al messaggio dell'assistente.
----------------------------------------------------------------------------
create or replace function public.create_chat_proposal(
  p_session uuid,
  p_message uuid,
  p_kind text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_sessions s
    where s.id = p_session and s.user_id = v_user
  ) then
    raise exception 'chat_session_not_found' using errcode = 'P0001';
  end if;

  -- Il messaggio a cui si lega la proposta è una risposta dell'assistente della stessa sessione.
  if not exists (
    select 1 from public.chat_messages m
    where m.id = p_message and m.session_id = p_session and m.role = 'assistant'
  ) then
    raise exception 'chat_message_not_found' using errcode = 'P0001';
  end if;

  -- Limite di dimensione: il payload di una proposta non supera 16 KB.
  if coalesce(octet_length(p_payload::text), 0) > 16384 then
    raise exception 'chat_proposal_too_large' using errcode = 'P0001';
  end if;

  insert into public.chat_proposals (session_id, message_id, kind, payload)
  values (p_session, p_message, p_kind, p_payload)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_chat_proposal(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.create_chat_proposal(uuid, uuid, text, jsonb) to authenticated;

----------------------------------------------------------------------------
-- DECIDE_CHAT_PROPOSAL: pending -> accepted o rejected, una volta sola.
-- La stessa transazione del server applica la modifica: se l'applicazione fallisce, la decisione
-- si annulla insieme a lei.
----------------------------------------------------------------------------
create or replace function public.decide_chat_proposal(p_id uuid, p_status text)
returns public.chat_proposals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.chat_proposals;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_status not in ('accepted', 'rejected') then
    raise exception 'invalid_chat_status' using errcode = 'P0001';
  end if;

  select p.* into v_row
  from public.chat_proposals p
  join public.chat_sessions s on s.id = p.session_id
  where p.id = p_id and s.user_id = v_user
  for update of p;

  if not found then
    raise exception 'chat_proposal_not_found' using errcode = 'P0001';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'chat_proposal_decided' using errcode = 'P0001';
  end if;

  update public.chat_proposals
  set status = p_status, decided_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.decide_chat_proposal(uuid, text) from public, anon;
grant execute on function public.decide_chat_proposal(uuid, text) to authenticated;
