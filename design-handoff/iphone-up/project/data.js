// Shared data — used by all 3 proposals
const IPHONE_CATALOG = [
  {
    id: 11, name: "iPhone 11", line: "11", year: 2019, img: "assets/iphone-11.png",
    variants: [
      { model: "iPhone 11", storage: "64GB", price: 220000, sealed: false },
      { model: "iPhone 11", storage: "128GB", price: 260000, sealed: false },
      { model: "iPhone 11", storage: "256GB", price: 310000, sealed: false },
    ],
  },
  {
    id: 12, name: "iPhone 12", line: "12", year: 2020, img: "assets/iphone-12.png",
    variants: [
      { model: "iPhone 12", storage: "64GB", price: 290000, sealed: false },
      { model: "iPhone 12", storage: "128GB", price: 340000, sealed: false },
      { model: "iPhone 12 Pro", storage: "256GB", price: 480000, sealed: false },
    ],
  },
  {
    id: 13, name: "iPhone 13", line: "13", year: 2021, img: "assets/iphone-13.png",
    variants: [
      { model: "iPhone 13", storage: "128GB", price: 420000, sealed: false },
      { model: "iPhone 13", storage: "256GB", price: 480000, sealed: false },
      { model: "iPhone 13 Pro", storage: "256GB", price: 620000, sealed: false },
    ],
  },
  {
    id: 14, name: "iPhone 14", line: "14", year: 2022, img: "assets/iphone-14.png",
    variants: [
      { model: "iPhone 14", storage: "128GB", price: 540000, sealed: false },
      { model: "iPhone 14", storage: "256GB", price: 620000, sealed: false },
      { model: "iPhone 14 Pro", storage: "256GB", price: 780000, sealed: true },
    ],
  },
  {
    id: 15, name: "iPhone 15", line: "15", year: 2023, img: "assets/iphone-15.png",
    variants: [
      { model: "iPhone 15", storage: "128GB", price: 720000, sealed: true },
      { model: "iPhone 15", storage: "256GB", price: 820000, sealed: true },
      { model: "iPhone 15 Pro", storage: "256GB", price: 980000, sealed: true },
      { model: "iPhone 15 Pro Max", storage: "512GB", price: 1240000, sealed: true },
    ],
  },
  {
    id: 16, name: "iPhone 16", line: "16", year: 2024, img: "assets/iphone-16.png",
    variants: [
      { model: "iPhone 16", storage: "128GB", price: 890000, sealed: true },
      { model: "iPhone 16", storage: "256GB", price: 980000, sealed: true },
      { model: "iPhone 16 Pro", storage: "256GB", price: 1180000, sealed: true },
      { model: "iPhone 16 Pro Max", storage: "512GB", price: 1450000, sealed: true },
    ],
  },
  {
    id: 17, name: "iPhone 17", line: "17", year: 2025, img: "assets/iphone-17.png",
    variants: [
      { model: "iPhone 17", storage: "256GB", price: 1090000, sealed: true },
      { model: "iPhone 17", storage: "512GB", price: 1240000, sealed: true },
      { model: "iPhone 17 Pro", storage: "256GB", price: 1290000, sealed: true },
      { model: "iPhone 17 Pro Max", storage: "512GB", price: 1490000, sealed: true },
    ],
  },
];

const TESTIMONIALS = [
  { name: "Camila R.", role: "Providencia", rating: 5, text: "Compré un 15 Pro sellado, todo perfecto. Atención de 10 en la tienda, me explicaron cada detalle." },
  { name: "Diego M.", role: "Las Condes", rating: 5, text: "Vendí mi 13 Pro y me dieron mejor precio que en otras tiendas. Pago al instante." },
  { name: "Javiera P.", role: "Ñuñoa", rating: 5, text: "Llevo dos iPhones comprados acá. Garantía real, equipos impecables, recomendado 100%." },
  { name: "Tomás S.", role: "Santiago", rating: 5, text: "Excelente experiencia. Probaron el equipo conmigo y me ayudaron con la migración." },
];

const STATS = [
  { n: "+5.000", l: "iPhones vendidos" },
  { n: "6 meses", l: "garantía oficial" },
  { n: "100%", l: "originales" },
  { n: "4.9★", l: "calificación clientes" },
];

const FAQS = [
  { q: "¿Los iPhones son originales?", a: "Sí, 100% originales Apple. Cada equipo pasa por una revisión técnica de 27 puntos antes de venderse y se entrega con su número de serie verificable en checkcoverage.apple.com." },
  { q: "¿Qué garantía incluyen?", a: "Todos nuestros equipos —sellados y seminuevos— incluyen 6 meses de garantía oficial UP que cubre defectos de fábrica y problemas técnicos. La gestión es directa con nosotros, sin intermediarios." },
  { q: "¿Puedo entregar mi iPhone como parte de pago?", a: "Sí. Cotiza online en 60 segundos, agendas tu visita y la evaluación final es gratuita. El descuento se aplica directo al precio del nuevo equipo." },
  { q: "¿Hacen envíos a regiones?", a: "Sí, despachamos a todo Chile vía Starken o Chilexpress con seguro incluido. Despacho gratis dentro de RM en compras sobre $500.000." },
  { q: "¿Cómo pago?", a: "Aceptamos efectivo, transferencia, débito, crédito y financiamiento PágaloAsí en hasta 12 cuotas sin interés." },
  { q: "¿Atienden sin cita?", a: "Por tu seguridad y la nuestra, atendemos preferentemente con cita previa por WhatsApp. También aceptamos walk-in en horario de tienda." },
];

const fmtCLP = (n) => "$" + n.toLocaleString("es-CL");

window.IPHONE_CATALOG = IPHONE_CATALOG;
window.TESTIMONIALS = TESTIMONIALS;
window.STATS = STATS;
window.FAQS = FAQS;
window.fmtCLP = fmtCLP;
