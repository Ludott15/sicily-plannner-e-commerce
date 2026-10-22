-- Ruolo del contatore dei limiti di frequenza (passo 11.5, revisione B3). hit_rate_limit non è più
-- eseguibile da anon e authenticated: né il client Supabase né una sessione utente possono consumare
-- o azzerare i contatori. Il server la chiama con `set local role rate_limiter` (src/server/db/rate-limiter.ts).
-- La funzione è SECURITY DEFINER (owner postgres), quindi al ruolo non serve nessun grant sulla tabella
-- rate_limit_hits.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rate_limiter') then
    create role rate_limiter nologin;
  end if;
end
$$;

grant usage on schema public to rate_limiter;

revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to rate_limiter;

-- La connessione del server (ruolo postgres, DATABASE_URL) deve poter fare SET ROLE rate_limiter.
grant rate_limiter to postgres;
