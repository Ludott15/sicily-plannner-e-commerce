begin;
select plan(8);

-- Due utenti: alice (user) e bob (admin). Il trigger crea i profili.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name": "Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{}');

update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice',
  'il trigger crea il profilo con il nome del provider'
);

-- Anonimo: nessun accesso.
set local role anon;
select throws_ok(
  'select * from public.profiles',
  '42501',
  null,
  'anon non può leggere profiles'
);

-- Alice autenticata.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  'select id from public.profiles',
  $$values ('11111111-1111-1111-1111-111111111111'::uuid)$$,
  'alice vede solo il proprio profilo'
);

update public.profiles set display_name = 'Alice B' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice B',
  'alice modifica il proprio profilo'
);

update public.profiles set display_name = 'hack' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'alice non modifica il profilo di bob'
);

set local role authenticated;
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'alice non può promuoversi admin'
);

select throws_ok(
  $$insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501',
  null,
  'il client non inserisce profili'
);

-- Bob admin vede tutti i profili.
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is(
  (select count(*) from public.profiles
   where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'))::int,
  2,
  'admin vede tutti i profili'
);

select * from finish();
rollback;
