// Almacenamiento mínimo de órdenes en disco (JSON).
// Para producción real, reemplazar por una DB (Postgres, Mongo, etc.).
// Hoy alcanza para llevar registro de qué órdenes están aprobadas y notificar al cliente.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(__dirname, "..", "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "{}", "utf-8");
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8") || "{}");
  } catch {
    return {};
  }
}

function writeAll(data) {
  ensureFile();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function saveOrder(order) {
  const all = readAll();
  all[order.id] = { ...all[order.id], ...order, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[order.id];
}

function getOrder(id) {
  return readAll()[id] || null;
}

function updateOrderStatus(id, status, paymentInfo = {}) {
  const all = readAll();
  if (!all[id]) return null;
  all[id].status = status;
  all[id].payment = { ...(all[id].payment || {}), ...paymentInfo };
  all[id].updatedAt = new Date().toISOString();
  writeAll(all);
  return all[id];
}

module.exports = { saveOrder, getOrder, updateOrderStatus };
