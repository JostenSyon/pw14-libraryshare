# Setup database

## Prerequisiti
- PostgreSQL attivo
- variabile `DATABASE_URL` valorizzata
- estensioni disponibili: `postgis`, `pg_trgm`
- file `.env` letto automaticamente dagli script npm

## Script disponibili
- `db/00_init.sql`: crea schema e indici, e allinea automaticamente i vincoli noti (script unico)
- `db/01_seed_example.sql`: inserisce dati minimi di esempio

## Comandi
```bash
npm run db:init
npm run db:seed
npm run db:setup
```

## Note
- `db:init` e' idempotente: puo' essere rilanciato senza distruggere i dati.
- Per lo schema vuoto utilizzare solo `npm run db:init`.
