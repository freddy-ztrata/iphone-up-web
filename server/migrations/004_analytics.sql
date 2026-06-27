-- 004 — Analítica de visitas (sesiones / páginas vistas / tiempo real).
-- Cada hit en una página pública inserta una fila vía POST /api/track.
CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  path        TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id);
