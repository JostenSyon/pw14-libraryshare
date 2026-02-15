import bcrypt from "bcrypt";
import { pool } from "../config/db.js";


// Registrazione di un nuovo utente
export async function register(req, res) {
  const { username, email, password, full_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Campi mancanti" });
  }

  const cleanUsername = String(username).trim();
  const cleanEmail = String(email).trim();
  if (!cleanUsername || !cleanEmail) {
    return res.status(400).json({ error: "Campi mancanti" });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name)
       VALUES ($1,$2,$3,$4)`,
      [cleanUsername, cleanEmail, password_hash, full_name || null]
    );

    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Username o email già esistenti" });
    }
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

// Login utente
export async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Credenziali mancanti" });
  }

  const cleanUsername = String(username).trim();
  if (!cleanUsername) {
    return res.status(400).json({ error: "Credenziali mancanti" });
  }

  try {
    const r = await pool.query(
      `SELECT id, password_hash
       FROM users
       WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL`,
      [cleanUsername]
    );

    if (r.rowCount === 0) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    // crea sessione
    req.session.userId = user.id;

    console.log("sessione avviata:", !!req.session);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

// Logout utente
export function logout(req, res) {

  //distrugge la sessione lato server invalidando l'id di sessione i cookie lato client
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Errore logout" });
    }

    // cancella cookie lato client
    res.clearCookie("pw14.sid"); //nome del cookie di sessione
    res.json({ ok: true });
  });
}
