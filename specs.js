// Specs oficiales Apple por línea (datos públicos).
// Cada entry mapea al `id` del catálogo en app.js (11..17).
// Solo agregamos campos genéricos por línea — los matices Pro/Pro Max van en `proExtras`.

window.IPHONE_SPECS = {
  11: {
    tagline: "Cámara dual, A13 Bionic y la confianza de un clásico que sigue rindiendo.",
    chip: "A13 Bionic",
    display: "6.1\" Liquid Retina HD · LCD · 1792×828 · 326 ppi",
    cameras: "Doble: 12 MP gran angular + 12 MP ultra gran angular · Modo Noche · 4K 60 fps",
    front: "12 MP TrueDepth · Slo-mo 120 fps",
    battery: "Hasta 17 h de reproducción de video · Carga rápida 18W (cargador no incluido)",
    connectivity: "Lightning · 4G LTE · Wi-Fi 6 · Bluetooth 5.0 · Face ID",
    dimensions: "150.9 × 75.7 × 8.3 mm · 194 g",
    materials: "Aluminio aeroespacial · Vidrio resistente",
    colors: ["Negro","Blanco","Verde","Amarillo","Morado","(PRODUCT)RED"],
    waterResistance: "IP68 · 2 m hasta 30 minutos",
    proExtras: {
      "iPhone 11 Pro":      { display: "5.8\" Super Retina XDR · OLED · 2436×1125 · 458 ppi", cameras: "Triple: 12 MP gran angular + ultra gran angular + teleobjetivo · Zoom óptico 2× · 4K 60 fps Dolby Vision", colors: ["Verde Noche","Gris Espacial","Plata","Oro"], materials: "Acero inoxidable · Vidrio mate texturizado" },
      "iPhone 11 Pro Max":  { display: "6.5\" Super Retina XDR · OLED · 2688×1242 · 458 ppi", cameras: "Triple: 12 MP gran angular + ultra gran angular + teleobjetivo · Zoom óptico 2× · 4K 60 fps Dolby Vision", colors: ["Verde Noche","Gris Espacial","Plata","Oro"], materials: "Acero inoxidable · Vidrio mate texturizado", battery: "Hasta 20 h de reproducción de video · Carga rápida 18W" },
    },
  },
  12: {
    tagline: "Diseño plano de bordes rectos, 5G y el salto al chip A14 Bionic.",
    chip: "A14 Bionic",
    display: "6.1\" Super Retina XDR · OLED · 2532×1170 · 460 ppi · HDR",
    cameras: "Doble: 12 MP gran angular ƒ/1.6 + 12 MP ultra gran angular · Modo Noche · 4K Dolby Vision",
    front: "12 MP TrueDepth · Modo Noche · 4K Dolby Vision",
    battery: "Hasta 17 h de reproducción de video · MagSafe 15W · Carga rápida 20W",
    connectivity: "Lightning · 5G · Wi-Fi 6 · Bluetooth 5.0 · MagSafe · Face ID",
    dimensions: "146.7 × 71.5 × 7.4 mm · 164 g",
    materials: "Aluminio aeroespacial · Ceramic Shield",
    colors: ["Negro","Blanco","Azul","Verde","(PRODUCT)RED","Morado"],
    waterResistance: "IP68 · 6 m hasta 30 minutos",
    proExtras: {
      "iPhone 12 Mini":     { display: "5.4\" Super Retina XDR · OLED · 2340×1080 · 476 ppi", dimensions: "131.5 × 64.2 × 7.4 mm · 135 g", battery: "Hasta 15 h de reproducción de video" },
      "iPhone 12 Pro":      { cameras: "Triple: gran angular + ultra gran angular + teleobjetivo + LiDAR · Zoom óptico 2× · 4K 60 fps Dolby Vision · ProRAW", colors: ["Grafito","Plata","Oro","Azul Pacífico"], materials: "Acero inoxidable · Ceramic Shield" },
      "iPhone 12 Pro Max":  { display: "6.7\" Super Retina XDR · OLED · 2778×1284 · 458 ppi", cameras: "Triple con sensor 47% más grande + LiDAR · Zoom óptico 2.5× · ProRAW · 4K Dolby Vision", colors: ["Grafito","Plata","Oro","Azul Pacífico"], materials: "Acero inoxidable · Ceramic Shield", battery: "Hasta 20 h de reproducción de video", dimensions: "160.8 × 78.1 × 7.4 mm · 226 g" },
    },
  },
  13: {
    tagline: "Cámaras rediseñadas con estilo cinemático y batería que dura todo el día.",
    chip: "A15 Bionic",
    display: "6.1\" Super Retina XDR · OLED · 2532×1170 · 460 ppi · True Tone",
    cameras: "Doble: 12 MP gran angular ƒ/1.6 + 12 MP ultra gran angular · Modo Cine 1080p 30 fps · Estilos Fotográficos",
    front: "12 MP TrueDepth · Modo Cine · 4K Dolby Vision",
    battery: "Hasta 19 h de reproducción de video · MagSafe 15W · Carga rápida 20W",
    connectivity: "Lightning · 5G · Wi-Fi 6 · Bluetooth 5.0 · MagSafe · Face ID",
    dimensions: "146.7 × 71.5 × 7.65 mm · 174 g",
    materials: "Aluminio aeroespacial · Ceramic Shield",
    colors: ["Medianoche","Blanco Estelar","Azul","Rosa","Verde","(PRODUCT)RED"],
    waterResistance: "IP68 · 6 m hasta 30 minutos",
    proExtras: {
      "iPhone 13 Mini":     { display: "5.4\" Super Retina XDR · OLED · 2340×1080 · 476 ppi", dimensions: "131.5 × 64.2 × 7.65 mm · 140 g", battery: "Hasta 17 h de reproducción de video" },
      "iPhone 13 Pro":      { display: "6.1\" Super Retina XDR ProMotion · 120 Hz · OLED · 2532×1170 · 460 ppi", cameras: "Triple Pro: gran angular ƒ/1.5 + ultra gran angular Macro + teleobjetivo 3× + LiDAR · ProRes · ProRAW", colors: ["Grafito","Oro","Plata","Azul Sierra","Verde Alpino"], materials: "Acero inoxidable · Ceramic Shield", battery: "Hasta 22 h de reproducción de video" },
      "iPhone 13 Pro Max":  { display: "6.7\" Super Retina XDR ProMotion · 120 Hz · OLED · 2778×1284 · 458 ppi", cameras: "Triple Pro: gran angular ƒ/1.5 + ultra gran angular Macro + teleobjetivo 3× + LiDAR · ProRes · ProRAW", colors: ["Grafito","Oro","Plata","Azul Sierra","Verde Alpino"], materials: "Acero inoxidable · Ceramic Shield", battery: "Hasta 28 h de reproducción de video", dimensions: "160.8 × 78.1 × 7.65 mm · 240 g" },
    },
  },
  14: {
    tagline: "Detección de Choques, Modo Acción y la cámara frontal con autofoco.",
    chip: "A15 Bionic (5 núcleos GPU)",
    display: "6.1\" Super Retina XDR · OLED · 2532×1170 · 460 ppi · HDR",
    cameras: "Doble: 12 MP gran angular ƒ/1.5 + 12 MP ultra gran angular · Modo Acción · Estilos Fotográficos",
    front: "12 MP TrueDepth ƒ/1.9 con autofoco · Modo Cine 4K",
    battery: "Hasta 20 h de reproducción de video · MagSafe 15W · Carga rápida 20W",
    connectivity: "Lightning · 5G · Wi-Fi 6 · Bluetooth 5.3 · MagSafe · Face ID · Detección de Choques · SOS satélite (US/CA)",
    dimensions: "146.7 × 71.5 × 7.8 mm · 172 g",
    materials: "Aluminio aeroespacial · Ceramic Shield",
    colors: ["Medianoche","Morado","Blanco Estelar","Azul","(PRODUCT)RED","Amarillo"],
    waterResistance: "IP68 · 6 m hasta 30 minutos",
    proExtras: {
      "iPhone 14 Plus":     { display: "6.7\" Super Retina XDR · OLED · 2778×1284 · 458 ppi", dimensions: "160.8 × 78.1 × 7.8 mm · 203 g", battery: "Hasta 26 h de reproducción de video" },
      "iPhone 14 Pro":      { display: "6.1\" Super Retina XDR ProMotion 120 Hz · 2556×1179 · 460 ppi · Always-On · Dynamic Island", chip: "A16 Bionic", cameras: "Triple Pro: 48 MP gran angular + 12 MP ultra gran angular + 12 MP teleobjetivo 3× + LiDAR · ProRes · ProRAW · 4K Cinematic 24 fps", colors: ["Negro Espacial","Plata","Oro","Morado Oscuro"], materials: "Acero inoxidable · Ceramic Shield", battery: "Hasta 23 h de reproducción de video" },
      "iPhone 14 Pro Max":  { display: "6.7\" Super Retina XDR ProMotion 120 Hz · 2796×1290 · 460 ppi · Always-On · Dynamic Island", chip: "A16 Bionic", cameras: "Triple Pro: 48 MP gran angular + 12 MP ultra gran angular + 12 MP teleobjetivo 3× + LiDAR · ProRes · ProRAW · 4K Cinematic 24 fps", colors: ["Negro Espacial","Plata","Oro","Morado Oscuro"], materials: "Acero inoxidable · Ceramic Shield", battery: "Hasta 29 h de reproducción de video", dimensions: "160.7 × 77.6 × 7.85 mm · 240 g" },
    },
  },
  15: {
    tagline: "USB-C, A16 Bionic y Dynamic Island ahora para todos.",
    chip: "A16 Bionic",
    display: "6.1\" Super Retina XDR · OLED · 2556×1179 · 460 ppi · Dynamic Island · HDR 1600 nits",
    cameras: "Doble: 48 MP gran angular ƒ/1.6 + 12 MP ultra gran angular · Tele 2× con sensor 48 MP · Modo Retrato Next-Gen",
    front: "12 MP TrueDepth ƒ/1.9 autofoco",
    battery: "Hasta 20 h de reproducción de video · MagSafe 15W · USB-C carga 20W",
    connectivity: "USB-C (USB 2) · 5G · Wi-Fi 6 · Bluetooth 5.3 · MagSafe · Face ID · Detección de Choques · SOS satélite",
    dimensions: "147.6 × 71.6 × 7.8 mm · 171 g",
    materials: "Aluminio · Vidrio mate con infusión de color · Ceramic Shield",
    colors: ["Negro","Azul","Verde","Amarillo","Rosa"],
    waterResistance: "IP68 · 6 m hasta 30 minutos",
    proExtras: {
      "iPhone 15 Plus":     { display: "6.7\" Super Retina XDR · OLED · 2796×1290 · 460 ppi · Dynamic Island", dimensions: "160.9 × 77.8 × 7.8 mm · 201 g", battery: "Hasta 26 h de reproducción de video" },
      "iPhone 15 Pro":      { display: "6.1\" Super Retina XDR ProMotion 120 Hz · 2556×1179 · 460 ppi · Always-On · Dynamic Island · 2000 nits", chip: "A17 Pro · 6 núcleos GPU", cameras: "Triple Pro: 48 MP ƒ/1.78 + 12 MP ultra gran angular + 12 MP tele 3× + LiDAR · ProRes · ProRAW · USB 3", connectivity: "USB-C (USB 3 hasta 10 Gb/s) · 5G · Wi-Fi 6E · Bluetooth 5.3 · Botón Acción", colors: ["Titanio Natural","Titanio Azul","Titanio Blanco","Titanio Negro"], materials: "Titanio Grado 5 · Ceramic Shield", battery: "Hasta 23 h de reproducción de video", dimensions: "146.6 × 70.6 × 8.25 mm · 187 g" },
      "iPhone 15 Pro Max":  { display: "6.7\" Super Retina XDR ProMotion 120 Hz · 2796×1290 · 460 ppi · Always-On · Dynamic Island · 2000 nits", chip: "A17 Pro · 6 núcleos GPU", cameras: "Triple Pro: 48 MP ƒ/1.78 + 12 MP ultra gran angular + 12 MP tele 5× tetraprisma + LiDAR · ProRes · ProRAW", connectivity: "USB-C (USB 3 hasta 10 Gb/s) · 5G · Wi-Fi 6E · Bluetooth 5.3 · Botón Acción", colors: ["Titanio Natural","Titanio Azul","Titanio Blanco","Titanio Negro"], materials: "Titanio Grado 5 · Ceramic Shield", battery: "Hasta 29 h de reproducción de video", dimensions: "159.9 × 76.7 × 8.25 mm · 221 g" },
    },
  },
  16: {
    tagline: "Apple Intelligence, Botón Cámara y el primer salto AI del iPhone.",
    chip: "A18",
    display: "6.1\" Super Retina XDR · OLED · 2556×1179 · 460 ppi · Dynamic Island · 2000 nits HDR",
    cameras: "Sistema Fusion: 48 MP gran angular ƒ/1.6 + 12 MP ultra gran angular Macro · Tele 2× · Estilos Fotográficos · Audio Mix",
    front: "12 MP TrueDepth ƒ/1.9 autofoco",
    battery: "Hasta 22 h de reproducción de video · MagSafe 25W · USB-C carga rápida",
    connectivity: "USB-C (USB 2) · 5G · Wi-Fi 7 · Bluetooth 5.3 · MagSafe · Face ID · Botón Acción · Botón Cámara · Apple Intelligence",
    dimensions: "147.6 × 71.6 × 7.8 mm · 170 g",
    materials: "Aluminio · Vidrio infundido en color · Ceramic Shield latest gen",
    colors: ["Negro","Blanco","Rosa","Verde Azulado","Ultramarino"],
    waterResistance: "IP68 · 6 m hasta 30 minutos",
    proExtras: {
      "iPhone 16 Plus":     { display: "6.7\" Super Retina XDR · OLED · 2796×1290 · 460 ppi", dimensions: "160.9 × 77.8 × 7.8 mm · 199 g", battery: "Hasta 27 h de reproducción de video" },
      "iPhone 16 Pro":      { display: "6.3\" Super Retina XDR ProMotion 120 Hz · 2622×1206 · 460 ppi · Always-On · Dynamic Island · 2000 nits", chip: "A18 Pro · 6 núcleos GPU", cameras: "Triple Pro: 48 MP Fusion + 48 MP ultra gran angular + 12 MP tele 5× tetraprisma + LiDAR · ProRes · ProRAW · 4K 120 fps Dolby Vision", colors: ["Titanio Negro","Titanio Blanco","Titanio Natural","Titanio del Desierto"], materials: "Titanio Grado 5 · Ceramic Shield", battery: "Hasta 27 h de reproducción de video", dimensions: "149.6 × 71.5 × 8.25 mm · 199 g" },
      "iPhone 16 Pro Max":  { display: "6.9\" Super Retina XDR ProMotion 120 Hz · 2868×1320 · 460 ppi · Always-On · Dynamic Island · 2000 nits", chip: "A18 Pro · 6 núcleos GPU", cameras: "Triple Pro: 48 MP Fusion + 48 MP ultra gran angular + 12 MP tele 5× tetraprisma + LiDAR · ProRes · ProRAW · 4K 120 fps Dolby Vision", colors: ["Titanio Negro","Titanio Blanco","Titanio Natural","Titanio del Desierto"], materials: "Titanio Grado 5 · Ceramic Shield", battery: "Hasta 33 h de reproducción de video", dimensions: "163.0 × 77.6 × 8.25 mm · 227 g" },
    },
  },
  17: {
    tagline: "Lo último de Apple. Pantalla ProMotion para todos y A19 Pro.",
    chip: "A19",
    display: "6.3\" Super Retina XDR ProMotion 120 Hz · OLED · 460 ppi · Always-On · Dynamic Island",
    cameras: "Doble Fusion: 48 MP gran angular + 12 MP ultra gran angular · Tele 2× con sensor cuádruple-pixel · 4K Dolby Vision",
    front: "18 MP TrueDepth ƒ/1.9 autofoco · Center Stage",
    battery: "Hasta 24 h de reproducción de video · MagSafe 25W · USB-C carga rápida",
    connectivity: "USB-C (USB 2) · 5G · Wi-Fi 7 · Bluetooth 5.3 · Botón Acción · Botón Cámara · Apple Intelligence",
    dimensions: "149.6 × 71.5 × 7.95 mm · 177 g",
    materials: "Aluminio aeroespacial · Ceramic Shield 2",
    colors: ["Negro","Blanco","Azul Niebla","Salvia","Lavanda"],
    waterResistance: "IP68 · 6 m hasta 30 minutos",
    proExtras: {
      "iPhone 17 Pro":      { display: "6.3\" Super Retina XDR ProMotion 120 Hz · 460 ppi · Always-On · Dynamic Island · pico 3000 nits", chip: "A19 Pro · 6 núcleos GPU", cameras: "Triple Pro: 48 MP Fusion + 48 MP ultra gran angular + 48 MP tele 8× + LiDAR · ProRes RAW · 4K 120 fps Dolby Vision", colors: ["Cosmic Orange","Deep Blue","Silver"], materials: "Aluminio Pro Grade · Ceramic Shield 2", battery: "Hasta 31 h de reproducción de video", dimensions: "150.0 × 71.9 × 8.75 mm · 206 g" },
      "iPhone 17 Pro Max":  { display: "6.9\" Super Retina XDR ProMotion 120 Hz · 460 ppi · Always-On · Dynamic Island · pico 3000 nits", chip: "A19 Pro · 6 núcleos GPU", cameras: "Triple Pro: 48 MP Fusion + 48 MP ultra gran angular + 48 MP tele 8× + LiDAR · ProRes RAW · 4K 120 fps Dolby Vision", colors: ["Cosmic Orange","Deep Blue","Silver"], materials: "Aluminio Pro Grade · Ceramic Shield 2", battery: "Hasta 39 h de reproducción de video · la mayor de cualquier iPhone", dimensions: "163.4 × 77.9 × 8.75 mm · 233 g" },
    },
  },
};

// Resolves specs for a specific model variant — merges line base with proExtras override.
window.getSpecsFor = function(lineId, variantName) {
  const base = window.IPHONE_SPECS[lineId];
  if (!base) return null;
  const extras = base.proExtras && base.proExtras[variantName];
  return { ...base, ...(extras || {}) };
};
