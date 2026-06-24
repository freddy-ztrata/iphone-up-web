// SQLite singleton + migraciones al boot.
// Toda capa que necesite DB hace `const db = require('./db')` y obtiene la misma instancia.

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "iphoneup.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// Aplica todas las migraciones .sql que aún no estén registradas en _migrations.
function runMigrations() {
  // Asegura que la tabla _migrations exista antes de chequear.
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const dir = path.join(__dirname, "migrations");
  if (!fs.existsSync(dir)) return;

  const applied = new Set(
    db.prepare("SELECT filename FROM _migrations").all().map(r => r.filename)
  );

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(".sql"))
    .sort(); // 001_, 002_, ...

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    console.log(`[db] applying migration ${file}`);
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      console.error(`[db] migration ${file} failed:`, err.message);
      throw err;
    }
  }
}

runMigrations();

console.log(`[db] ready at ${DB_PATH}`);

module.exports = db;
module.exports.DATA_DIR = DATA_DIR;
module.exports.DB_PATH = DB_PATH;
