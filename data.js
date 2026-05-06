// iPhone UP — datos compartidos entre páginas
// Precios reales del cliente (extraídos de IG @iphoneup.cl)
// Sellado: solo iPhone 17. Resto seminuevo A+.

window.CATALOG = [
  {
    id: 11, line: "11", year: 2019, img: "assets/iphones/iphone-11.png",
    models: [
      { name: "iPhone 11",         img: "assets/iphones/iphone-11.png",          storages: [{s:"64GB",p:180000},{s:"128GB",p:230000},{s:"256GB",p:270000}], sealed:false },
      { name: "iPhone 11 Pro",     img: "assets/iphones/variants/11-pro.png",    storages: [{s:"64GB",p:220000},{s:"128GB",p:260000},{s:"256GB",p:300000}], sealed:false },
      { name: "iPhone 11 Pro Max", img: "assets/iphones/variants/11-promax.png", storages: [{s:"64GB",p:240000},{s:"256GB",p:280000},{s:"512GB",p:330000}], sealed:false },
    ],
  },
  {
    id: 12, line: "12", year: 2020, img: "assets/iphones/iphone-12.png",
    models: [
      { name: "iPhone 12 Mini",    img: "assets/iphones/variants/12-mini.png",   storages: [{s:"64GB",p:220000},{s:"128GB",p:270000},{s:"256GB",p:310000}], sealed:false },
      { name: "iPhone 12",         img: "assets/iphones/iphone-12.png",          storages: [{s:"64GB",p:250000},{s:"128GB",p:290000},{s:"256GB",p:350000}], sealed:false },
      { name: "iPhone 12 Pro",     img: "assets/iphones/variants/12-pro.png",    storages: [{s:"128GB",p:340000},{s:"256GB",p:380000},{s:"512GB",p:430000}], sealed:false },
      { name: "iPhone 12 Pro Max", img: "assets/iphones/variants/12-promax.png", storages: [{s:"128GB",p:400000},{s:"256GB",p:450000},{s:"512GB",p:490000}], sealed:false },
    ],
  },
  {
    id: 13, line: "13", year: 2021, img: "assets/iphones/iphone-13.png",
    models: [
      { name: "iPhone 13 Mini",    img: "assets/iphones/variants/13-mini.png",   storages: [{s:"128GB",p:350000},{s:"256GB",p:400000},{s:"512GB",p:440000}], sealed:false },
      { name: "iPhone 13",         img: "assets/iphones/iphone-13.png",          storages: [{s:"128GB",p:380000},{s:"256GB",p:420000},{s:"512GB",p:460000}], sealed:false },
      { name: "iPhone 13 Pro",     img: "assets/iphones/variants/13-pro.png",    storages: [{s:"128GB",p:490000},{s:"256GB",p:530000},{s:"512GB",p:570000}], sealed:false },
      { name: "iPhone 13 Pro Max", img: "assets/iphones/variants/13-promax.png", storages: [{s:"128GB",p:560000},{s:"256GB",p:590000},{s:"512GB",p:630000}], sealed:false },
    ],
  },
  {
    id: 14, line: "14", year: 2022, img: "assets/iphones/iphone-14.png",
    models: [
      { name: "iPhone 14",         img: "assets/iphones/iphone-14.png",          storages: [{s:"128GB",p:420000},{s:"256GB",p:470000},{s:"512GB",p:510000}], sealed:false },
      { name: "iPhone 14 Plus",    img: "assets/iphones/variants/14-plus.png",   storages: [{s:"128GB",p:480000},{s:"256GB",p:510000},{s:"512GB",p:560000}], sealed:false },
      { name: "iPhone 14 Pro",     img: "assets/iphones/variants/14-pro.png",    storages: [{s:"128GB",p:590000},{s:"256GB",p:640000},{s:"512GB",p:690000}], sealed:false },
      { name: "iPhone 14 Pro Max", img: "assets/iphones/variants/14-promax.png", storages: [{s:"128GB",p:660000},{s:"256GB",p:720000},{s:"512GB",p:770000}], sealed:false },
    ],
  },
  {
    id: 15, line: "15", year: 2023, img: "assets/iphones/iphone-15.png",
    models: [
      { name: "iPhone 15",         img: "assets/iphones/iphone-15.png",          storages: [{s:"128GB",p:540000},{s:"256GB",p:580000}], sealed:false },
      { name: "iPhone 15 Plus",    img: "assets/iphones/variants/15-plus.png",   storages: [{s:"128GB",p:650000},{s:"256GB",p:700000}], sealed:false },
      { name: "iPhone 15 Pro",     img: "assets/iphones/variants/15-pro.png",    storages: [{s:"128GB",p:720000},{s:"256GB",p:740000},{s:"512GB",p:800000}], sealed:false },
      { name: "iPhone 15 Pro Max", img: "assets/iphones/variants/15-promax.png", storages: [{s:"256GB",p:820000},{s:"512GB",p:860000}], sealed:false },
    ],
  },
  {
    id: 16, line: "16", year: 2024, img: "assets/iphones/iphone-16.png",
    models: [
      { name: "iPhone 16",         img: "assets/iphones/iphone-16.png",          storages: [{s:"128GB",p:660000},{s:"256GB",p:700000}], sealed:false },
      { name: "iPhone 16 Plus",    img: "assets/iphones/variants/16-plus.png",   storages: [{s:"128GB",p:750000},{s:"256GB",p:800000}], sealed:false },
      { name: "iPhone 16 Pro",     img: "assets/iphones/variants/16-pro.png",    storages: [{s:"256GB",p:920000},{s:"512GB",p:970000}], sealed:false },
      { name: "iPhone 16 Pro Max", img: "assets/iphones/variants/16-promax.png", storages: [{s:"256GB",p:980000},{s:"512GB",p:1050000}], sealed:false },
    ],
  },
  {
    id: 17, line: "17", year: 2025, img: "assets/iphones/iphone-17.png",
    models: [
      { name: "iPhone 17",         img: "assets/iphones/iphone-17.png",          storages: [{s:"256GB",p:880000},{s:"512GB",p:920000}], sealed:true },
      { name: "iPhone 17 Pro",     img: "assets/iphones/variants/17-pro.png",    storages: [{s:"256GB",p:1250000},{s:"512GB",p:1500000}], sealed:true },
      { name: "iPhone 17 Pro Max", img: "assets/iphones/iphone-17-pro-max.png",  storages: [{s:"256GB",p:1350000},{s:"512GB",p:1600000}], sealed:true },
    ],
  },
];

window.TESTIMONIALS = [
  { name: "Camila R.", role: "Providencia", rating: 5, text: "Compré un 15 Pro sellado, todo perfecto. Atención de 10 en la tienda, me explicaron cada detalle." },
  { name: "Diego M.",  role: "Las Condes",  rating: 5, text: "Vendí mi 13 Pro y me dieron mejor precio que en otras tiendas. Pago al instante." },
  { name: "Javiera P.", role: "Ñuñoa",      rating: 5, text: "Llevo dos iPhones comprados acá. Garantía real, equipos impecables, recomendado 100%." },
  { name: "Tomás S.",  role: "Santiago",    rating: 5, text: "Excelente experiencia. Probaron el equipo conmigo y me ayudaron con la migración." },
];

window.STATS = [
  { n: "+5.000",  l: "iPhones vendidos" },
  { n: "6 meses", l: "garantía oficial" },
  { n: "100%",    l: "originales" },
  { n: "4.9★",    l: "calificación clientes" },
];

window.FAQS = [
  { q: "¿Los iPhones son originales?", a: "Sí, 100% originales Apple. Cada equipo pasa por una revisión técnica antes de venderse y se entrega con su número de serie verificable en checkcoverage.apple.com." },
  { q: "¿Qué garantía incluyen?",      a: "Todos nuestros equipos —sellados y seminuevos— incluyen 6 meses de garantía oficial UP que cubre defectos de fábrica y problemas técnicos. La gestión es directa con nosotros, sin intermediarios." },
  { q: "¿Puedo entregar mi iPhone como parte de pago?", a: "Sí. Cotiza online en 60 segundos, agendas tu visita y la evaluación final es gratuita. El descuento se aplica directo al precio del nuevo equipo." },
  { q: "¿Hacen envíos a regiones?",    a: "Sí, despachamos a todo Chile vía Starken o Chilexpress con seguro incluido. Despacho gratis dentro de RM en compras sobre $500.000." },
  { q: "¿Cómo pago?",                  a: "Aceptamos efectivo, transferencia, débito, crédito y financiamiento PágaloAsí en hasta 12 cuotas sin interés." },
  { q: "¿Atienden sin cita?",          a: "Por tu seguridad y la nuestra, atendemos preferentemente con cita previa por WhatsApp. También aceptamos walk-in en horario de tienda." },
];

window.fmtCLP = (n) => "$" + n.toLocaleString("es-CL");

// ---- Cart persistence (sessionStorage) shared between pages ----
window.cartStore = {
  key: "iphoneup_cart_v1",
  read() { try { return JSON.parse(sessionStorage.getItem(this.key) || "[]"); } catch { return []; } },
  write(items) { sessionStorage.setItem(this.key, JSON.stringify(items)); },
  add(item) { const c = this.read(); c.push(item); this.write(c); return c; },
  remove(idx) { const c = this.read(); c.splice(idx, 1); this.write(c); return c; },
  count() { return this.read().length; },
};
