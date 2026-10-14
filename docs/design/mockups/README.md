# Mockup

Riferimenti per struttura, gerarchia e contenuti. Non sono codice da copiare: gli stili sono inline e i testi tra parentesi quadre sono segnaposto che nell'interfaccia vengono dal database.

| File | Cosa | Stato |
| --- | --- | --- |
| `Home.html` | Home, desktop | Superato dal passo 1.2 |
| `HomeMobile.html` | Home, mobile | Superato dal passo 1.2 |
| `Attivita.html` | Scheda attività, desktop | Riferimento |
| `AttivitaMobile.html` | Scheda attività, mobile | Riferimento |
| `Itinerario.html` | Itinerario di gruppo, desktop | Riferimento |
| `ItinerarioMobile.html` | Itinerario di gruppo, mobile | Riferimento |
| `ItinerarioProntoMobile.html` | Itinerario pronto, mobile | Riferimento |
| `OnboardingMobile.html` | Onboarding, mobile | Riferimento |

## Home superata dal passo 1.2

`Home.html` e `HomeMobile.html` non descrivono più la home. Il passo 1.2 ha cambiato:

- l'hero senza testo sulla foto: la foto è la copertina del luogo in evidenza di home (`is_home_hero`), con la didascalia sotto; su mobile è a tutta larghezza sopra il testo, su desktop a destra;
- il carosello "Dove andare in Sicilia" al posto della card d'esempio: compare con almeno quattro luoghi con foto propria, nell'ordine scelto nell'admin;
- niente "Tre passi, poi parti" e niente card "Esempio · Giorno 1": le chiavi di messaggi sono state tolte;
- gli itinerari pronti in home mostrano durata e aree di viaggio.

Per la home fa fede il codice in `src/app/[locale]/(public)/page.tsx` e la sua specifica nella roadmap.
