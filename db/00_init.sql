BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  exchange_contact_preference TEXT NOT NULL DEFAULT 'email'
    CHECK (exchange_contact_preference IN ('email', 'phone')),
  is_trusted BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,

  geom geography(Point,4326),
  location_consent BOOLEAN NOT NULL DEFAULT FALSE,
  location_updated_at TIMESTAMPTZ,
  location_precision_km NUMERIC(5,2),
  location_privacy_profile TEXT
    CHECK (location_privacy_profile IN ('standard', 'private')),
  location_source TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Allineo anche DB esistenti: rimuovo il vecchio unique case-sensitive.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

CREATE TABLE IF NOT EXISTS genres (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS publishers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS authors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS books (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  edition_year INTEGER,
  pages INTEGER CHECK (pages IS NULL OR pages > 0),
  cover_price NUMERIC(10,2),
  genre_id BIGINT NOT NULL REFERENCES genres(id),
  publisher_id BIGINT NOT NULL REFERENCES publishers(id),
  cover_url TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS book_authors (
  book_isbn TEXT NOT NULL REFERENCES books(isbn) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES authors(id),
  PRIMARY KEY (book_isbn, author_id)
);

CREATE TABLE IF NOT EXISTS user_books (
  user_id BIGINT NOT NULL REFERENCES users(id),
  book_isbn TEXT NOT NULL REFERENCES books(isbn),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, book_isbn)
);

CREATE TABLE IF NOT EXISTS loan_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_user_id BIGINT NOT NULL REFERENCES users(id),
  owner_user_id BIGINT NOT NULL REFERENCES users(id),
  book_isbn TEXT NOT NULL REFERENCES books(isbn),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'returned', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_user_id <> owner_user_id)
);

-- Indici utili alla ricerca geospaziale e ai filtri piu frequenti
CREATE INDEX IF NOT EXISTS idx_users_active_location
  ON users USING GIST (geom)
  WHERE deleted_at IS NULL AND location_consent = TRUE AND geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_active_created
  ON users (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_active_is_trusted
  ON users (is_trusted)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_active_is_admin
  ON users (is_admin)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON users (LOWER(username));

CREATE INDEX IF NOT EXISTS idx_books_active_genre
  ON books (genre_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_books_active_title_trgm
  ON books USING GIN (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_books_active_view_count
  ON books (view_count DESC, title)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_books_by_user_active
  ON user_books (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_books_by_book_active
  ON user_books (book_isbn, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_books_available_by_book
  ON user_books (book_isbn, user_id)
  WHERE deleted_at IS NULL AND is_available = TRUE;

-- Vincolo citato nel codice: evita piu richieste attive sullo stesso owner/libro
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_active_per_owner_book
  ON loan_requests (owner_user_id, book_isbn)
  WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS idx_loan_requests_inbox
  ON loan_requests (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loan_requests_outbox
  ON loan_requests (requester_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loan_requests_book_status
  ON loan_requests (book_isbn, status);

COMMIT;
