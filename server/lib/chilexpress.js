// Cliente de la API de Chilexpress.
// Documentación: https://developers.chilexpress.cl/
//
// Productos utilizados:
//   - Geo Referencia: listar regiones y comunas (coberturas).
//   - Cotizador (Rating): obtener costo de envío puerta a puerta.
//
// Headers:
//   Ocp-Apim-Subscription-Key: <suscripción del producto correspondiente>
//   Content-Type: application/json

const BASE_GEO = "https://api.chilexpress.cl/services/v1/geo-reference";
const BASE_RATING = "https://api.chilexpress.cl/rating/v1.0/rates/courier";

function keyGeo() {
  const k = process.env.CHILEXPRESS_API_KEY_GEO || process.env.CHILEXPRESS_API_KEY_RATING;
  if (!k) throw new Error("CHILEXPRESS_API_KEY_GEO no configurada");
  return k;
}

function keyRating() {
  const k = process.env.CHILEXPRESS_API_KEY_RATING;
  if (!k) throw new Error("CHILEXPRESS_API_KEY_RATING no configurada");
  return k;
}

async function fetchJson(url, opts = {}) {
  // Usamos fetch global de Node 18+. En Node 20+ está nativo.
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.message || body?.error || body?.errors?.[0]?.description || text;
    const err = new Error(`Chilexpress ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ---------- Geo referencia ----------
async function listRegions() {
  const data = await fetchJson(`${BASE_GEO}/regions`, {
    headers: { "Ocp-Apim-Subscription-Key": keyGeo() },
  });
  // Estructura típica: { regions: [{ regionId, regionName, regionCode }] }
  return data.regions || data.Regions || [];
}

async function listCoverageAreas(regionCode) {
  // type=1 → coberturas de despacho. Las comunas de destino.
  const url = `${BASE_GEO}/coverage-areas?regionCode=${encodeURIComponent(regionCode)}&type=1`;
  const data = await fetchJson(url, {
    headers: { "Ocp-Apim-Subscription-Key": keyGeo() },
  });
  return data.coverageAreas || data.CoverageAreas || [];
}

// ---------- Cotizador ----------
/**
 * Cotiza el envío desde la tienda hasta una comuna destino.
 * @param {object} p
 * @param {string} p.destinationCountyCode  Código comuna destino (ej: "STGO")
 * @param {number} p.weight                  Peso en kg
 * @param {number} p.length                  cm
 * @param {number} p.width                   cm
 * @param {number} p.height                  cm
 * @param {number} [p.declaredWorth]         CLP declarado para seguro (opcional)
 * @returns {Promise<{courierServiceOptions:Array}>}
 */
async function quote({ destinationCountyCode, weight, length, width, height, declaredWorth }) {
  const originCounty = process.env.CHILEXPRESS_ORIGIN_COUNTY_CODE || "PROV";

  const payload = {
    originCountyCode: originCounty,
    destinationCountyCode,
    package: {
      weight: String(weight),
      height: String(height),
      width: String(width),
      length: String(length),
    },
    productType: 3,            // 3 = encomienda
    contentType: 1,            // 1 = mercancía no peligrosa
    declaredWorth: declaredWorth ? String(declaredWorth) : "0",
                               // Para activar seguro: > 0
                               // declaredContent: 1, etc., según convenio
  };

  const data = await fetchJson(BASE_RATING, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": keyRating(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // Respuesta típica: { data: { courierServiceOptions: [{ serviceTypeCode, serviceDescription, serviceValue, ... }] } }
  const options =
    data?.data?.courierServiceOptions ||
    data?.courierServiceOptions ||
    [];
  return { raw: data, options };
}

module.exports = { listRegions, listCoverageAreas, quote };
