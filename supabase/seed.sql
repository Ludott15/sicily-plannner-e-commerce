-- =============================================================================
-- DATI DEMO — SOLO PER SVILUPPO LOCALE E CI. NON CARICARE IN PRODUZIONE.
--
-- Eseguito da `supabase db reset` (locale e CI). `supabase db push` non esegue il seed:
-- non usare mai `--include-seed` verso il progetto di produzione.
-- Tutti gli slug hanno il prefisso "demo-"; descrizioni, prezzi e valutazioni sono
-- indicativi e non verificati. Il catalogo reale si inserisce dall'admin.
-- =============================================================================

-- Luoghi
insert into public.places (slug, name, province, lat, lng, description) values
  ('demo-palermo', 'Palermo', 'PA', 38.1157, 13.3615, '[DEMO] Capoluogo, mercati storici e architettura arabo-normanna.'),
  ('demo-monreale', 'Monreale', 'PA', 38.0817, 13.2893, '[DEMO] Borgo sopra Palermo con il duomo dei mosaici.'),
  ('demo-cefalu', 'Cefalù', 'PA', 38.0386, 14.0223, '[DEMO] Borgo sul mare con la cattedrale normanna.'),
  ('demo-catania', 'Catania', 'CT', 37.5079, 15.0830, '[DEMO] Città barocca ai piedi dell''Etna.'),
  ('demo-etna-sud', 'Etna versante sud', 'CT', 37.6997, 14.9989, '[DEMO] Crateri Silvestri e partenza delle escursioni.'),
  ('demo-bronte', 'Bronte', 'CT', 37.7875, 14.8313, '[DEMO] Paese del pistacchio.'),
  ('demo-taormina', 'Taormina', 'ME', 37.8526, 15.2866, '[DEMO] Teatro antico affacciato sul mare.'),
  ('demo-ortigia', 'Ortigia, Siracusa', 'SR', 37.0597, 15.2936, '[DEMO] Centro storico di Siracusa su un''isola.'),
  ('demo-noto', 'Noto', 'SR', 36.8906, 15.0697, '[DEMO] Capitale del barocco.'),
  ('demo-ragusa-ibla', 'Ragusa Ibla', 'RG', 36.9269, 14.7419, '[DEMO] Borgo barocco sulla collina.'),
  ('demo-agrigento', 'Agrigento', 'AG', 37.2900, 13.5880, '[DEMO] Valle dei Templi.'),
  ('demo-scala-dei-turchi', 'Scala dei Turchi', 'AG', 37.2906, 13.4739, '[DEMO] Scogliera di marna bianca.'),
  ('demo-trapani', 'Trapani', 'TP', 38.0176, 12.5365, '[DEMO] Saline e porto per le Egadi.'),
  ('demo-erice', 'Erice', 'TP', 38.0371, 12.5864, '[DEMO] Borgo medievale in cima al monte.'),
  ('demo-san-vito', 'San Vito Lo Capo', 'TP', 38.1742, 12.7352, '[DEMO] Spiaggia e riserva dello Zingaro.'),
  ('demo-piazza-armerina', 'Piazza Armerina', 'EN', 37.3663, 14.3336, '[DEMO] Villa Romana del Casale.');

-- Attività: create inattive, poi taggate, poi attivate (regola activity_without_tags).
insert into public.activities
  (slug, place_id, title, description, duration_min, price_from_eur, requires_car, accessible, season_months, partner, rating, is_active)
select v.slug, p.id, v.title, v.description, v.duration_min, v.price, v.requires_car, v.accessible, v.months, 'internal', v.rating, false
from (values
  ('demo-mercato-ballaro', 'demo-palermo', 'Street food al mercato di Ballarò', '[DEMO] Tour guidato tra panelle, arancine e sfincione.', 150, 35.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[], 4.8),
  ('demo-palazzo-normanni', 'demo-palermo', 'Palazzo dei Normanni e Cappella Palatina', '[DEMO] Visita con mosaici bizantini.', 120, 19.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-teatro-massimo', 'demo-palermo', 'Visita al Teatro Massimo', '[DEMO] Visita guidata al teatro lirico.', 45, 12.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-palermo-notte', 'demo-palermo', 'Aperitivo e vita notturna alla Vucciria', '[DEMO] Serata tra i locali del centro storico.', 180, 25.00, false, false, '{4,5,6,7,8,9,10}', 4.3),
  ('demo-duomo-monreale', 'demo-monreale', 'Duomo e chiostro di Monreale', '[DEMO] Mosaici dorati e chiostro benedettino.', 90, 10.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-rocca-cefalu', 'demo-cefalu', 'Salita alla Rocca di Cefalù', '[DEMO] Sentiero panoramico al Tempio di Diana.', 150, 5.00, false, false, '{3,4,5,6,9,10,11}', 4.6),
  ('demo-spiaggia-cefalu', 'demo-cefalu', 'Mare e borgo di Cefalù', '[DEMO] Giornata tra spiaggia e vicoli.', 300, 0.00, false, true, '{6,7,8,9}', 4.5),
  ('demo-catania-barocca', 'demo-catania', 'Catania barocca a piedi', '[DEMO] Piazza Duomo, via Crociferi e pescheria.', 150, 20.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-pescheria-catania', 'demo-catania', 'Colazione alla pescheria di Catania', '[DEMO] Mercato del pesce e granita con brioche.', 90, 18.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-crateri-etna', 'demo-etna-sud', 'Escursione ai crateri sommitali dell''Etna', '[DEMO] Con guida vulcanologica.', 360, 85.00, true, false, '{5,6,7,8,9,10}', 4.9),
  ('demo-grotta-etna', 'demo-etna-sud', 'Grotte di scorrimento lavico', '[DEMO] Esplorazione con caschetto e torcia.', 180, 45.00, true, false, '{4,5,6,7,8,9,10,11}', 4.6),
  ('demo-cantina-etna', 'demo-etna-sud', 'Degustazione in una cantina dell''Etna', '[DEMO] Vini di vulcano e prodotti locali.', 120, 40.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-pistacchio-bronte', 'demo-bronte', 'Pistacchieti e laboratorio a Bronte', '[DEMO] Raccolta e assaggio del pistacchio verde.', 180, 30.00, true, false, '{8,9,10}', 4.7),
  ('demo-teatro-taormina', 'demo-taormina', 'Teatro Antico di Taormina', '[DEMO] Teatro greco-romano con vista sull''Etna.', 90, 14.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-isola-bella', 'demo-taormina', 'Isola Bella in kayak', '[DEMO] Grotte marine e snorkeling.', 180, 45.00, false, false, '{5,6,7,8,9,10}', 4.7),
  ('demo-ortigia-tour', 'demo-ortigia', 'Ortigia a piedi', '[DEMO] Duomo, Fonte Aretusa e mercato.', 150, 18.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-neapolis', 'demo-ortigia', 'Parco archeologico della Neapolis', '[DEMO] Teatro greco e Orecchio di Dionisio.', 150, 18.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-barca-ortigia', 'demo-ortigia', 'Giro in barca intorno a Ortigia', '[DEMO] Grotte e bagno in mare.', 90, 25.00, false, false, '{5,6,7,8,9,10}', 4.5),
  ('demo-noto-barocco', 'demo-noto', 'Noto barocca e granita', '[DEMO] Cattedrale e palazzi, pausa con granita.', 120, 0.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-vendicari', 'demo-noto', 'Riserva di Vendicari', '[DEMO] Sentieri tra fenicotteri e calette.', 240, 0.00, true, false, '{4,5,6,7,8,9,10}', 4.8),
  ('demo-ibla-cioccolato', 'demo-ragusa-ibla', 'Ibla e cioccolato di Modica', '[DEMO] Passeggiata e laboratorio di cioccolato.', 180, 28.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-valle-templi', 'demo-agrigento', 'Valle dei Templi al tramonto', '[DEMO] Visita guidata tra i templi dorici.', 180, 25.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.9),
  ('demo-scala-turchi', 'demo-scala-dei-turchi', 'Scala dei Turchi', '[DEMO] Scogliera bianca e bagno al tramonto.', 150, 0.00, true, false, '{5,6,7,8,9,10}', 4.6),
  ('demo-saline-trapani', 'demo-trapani', 'Saline e mulini di Trapani', '[DEMO] Riserva delle saline al tramonto.', 120, 10.00, true, true, '{4,5,6,7,8,9,10}', 4.6),
  ('demo-egadi-barca', 'demo-trapani', 'Favignana e Levanzo in barca', '[DEMO] Giornata in barca con pranzo a bordo.', 480, 90.00, false, false, '{5,6,7,8,9}', 4.8),
  ('demo-cous-cous', 'demo-trapani', 'Corso di cous cous trapanese', '[DEMO] Cucina con una famiglia locale.', 180, 55.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.9),
  ('demo-erice-borgo', 'demo-erice', 'Erice e dolci di badia', '[DEMO] Borgo medievale e pasticceria storica.', 150, 9.00, true, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-zingaro', 'demo-san-vito', 'Riserva dello Zingaro', '[DEMO] Sentiero costiero tra calette.', 300, 5.00, true, false, '{3,4,5,6,9,10,11}', 4.8),
  ('demo-san-vito-relax', 'demo-san-vito', 'Giornata di relax a San Vito', '[DEMO] Spiaggia bianca e lettino.', 360, 20.00, false, true, '{6,7,8,9}', 4.4),
  ('demo-villa-casale', 'demo-piazza-armerina', 'Villa Romana del Casale', '[DEMO] Mosaici romani patrimonio UNESCO.', 150, 12.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8)
) as v(slug, place_slug, title, description, duration_min, price, requires_car, accessible, months, rating)
join public.places p on p.slug = v.place_slug;

insert into public.activity_interests (activity_id, interest_key, strength)
select a.id, t.interest_key, t.strength
from (values
  ('demo-mercato-ballaro', 'food_wine', 3), ('demo-mercato-ballaro', 'local_experiences', 2),
  ('demo-palazzo-normanni', 'history_archaeology', 3), ('demo-palazzo-normanni', 'art', 3),
  ('demo-teatro-massimo', 'art', 3), ('demo-teatro-massimo', 'history_archaeology', 1),
  ('demo-palermo-notte', 'nightlife', 3), ('demo-palermo-notte', 'food_wine', 1),
  ('demo-duomo-monreale', 'art', 3), ('demo-duomo-monreale', 'history_archaeology', 2), ('demo-duomo-monreale', 'villages', 1),
  ('demo-rocca-cefalu', 'nature_hiking', 3), ('demo-rocca-cefalu', 'history_archaeology', 1),
  ('demo-spiaggia-cefalu', 'sea', 3), ('demo-spiaggia-cefalu', 'villages', 2), ('demo-spiaggia-cefalu', 'relax', 2),
  ('demo-catania-barocca', 'art', 2), ('demo-catania-barocca', 'history_archaeology', 2),
  ('demo-pescheria-catania', 'food_wine', 3), ('demo-pescheria-catania', 'local_experiences', 3),
  ('demo-crateri-etna', 'nature_hiking', 3),
  ('demo-grotta-etna', 'nature_hiking', 3), ('demo-grotta-etna', 'local_experiences', 1),
  ('demo-cantina-etna', 'food_wine', 3), ('demo-cantina-etna', 'relax', 1),
  ('demo-pistacchio-bronte', 'food_wine', 3), ('demo-pistacchio-bronte', 'local_experiences', 3), ('demo-pistacchio-bronte', 'villages', 1),
  ('demo-teatro-taormina', 'history_archaeology', 3), ('demo-teatro-taormina', 'art', 1),
  ('demo-isola-bella', 'sea', 3), ('demo-isola-bella', 'nature_hiking', 1),
  ('demo-ortigia-tour', 'history_archaeology', 2), ('demo-ortigia-tour', 'villages', 2), ('demo-ortigia-tour', 'food_wine', 1),
  ('demo-neapolis', 'history_archaeology', 3),
  ('demo-barca-ortigia', 'sea', 3), ('demo-barca-ortigia', 'relax', 1),
  ('demo-noto-barocco', 'art', 3), ('demo-noto-barocco', 'villages', 2), ('demo-noto-barocco', 'food_wine', 1),
  ('demo-vendicari', 'nature_hiking', 3), ('demo-vendicari', 'sea', 2),
  ('demo-ibla-cioccolato', 'villages', 3), ('demo-ibla-cioccolato', 'food_wine', 2),
  ('demo-valle-templi', 'history_archaeology', 3),
  ('demo-scala-turchi', 'sea', 3), ('demo-scala-turchi', 'nature_hiking', 1),
  ('demo-saline-trapani', 'nature_hiking', 2), ('demo-saline-trapani', 'local_experiences', 2),
  ('demo-egadi-barca', 'sea', 3), ('demo-egadi-barca', 'relax', 2),
  ('demo-cous-cous', 'food_wine', 3), ('demo-cous-cous', 'local_experiences', 3),
  ('demo-erice-borgo', 'villages', 3), ('demo-erice-borgo', 'food_wine', 2), ('demo-erice-borgo', 'history_archaeology', 1),
  ('demo-zingaro', 'nature_hiking', 3), ('demo-zingaro', 'sea', 2),
  ('demo-san-vito-relax', 'relax', 3), ('demo-san-vito-relax', 'sea', 3),
  ('demo-villa-casale', 'history_archaeology', 3), ('demo-villa-casale', 'art', 3)
) as t(activity_slug, interest_key, strength)
join public.activities a on a.slug = t.activity_slug;

update public.activities set is_active = true where slug like 'demo-%';

-- Itinerari predefiniti (template editoriali)
insert into public.itineraries (owner_id, title, slug, is_template, days, status)
values
  (null, '[DEMO] Weekend a Palermo e dintorni', 'demo-weekend-palermo', true, 3, 'planned'),
  (null, '[DEMO] Sicilia orientale in cinque giorni', 'demo-sicilia-orientale', true, 5, 'planned');

insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, start_time)
select i.id, v.day_index, v.position, a.id, v.start_time::time
from (values
  ('demo-weekend-palermo', 0, 0, 'demo-mercato-ballaro', '10:00'),
  ('demo-weekend-palermo', 0, 1, 'demo-palazzo-normanni', '15:00'),
  ('demo-weekend-palermo', 0, 2, 'demo-palermo-notte', '20:00'),
  ('demo-weekend-palermo', 1, 0, 'demo-duomo-monreale', '09:30'),
  ('demo-weekend-palermo', 1, 1, 'demo-teatro-massimo', '16:00'),
  ('demo-weekend-palermo', 2, 0, 'demo-rocca-cefalu', '08:30'),
  ('demo-weekend-palermo', 2, 1, 'demo-spiaggia-cefalu', '13:00'),
  ('demo-sicilia-orientale', 0, 0, 'demo-pescheria-catania', '08:30'),
  ('demo-sicilia-orientale', 0, 1, 'demo-catania-barocca', '10:30'),
  ('demo-sicilia-orientale', 1, 0, 'demo-crateri-etna', '08:00'),
  ('demo-sicilia-orientale', 1, 1, 'demo-cantina-etna', '17:00'),
  ('demo-sicilia-orientale', 2, 0, 'demo-teatro-taormina', '09:00'),
  ('demo-sicilia-orientale', 2, 1, 'demo-isola-bella', '14:00'),
  ('demo-sicilia-orientale', 3, 0, 'demo-ortigia-tour', '09:30'),
  ('demo-sicilia-orientale', 3, 1, 'demo-neapolis', '15:00'),
  ('demo-sicilia-orientale', 4, 0, 'demo-noto-barocco', '09:30'),
  ('demo-sicilia-orientale', 4, 1, 'demo-vendicari', '14:30')
) as v(itinerary_slug, day_index, position, activity_slug, start_time)
join public.itineraries i on i.slug = v.itinerary_slug
join public.activities a on a.slug = v.activity_slug;
