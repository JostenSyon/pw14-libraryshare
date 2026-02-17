# PW14 LibraryShare

Piattaforma web per lo scambio locale di libri tra privati, con attenzione alla privacy della posizione geografica.

## Cos'è

LibraryShare è un progetto universitario (Project Work 14) che permette di condividere il proprio patrimonio librario con persone vicine geograficamente. L'idea è semplice: hai dei libri che non leggi più? Qualcuno vicino a te potrebbe essere interessato.

Il focus principale è stato mantenere la privacy degli utenti, in particolare sulla geolocalizzazione: la posizione viene approssimata e mai esposta in forma precisa.

## Funzionalità

- **Autenticazione**: registrazione e login con sessione lato server (no JWT, per avere logout effettivo).
- **Profilo utente**: gestione dati personali e preferenza di contatto (email o telefono).
- **Posizione anonimizzata**: l'utente può impostare la propria posizione con consenso esplicito. Viene approssimata su griglia da 5 o 10 km prima di essere salvata.
- **Ricerca libri vicini**: trova libri disponibili entro un certo raggio (filtri per titolo, autore, genere, distanza).
- **Home personalizzata**: se hai impostato la posizione vedi una sezione "vicini a te", più le classifiche dei libri più richiesti e più visualizzati.
- **Libreria personale**: aggiungi i tuoi libri, segna se sono disponibili per il prestito, rimuovili quando vuoi. Vista lista o griglia.
- **Prestiti**: richiedi un libro, il proprietario può accettare o rifiutare. Una volta accettato, i contatti vengono condivisi e il proprietario segna quando il libro viene restituito.
- **Integrazione Open Library**: per facilitare l'inserimento, i libri possono essere cercati su Open Library via ISBN e importati automaticamente.
- **Upload copertine**: gli admin possono caricare/aggiornare copertine per i libri.
- **Pannello admin**: statistiche, gestione utenti, soft-delete utenti.

## Stack

- **Frontend**: HTML, CSS e JavaScript vanilla. No framework, tutto scritto a mano per capire bene cosa succede sotto.
- **Backend**: Node.js + Express. Semplice, veloce, fa il suo lavoro.
- **Database**: PostgreSQL con estensioni PostGIS (per le coordinate) e pg_trgm (per la ricerca testuale fuzzy).
- **Altro**: Multer per upload file, bcrypt per le password.

## Come farlo partire

### Requisiti

- Node.js (testato con v20, ma dovrebbe andare anche con v18+)
- PostgreSQL installato e avviato
- Le estensioni PostGIS e pg_trgm abilitate (gli script le creano se mancano)

### Setup

1. Clona il repository:
```bash
git clone https://github.com/JostenSyon/pw14-libraryshare.git
cd pw14-libraryshare
```

2. Crea un file `.env` nella root del progetto con questi valori:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/pw14
SESSION_SECRET=metti-qui-una-stringa-casuale
PORT=3000
```

3. Installa le dipendenze:
```bash
npm install
```

4. Inizializza il database:
```bash
npm run db:init    # crea le tabelle
npm run db:seed    # resetta e popola con dati demo completi
```

Oppure tutto insieme:
```bash
npm run db:setup
```

5. Avvia il server:
```bash
npm run dev      # sviluppo (con nodemon)
# oppure:
npm start        # avvio standard
```

Apri il browser su `http://localhost:3000`

## Script database

- `db/00_init.sql`: schema completo (tabelle, indici, vincoli, estensioni)
- `db/01_seed_example.sql`: dataset demo completo estratto dal database locale (utenti, catalogo, prestiti, geodati approssimati)

### Nota seed

- `npm run db:seed` esegue un `TRUNCATE ... RESTART IDENTITY` delle tabelle applicative prima di inserire i dati demo.
- Usa `db:seed` solo su ambienti di sviluppo/test.

## Note sulla privacy

Questo progetto implementa funzionalità di geolocalizzazione **senza compromettere la privacy**:

- La posizione GPS reale **non viene mai salvata** nel database.
- Prima di essere inviata al server, viene approssimata su una griglia (5 km per città, 10 km per aree rurali).
- Le coordinate precise **non vengono mai esposte** al frontend, nemmeno agli admin.
- La ricerca è limitata a un raggio massimo di 200 km (coerente con l'idea di scambio locale).
- Il progetto prevede un cooldown di 48 ore sugli aggiornamenti posizione per evitare triangolazioni (nel codice è configurabile con un flag).
- I contatti tra utenti vengono condivisi **solo dopo che il prestito è stato accettato**.


## Stato del progetto

Questo è un **progetto didattico** sviluppato in circa un mese per il corso di Project Work. Funziona e fa quello che deve fare, ma ci sono sicuramente margini di miglioramento:

- Non c'è una moderazione vera sui contenuti (si assume buona fede).
- L'editing dei metadati è basico (per ora si può solo aggiungere/rimuovere/editare).
- Non c'è un sistema di notifiche push (tutto via polling o refresh).
- Nessuna verifica dell'email durante la registrazione (necessita di un account di invio email)
- Per quanto il progetto soddisfa i requisiti GDPR per sicurezza e protezione dei dati il progetto necessita di un messaggio per accettazione/rifiuto cookie

Se qualcuno volesse estenderlo o usarlo come base per qualcosa di più serio, ben venga. Pull request accettate dopo il completamento e la valutazione del PW

## Licenza

Licenza ISC (vedi `package.json`).

## English note

Academic project focused on local book sharing with privacy-first geolocation design. Backend (Node.js/Express), frontend (vanilla JS), PostgreSQL with PostGIS. See above for details.
