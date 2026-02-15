import { pool } from "../config/db.js";

// Crea una richiesta di prestito.
export async function createLoan(req, res) {
  const requesterId = req.session?.userId;
  const { owner_user_id, book_isbn } = req.body;

  const ownerId = Number(owner_user_id);
  const isbn = String(book_isbn || "").trim();

  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return res.status(400).json({ error: "owner_user_id non valido" });
  }
  if (!isbn) {
    return res.status(400).json({ error: "book_isbn mancante" });
  }
  if (ownerId === requesterId) {
    return res.status(400).json({ error: "Non puoi richiedere un prestito a te stesso" });
  }

  try {
    // 1) Verifico disponibilità reale presso il proprietario.
    const avail = await pool.query(
      `SELECT 1
       FROM user_books
       WHERE user_id = $1
         AND book_isbn = $2
         AND deleted_at IS NULL
         AND is_available = TRUE`,
      [ownerId, isbn]
    );

    if (avail.rowCount === 0) {
      return res.status(409).json({ error: "Libro non disponibile o non posseduto dall'utente selezionato" });
    }

    // 2) Inserisco la richiesta. Il vincolo UNIQUE parziale evita doppioni attivi.
    const r = await pool.query(
      `INSERT INTO loan_requests (requester_user_id, owner_user_id, book_isbn)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [requesterId, ownerId, isbn]
    );

    return res.status(201).json({
      ok: true,
      loan: {
        id: r.rows[0].id,
        status: r.rows[0].status,
        owner_user_id: ownerId,
        requester_user_id: requesterId,
        book_isbn: isbn,
        created_at: r.rows[0].created_at,
      },
    });
  } catch (e) {
    // Richiesta già attiva per quella coppia proprietario/libro.
    if (e.code === "23505") {
      return res.status(409).json({ error: "Esiste già una richiesta attiva per questo libro" });
    }
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}
// Elenco richieste ricevute dal proprietario.
export async function getInbox(req, res) {
  const ownerId = req.session?.userId;

  try {
    const r = await pool.query(
      `SELECT lr.id, lr.status, lr.book_isbn, lr.created_at, lr.updated_at,
              b.title AS book_title, b.cover_url AS cover_url,
              u.id AS requester_user_id, u.username AS requester_username,
              CASE
                WHEN lr.status = 'accepted' THEN
                  CASE
                    WHEN u.exchange_contact_preference = 'phone' THEN u.phone
                    ELSE u.email
                  END
                ELSE NULL
              END AS other_party_contact,
              CASE
                WHEN lr.status = 'accepted' THEN
                  CASE
                    WHEN u.exchange_contact_preference = 'phone' THEN 'phone'
                    ELSE 'email'
                  END
                ELSE NULL
              END AS other_party_contact_type
       FROM loan_requests lr
       LEFT JOIN books b ON b.isbn = lr.book_isbn
       JOIN users u ON u.id = lr.requester_user_id
       WHERE lr.owner_user_id = $1
       ORDER BY lr.created_at DESC`,
      [ownerId]
    );

    const rows = r.rows.map((row) => {
      // Espongo i contatti solo quando la richiesta è accepted.
      if (!row.other_party_contact) {
        delete row.other_party_contact;
        delete row.other_party_contact_type;
      }
      return row;
    });

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Elenco richieste inviate dal richiedente.
export async function getOutbox(req, res) {
  const requesterId = req.session?.userId;

  try {
    const r = await pool.query(
      `SELECT lr.id, lr.status, lr.book_isbn, lr.created_at, lr.updated_at,
              b.title AS book_title, b.cover_url AS cover_url,
              u.id AS owner_user_id, u.username AS owner_username,
              CASE
                WHEN lr.status = 'accepted' THEN
                  CASE
                    WHEN u.exchange_contact_preference = 'phone' THEN u.phone
                    ELSE u.email
                  END
                ELSE NULL
              END AS other_party_contact,
              CASE
                WHEN lr.status = 'accepted' THEN
                  CASE
                    WHEN u.exchange_contact_preference = 'phone' THEN 'phone'
                    ELSE 'email'
                  END
                ELSE NULL
              END AS other_party_contact_type
       FROM loan_requests lr
       LEFT JOIN books b ON b.isbn = lr.book_isbn
       JOIN users u ON u.id = lr.owner_user_id
       WHERE lr.requester_user_id = $1
       ORDER BY lr.created_at DESC`,
      [requesterId]
    );

    const rows = r.rows.map((row) => {
      // Espongo i contatti solo quando la richiesta è accepted.
      if (!row.other_party_contact) {
        delete row.other_party_contact;
        delete row.other_party_contact_type;
      }
      return row;
    });

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}
// Helper interno per errori HTTP.
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
// Il proprietario accetta la richiesta.
export async function acceptLoan(req, res) {
  const ownerId = req.session?.userId;
  const loanId = Number(req.params.id);

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return res.status(400).json({ error: "id non valido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lr = await client.query(
      `SELECT id, owner_user_id, book_isbn, status
       FROM loan_requests
       WHERE id = $1
       FOR UPDATE`,
      [loanId]
    );
    if (lr.rowCount === 0) throw httpError(404, "Richiesta non trovata");

    const loan = lr.rows[0];
    if (loan.owner_user_id !== ownerId) throw httpError(403, "Forbidden");
    if (loan.status !== "pending") throw httpError(409, `Stato non valido: ${loan.status}`);

    const ub = await client.query(
      `SELECT is_available
       FROM user_books
       WHERE user_id = $1 AND book_isbn = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [ownerId, loan.book_isbn]
    );
    if (ub.rowCount === 0) throw httpError(409, "Libro non presente nella libreria dell'owner");
    if (ub.rows[0].is_available !== true) throw httpError(409, "Libro già non disponibile");

    await client.query(
      `UPDATE loan_requests SET status='accepted', updated_at=NOW() WHERE id=$1`,
      [loanId]
    );
    await client.query(
      `UPDATE user_books SET is_available=FALSE, updated_at=NOW()
       WHERE user_id=$1 AND book_isbn=$2 AND deleted_at IS NULL`,
      [ownerId, loan.book_isbn]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, id: loanId, status: "accepted", book_isbn: loan.book_isbn });
  } catch (e) {
    await client.query("ROLLBACK");

    // Errori gestiti lato applicazione.
    if (e.status) {
      return res.status(e.status).json({ error: e.message });
    }

    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}
// Il proprietario rifiuta la richiesta.
export async function rejectLoan(req, res) {
  const ownerId = req.session?.userId;
  const loanId = Number(req.params.id);

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return res.status(400).json({ error: "id non valido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lr = await client.query(
      `SELECT id, owner_user_id, book_isbn, status
       FROM loan_requests
       WHERE id = $1
       FOR UPDATE`,
      [loanId]
    );
    if (lr.rowCount === 0) throw httpError(404, "Richiesta non trovata");

    const loan = lr.rows[0];
    if (loan.owner_user_id !== ownerId) throw httpError(403, "Forbidden");
    if (loan.status !== "pending") throw httpError(409, `Stato non valido: ${loan.status}`);

    await client.query(
      `UPDATE loan_requests
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1`,
      [loanId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, id: loanId, status: "rejected", book_isbn: loan.book_isbn });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}
// Il proprietario segna il libro come restituito.
export async function returnLoan(req, res) {
  const ownerId = req.session?.userId;
  const loanId = Number(req.params.id);

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return res.status(400).json({ error: "id non valido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lr = await client.query(
      `SELECT id, owner_user_id, book_isbn, status
       FROM loan_requests
       WHERE id = $1
       FOR UPDATE`,
      [loanId]
    );
    if (lr.rowCount === 0) throw httpError(404, "Richiesta non trovata");

    const loan = lr.rows[0];
    if (loan.owner_user_id !== ownerId) throw httpError(403, "Forbidden");
    if (loan.status !== "accepted") throw httpError(409, `Stato non valido: ${loan.status}`);

    // Riabilito la disponibilità del libro.
    const ub = await client.query(
      `UPDATE user_books
       SET is_available = TRUE, updated_at = NOW()
       WHERE user_id = $1 AND book_isbn = $2 AND deleted_at IS NULL
       RETURNING user_id`,
      [ownerId, loan.book_isbn]
    );
    if (ub.rowCount === 0) throw httpError(409, "Libro non presente nella libreria dell'owner");

    await client.query(
      `UPDATE loan_requests
       SET status = 'returned', updated_at = NOW()
       WHERE id = $1`,
      [loanId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, id: loanId, status: "returned", book_isbn: loan.book_isbn });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}
// Il richiedente annulla una richiesta in attesa.
export async function cancelLoan(req, res) {
  const requesterId = req.session?.userId;
  const loanId = Number(req.params.id);

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return res.status(400).json({ error: "id non valido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lr = await client.query(
      `SELECT id, requester_user_id, status
       FROM loan_requests
       WHERE id = $1
       FOR UPDATE`,
      [loanId]
    );
    if (lr.rowCount === 0) throw httpError(404, "Richiesta non trovata");

    const loan = lr.rows[0];
    if (loan.requester_user_id !== requesterId) throw httpError(403, "Forbidden");
    if (loan.status !== "pending") throw httpError(409, `Stato non valido: ${loan.status}`);

    await client.query(
      `UPDATE loan_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [loanId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, id: loanId, status: "cancelled" });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}
