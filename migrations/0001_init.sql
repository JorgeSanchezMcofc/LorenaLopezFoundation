-- Adopta un Regalo: niños, regalos y bitácora de cambios.
-- Privacidad: solo primer nombre; las notas son internas y nunca se publican.

CREATE TABLE children (
  id               TEXT PRIMARY KEY,              -- NINO-001
  seq              INTEGER NOT NULL UNIQUE,
  slug             TEXT NOT NULL UNIQUE,          -- nino-001 (la URL no lleva el nombre)
  first_name       TEXT NOT NULL DEFAULT '',
  age              INTEGER,
  grade_es         TEXT NOT NULL DEFAULT '',
  grade_en         TEXT NOT NULL DEFAULT '',
  interests        TEXT NOT NULL DEFAULT '[]',    -- JSON [{"es":"carros","en":"cars"}]
  profile_es       TEXT NOT NULL DEFAULT '',
  profile_en       TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',      -- interno
  privacy_warnings TEXT NOT NULL DEFAULT '[]',    -- JSON, avisos de la IA para el equipo
  guardian_ok      INTEGER NOT NULL DEFAULT 0,    -- autorización del tutor legal (interno)
  image_key        TEXT,                          -- caricatura aprobada (R2)
  thumb_key        TEXT,                          -- versión ligera WebP (R2)
  draft_image_key  TEXT,                          -- última caricatura generada, sin aprobar
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at     TEXT,
  published_by     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX children_status ON children(status);

CREATE TABLE gifts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id   TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  title_es   TEXT NOT NULL,
  title_en   TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','gifted')),
  gifted_at  TEXT
);
CREATE INDEX gifts_child ON gifts(child_id, position);

-- Contador que nunca retrocede: un ID borrado (NINO-007) no se vuelve a usar.
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counters (name, value) VALUES ('child', 0);

CREATE TABLE audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actor    TEXT NOT NULL,
  action   TEXT NOT NULL,
  child_id TEXT,
  detail   TEXT
);
