BEGIN;

-- Generi minimi per usare subito la UI di inserimento libro
INSERT INTO genres (name) VALUES
  ('Narrativa'),
  ('Saggio'),
  ('Fantasy'),
  ('Romanzo storico')
ON CONFLICT (name) DO NOTHING;

-- Utente admin demo (password: pw14demo)
INSERT INTO users (username, email, password_hash, full_name, is_admin, is_trusted)
VALUES (
  'admin_demo',
  'admin@example.com',
  '$2b$10$HVGMu5PgkRAPFgYTnfX70enNTy9NTgCMCtYLP.pfQcOyyFrqv3oh.',
  'Admin Demo',
  TRUE,
  TRUE
)
ON CONFLICT DO NOTHING;

-- Dati libro minimi di esempio
WITH g AS (
  SELECT id FROM genres WHERE name = 'Narrativa' LIMIT 1
), p AS (
  INSERT INTO publishers (name)
  VALUES ('Editore Demo')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), b AS (
  INSERT INTO books (isbn, title, edition_year, pages, cover_price, genre_id, publisher_id)
  SELECT '9780000000001', 'Libro Demo', 2020, 200, 12.90, g.id, p.id
  FROM g, p
  ON CONFLICT (isbn) DO NOTHING
  RETURNING isbn
), a AS (
  INSERT INTO authors (name)
  VALUES ('Autore Demo')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO book_authors (book_isbn, author_id)
SELECT '9780000000001', a.id
FROM a
ON CONFLICT DO NOTHING;

COMMIT;
