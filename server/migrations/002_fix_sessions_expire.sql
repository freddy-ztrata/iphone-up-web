-- 002 — Repara la tabla `sessions`.
--
-- La migración 001 original creó la columna `expired`, pero
-- better-sqlite3-session-store usa `expire`. El mismatch hacía que store.get/set
-- lanzara "no such column: expire" en cada request con cookie de sesión, lo que
-- devolvía Internal Server Error a cualquier usuario logueado (las peticiones
-- anónimas no tocan el store y por eso funcionaban).
--
-- Las sesiones son efímeras: recrear la tabla solo obliga a volver a iniciar
-- sesión. No afecta productos, órdenes, usuarios ni stock.
DROP TABLE IF EXISTS sessions;
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  expire  INTEGER NOT NULL,
  sess    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
