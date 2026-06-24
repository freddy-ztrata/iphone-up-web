// Backups automáticos de la DB SQLite cada N horas.
// Se guardan en {DATA_DIR}/backups/iphoneup-YYYYMMDD-HH.db
// Retención: las últimas N copias (default 14 días con 1 cada 6h = ~56).

const fs = require("fs");
const path = require("path");
const db = require("../db");

const DATA_DIR = db.DATA_DIR;
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 6);
const KEEP = Number(process.env.BACKUP_KEEP || 56);

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function pad(n) { return String(n).padStart(2, "0"); }
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function snapshot() {
  const file = path.join(BACKUP_DIR, `iphoneup-${timestamp()}.db`);
  try {
    await db.backup(file);
    console.log(`[backup] ok → ${file}`);
    pruneOld();
  } catch (err) {
    console.error("[backup] failed:", err.message);
  }
}

function pruneOld() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith(".db"))
    .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const stale = files.slice(KEEP);
  for (const { f } of stale) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
  }
}

function start() {
  // Una al boot (no esperamos N horas para tener al menos un punto de restauración).
  setTimeout(() => snapshot(), 30_000);
  setInterval(() => snapshot(), INTERVAL_HOURS * 60 * 60 * 1000);
  console.log(`[backup] programado cada ${INTERVAL_HOURS}h en ${BACKUP_DIR}`);
}

module.exports = { snapshot, start };
