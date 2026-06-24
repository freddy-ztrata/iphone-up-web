// Contenido editorial que aún no está en DB.
// Migrar a `settings` cuando el admin pueda editarlos.

module.exports = {
  TESTIMONIALS: [
    { name: "Camila R.", role: "Providencia", rating: 5, text: "Compré un 15 Pro sellado, todo perfecto. Atención de 10 en la tienda, me explicaron cada detalle." },
    { name: "Diego M.",  role: "Las Condes",  rating: 5, text: "Vendí mi 13 Pro y me dieron mejor precio que en otras tiendas. Pago al instante." },
    { name: "Javiera P.", role: "Ñuñoa",      rating: 5, text: "Llevo dos iPhones comprados acá. Garantía real, equipos impecables, recomendado 100%." },
    { name: "Tomás S.",  role: "Santiago",    rating: 5, text: "Excelente experiencia. Probaron el equipo conmigo y me ayudaron con la migración." },
  ],

  STATS: [
    { n: "+5.000",  l: "iPhones vendidos" },
    { n: "6 meses", l: "garantía oficial" },
    { n: "100%",    l: "originales" },
    { n: "4.9★",    l: "calificación clientes" },
  ],

  FAQS: [
    { q: "¿Los iPhones son originales?", a: "Sí, 100% originales Apple. Cada equipo pasa por una revisión técnica antes de venderse y se entrega con su número de serie verificable en checkcoverage.apple.com." },
    { q: "¿Qué garantía incluyen?",      a: "Todos nuestros equipos —sellados y seminuevos— incluyen 6 meses de garantía oficial UP que cubre defectos de fábrica y problemas técnicos. La gestión es directa con nosotros, sin intermediarios." },
    { q: "¿Puedo entregar mi iPhone como parte de pago?", a: "Sí. Cotiza online en 60 segundos, agendas tu visita y la evaluación final es gratuita. El descuento se aplica directo al precio del nuevo equipo." },
    { q: "¿Hacen envíos a regiones?",    a: "Sí, despachamos a todo Chile vía Starken o Chilexpress con seguro incluido. Despacho gratis dentro de RM en compras sobre $500.000." },
    { q: "¿Cómo pago?",                  a: "Aceptamos efectivo, transferencia bancaria y tarjetas de débito y crédito (Visa, Mastercard y American Express). Paga con el medio que más te acomode en nuestra tienda de Providencia." },
    { q: "¿Atienden sin cita?",          a: "Por tu seguridad y la nuestra, atendemos preferentemente con cita previa por Instagram (@iphoneup.cl). También aceptamos walk-in en horario de tienda." },
  ],

  TRADEIN_PRICES: {
    "iPhone 11":         { "64GB": 80000,  "128GB": 90000 },
    "iPhone 11 Pro":     { "64GB": 105000, "128GB": 110000 },
    "iPhone 11 Pro Max": { "64GB": 130000, "128GB": 140000 },
    "iPhone 12 Mini":    { "64GB": 100000 },
    "iPhone 12":         { "64GB": 140000, "128GB": 160000 },
    "iPhone 12 Pro":     { "128GB": 200000, "256GB": 230000 },
    "iPhone 12 Pro Max": { "128GB": 230000, "256GB": 260000 },
    "iPhone 13 Mini":    { "128GB": 170000, "256GB": 190000 },
    "iPhone 13":         { "128GB": 210000, "256GB": 230000 },
    "iPhone 13 Pro":     { "128GB": 290000, "256GB": 310000 },
    "iPhone 13 Pro Max": { "128GB": 350000, "256GB": 370000 },
    "iPhone 14":         { "128GB": 260000, "256GB": 300000 },
    "iPhone 14 Plus":    { "128GB": 310000 },
    "iPhone 14 Pro":     { "128GB": 400000, "256GB": 420000 },
    "iPhone 14 Pro Max": { "128GB": 430000, "256GB": 460000 },
    "iPhone 15":         { "128GB": 360000 },
    "iPhone 15 Pro":     { "128GB": 520000 },
    "iPhone 15 Pro Max": { "256GB": 560000, "512GB": 580000 },
    "iPhone 16":         { "128GB": 530000, "256GB": 550000 },
    "iPhone 16 Pro":     { "256GB": 680000 },
    "iPhone 16 Pro Max": { "256GB": 760000 },
    "iPhone 17":         { "256GB": 610000, "512GB": 630000 },
    "iPhone 17 Pro":     { "256GB": 940000, "512GB": 980000 },
    "iPhone 17 Pro Max": { "256GB": 980000, "512GB": 1020000 },
  },
};
