import { pool } from "../config/db.js";

export async function getStatsOverview(req, res) {
  try {
    const [
      usersR,
      booksR,
      userBooksR,
      userBooksAvailR,
      loanTotalR,
      loanByStatusR,
      viewsTotalR,
      topViewedR,
      mostRequestedR,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS users_total FROM users WHERE deleted_at IS NULL`),
      pool.query(`SELECT COUNT(*)::int AS books_catalog_total FROM books WHERE deleted_at IS NULL`),

      pool.query(`
        SELECT COUNT(*)::int AS user_books_total
        FROM user_books ub
        JOIN users u ON u.id = ub.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.isbn = ub.book_isbn AND b.deleted_at IS NULL
        WHERE ub.deleted_at IS NULL
      `),

      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE ub.is_available = true)::int AS user_books_available,
          COUNT(*) FILTER (WHERE ub.is_available = false)::int AS user_books_unavailable
        FROM user_books ub
        JOIN users u ON u.id = ub.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.isbn = ub.book_isbn AND b.deleted_at IS NULL
        WHERE ub.deleted_at IS NULL
      `),

      pool.query(`SELECT COUNT(*)::int AS loan_requests_total FROM loan_requests`),

      pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM loan_requests
        GROUP BY status
        ORDER BY status ASC
      `),

      pool.query(`
        SELECT COALESCE(SUM(view_count),0)::int AS views_total
        FROM books
        WHERE deleted_at IS NULL
      `),

      pool.query(`
        SELECT isbn, title, view_count::int
        FROM books
        WHERE deleted_at IS NULL
        ORDER BY view_count DESC, title ASC
        LIMIT 5
      `),

      pool.query(`
        SELECT b.isbn, b.title, COUNT(*)::int AS requests_count
        FROM loan_requests lr
        JOIN books b ON b.isbn = lr.book_isbn AND b.deleted_at IS NULL
        WHERE lr.status <> 'cancelled'
        GROUP BY b.isbn, b.title
        ORDER BY requests_count DESC, b.title ASC
        LIMIT 5
      `),
    ]);

    const byStatus = {};
    for (const row of loanByStatusR.rows) {
      byStatus[row.status] = Number(row.count) || 0;
    }

    return res.json({
      ok: true,
      overview: {
        users_total: usersR.rows[0].users_total,
        books_catalog_total: booksR.rows[0].books_catalog_total,

        user_books_total: userBooksR.rows[0].user_books_total,
        user_books_available: userBooksAvailR.rows[0].user_books_available,
        user_books_unavailable: userBooksAvailR.rows[0].user_books_unavailable,

        loan_requests_total: loanTotalR.rows[0].loan_requests_total,
        loan_requests_by_status: byStatus,

        views_total: viewsTotalR.rows[0].views_total,
      },
      top_viewed: topViewedR.rows,
      most_requested: mostRequestedR.rows,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

export async function getMapDistribution(req, res) {
  try {
    const pointsR = await pool.query(`
      SELECT
        ST_Y(u.geom::geometry)::float8 AS lat,
        ST_X(u.geom::geometry)::float8 AS lon,
        COUNT(*) FILTER (
          WHERE ub.deleted_at IS NULL
            AND b.deleted_at IS NULL
        )::int AS books_total,
        COUNT(*) FILTER (
          WHERE ub.deleted_at IS NULL
            AND b.deleted_at IS NULL
            AND ub.is_available = TRUE
        )::int AS books_available,
        COUNT(DISTINCT u.id)::int AS users_total,
        ARRAY_AGG(DISTINCT u.id) FILTER (
          WHERE ub.deleted_at IS NULL
            AND b.deleted_at IS NULL
        ) AS user_ids
      FROM users u
      LEFT JOIN user_books ub
        ON ub.user_id = u.id
      LEFT JOIN books b
        ON b.isbn = ub.book_isbn
      WHERE u.deleted_at IS NULL
        AND u.location_consent = TRUE
        AND u.geom IS NOT NULL
      GROUP BY ST_Y(u.geom::geometry), ST_X(u.geom::geometry)
      HAVING COUNT(*) FILTER (
        WHERE ub.deleted_at IS NULL
          AND b.deleted_at IS NULL
      ) > 0
      ORDER BY books_total DESC, users_total DESC
      LIMIT 1000
    `);

    const summaryR = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL
            AND location_consent = TRUE
            AND geom IS NOT NULL
        )::int AS users_with_location
      FROM users
    `);

    return res.json({
      ok: true,
      summary: {
        users_with_location: Number(summaryR.rows[0]?.users_with_location) || 0,
        points_total: pointsR.rowCount,
      },
      points: pointsR.rows,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

function ensureStatuses(rows) {
  const base = { pending: 0, accepted: 0, rejected: 0, returned: 0, cancelled: 0 };
  for (const row of rows) {
    const key = String(row.status || "").toLowerCase();
    if (Object.hasOwn(base, key)) {
      base[key] = Number(row.count) || 0;
    }
  }
  return base;
}

export async function getUserOverview(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id utente non valido" });
  }

  try {
    const [userR, booksR, outByStatusR, inByStatusR] = await Promise.all([
      pool.query(
        `SELECT id, username, email, full_name, is_trusted, is_admin, deleted_at, created_at, updated_at
         FROM users
         WHERE id = $1`,
        [id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS books_owned_total
         FROM user_books ub
         JOIN books b ON b.isbn = ub.book_isbn AND b.deleted_at IS NULL
         WHERE ub.user_id = $1 AND ub.deleted_at IS NULL`,
        [id]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM loan_requests
         WHERE requester_user_id = $1
         GROUP BY status`,
        [id]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM loan_requests
         WHERE owner_user_id = $1
         GROUP BY status`,
        [id]
      ),
    ]);

    if (userR.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const loansOutByStatus = ensureStatuses(outByStatusR.rows);
    const loansInByStatus = ensureStatuses(inByStatusR.rows);

    const loansOutTotal = Object.values(loansOutByStatus).reduce((a, b) => a + b, 0);
    const loansInTotal = Object.values(loansInByStatus).reduce((a, b) => a + b, 0);

    return res.json({
      ok: true,
      user: userR.rows[0],
      stats: {
        books_owned_total: Number(booksR.rows[0]?.books_owned_total) || 0,
        loans_out_total: loansOutTotal,
        loans_out_by_status: loansOutByStatus,
        loans_in_total: loansInTotal,
        loans_in_by_status: loansInByStatus,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

export async function setUserStatus(req, res) {
  const targetId = Number(req.params?.id);
  const actorId = Number(req.session?.userId);
  const { is_deleted } = req.body ?? {};

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: "id utente non valido" });
  }
  if (typeof is_deleted !== "boolean") {
    return res.status(400).json({ error: "is_deleted deve essere boolean" });
  }
  if (actorId && targetId === actorId && is_deleted) {
    return res.status(400).json({ error: "Non puoi eliminare il tuo account admin da questo pannello" });
  }

  try {
    const r = await pool.query(
      `UPDATE users
       SET deleted_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, deleted_at`,
      [targetId, is_deleted]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    return res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

export async function updateUsername(req, res) {
  const targetId = Number(req.params?.id);
  const rawUsername = req.body?.username;

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: "id utente non valido" });
  }

  const username = String(rawUsername || "").trim();
  if (!username) {
    return res.status(400).json({ error: "username obbligatorio" });
  }

  try {
    const r = await pool.query(
      `UPDATE users
       SET username = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, deleted_at`,
      [targetId, username]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    return res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Username già esistente" });
    }
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

export async function getBooksMaintenance(req, res) {
  const type = String(req.query?.type || "missing_description").trim();
  let limit = Number(req.query?.limit);
  let offset = Number(req.query?.offset);
  if (!Number.isInteger(limit) || limit <= 0) limit = 50;
  if (limit > 200) limit = 200;
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  const validTypes = new Set([
    "missing_description",
    "uncategorized",
    "missing_cover",
    "fallback_pages",
  ]);
  if (!validTypes.has(type)) {
    return res.status(400).json({ error: "type non valido" });
  }

  const whereByType = {
    missing_description: `(b.description IS NULL OR BTRIM(b.description) = '')`,
    uncategorized: `LOWER(g.name) = 'non categorizzato'`,
    missing_cover: `(b.cover_url IS NULL OR BTRIM(b.cover_url) = '')`,
    fallback_pages: `b.pages = 1`,
  };

  try {
    const r = await pool.query(
      `
      SELECT
        b.isbn,
        b.title,
        b.cover_url,
        b.edition_year,
        b.pages,
        p.name AS publisher,
        g.name AS genre,
        (b.description IS NULL OR BTRIM(b.description) = '') AS missing_description,
        (b.cover_url IS NULL OR BTRIM(b.cover_url) = '') AS missing_cover,
        (LOWER(g.name) = 'non categorizzato') AS uncategorized,
        (b.pages = 1) AS fallback_pages
      FROM books b
      JOIN publishers p ON p.id = b.publisher_id
      JOIN genres g ON g.id = b.genre_id
      WHERE b.deleted_at IS NULL
        AND ${whereByType[type]}
      ORDER BY b.title ASC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    return res.json({
      ok: true,
      type,
      limit,
      offset,
      items: r.rows,
      count: r.rowCount,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}
