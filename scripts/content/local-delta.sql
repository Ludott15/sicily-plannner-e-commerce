-- Delta per il database locale (npm run db:reset NON si usa). Idempotente: si puo' rieseguire.
-- Porta le righe demo esistenti allo stato del seed nuovo: luoghi, collegamenti, prezzi, itinerari nuovi, testi dello shop.
-- I testi di luoghi, attivita', itinerari e consigli li riscrive poi content:catalog.
begin;

insert into public.places (slug, name, province, lat, lng, description, area_id) values
  ('demo-siracusa', 'Siracusa', 'SR', 37.069167, 15.2875, 'Siracusa è il capoluogo della provincia omonima, sulla costa orientale della Sicilia. Il centro antico è Ortigia, un’isola collegata alla terraferma da ponti. Il Parco archeologico della Neapolis, con il teatro greco scavato nel colle Temenite, l’anfiteatro romano e la latomia del Paradiso, si trova sulla terraferma e non sull’isola. Dal centro di Ortigia il parco si raggiunge in auto o con un tragitto a piedi più lungo. Da Siracusa si arriva in auto a Pantalica, a circa venti chilometri, e alle spiagge a sud della città.', (select id from public.areas where slug = 'siracusano')),
  ('demo-sperlinga', 'Sperlinga', 'EN', 37.766667, 14.35, 'Sperlinga è un piccolo comune della provincia di Enna, poco più di seicento abitanti, tra i Nebrodi e le Madonie. Il castello sorge su uno sperone di arenaria ed è in parte scavato nella roccia, e il borgo conta decine di grotte artificiali. Il castello è documentato dal 1132, quando apparteneva alla famiglia Rosso. Durante i Vespri siciliani del 1282 la guarnigione angioina resistette per oltre un anno, e un motto latino sull’arco d’ingresso ricorda l’episodio. La salita avviene per una scalinata ricavata nella pietra.', (select id from public.areas where slug = 'interno')),
  ('demo-calascibetta', 'Calascibetta', 'EN', 37.583333, 14.266667, 'Calascibetta è un borgo medievale sulle alture a ridosso di Enna. A circa tre chilometri dal paese, la necropoli di Realmese scende lungo i pendii del Cozzo San Giuseppe, con un gruppo fitto di tombe a grotticella scavate nella roccia. Le campagne di scavo degli anni 1949 e 1950 hanno portato alla luce 288 tombe. Le fonti datano l’uso del sito tra il IX e il VI secolo a.C., con qualche divergenza, e non hanno ancora individuato l’abitato a cui apparteneva. Nella vicina valle del Canalotto c’è un villaggio rupestre bizantino.', (select id from public.areas where slug = 'interno'))
on conflict (slug) do nothing;

update public.activities set place_id = (select id from public.places where slug = 'demo-riserva-dello-zingaro') where slug = 'demo-zingaro';
update public.activities set place_id = (select id from public.places where slug = 'demo-piano-battaglia') where slug = 'demo-pizzo-carbonara';
update public.activities set place_id = (select id from public.places where slug = 'demo-siracusa') where slug = 'demo-neapolis';
update public.activities set place_id = (select id from public.places where slug = 'demo-sperlinga') where slug = 'demo-sperlinga';
update public.activities set place_id = (select id from public.places where slug = 'demo-calascibetta') where slug = 'demo-calascibetta';
update public.activities set on_site_price_eur = null where slug in ('demo-palazzo-normanni', 'demo-teatro-massimo', 'demo-teatro-taormina', 'demo-scala-turchi', 'demo-casa-pirandello', 'demo-eraclea-spiaggia', 'demo-villa-casale', 'demo-morgantina', 'demo-vendicari');
update public.activities set duration_min = 30 where slug = 'demo-teatro-massimo';
update public.activities set title = 'Valle dei Templi', title_en = 'Valley of the Temples' where slug = 'demo-valle-templi';

-- Itinerari predefiniti (template editoriali). Testi, stagioni e consigli dal catalogo.
-- Stagione: intersezione dei mesi delle tappe stagionali (vuota = tutto l'anno). Vedi DA-VERIFICARE.md.
insert into public.itineraries (owner_id, title, slug, is_template, days, status, day_titles)
values
  (null, 'Weekend a Palermo e dintorni', 'demo-weekend-palermo', true, 3, 'planned', array['Palermo', 'Monreale e Palermo', 'Cefalù']::text[]),
  (null, 'Sicilia orientale in cinque giorni', 'demo-sicilia-orientale', true, 5, 'planned', array['Catania', 'Etna', 'Taormina', 'Ortigia']::text[]),
  (null, 'Trapani, Erice e Segesta in due giorni', 'demo-trapani-erice', true, 2, 'planned', array['Saline e mare', 'Erice e Segesta']::text[]),
  (null, 'Agrigento e la Scala dei Turchi in tre giorni', 'demo-agrigento-scala', true, 3, 'planned', array['Valle dei Templi', 'Scala dei Turchi', 'Eraclea Minoa']::text[]),
  (null, 'Madonie e Cefalù in cinque giorni', 'demo-madonie-cefalu', true, 5, 'planned', array['Cefalù', 'Castelbuono', 'Piano Battaglia', 'Polizzi Generosa', 'Cefalù e la costa']::text[]),
  (null, 'Entroterra ennese in sette giorni', 'demo-entroterra-enna', true, 7, 'planned', array['Enna', 'Piazza Armerina', 'Aidone', 'Caltagirone', 'Enna e l’Altesina', 'Calascibetta', 'Masseria e Caltagirone']::text[]) on conflict (slug) do nothing;

update public.itineraries set
  subtitle = 'Mercati, mosaici e mare in tre giorni',
  description = 'Tre giorni tra Palermo, Monreale e Cefalù. Il primo giorno è nel centro storico: il mercato di Ballarò al mattino, la Cappella Palatina nel palazzo dei Normanni nel pomeriggio e, la sera, i locali della Vucciria. Il secondo giorno porta a Monreale, con il duomo e i mosaici dorati, e al Teatro Massimo nel pomeriggio. Il terzo giorno è a Cefalù: la salita alla Rocca presto, quando è fresco, e il mare nel pomeriggio. Il ritmo è intenso, quindi conviene scegliere con calma cosa lasciare per una prossima volta.',
  suitable_for = array['couple', 'friends']::public.travel_party[],
  season_months = '{}'::smallint[],
  pace = 'intense',
  day_intros = array['Il mercato di Ballarò al mattino, il palazzo dei Normanni con la Cappella Palatina nel pomeriggio, la Vucciria la sera.', 'Monreale e il suo duomo con i mosaici dorati, poi il Teatro Massimo nel pomeriggio.', 'Cefalù in un giorno: la Rocca presto, il mare nel pomeriggio.']::text[],
  day_notes = array['Arriva al mercato di buon mattino, quando l’offerta è più ampia. Per la Cappella Palatina controlla in anticipo gli orari, che possono variare con la stagione.', 'Dedica un’ora al chiostro benedettino accanto al duomo di Monreale. Per il Teatro Massimo le visite guidate hanno durata e prezzi variabili e vanno prenotate: controlla sul sito del teatro.', 'La salita alla Rocca richiede tempi molto diversi a seconda delle fonti, da circa un’ora e mezza a tre ore: parti presto, porta acqua e scarpe chiuse.']::text[],
  tips = array['Cefalù è sulla costa e Monreale sulla collina sopra Palermo: pianifica gli spostamenti con i mezzi o con l’auto, e lascia margine per il rientro serale.', 'Porta acqua e un cappello per la Rocca e per le ore di mezzogiorno in città. Verifica online gli orari delle visite prima di partire, perché sono cambiati nel tempo.', 'Il ritmo è intenso: se preferisci un passo più lento, scegli due tappe per giorno e lascia spazio alle soste.']::text[]
where slug = 'demo-weekend-palermo';

update public.itineraries set
  subtitle = 'Catania, l’Etna, Taormina e Siracusa in cinque giorni',
  description = 'Il giro della costa orientale con l’Etna al centro, da Catania a Noto passando per Taormina e Ortigia. Il percorso è pensato per la bella stagione, da maggio a ottobre: l’escursione ai crateri dell’Etna e il kayak alla Isola Bella dipendono dal tempo, dalle condizioni del vulcano e del mare. Il ritmo è intenso, con giornate lunghe e un giorno all’aperto in riserva, dove l’acqua e il cappello sono indispensabili. Si può accorciare, lasciando fuori Noto o Taormina, senza perdere il filo del viaggio.',
  suitable_for = array['family', 'friends']::public.travel_party[],
  season_months = array[5, 6, 7, 8, 9, 10]::smallint[],
  pace = 'intense',
  day_intros = array['Il mercato del pesce a Catania nelle prime ore del mattino, poi la città barocca a piedi.', 'L’Etna in mattinata con una guida autorizzata, e una cantina nel tardo pomeriggio.', 'Il teatro antico di Taormina al mattino, la baia di Isola Bella nel pomeriggio.', 'Ortigia a piedi con il duomo e la Fonte Aretusa, poi il parco della Neapolis.', 'Noto e la riserva di Vendicari: giornata lunga, con acqua e cappello.']::text[],
  day_notes = array['Arriva al mercato nelle prime ore, quando l’offerta è più ampia. Per la città barocca conviene un paio d’ore a piedi, con pause nelle piazze.', 'Le escursioni ai crateri dell’Etna si fanno con guida autorizzata e dipendono dalle condizioni del vulcano: verifica con la guida il giorno prima. In quota fa freddo anche d’estate, porta una giacca.', 'Il teatro è più tranquillo al mattino. Per Isola Bella l’accesso è a piedi lungo un istmo di ciottoli, percorribile con mare calmo: controlla le condizioni del mare e il biglietto.', 'La Neapolis apre presto e il caldo arriva a mezzogiorno: il pomeriggio presto è più comodo, con acqua. Il parco si visita in circa due ore e mezza.', 'A Vendicari il percorso è all’aperto e con poca tappa all’ombra: porta acqua e cappello. Nei pantani possono esserci fenicotteri, ma dipende dalla stagione.']::text[],
  tips = array['Il giro è pensato per la stagione da maggio a ottobre. Prenota con anticipo le escursioni in quota e le guide dei crateri, perché i posti sono limitati e le condizioni del vulcano cambiano.', 'Le distanze tra le tappe sono notevoli: usa l’auto per Etna, Noto e Vendicari, e il treno o il bus solo dove sono collegati. Calcola più tempo del previsto per gli spostamenti.', 'Se il ritmo è troppo serrato, togli una tappa per giornata: il filo del viaggio resta la costa orientale, con l’Etna e Ortigia.']::text[]
where slug = 'demo-sicilia-orientale';

update public.itineraries set
  subtitle = 'Saline, borghi sul monte e il tempio dorico',
  description = 'Due giorni nella Sicilia occidentale: le saline di Trapani, il borgo medievale di Erice in cima al monte e il tempio dorico di Segesta. La prima giornata è tra le saline, con il tramonto come momento migliore, e una cena di cous cous trapanese. La seconda inizia presto a Segesta, dove il tempio è in basso e il teatro sta in cima al monte Barbaro, e prosegue nel pomeriggio a Erice. Il percorso è pensato per la stagione da maggio a settembre, con un ritmo bilanciato.',
  suitable_for = array['couple', 'friends']::public.travel_party[],
  season_months = array[5, 6, 7, 8, 9]::smallint[],
  pace = 'balanced',
  day_intros = array['Le saline di Trapani nel pomeriggio, con il tramonto, e una cena di cous cous.', 'Il tempio dorico di Segesta al mattino, Erice nel primo pomeriggio.']::text[],
  day_notes = array['Le saline si visitano a piedi o in bici: la riserva è vasta e i mulini sono sparsi tra le vasche. Il Museo del sale di Nubia è nel baglio con il mulino: verifica gli orari prima.', 'A Segesta il tempio è in basso e il teatro in cima al monte Barbaro, a circa un centinaio di metri più in alto: il collegamento è con navetta o a piedi lungo una salita. Porta acqua e cappello.']::text[],
  tips = array['Erice si raggiunge con la funivia da Trapani: bastano pochi minuti di salita, con vista sul golfo e sulle Egadi, e così il pomeriggio inizia dall’alto.', 'Per Segesta prevedi tempo per entrambe le parti del sito, perché il tempio e il teatro sono separati da un tratto di strada. Scarpe comode e acqua.', 'Il cous cous trapanese è legato al mare: nei mesi estivi conviene prenotare la cena in anticipo.']::text[]
where slug = 'demo-trapani-erice';

update public.itineraries set
  subtitle = 'La Valle dei Templi e la scogliera di marna bianca',
  description = 'Tre giorni tra i templi dorici di Agrigento, la Scala dei Turchi e le botteghe di ceramica di Sciacca, con Eraclea Minoa sul mare. La Valle dei Templi è il cuore del viaggio ed è patrimonio UNESCO dal 1997; la Kolymbethra, un giardino di agrumi gestito dal FAI, offre una pausa nel verde. La Scala dei Turchi, scogliera di marna bianca sulla costa, ha regole d’accesso che cambiano nel tempo: va programmata con attenzione, e la stagione più adatta va da maggio a ottobre. Il ritmo è bilanciato, con il caldo dell’estate da mettere in conto.',
  suitable_for = array['family', 'couple']::public.travel_party[],
  season_months = array[5, 6, 7, 8, 9, 10]::smallint[],
  pace = 'balanced',
  day_intros = array['Valle dei Templi al mattino, la Kolymbethra a pranzo, la casa natale di Pirandello nel pomeriggio.', 'La Scala dei Turchi al mattino, poi le botteghe di ceramica di Sciacca.', 'Eraclea Minoa: la spiaggia e gli scavi sul mare.']::text[],
  day_notes = array['Per la Valle dei Templi conviene arrivare presto o nel tardo pomeriggio, quando il caldo cala. Il tempio della Concordia è il monumento più noto del parco.', 'L’accesso alla Scala dei Turchi è regolato e cambia nel tempo, con chiusure in alcune estati. Verifica il giorno prima con il Comune di Realmonte e porta scarpe con suola morbida, perché la marna è scivolosa.', 'Eraclea Minoa è sulla costa: il teatro greco è stato al centro di lavori e di polemiche sulla copertura provvisoria. Verifica quali aree sono aperte prima di andare.']::text[],
  tips = array['L’auto è quasi indispensabile: la Scala dei Turchi ed Eraclea Minoa non sono raggiungibili con i mezzi pubblici, e lungo la costa ci sono parcheggi a pagamento.', 'A Sciacca le botteghe di ceramica sono nel centro: chiedi in anticipo se è possibile un laboratorio con il ceramista, perché non tutte le botteghe lo offrono.', 'In estate il caldo è forte: porta acqua e un cappello, e fai le visite all’aperto nelle ore più fresche.']::text[]
where slug = 'demo-agrigento-scala';

update public.itineraries set
  subtitle = 'Cefalù, le Madonie e i borghi in cima',
  description = 'Cinque giorni tra il mare di Cefalù e le Madonie: il duomo normanno, il santuario di Gibilmanna, i borghi di Castelbuono e Polizzi Generosa, le faggete di Piano Battaglia e la salita a Pizzo Carbonara, il punto più alto del massiccio. Il ritmo è bilanciato: la prima parte è tra i borghi e la seconda tra la montagna e il mare. Alcune tappe, come la salita e il giro in barca, dipendono dal meteo e dalla stagione, e vanno fatte tra primavera e autunno. Per gran parte delle tappe serve l’auto.',
  suitable_for = array['solo', 'couple']::public.travel_party[],
  season_months = array[5, 6, 9, 10]::smallint[],
  pace = 'balanced',
  day_intros = array['Il duomo normanno di Cefalù al mattino, il santuario di Gibilmanna a pranzo, il lavatoio nel centro.', 'Castelbuono e il suo castello, poi il caseificio delle Madonie nel pomeriggio.', 'Le faggete di Piano Battaglia: un anello tra gli alberi.', 'La salita a Pizzo Carbonara: giornata lunga, si parte presto.', 'Calette in barca al mattino, la Rocca di Cefalù nel pomeriggio.']::text[],
  day_notes = array['Il duomo di Cefalù è in centro e si visita con calma al mattino. Gibilmanna si raggiunge in auto, con una strada in salita tra i boschi.', 'Castelbuono è un borgo arroccato, con il castello dei Ventimiglia che ospita il museo civico. Chiedi in anticipo se il caseificio richiede una prenotazione.', 'Piano Battaglia è in quota e ha rifugi per chi vuole fermarsi a dormire. L’anello nella faggeta richiede scarpe da trekking e una giacca, anche d’estate.', 'La salita a Pizzo Carbonara è lunga: le fonti danno tempi tra due ore e mezza e sette ore, a seconda del ritmo. Parti presto, porta acqua e controlla il meteo.', 'Il giro in barca dipende dal mare e dalla stagione: verifica il giorno prima con l’operatore. Dopo il pranzo, la Rocca di Cefalù si sale per il sentiero dal centro.']::text[],
  tips = array['Le Madonie sono un parco con sentieri in quota: in primavera e autunno le temperature sono più miti, mentre in estate conviene partire presto. In inverno la neve può interessare Piano Battaglia.', 'Un’auto è quasi indispensabile: le tappe sono in borghi e aree di montagna con poco trasporto pubblico. Porta acqua e cibo per la giornata in quota.', 'Pizzo Carbonara e il giro in barca sono da fare da maggio a ottobre: se viaggi in altri mesi, scambia l’ordine dei giorni o sostituisci le tappe.']::text[]
where slug = 'demo-madonie-cefalu';

update public.itineraries set
  subtitle = 'Enna, Piazza Armerina e Caltagirone con calma',
  description = 'Sette giorni nell’entroterra siciliano: il castello e il duomo di Enna, la Villa Romana del Casale e il centro di Piazza Armerina, gli scavi di Morgantina e il museo di Aidone, la scalinata di maiolica e i laboratori di Caltagirone. Il ritmo è rilassato: ogni giorno ha una o due tappe, con pause per il pranzo in masseria e per le passeggiate tra le colline. Il viaggio ruota intorno a Enna, con basi in città diverse per non fare sempre la stessa strada. Adatto a chi viaggia da solo o con amici e vuole una Sicilia diversa dalla costa.',
  suitable_for = array['solo', 'friends']::public.travel_party[],
  season_months = array[3, 4, 5, 6, 9, 10, 11]::smallint[],
  pace = 'relaxed',
  day_intros = array['Il castello di Lombardia e il duomo di Enna, con vista sull’Etna.', 'Villa Romana del Casale al mattino, il centro di Piazza Armerina nel pomeriggio.', 'Gli scavi di Morgantina e il museo di Aidone.', 'Scalinata di maiolica e laboratorio di ceramica a Caltagirone.', 'Il sentiero del monte Altesina, tra bosco e resti antichi.', 'Calascibetta e le tombe a grotticella di Realmese.', 'Pranzo in masseria e museo della ceramica a Caltagirone.']::text[],
  day_notes = array['Il castello è sulla cima della città: parti dal duomo e sali a piedi, con scarpe comode. Gli orari dei castelli vanno verificati con l’ufficio turistico, perché le fonti non concordano.', 'Per la Villa del Casale conviene la visita al mattino, con il sito meno affollato. Verifica prima se serve la prenotazione: le fonti non concordano.', 'Visitare il museo prima del parco rende più chiari i resti di Morgantina. L’auto è la soluzione più semplice per spostarsi tra Piazza Armerina e Aidone.', 'La scalinata di Santa Maria del Monte ha 142 gradini rivestiti di maiolica: va vista al mattino. Per il laboratorio chiedi se serve la prenotazione.', 'Per il monte Altesina porta acqua, una mappa e informazioni aggiornate sull’accesso alla riserva. Le fonti non danno una lunghezza precisa del percorso.', 'Calascibetta e Realmese sono su pendii ripidi: scarpe chiuse e tempo per le soste. La necropoli è a qualche chilometro dal borgo: l’auto è la scelta più pratica.', 'Le masserie lavorano spesso su prenotazione, con il pranzo a orari fissi: prenota in anticipo. Per il museo della ceramica verifica gli orari sul sito, che possono variare nel corso dell’anno.']::text[],
  tips = array['Il percorso va fatto in auto: i borghi e i siti sono distanti tra loro, e il trasporto pubblico è limitato. Lascia spazio per le soste, perché l’interno si gode con calma.', 'Le temperature cambiano tra Enna, a circa 930 metri, e la costa: porta una giacca anche in estate per le sere in quota.', 'Fai le prenotazioni dove servono, come la villa, le masserie e i laboratori di ceramica. Orari e prezzi cambiano: verifica sul sito o all’ufficio turistico.']::text[]
where slug = 'demo-entroterra-enna';


-- Tappe dei quattro nuovi. Ogni giorno resta entro il ritmo (ore × 60 minuti).
insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, time_slot, notes)
select i.id, v.day_index, v.position, a.id, v.time_slot::public.time_slot, v.notes
from (values
  -- Trapani, Erice e Segesta (balanced, 360): giorno 1 = 120 + 180, giorno 2 = 150 + 150.
  ('demo-trapani-erice', 0, 0, 'demo-saline-trapani', 'afternoon', 'Il tramonto sulle saline è il momento migliore.'),
  ('demo-trapani-erice', 0, 1, 'demo-cous-cous', 'evening', null),
  ('demo-trapani-erice', 1, 0, 'demo-segesta-tempio', 'morning', 'Mettiti in cammino presto: a metà giornata il sole sul colle si sente.'),
  ('demo-trapani-erice', 1, 1, 'demo-erice-borgo', 'afternoon', null),
  -- Agrigento (balanced, 360): 180 + 90 + 60 = 330; 150 + 120 = 270; 300.
  ('demo-agrigento-scala', 0, 0, 'demo-valle-templi', 'morning', 'Arriva presto: il caldo si fa sentire nelle ore centrali.'),
  ('demo-agrigento-scala', 0, 1, 'demo-kolymbethra', 'lunch', null),
  ('demo-agrigento-scala', 0, 2, 'demo-casa-pirandello', 'afternoon', null),
  ('demo-agrigento-scala', 1, 0, 'demo-scala-turchi', 'morning', 'Scarpe da scoglio: la marna è scivolosa.'),
  ('demo-agrigento-scala', 1, 1, 'demo-ceramiche-sciacca', 'afternoon', null),
  ('demo-agrigento-scala', 2, 0, 'demo-eraclea-spiaggia', 'morning', null),
  -- Madonie e Cefalù (balanced, 360): 60 + 120 + 60; 150 + 120; 240; 300; 150 + 150.
  ('demo-madonie-cefalu', 0, 0, 'demo-duomo-cefalu', 'morning', null),
  ('demo-madonie-cefalu', 0, 1, 'demo-gibilmanna', 'lunch', null),
  ('demo-madonie-cefalu', 0, 2, 'demo-lavatoio-cefalu', 'afternoon', null),
  ('demo-madonie-cefalu', 1, 0, 'demo-castelbuono-borgo', 'morning', null),
  ('demo-madonie-cefalu', 1, 1, 'demo-formaggi-madonie', 'afternoon', null),
  ('demo-madonie-cefalu', 2, 0, 'demo-madonie-faggete', 'morning', 'Porta una giacca: tra i faggi l’aria è più fresca.'),
  ('demo-madonie-cefalu', 3, 0, 'demo-pizzo-carbonara', 'morning', 'Parti presto e porta acqua: la salita è lunga.'),
  ('demo-madonie-cefalu', 4, 0, 'demo-barca-cefalu', 'morning', null),
  ('demo-madonie-cefalu', 4, 1, 'demo-rocca-cefalu', 'afternoon', null),
  -- Entroterra ennese (relaxed, 240): 120 + 90; 150 + 90; 180; 90 + 150; 240; 180; 150 + 90.
  ('demo-entroterra-enna', 0, 0, 'demo-castello-enna', 'morning', null),
  ('demo-entroterra-enna', 0, 1, 'demo-duomo-enna', 'afternoon', null),
  ('demo-entroterra-enna', 1, 0, 'demo-villa-casale', 'morning', 'Prenota la visita del mattino: il sito si riempie presto.'),
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
join public.activities a on a.slug = v.activity_slug
where not exists (select 1 from public.itinerary_items x where x.itinerary_id = i.id);



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
join public.itineraries i on i.slug = v.itinerary_slug
on conflict do nothing;



update public.itineraries set season_months = array[5,6,7,8,9,10]::smallint[] where slug = 'demo-agrigento-scala';
update public.itineraries set season_months = array[5,6,9,10]::smallint[] where slug = 'demo-madonie-cefalu';
update public.itineraries set season_months = array[3,4,5,6,9,10,11]::smallint[] where slug = 'demo-entroterra-enna';
update public.itineraries set season_months = array[5,6,7,8,9,10]::smallint[] where slug = 'demo-sicilia-orientale';
update public.itineraries set season_months = array[5,6,7,8,9]::smallint[] where slug = 'demo-trapani-erice';

update public.itinerary_items set notes = 'Arriva presto: il caldo si fa sentire nelle ore centrali.' where activity_id = (select id from public.activities where slug = 'demo-valle-templi') and notes like '%momento migliore per i templi%';

update public.products set description = 'Crema spalmabile al pistacchio di Bronte, da spalmare su pane e dolci.' where slug = 'demo-crema-pistacchio';
update public.products set description = 'Pistacchi di Bronte tostati e salati, da sgranocchiare.' where slug = 'demo-pistacchi-tostati';
update public.products set description = 'Cannolo siciliano alla ricotta, da consumare entro pochi giorni.' where slug = 'demo-cannoli-ricotta';
update public.products set description = 'Formaggio ragusano a pasta semidura, prodotto nel territorio di Ragusa.' where slug = 'demo-ragusano-dop';
update public.products set description = 'Olio extravergine di oliva del territorio ibleo.' where slug = 'demo-olio-iblea';
update public.products set description = 'Pasta di grano antico, prodotta con semola di grano duro antico.' where slug = 'demo-pasta-grano-antico';
update public.products set description = 'Sale marino aromatizzato con erbe, da usare in cucina.' where slug = 'demo-sale-marino';
update public.products set description = 'Cofanetto con tre prodotti scelti tra quelli del catalogo.' where slug = 'demo-box-sicilia';
update public.producers set name = 'Produttore di pistacchi di Bronte', story_it = 'Produttore di pistacchio verde di Bronte: la raccolta si fa a mano tra fine agosto e inizio ottobre.' where slug = 'demo-pistacchi-bronte';
update public.producers set name = 'Produttore del Ragusano', story_it = 'Produttore di formaggio ragusano, olio e pasta nel territorio di Ragusa.' where slug = 'demo-terra-iblea';
update public.suppliers set name = 'Fornitore di prova', notes = 'Fornitore di prova: nessun contratto reale.' where contact_email = 'demo-fornitore@example.com';
update public.guides set title_it = 'Guida di prova: prima volta in Sicilia', author_name = 'Redazione di Isula' where slug = 'demo-guida-prima-volta';

update public.places set description = replace(description, '[DEMO] ', '') where slug like 'demo-%' and description like '%[DEMO] %';
update public.places set tagline_it = replace(tagline_it, '[DEMO] ', '') where slug like 'demo-%' and tagline_it like '%[DEMO] %';
update public.activities set title = replace(title, '[DEMO] ', '') where slug like 'demo-%' and title like '%[DEMO] %';
update public.activities set description = replace(description, '[DEMO] ', '') where slug like 'demo-%' and description like '%[DEMO] %';
update public.itineraries set title = replace(title, '[DEMO] ', '') where slug like 'demo-%' and is_template and title like '%[DEMO] %';
update public.itineraries set subtitle = replace(subtitle, '[DEMO] ', '') where slug like 'demo-%' and is_template and subtitle like '%[DEMO] %';
update public.itineraries set description = replace(description, '[DEMO] ', '') where slug like 'demo-%' and is_template and description like '%[DEMO] %';
update public.activity_offers set title = replace(title, '[DEMO] ', '') where partner_product_id like 'demo-%' and title like '%[DEMO] %';
update public.products set title = replace(title, '[DEMO] ', '') where slug like 'demo-%' and title like '%[DEMO] %';
update public.products set description = replace(description, '[DEMO] ', '') where slug like 'demo-%' and description like '%[DEMO] %';
update public.producers set name = replace(name, '[DEMO] ', '') where slug like 'demo-%' and name like '%[DEMO] %';
update public.producers set story_it = replace(story_it, '[DEMO] ', '') where slug like 'demo-%' and story_it like '%[DEMO] %';
update public.guides set title_it = replace(title_it, '[DEMO] ', '') where slug like 'demo-%' and title_it like '%[DEMO] %';
update public.guides set summary_it = replace(summary_it, '[DEMO] ', '') where slug like 'demo-%' and summary_it like '%[DEMO] %';
update public.guides set body_it = replace(body_it, '[DEMO] ', '') where slug like 'demo-%' and body_it like '%[DEMO] %';
update public.itinerary_items set notes = replace(notes, '[DEMO] ', '') where notes like '%[DEMO] %' and itinerary_id in (select id from public.itineraries where is_template and slug like 'demo-%');
update public.suppliers set name = replace(name, '[DEMO] ', '') where contact_email = 'demo-fornitore@example.com';

commit;
