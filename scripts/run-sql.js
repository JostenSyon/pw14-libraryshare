import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Uso: node scripts/run-sql.js <file.sql>');
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(sqlPath)) {
  console.error(`File SQL non trovato: ${sqlPath}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL mancante. Controlla il file .env');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function run() {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    console.log(`OK: eseguito ${fileArg}`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Errore esecuzione SQL:', err.message || err);
  process.exit(1);
});
