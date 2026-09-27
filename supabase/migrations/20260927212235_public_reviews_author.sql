-- public_reviews: nome e avatar dell'autore (display_name, avatar_url), sempre senza user_id.
-- Ricreata perché cambia il nome di una colonna (author_name → display_name).
drop view public.public_reviews;

create view public.public_reviews
with (security_barrier = true)
as
select r.id, r.activity_id, r.rating, r.body, r.created_at, p.display_name, p.avatar_url
from public.reviews r
join public.activities a on a.id = r.activity_id and a.is_active
join public.profiles p on p.id = r.user_id;

revoke all on public.public_reviews from anon, authenticated;
grant select on public.public_reviews to anon, authenticated;
