-- Consigli generali dell'itinerario pronto (itineraries.tips): letti da tutti sui template, scritti
-- solo dall'import dei contenuti (server, con dbAdmin), mai dal client.
-- Ruoli: anonimo, proprietario (alice), altro utente (bob), admin.
begin;
\ir helpers/setup.psql
select * from no_plan();

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('admin', true);

insert into public.itineraries (id, owner_id, title, slug, is_template, days, tips)
values ('cccccccc-0000-0000-0000-000000000031', null, 'Test consigli', 'test-consigli-itinerario', true, 1,
  array['Primo consiglio di prova', 'Secondo consiglio di prova']);

-- Anonimo: il template e i suoi consigli si leggono.
select tests.as_anon();
select results_eq(
  $$select tips from public.itineraries where slug = 'test-consigli-itinerario'$$,
  $$values (array['Primo consiglio di prova', 'Secondo consiglio di prova']::text[])$$,
  'anonimo: legge i consigli del template'
);
select throws_ok(
  $$update public.itineraries set tips = '{}' where slug = 'test-consigli-itinerario'$$,
  '42501', null, 'anonimo: non modifica i consigli'
);

-- Utente autenticato: legge, ma non scrive i consigli di un template.
select tests.authenticate_as('alice');
select results_eq(
  $$select cardinality(tips) from public.itineraries where slug = 'test-consigli-itinerario'$$,
  $$values (2)$$,
  'proprietario: legge i consigli del template'
);
select throws_ok(
  $$update public.itineraries set tips = array['Finto'] where slug = 'test-consigli-itinerario'$$,
  '42501', null, 'proprietario: non modifica i consigli del template'
);
select throws_ok(
  format($$insert into public.itineraries (owner_id, title, days, tips) values (%L, 'Con consigli', 1, array['Finto'])$$, tests.uid('alice')),
  '42501', null, 'proprietario: non inserisce consigli'
);

-- Admin: il client non scrive i consigli nemmeno come admin (lo fa il server con dbAdmin).
select tests.authenticate_as('admin');
select throws_ok(
  $$update public.itineraries set tips = array['Finto'] where slug = 'test-consigli-itinerario'$$,
  '42501', null, 'admin: il client non scrive i consigli'
);

select * from finish();
rollback;
