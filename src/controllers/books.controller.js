import { pool } from "../config/db.js";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const DEFAULT_GENRE_NAME = "Non categorizzato";
const DEFAULT_PUBLISHER_NAME = "Sconosciuto";
const DEFAULT_AUTHOR_NAME = "Autore sconosciuto";

function normalizeIsbn(value) {
  return String(value || "").replace(/[\s-]/g, "").trim();
}

function isLikelyIsbn(value) {
  const raw = normalizeIsbn(value);
  if (raw.length === 13) return /^\d{13}$/.test(raw);
  if (raw.length === 10) return /^\d{9}[\dXx]$/.test(raw);
  return false;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildSearchTokens(q) {
  const stop = new Set([
    "il", "lo", "la", "i", "gli", "le", "un", "una", "uno",
    "di", "del", "della", "dei", "degli", "delle",
    "e", "ed", "a", "da", "in", "con", "per", "su",
    "al", "allo", "alla", "ai", "agli", "alle",
  ]);

  return normalizeText(q)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

function pickFirstValidIsbn(values) {
  if (!Array.isArray(values)) return null;
  for (const v of values) {
    const isbn = normalizeIsbn(v);
    if (isLikelyIsbn(isbn)) return isbn.toUpperCase();
  }
  return null;
}

function normalizeOpenLibraryCandidate(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const isbn = normalizeIsbn(data.isbn);
  const title = String(data.title || "").trim();
  if (!isbn || !title || !isLikelyIsbn(isbn)) return null;

  const authors = Array.isArray(data.authors)
    ? data.authors.map((a) => String(a || "").trim()).filter(Boolean)
    : String(data.authors || "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

  const publisher = String(data.publisher || "").trim() || DEFAULT_PUBLISHER_NAME;
  const editionYearNum = Number(data.edition_year);
  const pagesNum = Number(data.pages);
  const coverUrl = String(data.cover_url || "").trim() || null;

  return {
    source: "openlibrary",
    isbn,
    title,
    authors: authors.length ? authors : [DEFAULT_AUTHOR_NAME],
    publisher,
    edition_year: Number.isInteger(editionYearNum) && editionYearNum > 0 ? editionYearNum : null,
    pages: Number.isInteger(pagesNum) && pagesNum > 0 ? pagesNum : null,
    cover_url: coverUrl,
    description: null,
  };
}

function parseEditionYear(publishDate) {
  const text = String(publishDate || "");
  const match = text.match(/\b(1[6-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function parseOpenLibraryDescription(rawDescription) {
  if (typeof rawDescription === "string") {
    const text = rawDescription.trim();
    return text || null;
  }
  if (rawDescription && typeof rawDescription === "object") {
    const value = String(rawDescription.value || rawDescription.text || "").trim();
    return value || null;
  }
  return null;
}

async function fetchJsonWithTimeout(url, timeoutMs = 3500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

function mapOpenLibraryPayload(raw, isbn) {
  const title = String(raw?.title || "").trim();
  if (!title) return null;

  const authors = Array.isArray(raw?.authors)
    ? raw.authors.map((a) => String(a?.name || "").trim()).filter(Boolean)
    : [];
  const publishers = Array.isArray(raw?.publishers)
    ? raw.publishers.map((p) => String(p?.name || "").trim()).filter(Boolean)
    : [];

  const pagesRaw = Number(raw?.number_of_pages);
  const pages = Number.isFinite(pagesRaw) && pagesRaw > 0 ? pagesRaw : null;
  const editionYear = parseEditionYear(raw?.publish_date);
  const coverUrl = String(raw?.cover?.medium || raw?.cover?.small || "").trim() || null;
  const description = parseOpenLibraryDescription(raw?.description);

  const workKey = Array.isArray(raw?.works) && raw.works[0]?.key
    ? String(raw.works[0].key).trim()
    : null;

  return {
    source: "openlibrary",
    isbn,
    title,
    authors: authors.length ? authors : [DEFAULT_AUTHOR_NAME],
    publisher: publishers[0] || DEFAULT_PUBLISHER_NAME,
    edition_year: editionYear,
    pages,
    cover_url: coverUrl,
    description,
    work_key: workKey,
  };
}

async function fetchOpenLibraryByIsbn(isbn) {
  const key = `ISBN:${isbn}`;
  const url = `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`;
  const json = await fetchJsonWithTimeout(url, 3500);
  if (!json || typeof json !== "object") return null;
  return mapOpenLibraryPayload(json[key], isbn);
}

async function searchOpenLibrary(query, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  // Per non superare il limite richieste di OpenLibrary uso una sola chiamata search.
  // Poi filtro e ordino i risultati lato server, dando priorità a quelli in italiano.
  const fields = "key,title,author_name,cover_i,first_publish_year,publisher,isbn,language";
  const rawQuery = String(query || "").trim();
  const italianQuery = /\blanguage:\w+/i.test(rawQuery)
    ? rawQuery
    : `${rawQuery} language:ita`;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(italianQuery)}&lang=it&fields=${encodeURIComponent(fields)}&limit=${safeLimit * 6}`;
  const json = await fetchJsonWithTimeout(url, 3500);
  if (!json || typeof json !== "object") return [];
  const docs = Array.isArray(json?.docs) ? json.docs : [];
  const out = [];
  const seen = new Set();

  for (const d of docs) {
    const isbn = pickFirstValidIsbn(d?.isbn);
    const title = String(d?.title || "").trim();
    if (!isbn || !title || seen.has(isbn)) continue;
    seen.add(isbn);

    const authors = Array.isArray(d?.author_name)
      ? d.author_name.map((a) => String(a || "").trim()).filter(Boolean)
      : [];
    const publishers = Array.isArray(d?.publisher)
      ? d.publisher.map((p) => String(p || "").trim()).filter(Boolean)
      : [];
    const coverUrl = Number.isFinite(Number(d?.cover_i))
      ? `https://covers.openlibrary.org/b/id/${Number(d.cover_i)}-M.jpg`
      : null;

    const langs = Array.isArray(d?.language)
      ? d.language.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
      : [];

    out.push({
      source: "openlibrary",
      isbn,
      title,
      authors: authors.join(", "),
      publisher: publishers[0] || "",
      edition_year: Number.isInteger(d?.first_publish_year) ? d.first_publish_year : null,
      cover_url: coverUrl,
      language_codes: langs,
      is_italian: langs.includes("ita"),
    });
  }

  const tokens = buildSearchTokens(query);
  const fullQ = normalizeText(query);
  const score = (item) => {
    const hay = normalizeText(`${item?.title || ""} ${item?.authors || ""} ${item?.publisher || ""}`);
    const tokenHits = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    const fullHit = fullQ && hay.includes(fullQ) ? 1 : 0;
    const italianBoost = item?.is_italian ? 1 : 0;
    return (fullHit * 4) + (tokenHits * 2) + italianBoost;
  };

  const tokenFiltered = tokens.length ? out.filter((item) => {
    const hay = normalizeText(`${item?.title || ""} ${item?.authors || ""} ${item?.publisher || ""}`);
    return tokens.some((t) => hay.includes(t));
  }) : out;

  const italian = tokenFiltered.filter((item) => item?.is_italian);
  const rankedSource = italian.length ? italian : tokenFiltered;

  return rankedSource
    .sort((a, b) => score(b) - score(a))
    .slice(0, safeLimit)
    .map(({ language_codes, is_italian, ...item }) => item);
}

async function fetchOpenLibraryWorkDescription(workKey) {
  const key = String(workKey || "").trim();
  if (!key) return null;
  const url = `https://openlibrary.org${key}.json`;
  const json = await fetchJsonWithTimeout(url, 3000);
  if (!json || typeof json !== "object") return null;
  return parseOpenLibraryDescription(json.description);
}

async function resolveOpenLibraryCoverByIsbn(isbn) {
  const olBook = await fetchOpenLibraryByIsbn(isbn);
  if (olBook?.cover_url) return olBook.cover_url;

  const fallbackUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const head = await fetch(fallbackUrl, { method: "HEAD", signal: ctrl.signal });
    if (head.ok) return fallbackUrl;
  } catch {
    // ignora
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function getOrCreateDefaultGenreId(client) {
  let genreId = null;
  const ins = await client.query(
    `INSERT INTO genres (name)
     VALUES ($1)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [DEFAULT_GENRE_NAME]
  );
  genreId = ins.rows[0]?.id ?? null;
  if (!genreId) {
    const sel = await client.query(`SELECT id FROM genres WHERE name = $1`, [DEFAULT_GENRE_NAME]);
    genreId = sel.rows[0]?.id ?? null;
  }
  return genreId;
}

async function getOrCreatePublisherId(client, publisherName) {
  const name = String(publisherName || "").trim() || DEFAULT_PUBLISHER_NAME;
  let publisherId = null;
  const ins = await client.query(
    `INSERT INTO publishers (name)
     VALUES ($1)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [name]
  );
  publisherId = ins.rows[0]?.id ?? null;
  if (!publisherId) {
    const sel = await client.query(`SELECT id FROM publishers WHERE name = $1`, [name]);
    publisherId = sel.rows[0]?.id ?? null;
  }
  return { id: publisherId, name };
}

async function upsertAuthorsForIsbn(client, isbn, authors) {
  const safeAuthors = Array.isArray(authors) && authors.length
    ? [...new Set(authors.map((a) => String(a || "").trim()).filter(Boolean))]
    : [DEFAULT_AUTHOR_NAME];

  await client.query(
    `INSERT INTO authors (name)
     SELECT UNNEST($1::text[])
     ON CONFLICT (name) DO NOTHING`,
    [safeAuthors]
  );

  await client.query(
    `INSERT INTO book_authors (book_isbn, author_id)
     SELECT $1, a.id
     FROM authors a
     WHERE a.name = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [isbn, safeAuthors]
  );
}

async function importBookFromOpenLibrary(client, olBook) {
  const existing = await client.query(`SELECT isbn, deleted_at FROM books WHERE isbn = $1`, [olBook.isbn]);
  if (existing.rowCount > 0) {
    if (existing.rows[0].deleted_at) {
      return { alreadyExists: true, softDeleted: true };
    }
    return { alreadyExists: true, softDeleted: false };
  }

  const genreId = await getOrCreateDefaultGenreId(client);
  if (!genreId) throw new Error("GENRE_DEFAULT_NOT_FOUND");

  const publisher = await getOrCreatePublisherId(client, olBook.publisher);
  if (!publisher.id) throw new Error("PUBLISHER_NOT_FOUND");

  // Compatibilità con schemi DB più restrittivi (es. pages/edition_year NOT NULL).
  const safeEditionYear =
    Number.isInteger(Number(olBook.edition_year)) && Number(olBook.edition_year) > 0
      ? Number(olBook.edition_year)
      : new Date().getFullYear();

  const safePages =
    Number.isInteger(Number(olBook.pages)) && Number(olBook.pages) > 0
      ? Number(olBook.pages)
      : 1;

  await client.query(
    `INSERT INTO books (isbn, title, description, edition_year, pages, cover_price, genre_id, publisher_id, cover_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      olBook.isbn,
      olBook.title,
      null,
      safeEditionYear,
      safePages,
      0,
      genreId,
      publisher.id,
      olBook.cover_url,
    ]
  );

  await upsertAuthorsForIsbn(client, olBook.isbn, olBook.authors);
  return { alreadyExists: false, softDeleted: false };
}

// Valido i dati base usati in create/update libro.
function validateBookPayload(body) {
  const {
    isbn,
    title,
    description,
    edition_year,
    pages,
    cover_price,
    genre_id,
    publisher,
    authors,
  } = body;

  if (!isbn || !title || !edition_year || !pages || cover_price === undefined || !genre_id || !publisher) {
    return { ok: false, error: "Campi mancanti" };
  }
  if (!Array.isArray(authors) || authors.length === 0) {
    return { ok: false, error: "authors deve essere un array non vuoto" };
  }

  const cleanIsbn = String(isbn).trim();
  const cleanTitle = String(title).trim();
  const cleanPublisher = String(publisher).trim();
  const cleanAuthors = [...new Set(authors.map(a => String(a).trim()).filter(Boolean))];

  if (!cleanIsbn || !cleanTitle || !cleanPublisher || cleanAuthors.length === 0) {
    return { ok: false, error: "Dati non validi" };
  }

  return {
    ok: true,
    data: {
      isbn: cleanIsbn,
      title: cleanTitle,
      description: description != null && String(description).trim() ? String(description).trim() : null,
      edition_year,
      pages,
      cover_price,
      genre_id,
      publisher: cleanPublisher,
      authors: cleanAuthors,
    },
  };
}

// Inserisco un libro completo con editore e autori.
async function insertSingleBook(client, payload) {

  // Creo l'editore solo se manca.
  let pubIns = await client.query(
    `INSERT INTO publishers (name)
     VALUES ($1)
     ON CONFLICT (name) DO NOTHING
     RETURNING id`,
    [payload.publisher]
  );

  let publisher_id = pubIns.rows[0]?.id;
  if (!publisher_id) {
    const r = await client.query(`SELECT id FROM publishers WHERE name = $1`, [payload.publisher]);
    publisher_id = r.rows[0].id;
  }

  // Inserisco il libro.
  await client.query(
    `INSERT INTO books (isbn, title, description, edition_year, pages, cover_price, genre_id, publisher_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      payload.isbn,
      payload.title,
      payload.description,
      payload.edition_year,
      payload.pages,
      payload.cover_price,
      payload.genre_id,
      publisher_id,
    ]
  );

  // Inserisco gli autori mancanti.
  await client.query(
    `INSERT INTO authors (name)
     SELECT UNNEST($1::text[])
     ON CONFLICT (name) DO NOTHING`,
    [payload.authors]
  );

  // Collego libro e autori.
  await client.query(
    `INSERT INTO book_authors (book_isbn, author_id)
     SELECT $1, a.id
     FROM authors a
     WHERE a.name = ANY($2::text[])
     ON CONFLICT DO NOTHING`,
    [payload.isbn, payload.authors]
  );
}

// Crea un singolo libro.
export async function createBook(req, res) {
  const v = validateBookPayload(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await insertSingleBook(client, v.data);
    await client.query("COMMIT");
    return res.status(201).json({ ok: true, isbn: v.data.isbn });
  } catch (e) {
    await client.query("ROLLBACK");

    if (e.code === "23505") {
      return res.status(409).json({ error: "ISBN già esistente" });
    }
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}

// Crea più libri in una sola transazione.
export async function createBooksBulk(req, res) {
  const books = req.body;

  if (!Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ error: "Payload deve essere un array di libri" });
  }

  const validated = [];
  for (let i = 0; i < books.length; i++) {
    const v = validateBookPayload(books[i]);
    if (!v.ok) {
      return res.status(400).json({ error: `Libro #${i + 1}: ${v.error}` });
    }
    validated.push(v.data);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const b of validated) {
      await insertSingleBook(client, b);
    }

    await client.query("COMMIT");
    return res.status(201).json({ ok: true, count: validated.length });
  } catch (e) {
    await client.query("ROLLBACK");

    if (e.code === "23505") {
      return res.status(409).json({ error: "Conflitto: almeno un ISBN è già esistente" });
    }
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}

// Restituisce il catalogo libri.
export async function getAllBooks(req, res) {
  const includeDeleted = req.isAdmin === true;

  try {
    const result = await pool.query(
      `SELECT b.isbn,
              b.title,
              b.description,
              b.cover_url,
              string_agg(a.name, ', ' ORDER BY a.name) AS authors,
              p.name AS publisher,
              b.edition_year,
              g.name AS genre,
              b.cover_price,
              b.pages
       FROM books b
       JOIN book_authors ba ON ba.book_isbn = b.isbn
       JOIN authors a ON a.id = ba.author_id
       JOIN genres g ON g.id = b.genre_id
       JOIN publishers p ON p.id = b.publisher_id
       ${includeDeleted ? "" : "WHERE b.deleted_at IS NULL"}  
       GROUP BY b.isbn, b.title, b.description, p.name, b.edition_year, g.name, b.cover_price, b.pages, b.cover_url
       ORDER BY b.title`
    );

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

// Restituisce i dettagli di un libro da ISBN.
export async function getBookByIsbn(req, res) {
  const { isbn } = req.params;
  const requesterId = Number.isInteger(req.session?.userId) ? req.session.userId : null;

  try {
    const result = await pool.query(
      `SELECT b.isbn,
              b.title,
              b.description,
              b.cover_url,
              string_agg(a.name, ', ' ORDER BY a.name) AS authors,
              p.name AS publisher,
              b.edition_year,
              g.name AS genre,
              b.cover_price,
              b.pages,
              own.owner_user_id,
              (own.owner_user_id IS NOT NULL) AS is_available
       FROM books b
       LEFT JOIN LATERAL (
         SELECT ub.user_id AS owner_user_id
         FROM user_books ub
         JOIN users u
           ON u.id = ub.user_id
          AND u.deleted_at IS NULL
         WHERE ub.book_isbn = b.isbn
           AND ub.deleted_at IS NULL
           AND ub.is_available = TRUE
           AND ($2::int IS NULL OR ub.user_id <> $2)
         ORDER BY ub.updated_at DESC, ub.user_id ASC
         LIMIT 1
       ) own ON TRUE
       JOIN book_authors ba ON ba.book_isbn = b.isbn
       JOIN authors a ON a.id = ba.author_id
       JOIN genres g ON g.id = b.genre_id
       JOIN publishers p ON p.id = b.publisher_id
       WHERE b.isbn = $1 AND b.deleted_at IS NULL
       GROUP BY b.isbn, b.title, b.description, p.name, b.edition_year, g.name, b.cover_price, b.pages, b.cover_url, own.owner_user_id`,
      [isbn, requesterId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Libro non trovato" });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  }
}

// Versione legacy: mantengo solo per compatibilità temporanea.
export async function createBook_legacy(req, res) {
  console.warn("createBook_legacy è deprecata, usare createBook al suo posto");
  const {
    isbn,
    title,
    description,
    edition_year,
    pages,
    cover_price,
    genre_id,
    publisher,     // stringa: es "Bompiani"
    authors        // array: ["J. R. R. Tolkien", "..."]
  } = req.body;

  // Validazione minima dei campi.
  if (!isbn || !title || !edition_year || !pages || cover_price === undefined || !genre_id || !publisher) {
    return res.status(400).json({ error: "Campi mancanti" });
  }
  if (!Array.isArray(authors) || authors.length === 0) {
    return res.status(400).json({ error: "authors deve essere un array non vuoto" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Trovo o creo l'editore.
    let pubIns = await client.query(
      `INSERT INTO publishers (name)
       VALUES ($1)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [publisher.trim()]
    );

    let publisher_id = pubIns.rows[0]?.id;
    if (!publisher_id) {
      const r = await client.query(`SELECT id FROM publishers WHERE name = $1`, [publisher.trim()]);
      publisher_id = r.rows[0].id;
    }

    // 2) Inserisco il libro.
    await client.query(
      `INSERT INTO books (isbn, title, description, edition_year, pages, cover_price, genre_id, publisher_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        isbn.trim(),
        title.trim(),
        description != null && String(description).trim() ? String(description).trim() : null,
        edition_year,
        pages,
        cover_price,
        genre_id,
        publisher_id,
      ]
    );

    // 3) Inserisco gli autori mancanti.
    const cleanAuthors = [...new Set(authors.map(a => String(a).trim()).filter(Boolean))];
    await client.query(
      `INSERT INTO authors (name)
       SELECT UNNEST($1::text[])
       ON CONFLICT (name) DO NOTHING`,
      [cleanAuthors]
    );

    // 4) Collego ISBN e author_id in book_authors.
    await client.query(
      `INSERT INTO book_authors (book_isbn, author_id)
       SELECT $1, a.id
       FROM authors a
       WHERE a.name = ANY($2::text[])
       ON CONFLICT DO NOTHING`,
      [isbn.trim(), cleanAuthors]
    );

    await client.query("COMMIT");
    return res.status(201).json({ ok: true, isbn });
  } catch (e) {
    await client.query("ROLLBACK");

    // ISBN duplicato.
    if (e.code === "23505") {
      return res.status(409).json({ error: "ISBN già esistente" });
    }
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}

// Update del libro.
export async function updateBook(req, res) {
  const { isbn } = req.params;
  const { title, description, edition_year, pages, cover_price, genre_id, publisher, authors } = req.body;

  if (!title || !edition_year || !pages || cover_price === undefined || !genre_id || !publisher) {
    return res.status(400).json({ error: "Campi mancanti" });
  }
  if (!Array.isArray(authors) || authors.length === 0) {
    return res.status(400).json({ error: "authors deve essere un array non vuoto" });
  }

  const cleanAuthors = [...new Set(authors.map(a => String(a).trim()).filter(Boolean))];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Trovo o creo l'editore senza update superflui.
    let pub = await client.query(
      `INSERT INTO publishers (name)
       VALUES ($1)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [publisher.trim()]
    );
    let publisher_id = pub.rows[0]?.id;
    if (!publisher_id) {
      const r = await client.query(`SELECT id FROM publishers WHERE name = $1`, [publisher.trim()]);
      publisher_id = r.rows[0].id;
    }

    // Aggiorno la tabella books.
    const up = await client.query(
      `UPDATE books
       SET title=$2, description=$3, edition_year=$4, pages=$5, cover_price=$6, genre_id=$7, publisher_id=$8
       WHERE isbn=$1`,
      [
        isbn.trim(),
        title.trim(),
        description != null && String(description).trim() ? String(description).trim() : null,
        edition_year,
        pages,
        cover_price,
        genre_id,
        publisher_id,
      ]
    );
    if (up.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Libro non trovato" });
    }

    // Upsert autori.
    await client.query(
      `INSERT INTO authors (name)
       SELECT UNNEST($1::text[])
       ON CONFLICT (name) DO NOTHING`,
      [cleanAuthors]
    );

    // Rigenero le relazioni libro-autori.
    await client.query(`DELETE FROM book_authors WHERE book_isbn=$1`, [isbn.trim()]);
    await client.query(
      `INSERT INTO book_authors (book_isbn, author_id)
       SELECT $1, a.id
       FROM authors a
       WHERE a.name = ANY($2::text[])`,
      [isbn.trim(), cleanAuthors]
    );

    await client.query("COMMIT");
    res.json({ ok: true, isbn });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Errore server" });
  } finally {
    client.release();
  }
}

export async function deleteBook(req, res) {
  const { isbn } = req.params;

  try {
    const up = await pool.query(
      `UPDATE books
       SET deleted_at = NOW()
       WHERE isbn = $1 AND deleted_at IS NULL`,
      [isbn.trim()]
    );

    if (up.rowCount === 0) {
      // Non trovato, oppure già eliminato.
      return res.status(404).json({ error: "Libro non trovato (o già eliminato)" });
    }

    return res.json({ ok: true, isbn });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

export async function restoreBook(req, res) {
  const { isbn } = req.params;

  try {
    const up = await pool.query(
      `UPDATE books
       SET deleted_at = NULL
       WHERE isbn = $1 AND deleted_at IS NOT NULL`,
      [isbn.trim()]
    );

    if (up.rowCount === 0) {
      // Non trovato, oppure non eliminato.
      return res.status(404).json({ error: "Libro non trovato (o non eliminato)" });
    }

    return res.json({ ok: true, isbn });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

export async function uploadBookCover(req, res) {
  const { isbn } = req.params;
  const cleanIsbn = String(isbn || "").trim();

  if (!cleanIsbn) {
    return res.status(400).json({ error: "isbn mancante" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "File copertina mancante (campo: cover)" });
  }

  const mime = req.file.mimetype;
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(mime)) {
    return res.status(400).json({ error: "Formato non supportato (solo jpg/png/webp)" });
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const filename = `${cleanIsbn}.${ext}`;
  const thumbFilename = `thumb-${cleanIsbn}.${ext}`;

  try {
    // Controllo che il libro esista.
    const ex = await pool.query(
      `SELECT isbn FROM books WHERE isbn = $1 AND deleted_at IS NULL`,
      [cleanIsbn]
    );
    if (ex.rowCount === 0) {
      return res.status(404).json({ error: "Libro non trovato" });
    }

    // Salvo la copertina su public/uploads/covers.
    const baseDir = path.join(process.cwd(), "public", "uploads", "covers");
    fs.mkdirSync(baseDir, { recursive: true });

    const filePath = path.join(baseDir, filename);
    const thumbPath = path.join(baseDir, thumbFilename);
    fs.writeFileSync(filePath, req.file.buffer);
    await sharp(req.file.buffer)
      .resize({ width: 120, height: 180, fit: "cover" })
      .toFormat(ext === "jpg" ? "jpeg" : ext)
      .toFile(thumbPath);

    const cover_url = `/uploads/covers/${filename}`;

    await pool.query(
      `UPDATE books SET cover_url = $2 WHERE isbn = $1`,
      [cleanIsbn, cover_url]
    );

    return res.json({ ok: true, isbn: cleanIsbn, cover_url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

// Cerca libri vicini con filtri e paginazione.
export async function searchBooksNearMe(req, res) {
  const userId = req.session?.userId;

  // Leggo i parametri della ricerca.
  const qRaw = req.query?.q;
  const genreRaw = req.query?.genre_id;
  const radiusRaw = req.query?.radius_km;
  const limitRaw = req.query?.limit;
  const offsetRaw = req.query?.offset;
  const availabilityRaw = req.query?.availability;

  const q = typeof qRaw === "string" && qRaw.trim() ? qRaw.trim() : null;

  const genreId =
    genreRaw !== undefined && genreRaw !== null && String(genreRaw).trim() !== ""
      ? Number(genreRaw)
      : null;

  if (genreId !== null && (!Number.isInteger(genreId) || genreId <= 0)) {
    return res.status(400).json({ error: "genre_id non valido" });
  }

  // Raggio predefinito 15 km, massimo 200 km.
  const MAX_RADIUS_KM = 200;
  const DEFAULT_RADIUS_KM = 15;

  let radiusKm =
    radiusRaw !== undefined && radiusRaw !== null && String(radiusRaw).trim() !== ""
      ? Number(radiusRaw)
      : DEFAULT_RADIUS_KM;

  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = DEFAULT_RADIUS_KM;
  if (radiusKm > MAX_RADIUS_KM) radiusKm = MAX_RADIUS_KM;

  const radiusMeters = radiusKm * 1000;

  let limit =
    limitRaw !== undefined && limitRaw !== null && String(limitRaw).trim() !== ""
      ? Number(limitRaw)
      : 50;
  if (!Number.isInteger(limit) || limit <= 0) limit = 50;
  if (limit > 100) limit = 100;

  let offset =
    offsetRaw !== undefined && offsetRaw !== null && String(offsetRaw).trim() !== ""
      ? Number(offsetRaw)
      : 0;
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  // Di default mostro solo i disponibili; con "all" includo tutto.
  const availability =
    typeof availabilityRaw === "string" && availabilityRaw.trim().toLowerCase() === "all"
      ? "all"
      : "available";

  try {
    /*
      Uso PostGIS con geography(Point, 4326), quindi lat/lon su WGS84.
      ST_DWithin e ST_Distance lavorano in metri e gestiscono la curvatura terrestre.
      La query richiede consenso + posizione valida e non restituisce coordinate:
      espongo solo distanza approssimata in km.
    */
    const result = await pool.query(
      `
      WITH me AS (
        SELECT geom
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
          AND location_consent = TRUE
          AND geom IS NOT NULL
      )
      SELECT
        b.isbn,
        b.title,
        b.cover_url,
        b.genre_id,
        ub.is_available,
        ub.user_id AS owner_user_id,
        ROUND((ST_Distance(u.geom, me.geom) / 1000.0))::int AS distance_km_approx
      FROM me
      JOIN users u
        ON u.deleted_at IS NULL
       AND u.location_consent = TRUE
       AND u.geom IS NOT NULL
      JOIN user_books ub
        ON ub.user_id = u.id
       AND ub.deleted_at IS NULL
      JOIN books b
        ON b.isbn = ub.book_isbn
       AND b.deleted_at IS NULL
      WHERE u.id <> $1
        AND ST_DWithin(u.geom, me.geom, $2)
        AND ($3::int IS NULL OR b.genre_id = $3)
        AND (
          $4::text IS NULL
          OR b.title ILIKE ('%' || $4 || '%')
          OR EXISTS (
            SELECT 1
            FROM book_authors ba
            JOIN authors a ON a.id = ba.author_id
            WHERE ba.book_isbn = b.isbn
              AND a.name ILIKE ('%' || $4 || '%')
          )
          OR EXISTS (
            SELECT 1
            FROM publishers p
            WHERE p.id = b.publisher_id
              AND p.name ILIKE ('%' || $4 || '%')
          )
        )
        AND ($7::text = 'all' OR ub.is_available = TRUE)
      ORDER BY ST_Distance(u.geom, me.geom) ASC, b.title ASC
      LIMIT $5 OFFSET $6
      `,
      [userId, radiusMeters, genreId, q, limit, offset, availability]
    );

    return res.json({
      ok: true,
      radius_km_applied: radiusKm,
      max_radius_km: MAX_RADIUS_KM,
      limit,
      offset,
      availability_applied: availability,
      results: result.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}


// Incrementa le visualizzazioni del libro aperto in dettaglio.
// Regola: 1 conteggio per sessione e ISBN.
export async function incrementBookView(req, res) {
  const isbnParam = req.params?.isbn;
  const isbn = String(isbnParam || "").trim();

  if (!isbn) {
    return res.status(400).json({ error: "isbn mancante" });
  }

  try {
    // Se manca la sessione, incremento comunque senza bloccare la richiesta.
    const sess = req.session;

    if (sess) {
      if (!sess.viewedBooks || typeof sess.viewedBooks !== "object") {
        sess.viewedBooks = {};
      }

      // Se già visto in sessione, non incremento.
      if (sess.viewedBooks[isbn] === true) {
        const r = await pool.query(
          `SELECT view_count
           FROM books
           WHERE isbn = $1 AND deleted_at IS NULL`,
          [isbn]
        );

        if (r.rowCount === 0) {
          return res.status(404).json({ error: "Libro non trovato" });
        }

        return res.json({ ok: true, counted: false, view_count: Number(r.rows[0].view_count) });
      }

      // Segno subito come visto per evitare doppi click ravvicinati.
      sess.viewedBooks[isbn] = true;
    }

    const up = await pool.query(
      `UPDATE books
       SET view_count = view_count + 1
       WHERE isbn = $1 AND deleted_at IS NULL
       RETURNING view_count`,
      [isbn]
    );

    if (up.rowCount === 0) {
      // Se il libro non esiste, ripulisco il flag sessione.
      if (req.session?.viewedBooks) delete req.session.viewedBooks[isbn];
      return res.status(404).json({ error: "Libro non trovato" });
    }

    return res.json({ ok: true, counted: true, view_count: Number(up.rows[0].view_count) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore server" });
  }
}

// Cerca metadati su OpenLibrary per un ISBN e restituisce solo i campi utili alla UI.
export async function lookupBookByIsbnOpenLibrary(req, res) {
  const isbn = normalizeIsbn(req.params?.isbn);
  if (!isbn) {
    return res.status(400).json({ error: "isbn mancante" });
  }

  try {
    const book = await fetchOpenLibraryByIsbn(isbn);
    if (!book) {
      return res.status(404).json({ error: "Libro non trovato su OpenLibrary" });
    }
    return res.json({ ok: true, book });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore nel lookup OpenLibrary" });
  }
}

// Importa a catalogo un libro da OpenLibrary (solo metadata essenziali).
export async function importBookByIsbnOpenLibrary(req, res) {
  const isbn = normalizeIsbn(req.params?.isbn);
  if (!isbn) {
    return res.status(400).json({ error: "isbn mancante" });
  }

  const client = await pool.connect();
  try {
    const book = await fetchOpenLibraryByIsbn(isbn);
    if (!book) {
      return res.status(404).json({ error: "Libro non trovato su OpenLibrary" });
    }

    await client.query("BEGIN");
    const state = await importBookFromOpenLibrary(client, book);
    await client.query("COMMIT");

    if (state.softDeleted) {
      return res.status(409).json({ error: "ISBN presente ma rimosso dal catalogo. Richiedi il ripristino a un admin." });
    }

    return res.status(state.alreadyExists ? 200 : 201).json({
      ok: true,
      imported: !state.alreadyExists,
      book,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ error: "ISBN già esistente" });
    }
    console.error(e);
    return res.status(500).json({ error: "Errore import da OpenLibrary" });
  } finally {
    client.release();
  }
}

// Importa da metadati OpenLibrary già caricati in frontend (evita chiamate ripetute verso OL).
export async function importBookFromOpenLibraryData(req, res) {
  const candidate = normalizeOpenLibraryCandidate(req.body?.book);
  if (!candidate) {
    return res.status(400).json({ error: "Dati libro non validi per import OpenLibrary" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const state = await importBookFromOpenLibrary(client, candidate);
    await client.query("COMMIT");

    if (state.softDeleted) {
      return res.status(409).json({ error: "ISBN presente ma rimosso dal catalogo. Richiedi il ripristino a un admin." });
    }

    return res.status(state.alreadyExists ? 200 : 201).json({
      ok: true,
      imported: !state.alreadyExists,
      book: candidate,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {
      return res.status(409).json({ error: "ISBN già esistente" });
    }
    console.error(e);
    return res.status(500).json({
      error: "Errore import da dati OpenLibrary",
      detail: process.env.NODE_ENV === "production" ? undefined : (e?.message || "unknown"),
      code: process.env.NODE_ENV === "production" ? undefined : (e?.code || null),
    });
  } finally {
    client.release();
  }
}

// Importa solo la descrizione da OpenLibrary se in catalogo è assente.
export async function importBookDescriptionFromOpenLibrary(req, res) {
  const isbn = normalizeIsbn(req.params?.isbn);
  if (!isbn) {
    return res.status(400).json({ error: "isbn mancante" });
  }

  try {
    const olBook = await fetchOpenLibraryByIsbn(isbn);
    if (!olBook) {
      return res.status(404).json({ error: "Libro non trovato su OpenLibrary" });
    }

    let description = String(olBook.description || "").trim();
    if (!description && olBook?.work_key) {
      const byWork = await fetchOpenLibraryWorkDescription(olBook.work_key);
      description = String(byWork || "").trim();
    }
    if (!description) {
      return res.status(404).json({ error: "Descrizione non disponibile su OpenLibrary" });
    }

    const updated = await pool.query(
      `UPDATE books
       SET description = $2,
           updated_at = NOW()
       WHERE isbn = $1
         AND deleted_at IS NULL
         AND (description IS NULL OR BTRIM(description) = '')
       RETURNING isbn, description`,
      [isbn, description]
    );

    if (updated.rowCount > 0) {
      return res.json({ ok: true, isbn, imported: true, description: updated.rows[0].description });
    }

    const exists = await pool.query(
      `SELECT isbn, description
       FROM books
       WHERE isbn = $1 AND deleted_at IS NULL`,
      [isbn]
    );

    if (exists.rowCount === 0) {
      return res.status(404).json({ error: "Libro non presente nel catalogo locale" });
    }

    return res.status(409).json({ error: "Descrizione già presente in catalogo" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore import descrizione da OpenLibrary" });
  }
}

// Importa solo la copertina da OpenLibrary se nel catalogo è assente.
export async function importBookCoverFromOpenLibrary(req, res) {
  const isbn = normalizeIsbn(req.params?.isbn);
  if (!isbn) return res.status(400).json({ error: "isbn mancante" });

  try {
    const coverUrl = await resolveOpenLibraryCoverByIsbn(isbn);
    if (!coverUrl) {
      return res.status(404).json({ error: "Copertina non disponibile su OpenLibrary" });
    }

    const up = await pool.query(
      `UPDATE books
       SET cover_url = $2,
           updated_at = NOW()
       WHERE isbn = $1
         AND deleted_at IS NULL
         AND (cover_url IS NULL OR BTRIM(cover_url) = '')
       RETURNING isbn, cover_url`,
      [isbn, coverUrl]
    );

    if (up.rowCount > 0) {
      return res.json({ ok: true, isbn, imported: true, cover_url: up.rows[0].cover_url });
    }

    const exists = await pool.query(
      `SELECT isbn, cover_url
       FROM books
       WHERE isbn = $1 AND deleted_at IS NULL`,
      [isbn]
    );
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: "Libro non presente nel catalogo locale" });
    }
    return res.status(409).json({ error: "Copertina già presente in catalogo" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore import copertina da OpenLibrary" });
  }
}

// Suggerimenti per titolo: prima catalogo locale, poi OpenLibrary.
export async function suggestBooks(req, res) {
  const q = String(req.query?.q || "").trim();
  let limit = Number(req.query?.limit);
  if (!Number.isInteger(limit) || limit <= 0) limit = 8;
  if (limit > 20) limit = 20;

  if (q.length < 2) {
    return res.status(400).json({ error: "query troppo corta (minimo 2 caratteri)" });
  }

  try {
    const cleanQ = String(q || "").trim();
    const isIsbnMode = isLikelyIsbn(cleanQ);
    const mode = isIsbnMode ? "isbn" : "text";
    const isbnQuery = isIsbnMode ? normalizeIsbn(cleanQ) : null;

    let local = [];
    if (isIsbnMode) {
      const localByIsbn = await pool.query(
        `
        SELECT
          b.isbn,
          b.title,
          b.cover_url,
          b.edition_year,
          p.name AS publisher,
          (
            SELECT string_agg(a2.name, ', ' ORDER BY a2.name)
            FROM book_authors ba2
            JOIN authors a2 ON a2.id = ba2.author_id
            WHERE ba2.book_isbn = b.isbn
          ) AS authors
        FROM books b
        JOIN publishers p ON p.id = b.publisher_id
        WHERE b.deleted_at IS NULL
          AND b.isbn = $1
        LIMIT 1
        `,
        [isbnQuery]
      );
      local = localByIsbn.rows.map((r) => ({
        source: "local",
        isbn: r.isbn,
        title: r.title,
        authors: r.authors || "",
        publisher: r.publisher || "",
        edition_year: r.edition_year ?? null,
        cover_url: r.cover_url || null,
      }));
    } else {
      const localR = await pool.query(
      `
      SELECT
        b.isbn,
        b.title,
        b.cover_url,
        b.edition_year,
        p.name AS publisher,
        (
          SELECT string_agg(a2.name, ', ' ORDER BY a2.name)
          FROM book_authors ba2
          JOIN authors a2 ON a2.id = ba2.author_id
          WHERE ba2.book_isbn = b.isbn
        ) AS authors
      FROM books b
      JOIN publishers p ON p.id = b.publisher_id
      WHERE b.deleted_at IS NULL
        AND (
          b.title ILIKE ('%' || $1 || '%')
          OR p.name ILIKE ('%' || $1 || '%')
          OR EXISTS (
            SELECT 1
            FROM book_authors ba
            JOIN authors a ON a.id = ba.author_id
            WHERE ba.book_isbn = b.isbn
              AND a.name ILIKE ('%' || $1 || '%')
          )
        )
      ORDER BY similarity(b.title, $1) DESC, b.title ASC
      LIMIT $2
      `,
      [cleanQ, limit]
    );
      local = localR.rows.map((r) => ({
        source: "local",
        isbn: r.isbn,
        title: r.title,
        authors: r.authors || "",
        publisher: r.publisher || "",
        edition_year: r.edition_year ?? null,
        cover_url: r.cover_url || null,
      }));
    }

    const localIsbnSet = new Set(local.map((b) => String(b.isbn)));
    let openLibraryRaw = [];
    if (isIsbnMode) {
      const one = await fetchOpenLibraryByIsbn(isbnQuery);
      openLibraryRaw = one ? [one] : [];
    } else {
      openLibraryRaw = await searchOpenLibrary(cleanQ, limit);
    }
    const openlibrary = openLibraryRaw.filter((b) => !localIsbnSet.has(String(b.isbn))).slice(0, limit);

    return res.json({
      ok: true,
      mode,
      q: cleanQ,
      limit,
      local,
      openlibrary,
      totals: {
        local: local.length,
        openlibrary: openlibrary.length,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Errore suggerimenti libri" });
  }
}
