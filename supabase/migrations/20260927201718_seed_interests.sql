-- Vocabolario iniziale degli interessi (docs/spec.md, "Motore di personalizzazione").
-- Si estende da admin senza migrazioni.
insert into public.interests (key, label_it, label_en, sort) values
  ('sea', 'Mare', 'Sea', 10),
  ('food_wine', 'Cibo e vino', 'Food and wine', 20),
  ('history_archaeology', 'Storia e archeologia', 'History and archaeology', 30),
  ('nature_hiking', 'Natura ed escursioni', 'Nature and hiking', 40),
  ('villages', 'Borghi', 'Villages', 50),
  ('art', 'Arte', 'Art', 60),
  ('nightlife', 'Vita notturna', 'Nightlife', 70),
  ('local_experiences', 'Esperienze locali', 'Local experiences', 80),
  ('relax', 'Relax', 'Relax', 90)
on conflict (key) do nothing;
