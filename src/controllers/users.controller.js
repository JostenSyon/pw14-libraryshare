import { pool } from "../config/db.js";
import { logout } from "./auth.controller.js";

const cooldownMs = 48 * 60 * 60 * 1000; // 48h in ms
const cooldownCheck = false; // disabilita controllo cooldown per test/debug  


// Ottiene i dettagli dell'utente loggato
export async function getMe(req, res) {
  try {
    const r = await pool.query(
      `SELECT id, username, email, full_name, created_at, is_trusted, is_admin, phone, exchange_contact_preference
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.session.userId]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Aggiorna i dettagli dell'utente loggato
export async function updateMe(req, res) {
  const userId = req.session?.userId;
  const { email, full_name, phone, exchange_contact_preference } = req.body;

  // almeno un campo da aggiornare
  if (
    email === undefined &&
    full_name === undefined &&
    phone === undefined &&
    exchange_contact_preference === undefined
  ) {
    return res.status(400).json({ error: "Nessun campo da aggiornare" });
  }

  // Normalizzazione / validazione campi contatto
  const pref = exchange_contact_preference !== undefined
    ? String(exchange_contact_preference).trim().toLowerCase()
    : undefined;

  if (pref !== undefined && pref !== "email" && pref !== "phone") {
    return res.status(400).json({ error: "exchange_contact_preference non valido (email/phone)" });
  }

  const cleanPhone = phone !== undefined
    ? (String(phone).trim() ? String(phone).trim() : null)
    : undefined;

  // Evita stati incoerenti:
  // - se imposto preferenza 'phone' devo avere un phone valorizzato (nel body o già salvato)
  // - se provo a rimuovere il phone mentre la preferenza (nuova o attuale) è 'phone' -> errore
  let currentPref = null;
  let currentPhone = null;

  const needsPrefPhoneCheck = pref === "phone" && cleanPhone === undefined;
  const needsRemovePhoneCheck = cleanPhone === null && (pref === undefined || pref === "phone");

  if (needsPrefPhoneCheck || needsRemovePhoneCheck) {
    const c = await pool.query(
      `SELECT phone, exchange_contact_preference
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (c.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    currentPhone = c.rows[0].phone;
    currentPref = c.rows[0].exchange_contact_preference;
  }

  if (pref === "phone") {
    const effectivePhone = cleanPhone !== undefined ? cleanPhone : currentPhone;
    if (!effectivePhone) {
      return res.status(400).json({ error: "Per usare 'phone' devi impostare un numero di telefono" });
    }
  }

  if (cleanPhone === null) {
    const effectivePref = pref !== undefined ? pref : currentPref;
    if (effectivePref === "phone") {
      return res.status(400).json({ error: "Non puoi rimuovere il telefono se la preferenza è 'phone'" });
    }
  }

  // costruiamo dinamicamente SET (evita di sovrascrivere con undefined)
  const sets = [];
  const values = [];
  let i = 1;

  if (email !== undefined) {
    const cleanEmail = String(email).trim();
    if (!cleanEmail) return res.status(400).json({ error: "Email non valida" });
    sets.push(`email = $${i++}`);
    values.push(cleanEmail);
  }

  if (full_name !== undefined) {
    const cleanName = String(full_name).trim();
    // full_name può anche essere vuoto -> trattiamo come NULL
    sets.push(`full_name = $${i++}`);
    values.push(cleanName ? cleanName : null);
  }

  if (cleanPhone !== undefined) {
    sets.push(`phone = $${i++}`);
    values.push(cleanPhone);
  }

  if (pref !== undefined) {
    sets.push(`exchange_contact_preference = $${i++}`);
    values.push(pref);
  }

  // aggiorna updated_at automaticamente
  sets.push(`updated_at = NOW()`);



  values.push(userId);

  try {
    const r = await pool.query(
      `UPDATE users
       SET ${sets.join(", ")}
       WHERE id = $${i} AND deleted_at IS NULL
       RETURNING id, username, email, full_name, phone, exchange_contact_preference, created_at, updated_at`,
      values
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    // username/email uniche
    if (e.code === "23505") {
      return res.status(409).json({ error: "Email già in uso" });
    }
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Elimina (soft delete) l'utente loggato
export async function deleteMe(req, res) {
  const userId = req.session?.userId;

  try {
    const r = await pool.query(
      `UPDATE users
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [userId]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    // logout: distrugge sessione e cancella cookie
    logout(req, res)

    
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Ottiene la lista utenti (admin)
export async function getUsers(req, res) {
  const includeDeletedRaw = String(req.query?.include_deleted || "").toLowerCase();
  const includeDeleted = includeDeletedRaw === "1" || includeDeletedRaw === "true";

  try {
    const r = await pool.query(
      `SELECT id, username, email, full_name, created_at, is_trusted, is_admin, deleted_at
       FROM users
       ${includeDeleted ? "" : "WHERE deleted_at IS NULL"}
       ORDER BY created_at DESC`
    );

    res.json(r.rows); //stampa tutte le righe
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Ottiene la lista utenti affidabili (admin)
export async function getTrustedUsers(req, res) {
  try {
    const r = await pool.query(
      `SELECT id, username, email, full_name, created_at, is_trusted
       FROM users
       WHERE is_trusted = TRUE AND deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Imposta/rimuove lo stato di utente affidabile (admin)
export async function setTrustedUser(req, res) {
  const { id } = req.body;
  const { is_trusted } = req.body;
  const idNum = Number(id);

  if (typeof is_trusted !== "boolean") {
    return res.status(400).json({ error: "is_trusted deve essere boolean" });
  }
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: "id utente non valido" });
  }
  //console.log(`Imposto is_trusted=${is_trusted} per utente id=${id}`);

  try {
    const r = await pool.query(
      `UPDATE users
       SET is_trusted = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, username, is_trusted`,
      [id, is_trusted]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  } 
  
}   

// Ottiene la lista utenti admin (admin only)
export async function getAdmins(req, res) {
  try {
    const r = await pool.query(
      `SELECT id, username, email, full_name, created_at, is_admin
       FROM users
       WHERE deleted_at IS NULL AND is_admin = TRUE
       ORDER BY created_at DESC`
    );

    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

// Imposta/rimuove lo stato di admin (admin only)
// body: { user_id: number|string, is_admin: boolean }
export async function setAdminUser(req, res) {
  const { user_id, is_admin } = req.body;
  const uid = Number(user_id);

  if (!Number.isInteger(uid) || uid <= 0) {
    return res.status(400).json({ error: "user_id non valido" });
  }
  if (typeof is_admin !== "boolean") {
    return res.status(400).json({ error: "is_admin deve essere boolean" });
  }

  try {
    const r = await pool.query(
      `UPDATE users
       SET is_admin = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, username, email, full_name, is_admin`,
      [uid, is_admin]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

// Imposta la posizione dell'utente loggato con approssimazione e profilo di privacy
export async function setMyLocation(req, res) {
  const userId = req.session?.userId;
  const { lat, lon, privacy_profile = "standard", source = "gps" } = req.body ?? {};

  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return res.status(400).json({ error: "Latitudine non valida" });
  }
  if (!Number.isFinite(lonNum) || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ error: "Longitudine non valida" });
  }

  const profile = privacy_profile === "private" ? "private" : "standard";
  // Profili di anonimizzazione:
  // - standard: piu preciso (5km)
  // - private: piu generico (10km)
  const precisionKm = profile === "private" ? 10 : 5;

  try {
    // cooldown 48h
    const check = await pool.query(
      `SELECT location_updated_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (check.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    // Limito l'aggiornamento posizione a ogni 48h:
    // mi serve per ridurre abusi e cambi continui.

    // Se last è null non ho ancora una posizione salvata, quindi procedo subito.
    const last = check.rows[0].location_updated_at;
    
    if (last && cooldownCheck) {
      // Tengo il valore cooldown in cima al file per cambiarlo rapidamente nei test.
      if (Date.now() - new Date(last).getTime() < cooldownMs) {
        return res.status(409).json({
          error: "Posizione aggiornabile solo ogni 48 ore",
          next_update_after: new Date(new Date(last).getTime() + cooldownMs).toISOString()
        });
      }
    }

    /**
     * Generalizzazione:
     * snap-to-grid approssimato in km → gradi
     */
    const kmPerDeg = 111.32;
    const stepLat = precisionKm / kmPerDeg;
    const stepLon = precisionKm / (kmPerDeg * Math.cos(latNum * Math.PI / 180) || 1);

    const safeLat = Math.round(latNum / stepLat) * stepLat;
    const safeLon = Math.round(lonNum / stepLon) * stepLon;

    const result = await pool.query(
      `UPDATE users
       SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           location_precision_km = $3,
           location_privacy_profile = $4,
           location_source = $5,
           location_consent = TRUE,
           location_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $6 AND deleted_at IS NULL
       RETURNING location_updated_at, location_precision_km::float8 AS location_precision_km, location_privacy_profile`,
      [safeLon, safeLat, precisionKm, profile, source, userId]
    );

    const row = result.rows[0];

    res.json({
      ok: true,
      privacy_profile_applied: row.location_privacy_profile,
      applied_precision_km: row.location_precision_km,
      updated_at: row.location_updated_at,
      next_update_after: new Date(
        new Date(row.location_updated_at).getTime() + 48 * 60 * 60 * 1000
      ).toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore server" });
  }
}

//non restituisce la posizione, ma solo lo stato del consenso, se è presente una posizione e quando è stata aggiornata l'ultima volta (per rispetto cooldown 48h)
export async function getMyLocationStatus(req, res) {
  const userId = req.session?.userId;

  try {
    const r = await pool.query(
      `SELECT
         location_consent,
         (geom IS NOT NULL) AS has_location,
         location_updated_at,
         location_precision_km,
         location_privacy_profile
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Utente non trovato" });

    const row = r.rows[0];

    let nextUpdateAfter = null;
    if (row.location_updated_at) {
      nextUpdateAfter = new Date(new Date(row.location_updated_at).getTime() + 48 * 60 * 60 * 1000).toISOString();
    }

    res.json({
      consent: row.location_consent,
      has_location: row.has_location,
      updated_at: row.location_updated_at,
      applied_precision_km: row.location_precision_km,
      privacy_profile_applied: row.location_privacy_profile,
      next_update_after: nextUpdateAfter,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Rimuove la posizione dell'utente loggato (consenso revocato)
export async function deleteMyLocation(req, res) {
  const userId = req.session?.userId;

  try {
    const r = await pool.query(
      `UPDATE users
       SET geom = NULL,
           location_consent = FALSE,
           location_updated_at = NULL,
           location_precision_km = NULL,
           location_privacy_profile = NULL,
           location_source = NULL,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [userId]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Utente non trovato" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
