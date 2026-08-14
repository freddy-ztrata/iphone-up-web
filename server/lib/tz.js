// Zona horaria del negocio (America/Santiago) sin dependencias nuevas.
//
// Por qué existe: SQLite resuelve `datetime('now','localtime')` usando la TZ del
// sistema operativo. La imagen del Dockerfile es node:20-alpine, que no trae
// tzdata y corre en UTC, así que "hoy" en el dashboard empezaba a las 20:00 o
// 21:00 hora de Santiago. En vez de agregar tzdata a la imagen (más peso) o de
// depender de una env TZ que puede faltar, calculamos el offset real con Intl
// (Node 20 trae ICU completo) y se lo pasamos a SQLite como modificador
// explícito de minutos.
//
// El offset se recalcula en cada llamada: Chile cambia a horario de verano y un
// valor cacheado al boot quedaría desfasado una hora hasta el siguiente deploy.

const TZ = "America/Santiago";

// Formatea una fecha en la TZ pedida y la re-parsea como si fuera UTC. La
// diferencia contra el instante original es el offset de esa zona.
const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function partsIn(date) {
  const out = {};
  for (const p of PARTS_FMT.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  // Intl usa "24" para medianoche con hour12:false en algunas versiones de ICU.
  if (out.hour === "24") out.hour = "00";
  return out;
}

/**
 * Offset de America/Santiago en minutos respecto de UTC (negativo al oeste).
 * Ej: -240 en horario de verano, -180 en invierno.
 */
function offsetMinutes(date = new Date()) {
  const p = partsIn(date);
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second)
  );
  // Redondeamos al minuto: los segundos del instante original se pierden en el
  // formateo y sin redondear el offset saldría con ±1 minuto de ruido.
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Modificador para pasar a SQLite y convertir un timestamp UTC a hora local
 * de Santiago. Uso: date(created_at, sqliteModifier()).
 *
 * Devolvemos siempre el signo explícito porque SQLite lo exige ('-240 minutes').
 */
function sqliteModifier(date = new Date()) {
  const m = offsetMinutes(date);
  return `${m >= 0 ? "+" : "-"}${Math.abs(m)} minutes`;
}

/** Fecha de hoy en Santiago como 'YYYY-MM-DD'. */
function today(date = new Date()) {
  const p = partsIn(date);
  return `${p.year}-${p.month}-${p.day}`;
}

module.exports = { TZ, offsetMinutes, sqliteModifier, today };
