import { pool } from "../config/db.js";


export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}


/**
 * Middleware: richiede che l'utente abbia una posizione impostata.
 *
 * controlla se l'utente può usare funzionalità che dipendono dalla posizione
 * (es. ricerca libri "vicino a me").
 *
 * Regole:
 * - l'utente deve essere loggato
 * - deve aver dato il consenso alla posizione
 * - deve esistere una posizione privacy-safe (geom)
 *
 * NON viengono mai restituite coordinate al client.
 * La posizione serve solo lato backend per le query PostGIS.
 */

export async function requireUserLocation(req, res, next) {
  // Sicurezza extra: se utente non loggato non dovrebbe nemmeno arrivare qui
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // Recuperiamo solo le info minime necessarie
    const result = await pool.query(
      `SELECT
         location_consent,
         geom IS NOT NULL AS has_location,
         location_precision_km,
         location_privacy_profile,
         location_updated_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const row = result.rows[0];

    // Se manca consenso o posizione -> non puoi usare "near me"
    if (!row.location_consent || !row.has_location) {
      return res.status(400).json({
        error: "Location not set or consent missing"
      });
    }

    /**
     * Mettiamo qualche info utile su req,
     * così il controller non deve rifare query inutili.
     *
     * NOTA: qui NON metto geom,
     * perché il controller la leggerà direttamente nel SQL.
     */
    req.userLocationMeta = {
      precisionKm: row.location_precision_km,
      privacyProfile: row.location_privacy_profile,
      updatedAt: row.location_updated_at,
    };

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
