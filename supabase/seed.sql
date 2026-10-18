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
  ('demo-piazza-armerina', 'Piazza Armerina', 'EN', 37.3663, 14.3336, '[DEMO] Villa Romana del Casale.'),
  ('demo-mondello', 'Mondello', 'PA', 38.2047, 13.3236, '[DEMO] Borgo marinaro di Palermo.'),
  ('demo-segesta', 'Segesta', 'TP', 37.9411, 12.8336, '[DEMO] Tempio dorico sulla collina.'),
  ('demo-sciacca', 'Sciacca', 'AG', 37.5092, 13.0889, '[DEMO] Città delle ceramiche e delle terme.'),
  ('demo-eraclea-minoa', 'Eraclea Minoa', 'AG', 37.3922, 13.2817, '[DEMO] Scavi greci sopra la spiaggia.'),
  ('demo-pantalica', 'Pantalica', 'SR', 37.1450, 15.0270, '[DEMO] Necropoli rupestre nelle gole dell''Anapo.'),
  ('demo-fontane-bianche', 'Fontane Bianche', 'SR', 36.9628, 15.2069, '[DEMO] Spiaggia a sud di Siracusa.'),
  ('demo-marzamemi', 'Marzamemi', 'SR', 36.7400, 15.1170, '[DEMO] Borgo di pescatori con la tonnara.'),
  ('demo-modica', 'Modica', 'RG', 36.8586, 14.7608, '[DEMO] Città barocca su due colline.'),
  ('demo-scicli', 'Scicli', 'RG', 36.7922, 14.7069, '[DEMO] Barocco tra le cave.'),
  ('demo-marina-ragusa', 'Marina di Ragusa', 'RG', 36.7836, 14.5506, '[DEMO] Spiaggia e lungomare.'),
  ('demo-castelbuono', 'Castelbuono', 'PA', 37.9306, 14.0883, '[DEMO] Borgo delle Madonie con il castello.'),
  ('demo-piano-battaglia', 'Piano Battaglia', 'PA', 37.8700, 14.0300, '[DEMO] Altopiano tra i faggi delle Madonie.'),
  ('demo-polizzi', 'Polizzi Generosa', 'PA', 37.8122, 14.0028, '[DEMO] Borgo in cima alle Madonie.'),
  ('demo-enna', 'Enna', 'EN', 37.5670, 14.2795, '[DEMO] Città più alta della Sicilia.'),
  ('demo-caltagirone', 'Caltagirone', 'CT', 37.2373, 14.5122, '[DEMO] Città della ceramica.'),
  ('demo-aidone', 'Aidone', 'EN', 37.4150, 14.4460, '[DEMO] Museo e scavi di Morgantina.'),
  ('demo-valle-dei-templi', 'Valle dei Templi', 'AG', 37.2900, 13.5850, '[DEMO] Area archeologica dei templi dorici presso Agrigento.'),
  ('demo-etna', 'Etna', 'CT', 37.7510, 14.9934, '[DEMO] Vulcano attivo, crateri sommitali e colate laviche.'),
  ('demo-riserva-dello-zingaro', 'Riserva dello Zingaro', 'TP', 38.1100, 12.7900, '[DEMO] Riserva naturale con sentieri costieri e calette.');

-- Aree di viaggio dei luoghi demo (le aree vengono dalla migrazione, non dal seed). Tutte le
-- aree hanno almeno 6 attività; Costa nord e Madonie e Interno ne hanno abbastanza per un
-- viaggio di 5 giorni (e2e pending-actions), le altre si fermano prima.
update public.places p set area_id = a.id
from (values
  ('demo-palermo', 'palermo'), ('demo-monreale', 'palermo'), ('demo-mondello', 'palermo'),
  ('demo-cefalu', 'costa-nord-madonie'), ('demo-castelbuono', 'costa-nord-madonie'), ('demo-piano-battaglia', 'costa-nord-madonie'), ('demo-polizzi', 'costa-nord-madonie'),
  ('demo-trapani', 'ovest'), ('demo-erice', 'ovest'), ('demo-san-vito', 'ovest'), ('demo-segesta', 'ovest'), ('demo-riserva-dello-zingaro', 'ovest'),
  ('demo-agrigento', 'agrigentino'), ('demo-scala-dei-turchi', 'agrigentino'), ('demo-sciacca', 'agrigentino'), ('demo-eraclea-minoa', 'agrigentino'), ('demo-valle-dei-templi', 'agrigentino'),
  ('demo-piazza-armerina', 'interno'), ('demo-enna', 'interno'), ('demo-caltagirone', 'interno'), ('demo-aidone', 'interno'),
  ('demo-catania', 'etna-costa-ionica'), ('demo-etna-sud', 'etna-costa-ionica'), ('demo-etna', 'etna-costa-ionica'), ('demo-bronte', 'etna-costa-ionica'), ('demo-taormina', 'etna-costa-ionica'),
  ('demo-ortigia', 'siracusano'), ('demo-pantalica', 'siracusano'), ('demo-fontane-bianche', 'siracusano'), ('demo-marzamemi', 'siracusano'),
  ('demo-noto', 'barocco-ibleo'), ('demo-ragusa-ibla', 'barocco-ibleo'), ('demo-modica', 'barocco-ibleo'), ('demo-scicli', 'barocco-ibleo'), ('demo-marina-ragusa', 'barocco-ibleo')
) as v(place_slug, area_slug)
join public.areas a on a.slug = v.area_slug
where p.slug = v.place_slug;

-- Carosello e hero della home: dieci luoghi in evidenza, in quest'ordine. Un solo hero
-- (indice unico places_single_home_hero). Le foto demo le carica npm run media:demo.
update public.places p set
  is_featured = true,
  featured_order = v.featured_order,
  tagline_it = v.tagline_it,
  is_home_hero = v.is_home_hero
from (values
  ('demo-ortigia', 1, '[DEMO] Il centro antico di Siracusa, su un''isola sul mare.', true),
  ('demo-valle-dei-templi', 2, '[DEMO] Templi dorici tra mandorli e ulivi, vicino ad Agrigento.', false),
  ('demo-etna', 3, '[DEMO] Il vulcano attivo più alto d''Europa, con crateri e colate.', false),
  ('demo-scala-dei-turchi', 4, '[DEMO] Scogliera di marna bianca che scende nel mare.', false),
  ('demo-taormina', 5, '[DEMO] Teatro antico affacciato sul mare e sull''Etna.', false),
  ('demo-cefalu', 6, '[DEMO] Borgo sul mare con la cattedrale normanna.', false),
  ('demo-noto', 7, '[DEMO] Capitale del barocco, pietra dorata e scalinate.', false),
  ('demo-riserva-dello-zingaro', 8, '[DEMO] Sentieri costieri tra calette di acqua trasparente.', false),
  ('demo-erice', 9, '[DEMO] Borgo medievale in cima al monte, sopra il mare.', false),
  ('demo-modica', 10, '[DEMO] Città barocca su due colline, tra cioccolato e vicoli.', false)
) as v(slug, featured_order, tagline_it, is_home_hero)
where p.slug = v.slug;

-- Attività: create inattive, poi taggate, poi attivate (regola activity_without_tags).
-- on_site_price_eur è il prezzo pagato in loco (ingresso, biglietto), un metadato: null per tour ed
-- esperienze, che sono offerte dei partner (activity_offers), 0 per quelle libere.
insert into public.activities
  (slug, place_id, title, description, duration_min, on_site_price_eur, requires_car, accessible, season_months, rating, is_active)
select v.slug, p.id, v.title, v.description, v.duration_min, v.price, v.requires_car, v.accessible, v.months, v.rating, false
from (values
  ('demo-mercato-ballaro', 'demo-palermo', 'Street food al mercato di Ballarò', '[DEMO] Tour guidato tra panelle, arancine e sfincione.', 150, null, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[], 4.8),
  ('demo-palazzo-normanni', 'demo-palermo', 'Palazzo dei Normanni e Cappella Palatina', '[DEMO] Visita con mosaici bizantini.', 120, 19.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-teatro-massimo', 'demo-palermo', 'Visita al Teatro Massimo', '[DEMO] Visita guidata al teatro lirico.', 45, 12.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-palermo-notte', 'demo-palermo', 'Aperitivo e vita notturna alla Vucciria', '[DEMO] Serata tra i locali del centro storico.', 180, null, false, false, '{4,5,6,7,8,9,10}', 4.3),
  ('demo-duomo-monreale', 'demo-monreale', 'Duomo e chiostro di Monreale', '[DEMO] Mosaici dorati e chiostro benedettino.', 90, 10.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-rocca-cefalu', 'demo-cefalu', 'Salita alla Rocca di Cefalù', '[DEMO] Sentiero panoramico al Tempio di Diana.', 150, 5.00, false, false, '{3,4,5,6,9,10,11}', 4.6),
  ('demo-spiaggia-cefalu', 'demo-cefalu', 'Mare e borgo di Cefalù', '[DEMO] Giornata tra spiaggia e vicoli.', 300, 0.00, false, true, '{6,7,8,9}', 4.5),
  ('demo-catania-barocca', 'demo-catania', 'Catania barocca a piedi', '[DEMO] Piazza Duomo, via Crociferi e pescheria.', 150, 0.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-pescheria-catania', 'demo-catania', 'Colazione alla pescheria di Catania', '[DEMO] Mercato del pesce e granita con brioche.', 90, null, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-crateri-etna', 'demo-etna-sud', 'Escursione ai crateri sommitali dell''Etna', '[DEMO] Con guida vulcanologica.', 360, null, true, false, '{5,6,7,8,9,10}', 4.9),
  ('demo-grotta-etna', 'demo-etna-sud', 'Grotte di scorrimento lavico', '[DEMO] Esplorazione con caschetto e torcia.', 180, null, true, false, '{4,5,6,7,8,9,10,11}', 4.6),
  ('demo-cantina-etna', 'demo-etna-sud', 'Degustazione in una cantina dell''Etna', '[DEMO] Vini di vulcano e prodotti locali.', 120, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-pistacchio-bronte', 'demo-bronte', 'Pistacchieti e laboratorio a Bronte', '[DEMO] Raccolta e assaggio del pistacchio verde.', 180, null, true, false, '{8,9,10}', 4.7),
  ('demo-teatro-taormina', 'demo-taormina', 'Teatro Antico di Taormina', '[DEMO] Teatro greco-romano con vista sull''Etna.', 90, 14.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-isola-bella', 'demo-taormina', 'Isola Bella in kayak', '[DEMO] Grotte marine e snorkeling.', 180, null, false, false, '{5,6,7,8,9,10}', 4.7),
  ('demo-ortigia-tour', 'demo-ortigia', 'Ortigia a piedi', '[DEMO] Duomo, Fonte Aretusa e mercato.', 150, 0.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-neapolis', 'demo-ortigia', 'Parco archeologico della Neapolis', '[DEMO] Teatro greco e Orecchio di Dionisio.', 150, 18.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-barca-ortigia', 'demo-ortigia', 'Giro in barca intorno a Ortigia', '[DEMO] Grotte e bagno in mare.', 90, null, false, false, '{5,6,7,8,9,10}', 4.5),
  ('demo-noto-barocco', 'demo-noto', 'Noto barocca e granita', '[DEMO] Cattedrale e palazzi, pausa con granita.', 120, 0.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-vendicari', 'demo-noto', 'Riserva di Vendicari', '[DEMO] Sentieri tra fenicotteri e calette.', 240, 0.00, true, false, '{4,5,6,7,8,9,10}', 4.8),
  ('demo-ibla-cioccolato', 'demo-ragusa-ibla', 'Ibla e cioccolato di Modica', '[DEMO] Passeggiata e laboratorio di cioccolato.', 180, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-valle-templi', 'demo-agrigento', 'Valle dei Templi al tramonto', '[DEMO] Visita guidata tra i templi dorici.', 180, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.9),
  ('demo-scala-turchi', 'demo-scala-dei-turchi', 'Scala dei Turchi', '[DEMO] Scogliera bianca e bagno al tramonto.', 150, 0.00, true, false, '{5,6,7,8,9,10}', 4.6),
  ('demo-saline-trapani', 'demo-trapani', 'Saline e mulini di Trapani', '[DEMO] Riserva delle saline al tramonto.', 120, 10.00, true, true, '{4,5,6,7,8,9,10}', 4.6),
  ('demo-egadi-barca', 'demo-trapani', 'Favignana e Levanzo in barca', '[DEMO] Giornata in barca con pranzo a bordo.', 480, null, false, false, '{5,6,7,8,9}', 4.8),
  ('demo-cous-cous', 'demo-trapani', 'Corso di cous cous trapanese', '[DEMO] Cucina con una famiglia locale.', 180, null, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.9),
  ('demo-erice-borgo', 'demo-erice', 'Erice e dolci di badia', '[DEMO] Borgo medievale e pasticceria storica.', 150, null, true, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-zingaro', 'demo-san-vito', 'Riserva dello Zingaro', '[DEMO] Sentiero costiero tra calette.', 300, 5.00, true, false, '{3,4,5,6,9,10,11}', 4.8),
  ('demo-san-vito-relax', 'demo-san-vito', 'Giornata di relax a San Vito', '[DEMO] Spiaggia bianca e lettino.', 360, null, false, true, '{6,7,8,9}', 4.4),
  ('demo-villa-casale', 'demo-piazza-armerina', 'Villa Romana del Casale', '[DEMO] Mosaici romani patrimonio UNESCO.', 150, 12.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-mondello-spiaggia', 'demo-mondello', 'Spiaggia di Mondello', '[DEMO] Mare e lungomare liberty.', 240, 0.00, false, true, '{6,7,8,9}', 4.4),
  ('demo-catacombe-cappuccini', 'demo-palermo', 'Catacombe dei Cappuccini', '[DEMO] Corridoi sotterranei del convento.', 60, 5.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.3),
  ('demo-segesta-tempio', 'demo-segesta', 'Tempio e teatro di Segesta', '[DEMO] Tempio dorico e teatro sul monte Barbaro.', 150, 6.00, true, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.8),
  ('demo-kolymbethra', 'demo-agrigento', 'Giardino della Kolymbethra', '[DEMO] Agrumeto antico nella Valle dei Templi.', 90, 6.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-casa-pirandello', 'demo-agrigento', 'Casa natale di Pirandello', '[DEMO] Museo nella contrada del Caos.', 60, 4.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.3),
  ('demo-eraclea-spiaggia', 'demo-eraclea-minoa', 'Eraclea Minoa, spiaggia e scavi', '[DEMO] Teatro greco e pineta sul mare.', 300, 0.00, true, false, '{5,6,7,8,9,10}', 4.6),
  ('demo-ceramiche-sciacca', 'demo-sciacca', 'Botteghe di ceramica a Sciacca', '[DEMO] Laboratorio con un ceramista.', 120, null, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.5),
  ('demo-pantalica-trekking', 'demo-pantalica', 'Necropoli e gole di Pantalica', '[DEMO] Sentiero tra tombe rupestri e fiume.', 240, 0.00, true, false, '{3,4,5,9,10,11}', 4.7),
  ('demo-fontane-bianche', 'demo-fontane-bianche', 'Mare a Fontane Bianche', '[DEMO] Spiaggia di sabbia chiara.', 300, 0.00, false, true, '{6,7,8,9}', 4.3),
  ('demo-marzamemi-borgo', 'demo-marzamemi', 'Marzamemi e la tonnara', '[DEMO] Piazza della tonnara e conserve di tonno.', 150, null, true, true, '{4,5,6,7,8,9,10}', 4.6),
  ('demo-modica-barocca', 'demo-modica', 'Modica barocca a piedi', '[DEMO] San Giorgio e la città alta.', 150, 0.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-scicli-chiese', 'demo-scicli', 'Scicli e via Mormino Penna', '[DEMO] Chiese e palazzi barocchi.', 120, 0.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.5),
  ('demo-marina-ragusa', 'demo-marina-ragusa', 'Spiaggia di Marina di Ragusa', '[DEMO] Sabbia e lungomare.', 300, 0.00, false, true, '{6,7,8,9}', 4.3),
  ('demo-castelbuono-borgo', 'demo-castelbuono', 'Castelbuono e il castello dei Ventimiglia', '[DEMO] Borgo e cappella palatina.', 150, 0.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-manna-castelbuono', 'demo-castelbuono', 'Manna e dolci a Castelbuono', '[DEMO] Assaggi in pasticceria e storia della manna.', 120, null, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-madonie-faggete', 'demo-piano-battaglia', 'Faggete delle Madonie', '[DEMO] Sentiero ad anello tra i faggi.', 240, 0.00, true, false, '{4,5,6,7,8,9,10}', 4.7),
  ('demo-duomo-cefalu', 'demo-cefalu', 'Duomo normanno di Cefalù', '[DEMO] Mosaici del Cristo Pantocratore.', 60, 5.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-lavatoio-cefalu', 'demo-cefalu', 'Lavatoio medievale e vicoli di Cefalù', '[DEMO] Passeggiata nel centro storico.', 60, 0.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.3),
  ('demo-polizzi-borgo', 'demo-polizzi', 'Polizzi Generosa e lo sfoglio', '[DEMO] Borgo e dolce tipico.', 150, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.5),
  ('demo-formaggi-madonie', 'demo-castelbuono', 'Caseificio delle Madonie', '[DEMO] Visita e degustazione di formaggi.', 120, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-castello-enna', 'demo-enna', 'Castello di Lombardia e Rocca di Cerere', '[DEMO] Torri e panorama sull''Etna.', 120, 3.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.5),
  ('demo-duomo-enna', 'demo-enna', 'Duomo e museo di Enna', '[DEMO] Soffitto ligneo e tesoro.', 90, 4.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.4),
  ('demo-pergusa', 'demo-enna', 'Lago di Pergusa', '[DEMO] Riserva naturale intorno al lago.', 150, 0.00, true, true, '{4,5,6,7,8,9,10}', 4.2),
  ('demo-masseria-enna', 'demo-enna', 'Pranzo in masseria nell''ennese', '[DEMO] Grano antico e piatti di campagna.', 150, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.5),
  ('demo-scala-caltagirone', 'demo-caltagirone', 'Scala di Santa Maria del Monte', '[DEMO] Gradini di maiolica.', 90, 0.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.7),
  ('demo-ceramica-caltagirone', 'demo-caltagirone', 'Laboratorio di ceramica a Caltagirone', '[DEMO] Decorazione con un ceramista.', 150, null, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-morgantina', 'demo-aidone', 'Scavi di Morgantina e museo di Aidone', '[DEMO] Città greca e il suo museo.', 180, 10.00, true, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.6),
  ('demo-piazza-armerina-borgo', 'demo-piazza-armerina', 'Centro storico di Piazza Armerina', '[DEMO] Cattedrale e quartieri medievali.', 90, 0.00, false, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.3),
  ('demo-gibilmanna', 'demo-cefalu', 'Santuario di Gibilmanna', '[DEMO] Santuario tra i boschi sopra Cefalù.', 120, 0.00, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.4),
  ('demo-barca-cefalu', 'demo-cefalu', 'Costa di Cefalù in barca', '[DEMO] Calette e bagno al largo.', 150, null, false, false, '{5,6,7,8,9,10}', 4.5),
  ('demo-pizzo-carbonara', 'demo-polizzi', 'Salita a Pizzo Carbonara', '[DEMO] Escursione sulla vetta delle Madonie.', 300, 0.00, true, false, '{5,6,7,8,9,10}', 4.7),
  ('demo-museo-ceramica', 'demo-caltagirone', 'Museo della ceramica di Caltagirone', '[DEMO] Maioliche dal medioevo a oggi.', 90, 4.00, false, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.4),
  ('demo-altesina', 'demo-enna', 'Sentiero di Monte Altesina', '[DEMO] Bosco e resti antichi al centro dell''isola.', 240, 0.00, true, false, '{3,4,5,6,9,10,11}', 4.4),
  ('demo-calascibetta', 'demo-enna', 'Calascibetta e necropoli di Realmese', '[DEMO] Borgo e tombe a grotticella.', 180, 0.00, true, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.4),
  ('demo-cantina-entroterra', 'demo-aidone', 'Cantina nell''entroterra', '[DEMO] Vini di collina e olio.', 120, null, true, true, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.5),
  ('demo-sperlinga', 'demo-enna', 'Castello di Sperlinga', '[DEMO] Castello scavato nella roccia.', 90, 4.00, true, false, '{1,2,3,4,5,6,7,8,9,10,11,12}', 4.4)
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
  ('demo-villa-casale', 'history_archaeology', 3), ('demo-villa-casale', 'art', 3),
  ('demo-mondello-spiaggia', 'sea', 3), ('demo-mondello-spiaggia', 'relax', 2),
  ('demo-catacombe-cappuccini', 'history_archaeology', 3),
  ('demo-segesta-tempio', 'history_archaeology', 3), ('demo-segesta-tempio', 'nature_hiking', 1),
  ('demo-kolymbethra', 'nature_hiking', 3), ('demo-kolymbethra', 'history_archaeology', 1),
  ('demo-casa-pirandello', 'art', 2), ('demo-casa-pirandello', 'history_archaeology', 2),
  ('demo-eraclea-spiaggia', 'sea', 3), ('demo-eraclea-spiaggia', 'history_archaeology', 1),
  ('demo-ceramiche-sciacca', 'local_experiences', 3), ('demo-ceramiche-sciacca', 'art', 2), ('demo-ceramiche-sciacca', 'villages', 1),
  ('demo-pantalica-trekking', 'nature_hiking', 3), ('demo-pantalica-trekking', 'history_archaeology', 2),
  ('demo-fontane-bianche', 'sea', 3), ('demo-fontane-bianche', 'relax', 2),
  ('demo-marzamemi-borgo', 'villages', 3), ('demo-marzamemi-borgo', 'food_wine', 2),
  ('demo-modica-barocca', 'art', 3), ('demo-modica-barocca', 'villages', 2),
  ('demo-scicli-chiese', 'art', 3), ('demo-scicli-chiese', 'villages', 2),
  ('demo-marina-ragusa', 'sea', 3), ('demo-marina-ragusa', 'relax', 1),
  ('demo-castelbuono-borgo', 'villages', 3), ('demo-castelbuono-borgo', 'history_archaeology', 1),
  ('demo-manna-castelbuono', 'food_wine', 3), ('demo-manna-castelbuono', 'local_experiences', 2),
  ('demo-madonie-faggete', 'nature_hiking', 3),
  ('demo-duomo-cefalu', 'art', 3), ('demo-duomo-cefalu', 'history_archaeology', 2),
  ('demo-lavatoio-cefalu', 'villages', 2), ('demo-lavatoio-cefalu', 'history_archaeology', 2),
  ('demo-polizzi-borgo', 'villages', 3), ('demo-polizzi-borgo', 'food_wine', 2),
  ('demo-formaggi-madonie', 'food_wine', 3), ('demo-formaggi-madonie', 'local_experiences', 2),
  ('demo-castello-enna', 'history_archaeology', 3), ('demo-castello-enna', 'nature_hiking', 1),
  ('demo-duomo-enna', 'art', 2), ('demo-duomo-enna', 'history_archaeology', 2),
  ('demo-pergusa', 'nature_hiking', 3), ('demo-pergusa', 'relax', 1),
  ('demo-masseria-enna', 'food_wine', 3), ('demo-masseria-enna', 'local_experiences', 2),
  ('demo-scala-caltagirone', 'art', 3), ('demo-scala-caltagirone', 'villages', 2),
  ('demo-ceramica-caltagirone', 'local_experiences', 3), ('demo-ceramica-caltagirone', 'art', 2),
  ('demo-morgantina', 'history_archaeology', 3),
  ('demo-piazza-armerina-borgo', 'villages', 3), ('demo-piazza-armerina-borgo', 'history_archaeology', 1),
  ('demo-gibilmanna', 'history_archaeology', 2), ('demo-gibilmanna', 'nature_hiking', 2),
  ('demo-barca-cefalu', 'sea', 3), ('demo-barca-cefalu', 'relax', 1),
  ('demo-pizzo-carbonara', 'nature_hiking', 3),
  ('demo-museo-ceramica', 'art', 2), ('demo-museo-ceramica', 'history_archaeology', 2),
  ('demo-altesina', 'nature_hiking', 3), ('demo-altesina', 'history_archaeology', 1),
  ('demo-calascibetta', 'history_archaeology', 3), ('demo-calascibetta', 'villages', 2),
  ('demo-cantina-entroterra', 'food_wine', 3), ('demo-cantina-entroterra', 'relax', 1),
  ('demo-sperlinga', 'history_archaeology', 3), ('demo-sperlinga', 'villages', 1)
) as t(activity_slug, interest_key, strength)
join public.activities a on a.slug = t.activity_slug;

-- Diete adatte (vincolo per chi indica una dieta nelle Preferenze): solo alcune attività di cibo.
update public.activities set diet_friendly = '{vegetarian}' where slug in ('demo-mercato-ballaro', 'demo-cous-cous');
update public.activities set diet_friendly = '{vegetarian,vegan,gluten_free}' where slug = 'demo-cantina-etna';
update public.activities set diet_friendly = '{vegetarian,vegan,lactose_free}' where slug = 'demo-pistacchio-bronte';

update public.activities set is_active = true where slug like 'demo-%';

-- Offerte demo dei partner: URL di ricerca pubblica, non prodotti specifici; titoli, prezzi e
-- voti sono di prova ([DEMO]). Lo Zingaro ha due offerte: la principale è la più economica.
insert into public.activity_offers
  (activity_id, partner, partner_product_id, title, price_from_eur, affiliate_url, rating, reviews_count, free_cancellation, price_updated_at)
select a.id, v.partner::public.partner, v.product, v.title, v.price, v.url, v.rating, v.reviews, v.free_cancellation, now() - interval '2 days'
from (values
  ('demo-zingaro', 'getyourguide', 'demo-gyg-zingaro', '[DEMO] Escursione guidata nella Riserva dello Zingaro', 45.00,
    'https://www.getyourguide.com/s/?q=Riserva%20dello%20Zingaro', 4.7, 128, true),
  ('demo-zingaro', 'viator', 'demo-viator-zingaro', '[DEMO] Trekking e bagno nelle calette dello Zingaro', 52.00,
    'https://www.viator.com/searchResults/all?text=Riserva%20dello%20Zingaro', null, null, null),
  ('demo-egadi-barca', 'getyourguide', 'demo-gyg-egadi', '[DEMO] Favignana e Levanzo in barca con pranzo', 75.00,
    'https://www.getyourguide.com/s/?q=Favignana%20Levanzo', 4.8, 342, true)
) as v(activity_slug, partner, product, title, price, url, rating, reviews, free_cancellation)
join public.activities a on a.slug = v.activity_slug;

-- Consigli locali demo, firmati "Redazione di Isula" (voce di default al lancio). Testi di prova
-- ([DEMO]); date di verifica relative a oggi: validi, uno in scadenza (coda "Da riverificare")
-- e uno scaduto (fuori dalle pagine, solo nella coda).
insert into public.local_tip_authors (id, kind, display_name)
values ('00000000-0000-4000-8000-00000000d001', 'editorial', 'Redazione di Isula');

insert into public.local_tips (author_id, activity_id, place_id, body, verified_at)
select '00000000-0000-4000-8000-00000000d001', a.id, p.id, v.body, current_date - v.days_ago
from (values
  ('demo-zingaro', null, '[DEMO] Entra dall''ingresso di Scopello prima delle 9: la prima cala, Capreria, è ancora vuota.', 20),
  ('demo-pescheria-catania', null, '[DEMO] Arriva prima delle 8: i banchi del pesce spada chiudono verso mezzogiorno.', 45),
  ('demo-vendicari', null, '[DEMO] I fenicotteri si vedono dal capanno del Pantano Grande, tra settembre e marzo.', 345),
  (null, 'demo-noto', '[DEMO] La scalinata della cattedrale è in ombra dopo le 17: è il momento per le foto.', 60),
  (null, 'demo-catania', '[DEMO] Consiglio scaduto: non compare più nelle pagine finché non viene riverificato.', 400)
) as v(activity_slug, place_slug, body, days_ago)
left join public.activities a on a.slug = v.activity_slug
left join public.places p on p.slug = v.place_slug;

-- Itinerari predefiniti (template editoriali)
insert into public.itineraries (owner_id, title, slug, is_template, days, status)
values
  (null, '[DEMO] Weekend a Palermo e dintorni', 'demo-weekend-palermo', true, 3, 'planned'),
  (null, '[DEMO] Sicilia orientale in cinque giorni', 'demo-sicilia-orientale', true, 5, 'planned');

update public.itineraries set day_titles = '{"Palermo","Monreale e Palermo","Cefalù"}' where slug = 'demo-weekend-palermo';
update public.itineraries set day_titles = '{"Catania","Etna","Taormina","Ortigia"}' where slug = 'demo-sicilia-orientale';

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

-- Itinerari pronti (template editoriali): sei demo, tutti pubblicati e tutti con i controlli di
-- pubblicazione ok (src/lib/itinerary-checks.ts): ritmo, tappe attive e nei mesi consigliati,
-- minuti del giorno entro il ritmo, copertina foto con testo alternativo (prima tappa).
-- Durate: relaxed 240 min, balanced 360, intense 480 per giorno.

-- 1) I due dell'avvio: campi editoriali, fasce orarie e note.
update public.itineraries set
  subtitle = '[DEMO] Mercati, mosaici e mare in tre giorni',
  description = '[DEMO] Palermo e Monreale nei primi due giorni, poi una giornata a Cefalù. Ritmo intenso: le giornate sono piene.',
  suitable_for = array['couple', 'friends']::public.travel_party[],
  season_months = '{}'::smallint[],
  pace = 'intense',
  day_intros = array[
    '[DEMO] Il mercato di Ballarò al mattino, il palazzo dei Normanni nel primo pomeriggio e la vita notturna della Vucciria.',
    '[DEMO] Monreale e i suoi mosaici al mattino, poi il Teatro Massimo.',
    '[DEMO] Cefalù: la rocca presto, il mare nel pomeriggio.'
  ]
where slug = 'demo-weekend-palermo';

update public.itineraries set
  subtitle = '[DEMO] Catania, l’Etna, Taormina e Siracusa in cinque giorni',
  description = '[DEMO] Il giro della costa orientale con l’Etna al centro. Pensato per la bella stagione, da maggio a ottobre, con ritmo intenso.',
  suitable_for = array['family', 'friends']::public.travel_party[],
  season_months = array[5, 6, 7, 8, 9, 10]::smallint[],
  pace = 'intense',
  day_intros = array[
    '[DEMO] Mercato del pesce a Catania all’alba, poi la città barocca.',
    '[DEMO] L’Etna in mattinata, con la guida, e una cantina nel tardo pomeriggio.',
    '[DEMO] Il teatro di Taormina al mattino, la baia in kayak nel pomeriggio.',
    '[DEMO] Ortigia a piedi, poi il parco della Neapolis.',
    '[DEMO] Noto e la riserva di Vendicari: giornata lunga, acqua e cappello.'
  ]
where slug = 'demo-sicilia-orientale';

-- Fasce orarie e note delle tappe dei due esistenti (giorno e posizione come nel seed sopra).
update public.itinerary_items ii set time_slot = v.time_slot::public.time_slot, notes = v.notes
from public.itineraries i
join (values
  ('demo-weekend-palermo', 0, 0, 'morning', '[DEMO] Il mercato è pieno al mattino: conviene arrivare presto.'),
  ('demo-weekend-palermo', 0, 1, 'afternoon', null),
  ('demo-weekend-palermo', 0, 2, 'evening', null),
  ('demo-weekend-palermo', 1, 0, 'morning', '[DEMO] Il chiostro da solo richiede un’ora buona.'),
  ('demo-weekend-palermo', 1, 1, 'afternoon', null),
  ('demo-weekend-palermo', 2, 0, 'morning', '[DEMO] Sentiero in salita: meglio le prime ore, quando è fresco.'),
  ('demo-weekend-palermo', 2, 1, 'afternoon', null),
  ('demo-sicilia-orientale', 0, 0, 'morning', '[DEMO] Colazione al mercato: il pesce più fresco è nelle prime ore.'),
  ('demo-sicilia-orientale', 0, 1, 'afternoon', null),
  ('demo-sicilia-orientale', 1, 0, 'morning', '[DEMO] In quota fa freddo anche d’estate: porta una giacca.'),
  ('demo-sicilia-orientale', 1, 1, 'evening', '[DEMO] Degustazione dopo il rientro dai crateri.'),
  ('demo-sicilia-orientale', 2, 0, 'morning', '[DEMO] Il teatro di mattina è meno affollato.'),
  ('demo-sicilia-orientale', 2, 1, 'afternoon', null),
  ('demo-sicilia-orientale', 3, 0, 'morning', null),
  ('demo-sicilia-orientale', 3, 1, 'afternoon', '[DEMO] Il parco apre presto: il caldo arriva a mezzogiorno.'),
  ('demo-sicilia-orientale', 4, 0, 'morning', null),
  ('demo-sicilia-orientale', 4, 1, 'afternoon', '[DEMO] La riserva ha poca ombra: acqua e cappello.')
) as v(itinerary_slug, day_index, position, time_slot, notes)
  on i.slug = v.itinerary_slug
where ii.itinerary_id = i.id and ii.day_index = v.day_index and ii.position = v.position;

-- 2) Quattro nuovi. Il titolo dei giorni è facoltativo (come negli esistenti).
insert into public.itineraries (owner_id, title, slug, is_template, days, status, subtitle, description, season_months, suitable_for, pace, day_titles, day_intros)
values
  (null, '[DEMO] Trapani, Erice e Segesta in due giorni', 'demo-trapani-erice', true, 2, 'planned',
    '[DEMO] Saline, borghi sul monte e il tempio dorico.',
    '[DEMO] Due giorni nella Sicilia occidentale: il mare delle saline, Erice in cima al monte e il tempio dorico di Segesta. Consigliato da maggio a settembre.',
    array[5, 6, 7, 8, 9]::smallint[],
    array['couple', 'friends']::public.travel_party[],
    'balanced',
    array['Saline e mare', 'Erice e Segesta'],
    array[
      '[DEMO] Le saline al pomeriggio e una serata di cous cous.',
      '[DEMO] Il tempio di Segesta al mattino, Erice nel primo pomeriggio.'
    ]),
  (null, '[DEMO] Agrigento e la Scala dei Turchi in tre giorni', 'demo-agrigento-scala', true, 3, 'planned',
    '[DEMO] La Valle dei Templi e la scogliera di marna bianca.',
    '[DEMO] Tre giorni tra i templi dorici, la Scala dei Turchi e le botteghe di Sciacca. Adatto tutto l’anno, con il caldo dell’estate da mettere in conto.',
    '{}'::smallint[],
    array['family', 'couple']::public.travel_party[],
    'balanced',
    array['Valle dei Templi', 'Scala dei Turchi', 'Eraclea Minoa'],
    array[
      '[DEMO] Valle dei Templi al mattino, la Kolymbethra a pranzo, la casa di Pirandello nel pomeriggio.',
      '[DEMO] La Scala dei Turchi al mattino, poi le botteghe di ceramica di Sciacca.',
      '[DEMO] Eraclea Minoa: la spiaggia e gli scavi sul mare.'
    ]),
  (null, '[DEMO] Madonie e Cefalù in cinque giorni', 'demo-madonie-cefalu', true, 5, 'planned',
    '[DEMO] Cefalù, le Madonie e i borghi in cima.',
    '[DEMO] Cinque giorni tra il mare di Cefalù e le Madonie: faggete, borghi e la salita a Pizzo Carbonara. Ritmo bilanciato.',
    '{}'::smallint[],
    array['solo', 'couple']::public.travel_party[],
    'balanced',
    array['Cefalù', 'Castelbuono', 'Piano Battaglia', 'Polizzi Generosa', 'Cefalù e la costa'],
    array[
      '[DEMO] Il duomo di Cefalù al mattino, il santuario di Gibilmanna a pranzo, il lavatoio nel centro.',
      '[DEMO] Castelbuono e il suo castello, poi il caseificio delle Madonie.',
      '[DEMO] Le faggete di Piano Battaglia: un anello tra gli alberi.',
      '[DEMO] La salita a Pizzo Carbonara: giornata lunga, si parte presto.',
      '[DEMO] Calette in barca al mattino, la rocca di Cefalù nel pomeriggio.'
    ]),
  (null, '[DEMO] Entroterra ennese in sette giorni', 'demo-entroterra-enna', true, 7, 'planned',
    '[DEMO] Enna, Piazza Armerina e Caltagirone con calma.',
    '[DEMO] Sette giorni nell’entroterra: ville romane, città della ceramica e borghi tra le colline. Ritmo rilassato, adatto a chi viaggia da solo o con gli amici.',
    '{}'::smallint[],
    array['solo', 'friends']::public.travel_party[],
    'relaxed',
    array['Enna', 'Piazza Armerina', 'Aidone', 'Caltagirone', 'Enna e l’Altesina', 'Calascibetta', 'Masseria e Caltagirone'],
    array[
      '[DEMO] Il castello di Lombardia e il duomo di Enna, con vista sull’Etna.',
      '[DEMO] Villa Romana del Casale al mattino, il centro di Piazza Armerina nel pomeriggio.',
      '[DEMO] Gli scavi di Morgantina e il museo di Aidone.',
      '[DEMO] Scalinata di maiolica e laboratorio di ceramica a Caltagirone.',
      '[DEMO] Il sentiero del monte Altesina, tra bosco e resti antichi.',
      '[DEMO] Calascibetta e le tombe a grotticella di Realmese.',
      '[DEMO] Pranzo in masseria e museo della ceramica a Caltagirone.'
    ]);

-- Tappe dei quattro nuovi. Ogni giorno resta entro il ritmo (ore × 60 minuti).
insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, time_slot, notes)
select i.id, v.day_index, v.position, a.id, v.time_slot::public.time_slot, v.notes
from (values
  -- Trapani, Erice e Segesta (balanced, 360): giorno 1 = 120 + 180, giorno 2 = 150 + 150.
  ('demo-trapani-erice', 0, 0, 'demo-saline-trapani', 'afternoon', '[DEMO] Il tramonto sulle saline è il momento migliore.'),
  ('demo-trapani-erice', 0, 1, 'demo-cous-cous', 'evening', null),
  ('demo-trapani-erice', 1, 0, 'demo-segesta-tempio', 'morning', '[DEMO] Mettiti in cammino presto: a metà giornata il sole sul colle si sente.'),
  ('demo-trapani-erice', 1, 1, 'demo-erice-borgo', 'afternoon', null),
  -- Agrigento (balanced, 360): 180 + 90 + 60 = 330; 150 + 120 = 270; 300.
  ('demo-agrigento-scala', 0, 0, 'demo-valle-templi', 'morning', '[DEMO] Il tramonto è il momento migliore per i templi.'),
  ('demo-agrigento-scala', 0, 1, 'demo-kolymbethra', 'lunch', null),
  ('demo-agrigento-scala', 0, 2, 'demo-casa-pirandello', 'afternoon', null),
  ('demo-agrigento-scala', 1, 0, 'demo-scala-turchi', 'morning', '[DEMO] Scarpe da scoglio: la marna è scivolosa.'),
  ('demo-agrigento-scala', 1, 1, 'demo-ceramiche-sciacca', 'afternoon', null),
  ('demo-agrigento-scala', 2, 0, 'demo-eraclea-spiaggia', 'morning', null),
  -- Madonie e Cefalù (balanced, 360): 60 + 120 + 60; 150 + 120; 240; 300; 150 + 150.
  ('demo-madonie-cefalu', 0, 0, 'demo-duomo-cefalu', 'morning', null),
  ('demo-madonie-cefalu', 0, 1, 'demo-gibilmanna', 'lunch', null),
  ('demo-madonie-cefalu', 0, 2, 'demo-lavatoio-cefalu', 'afternoon', null),
  ('demo-madonie-cefalu', 1, 0, 'demo-castelbuono-borgo', 'morning', null),
  ('demo-madonie-cefalu', 1, 1, 'demo-formaggi-madonie', 'afternoon', null),
  ('demo-madonie-cefalu', 2, 0, 'demo-madonie-faggete', 'morning', '[DEMO] Porta una giacca: tra i faggi l’aria è più fresca.'),
  ('demo-madonie-cefalu', 3, 0, 'demo-pizzo-carbonara', 'morning', '[DEMO] Parti presto e porta acqua: la salita è lunga.'),
  ('demo-madonie-cefalu', 4, 0, 'demo-barca-cefalu', 'morning', null),
  ('demo-madonie-cefalu', 4, 1, 'demo-rocca-cefalu', 'afternoon', null),
  -- Entroterra ennese (relaxed, 240): 120 + 90; 150 + 90; 180; 90 + 150; 240; 180; 150 + 90.
  ('demo-entroterra-enna', 0, 0, 'demo-castello-enna', 'morning', null),
  ('demo-entroterra-enna', 0, 1, 'demo-duomo-enna', 'afternoon', null),
  ('demo-entroterra-enna', 1, 0, 'demo-villa-casale', 'morning', '[DEMO] Prenota la visita del mattino: il sito si riempie presto.'),
  ('demo-entroterra-enna', 1, 1, 'demo-piazza-armerina-borgo', 'afternoon', null),
  ('demo-entroterra-enna', 2, 0, 'demo-morgantina', 'morning', null),
  ('demo-entroterra-enna', 3, 0, 'demo-scala-caltagirone', 'morning', null),
  ('demo-entroterra-enna', 3, 1, 'demo-ceramica-caltagirone', 'afternoon', null),
  ('demo-entroterra-enna', 4, 0, 'demo-altesina', 'morning', null),
  ('demo-entroterra-enna', 5, 0, 'demo-calascibetta', 'morning', null),
  ('demo-entroterra-enna', 6, 0, 'demo-masseria-enna', 'lunch', null),
  ('demo-entroterra-enna', 6, 1, 'demo-museo-ceramica', 'afternoon', null)
) as v(itinerary_slug, day_index, position, activity_slug, time_slot, notes)
join public.itineraries i on i.slug = v.itinerary_slug
join public.activities a on a.slug = v.activity_slug;

-- 3) Notti: la notte n sta dopo il giorno n (area oppure luogo; uno dei due è obbligatorio).
insert into public.itinerary_nights (itinerary_id, night_index, area_id, place_id)
select i.id, v.night_index,
  (select ar.id from public.areas ar where ar.slug = v.area_slug),
  (select p.id from public.places p where p.slug = v.place_slug)
from (values
  ('demo-weekend-palermo', 1, 'palermo', null::text),
  ('demo-weekend-palermo', 2, null::text, 'demo-cefalu'),
  ('demo-sicilia-orientale', 1, null::text, 'demo-catania'),
  ('demo-sicilia-orientale', 2, 'etna-costa-ionica', null::text),
  ('demo-sicilia-orientale', 3, null::text, 'demo-taormina'),
  ('demo-sicilia-orientale', 4, null::text, 'demo-ortigia'),
  ('demo-trapani-erice', 1, 'ovest', null::text),
  ('demo-agrigento-scala', 1, 'agrigentino', null::text),
  ('demo-agrigento-scala', 2, null::text, 'demo-sciacca'),
  ('demo-madonie-cefalu', 1, null::text, 'demo-cefalu'),
  ('demo-madonie-cefalu', 2, null::text, 'demo-castelbuono'),
  ('demo-madonie-cefalu', 3, null::text, 'demo-piano-battaglia'),
  ('demo-madonie-cefalu', 4, null::text, 'demo-polizzi'),
  ('demo-entroterra-enna', 1, null::text, 'demo-enna'),
  ('demo-entroterra-enna', 2, null::text, 'demo-piazza-armerina'),
  ('demo-entroterra-enna', 3, 'interno', null::text),
  ('demo-entroterra-enna', 4, null::text, 'demo-caltagirone'),
  ('demo-entroterra-enna', 5, null::text, 'demo-enna'),
  ('demo-entroterra-enna', 6, null::text, 'demo-enna')
) as v(itinerary_slug, night_index, area_slug, place_slug)
join public.itineraries i on i.slug = v.itinerary_slug;
