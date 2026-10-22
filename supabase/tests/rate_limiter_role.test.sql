-- Ruolo rate_limiter (passo 11.5, revisione B3): hit_rate_limit è eseguibile solo dal ruolo rate_limiter
-- (e dal proprietario). Anonimo e utente autenticato non possono consumare né azzerare i contatori.
-- Nessuna dipendenza dal seed: il bucket ha il prefisso pgtap-rlr-.
begin;
\ir helpers/setup.psql
select * from no_plan();

select ok(
  not has_function_privilege('anon', 'public.hit_rate_limit(text, integer, integer)', 'execute'),
  'anon non può eseguire hit_rate_limit'
);
select ok(
  not has_function_privilege('authenticated', 'public.hit_rate_limit(text, integer, integer)', 'execute'),
  'authenticated non può eseguire hit_rate_limit'
);
select ok(
  has_function_privilege('rate_limiter', 'public.hit_rate_limit(text, integer, integer)', 'execute'),
  'rate_limiter può eseguire hit_rate_limit'
);
select ok(
  pg_has_role('postgres', 'rate_limiter', 'MEMBER'),
  'postgres (connessione del server) è membro di rate_limiter e può fare set role'
);

-- Chiamata reale come rate_limiter: il risultato va in una tabella temporanea (pgTAP non è visibile a quel
-- ruolo). Il primo hit è dentro il limite, il secondo lo supera.
create temp table rlr_result (k text primary key, v boolean);
grant all on rlr_result to rate_limiter;
set local role rate_limiter;
insert into rlr_result values ('primo', public.hit_rate_limit('pgtap-rlr-bucket-01', 1, 3600));
insert into rlr_result values ('secondo', public.hit_rate_limit('pgtap-rlr-bucket-01', 1, 3600));
reset role;
select is((select v from rlr_result where k = 'primo'), true, 'rate_limiter: primo hit consentito');
select is((select v from rlr_result where k = 'secondo'), false, 'rate_limiter: secondo hit oltre il limite');

-- Anonimo e utente autenticato: la funzione è negata (42501), come la tabella rate_limit_hits.
select tests.as_anon();
select throws_ok(
  $$select public.hit_rate_limit('pgtap-rlr-bucket-02', 3, 3600)$$,
  '42501', null, 'anonimo: hit_rate_limit negata'
);
reset role;

select tests.create_user('rlr_alice');
select tests.authenticate_as('rlr_alice');
select throws_ok(
  $$select public.hit_rate_limit('pgtap-rlr-bucket-03', 3, 3600)$$,
  '42501', null, 'utente autenticato: hit_rate_limit negata'
);
reset role;

select * from finish();
rollback;
