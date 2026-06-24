// Fallback de envíos: tarifas fijas por región mientras no se conecta
// la API real de Chilexpress.
//
// Cuando las env vars CHILEXPRESS_API_KEY_RATING / GEO existen, se ignora
// este archivo y se usa la API real. Cuando NO existen, las rutas
// /api/chilexpress/* responden con esta data para que el checkout siga
// funcionando.
//
// Estructura:
//   - REGIONS:  lista de regiones (mismo shape que respuesta de Chilexpress)
//   - COMMUNES: principales comunas por región (suficiente para iniciar; el
//               resto puede coordinarse por WhatsApp)
//   - RATES:    tarifa fija por región (CLP). Express simple, 24–72h hábiles.

const REGIONS = [
  { regionCode: "XV", regionName: "Arica y Parinacota",          regionId: 15 },
  { regionCode: "I",  regionName: "Tarapacá",                    regionId: 1  },
  { regionCode: "II", regionName: "Antofagasta",                 regionId: 2  },
  { regionCode: "III",regionName: "Atacama",                     regionId: 3  },
  { regionCode: "IV", regionName: "Coquimbo",                    regionId: 4  },
  { regionCode: "V",  regionName: "Valparaíso",                  regionId: 5  },
  { regionCode: "RM", regionName: "Metropolitana de Santiago",   regionId: 13 },
  { regionCode: "VI", regionName: "O'Higgins",                   regionId: 6  },
  { regionCode: "VII",regionName: "Maule",                       regionId: 7  },
  { regionCode: "XVI",regionName: "Ñuble",                       regionId: 16 },
  { regionCode: "VIII",regionName:"Biobío",                      regionId: 8  },
  { regionCode: "IX", regionName: "La Araucanía",                regionId: 9  },
  { regionCode: "XIV",regionName: "Los Ríos",                    regionId: 14 },
  { regionCode: "X",  regionName: "Los Lagos",                   regionId: 10 },
  { regionCode: "XI", regionName: "Aysén",                       regionId: 11 },
  { regionCode: "XII",regionName: "Magallanes",                  regionId: 12 },
];

// Comunas principales por región. Códigos arbitrarios (slug en mayúsculas).
// Cuando se conecte Chilexpress, esta tabla queda obsoleta — los códigos
// reales los entrega su API.
const COMMUNES = {
  XV:  ["Arica", "Putre"],
  I:   ["Iquique", "Alto Hospicio", "Pozo Almonte"],
  II:  ["Antofagasta", "Calama", "Tocopilla", "Mejillones"],
  III: ["Copiapó", "Vallenar", "Caldera"],
  IV:  ["La Serena", "Coquimbo", "Ovalle", "Illapel"],
  V:   ["Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "San Antonio", "Quillota", "Los Andes", "San Felipe"],
  RM:  ["Santiago", "Providencia", "Las Condes", "Ñuñoa", "La Reina", "Vitacura", "Lo Barnechea",
        "Maipú", "La Florida", "Puente Alto", "San Bernardo", "Peñalolén", "Macul", "Quilicura",
        "Huechuraba", "Independencia", "Recoleta", "Renca", "Estación Central", "San Miguel",
        "La Cisterna", "El Bosque", "Pudahuel", "Cerrillos", "Conchalí"],
  VI:  ["Rancagua", "San Fernando", "Rengo", "Santa Cruz", "Pichilemu"],
  VII: ["Talca", "Curicó", "Linares", "Constitución", "Cauquenes"],
  XVI: ["Chillán", "Chillán Viejo", "Bulnes", "San Carlos"],
  VIII:["Concepción", "Talcahuano", "Los Ángeles", "Chiguayante", "Coronel", "San Pedro de la Paz", "Hualpén"],
  IX:  ["Temuco", "Padre Las Casas", "Villarrica", "Pucón", "Angol"],
  XIV: ["Valdivia", "La Unión", "Río Bueno"],
  X:   ["Puerto Montt", "Osorno", "Castro", "Ancud", "Puerto Varas"],
  XI:  ["Coyhaique", "Puerto Aysén"],
  XII: ["Punta Arenas", "Puerto Natales"],
};

// Tarifas fijas por región (CLP). Ajustables a gusto del cliente.
const RATES = {
  RM: 4990,    // Región Metropolitana — más barato
  V: 6990, VI: 6990, VII: 6990, XVI: 6990,
  IV: 7990, VIII: 7990,
  III: 8990, IX: 8990, XIV: 8990, X: 8990,
  II: 9990,
  I: 11990, XV: 11990,
  XI: 12990, XII: 12990,
};

// Tiempo estimado de entrega por región (display)
const ETA = {
  RM: "24 a 48 horas hábiles",
  V: "48 a 72 horas hábiles", VI: "48 a 72 horas hábiles", VII: "48 a 72 horas hábiles", XVI: "48 a 72 horas hábiles",
  IV: "2 a 4 días hábiles", VIII: "2 a 4 días hábiles",
  III: "3 a 5 días hábiles", IX: "3 a 5 días hábiles", XIV: "3 a 5 días hábiles", X: "3 a 5 días hábiles",
  II: "3 a 5 días hábiles",
  I: "4 a 6 días hábiles", XV: "4 a 6 días hábiles",
  XI: "5 a 7 días hábiles", XII: "5 a 7 días hábiles",
};

function isEnabled() {
  return !process.env.CHILEXPRESS_API_KEY_RATING;
}

function listRegions() {
  return REGIONS.map(r => ({ ...r }));
}

function listCommunes(regionCode) {
  const code = String(regionCode || "").toUpperCase();
  const names = COMMUNES[code] || [];
  return names.map(name => ({
    countyCode: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
    countyName: name,
    regionCode: code,
  }));
}

function quoteForRegion(regionCode) {
  const code = String(regionCode || "").toUpperCase();
  const price = RATES[code] ?? 9990;
  const eta = ETA[code] || "2 a 5 días hábiles";
  return [{
    code: "FALLBACK_STD",
    name: "Envío estándar",
    price,
    deliveryTime: eta,
  }];
}

// Dado un countyCode generado por listCommunes, deducimos la región a partir
// del nombre de la comuna (búsqueda inversa). Si no se encuentra, devolvemos RM.
function regionFromCountyCode(countyCode) {
  if (!countyCode) return "RM";
  for (const [region, names] of Object.entries(COMMUNES)) {
    for (const name of names) {
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      if (code === countyCode) return region;
    }
  }
  return "RM";
}

module.exports = { isEnabled, listRegions, listCommunes, quoteForRegion, regionFromCountyCode };
