-- 003 — Corrige el ORDEN de columnas de `sessions`.
--
-- better-sqlite3-session-store hace INSERT posicional con orden (sid, sess, expire).
-- La migración 002 recreó la tabla como (sid, expire, sess), invirtiendo dos
-- columnas: el JSON de la sesión terminaba en la columna `expire` y la fecha de
-- expiración en `sess`. Al leer, `sess` no era JSON válido, así que express-session
-- no podía recuperar NINGUNA sesión: el usuario iniciaba sesión pero cada llamada
-- a /api/admin/* devolvía 401 "No autenticado" (productos/usuarios/órdenes vacíos).
--
-- Recreamos la tabla con el orden correcto. Las sesiones son efímeras: solo obliga
-- a volver a iniciar sesión. No afecta productos, órdenes, usuarios ni stock.
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
