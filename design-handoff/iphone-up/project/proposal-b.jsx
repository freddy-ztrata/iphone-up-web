// Propuesta B — Apple-style Clean
// Inspiración apple.com: blanco, mucho espacio, tipografía grande, minimal
// El verde de la marca aparece SOLO como acento (CTAs, badges); negro como neutral fuerte
const { useState, useEffect, useRef, useMemo } = React;

const B_GREEN = "#7DC72E";
const B_GREEN_DARK = "#5FA920";
const B_TEXT = "#1d1d1f";
const B_GRAY = "#86868b";
const B_BG_SOFT = "#f5f5f7";

const bStyles = {
  root: {
    width: "100%", background: "#fff", color: B_TEXT,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: "hidden", position: "relative",
  },
};

function BLogo({ dark = true, size = 28 }) {
  // Use the dark/IG version of the logo, but we'll show on white using mix-blend
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <img src="assets/logo-full.jpg" alt="iPhone UP"
        style={{ height: size, filter: dark ? "invert(1) hue-rotate(180deg) saturate(0.5)" : "none",
          mixBlendMode: dark ? "multiply" : "normal" }} />
    </div>
  );
}

function BNav({ cartCount, onCart }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid rgba(0,0,0,0.08)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BLogo size={26} />
        <nav style={{ display: "flex", gap: 32, fontSize: 13, fontWeight: 400 }}>
          {["Catálogo", "iPhone 17", "Vende el tuyo", "Servicio", "Tienda", "Soporte"].map(x => (
            <a key={x} href="#" style={{ color: B_TEXT, textDecoration: "none", opacity: 0.8 }}>{x}</a>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onCart} style={{
            position: "relative", background: "transparent", border: "none",
            color: B_TEXT, padding: 4, cursor: "pointer", fontSize: 13, opacity: 0.8,
          }}>
            🛒 {cartCount > 0 && <span style={{ marginLeft: 4, background: B_GREEN, color: "#fff", padding: "1px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}

function BAnnouncement() {
  return (
    <div style={{ background: B_BG_SOFT, padding: "10px 24px", textAlign: "center", fontSize: 13, color: B_TEXT }}>
      Nuevo: <strong style={{ color: B_TEXT }}>iPhone 17</strong> y <strong>17 Pro Max</strong> ya disponibles.
      <a href="#" style={{ color: B_GREEN_DARK, marginLeft: 8, textDecoration: "none", fontWeight: 600 }}>Ver más →</a>
    </div>
  );
}

function BHero() {
  return (
    <section style={{ padding: "80px 24px 0", background: "#fff", textAlign: "center" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 999, marginBottom: 20,
          background: "#f5f5f7", fontSize: 13, color: B_TEXT, fontWeight: 500,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: B_GREEN }} />
          Confianza, calidad y atención real
        </div>
        <h1 style={{
          fontSize: 80, lineHeight: 1.05, fontWeight: 700,
          margin: "0 0 20px", letterSpacing: -2.5, color: B_TEXT,
        }}>
          Tu próximo iPhone,<br />
          <span style={{
            background: `linear-gradient(180deg, ${B_GREEN}, ${B_GREEN_DARK})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>siempre UP.</span>
        </h1>
        <p style={{ fontSize: 22, lineHeight: 1.45, color: B_GRAY, maxWidth: 720, margin: "0 auto 36px", fontWeight: 400 }}>
          Del iPhone 11 al 17. Sellados y seminuevos. 100% originales, probados pieza por pieza
          y respaldados con 6 meses de garantía.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={{
            background: B_GREEN, color: "#fff", border: "none",
            padding: "14px 28px", borderRadius: 999, cursor: "pointer",
            fontSize: 15, fontWeight: 600,
          }}>Explorar catálogo</button>
          <button style={{
            background: "#fff", color: B_TEXT,
            border: `1px solid ${B_TEXT}`,
            padding: "14px 28px", borderRadius: 999, cursor: "pointer",
            fontSize: 15, fontWeight: 600,
          }}>Vende tu iPhone →</button>
        </div>
        {/* Hero phone */}
        <div style={{ marginTop: 60, position: "relative", height: 540 }}>
          <div style={{
            position: "absolute", inset: "10% 20% 0",
            background: `radial-gradient(ellipse at 50% 30%, ${B_GREEN}22, transparent 60%)`,
            filter: "blur(40px)",
          }} />
          <img src="assets/iphone-17.png" alt="iPhone 17"
            style={{ position: "relative", height: "100%", maxWidth: "100%", objectFit: "contain" }} />
        </div>
      </div>
    </section>
  );
}

function BTrustBar() {
  const items = [
    { n: "+5.000", l: "iPhones vendidos" },
    { n: "6 meses", l: "garantía oficial" },
    { n: "100%", l: "equipos originales" },
    { n: "4.9★", l: "calificación clientes" },
  ];
  return (
    <section style={{ padding: "60px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, borderTop: "1px solid #e5e5e7", borderBottom: "1px solid #e5e5e7" }}>
        {items.map((s, i) => (
          <div key={s.l} style={{ padding: "32px 24px", textAlign: "center", borderLeft: i > 0 ? "1px solid #e5e5e7" : "none" }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: B_TEXT, letterSpacing: -1.5 }}>{s.n}</div>
            <div style={{ fontSize: 14, color: B_GRAY, marginTop: 6 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BFeaturedPhone() {
  return (
    <section style={{ padding: "100px 24px", background: B_BG_SOFT, textAlign: "center" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontSize: 14, color: B_GREEN_DARK, fontWeight: 600, marginBottom: 12, letterSpacing: 0.5 }}>
          Destacado · Septiembre 2025
        </div>
        <h2 style={{ fontSize: 64, fontWeight: 700, margin: "0 0 16px", letterSpacing: -2, lineHeight: 1.05 }}>
          iPhone 17 Pro Max.
        </h2>
        <p style={{ fontSize: 22, color: B_GRAY, margin: "0 0 12px", fontWeight: 400 }}>
          Lo más nuevo. Sellado. Garantía 6 meses.
        </p>
        <p style={{ fontSize: 28, fontWeight: 700, color: B_TEXT, margin: "0 0 32px" }}>
          Desde <span style={{ color: B_GREEN_DARK }}>{fmtCLP(1350000)}</span>
          <span style={{ fontSize: 16, color: B_GRAY, fontWeight: 500 }}> · o 12x {fmtCLP(112500)}</span>
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 60 }}>
          <button style={{ background: B_GREEN, color: "#fff", border: "none", padding: "12px 24px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Comprar
          </button>
          <a style={{ color: B_GREEN_DARK, fontSize: 14, fontWeight: 600, alignSelf: "center", cursor: "pointer" }}>
            Más información →
          </a>
        </div>
        <div style={{ position: "relative", height: 520 }}>
          <img src="assets/iphone-17.png" alt="iPhone 17 Pro Max"
            style={{ height: "100%", maxWidth: "100%", objectFit: "contain" }} />
        </div>
      </div>
    </section>
  );
}

function BConditionTabs({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", padding: 4, background: "#f5f5f7", borderRadius: 999, gap: 4 }}>
      {[["all","Todos"],["sealed","Sellado"],["used","Seminuevo"]].map(([k,l]) => {
        const active = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} style={{
            padding: "8px 18px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
            borderRadius: 999, background: active ? "#fff" : "transparent",
            color: active ? B_TEXT : B_GRAY,
            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}>{l}</button>
        );
      })}
    </div>
  );
}

function BPhoneCard({ phone, onAdd }) {
  const [storageIdx, setStorageIdx] = useState(0);
  const variants = phone.variants;
  const baseModels = useMemo(() => [...new Set(variants.map(v => v.model))], [variants]);
  const [modelIdx, setModelIdx] = useState(0);
  const currentModel = baseModels[Math.min(modelIdx, baseModels.length - 1)] || phone.variants[0].model;
  const modelVariants = variants.filter(v => v.model === currentModel);
  const variant = modelVariants[Math.min(storageIdx, modelVariants.length - 1)] || modelVariants[0];

  return (
    <div style={{
      background: "#fff", borderRadius: 22, padding: 24,
      border: "1px solid #e5e5e7", display: "flex", flexDirection: "column",
      transition: "transform .2s, box-shadow .2s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.06)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
      {variant.sealed && (
        <div style={{
          alignSelf: "flex-start", padding: "4px 10px", fontSize: 11, fontWeight: 700,
          background: "#e8f7d3", color: B_GREEN_DARK, borderRadius: 999, letterSpacing: 0.3,
        }}>SELLADO</div>
      )}
      <div style={{ height: 220, marginTop: variant.sealed ? 8 : 28, marginBottom: 20, position: "relative" }}>
        <img src={phone.img} alt={phone.name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px", color: B_TEXT, letterSpacing: -0.5 }}>{currentModel}</h3>
      <div style={{ fontSize: 13, color: B_GRAY, marginBottom: 16 }}>
        Año {phone.year} · {variant.sealed ? "Nuevo en caja" : "Seminuevo A+"}
      </div>

      {baseModels.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {baseModels.map((m, i) => (
            <button key={m} onClick={() => { setModelIdx(i); setStorageIdx(0); }}
              style={{
                padding: "5px 9px", fontSize: 11, fontWeight: 500,
                border: i === modelIdx ? `1px solid ${B_TEXT}` : "1px solid #e5e5e7",
                background: i === modelIdx ? B_TEXT : "#fff",
                color: i === modelIdx ? "#fff" : B_TEXT,
                borderRadius: 6, cursor: "pointer",
              }}>{m.replace(`iPhone ${phone.line}`, "").trim() || "Base"}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {modelVariants.map((v, i) => (
          <button key={i} onClick={() => setStorageIdx(i)}
            style={{
              flex: 1, padding: "8px", fontSize: 12, fontWeight: 600,
              border: i === storageIdx ? `1.5px solid ${B_TEXT}` : "1px solid #e5e5e7",
              background: "#fff", color: B_TEXT,
              borderRadius: 8, cursor: "pointer",
            }}>{v.storage}</button>
        ))}
      </div>

      <div style={{ marginBottom: 16, marginTop: "auto" }}>
        <div style={{ fontSize: 11, color: B_GRAY, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>Desde</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: B_TEXT, letterSpacing: -0.5 }}>{fmtCLP(variant.price)}</div>
        <div style={{ fontSize: 12, color: B_GRAY, marginTop: 2 }}>o 12x {fmtCLP(Math.round(variant.price/12))} sin interés</div>
      </div>

      <button onClick={() => onAdd(variant)} style={{
        width: "100%", padding: "12px", borderRadius: 999,
        background: B_GREEN, color: "#fff", border: "none", cursor: "pointer",
        fontSize: 14, fontWeight: 600,
      }}>Agregar</button>
    </div>
  );
}

function BCatalog({ onAdd }) {
  const [cond, setCond] = useState("all");
  const [line, setLine] = useState("all");

  const phones = useMemo(() => {
    let list = IPHONE_CATALOG;
    if (line !== "all") list = list.filter(p => String(p.id) === line);
    if (cond !== "all") {
      list = list.map(p => ({ ...p, variants: p.variants.filter(v => cond === "sealed" ? v.sealed : !v.sealed) }))
        .filter(p => p.variants.length > 0);
    }
    return list;
  }, [cond, line]);

  return (
    <section style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 56, fontWeight: 700, margin: "0 0 16px", letterSpacing: -2, color: B_TEXT }}>
            Encuentra el tuyo.
          </h2>
          <p style={{ fontSize: 20, color: B_GRAY, margin: 0, fontWeight: 400 }}>
            Del iPhone 11 al 17. Filtra por condición y modelo.
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <BConditionTabs value={cond} onChange={setCond} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["all","Todos"], ...IPHONE_CATALOG.map(p => [String(p.id), p.name])].map(([k,l]) => {
              const active = line === k;
              return (
                <button key={k} onClick={() => setLine(k)} style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 600,
                  border: `1px solid ${active ? B_TEXT : "#e5e5e7"}`,
                  background: active ? B_TEXT : "#fff",
                  color: active ? "#fff" : B_TEXT,
                  borderRadius: 999, cursor: "pointer",
                }}>{l}</button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
          {phones.map(p => <BPhoneCard key={p.id} phone={p} onAdd={onAdd} />)}
        </div>
      </div>
    </section>
  );
}

function BCompare() {
  const lines = [11, 13, 15, 17];
  const compared = lines.map(l => IPHONE_CATALOG.find(p => p.id === l));
  const rows = [
    { l: "Año", v: p => p.year },
    { l: "Desde", v: p => fmtCLP(Math.min(...p.variants.map(v => v.price))) },
    { l: "Capacidades", v: p => [...new Set(p.variants.map(v => v.storage))].join(" / ") },
    { l: "Sellados disponibles", v: p => p.variants.some(v => v.sealed) ? "Sí" : "Solo seminuevo" },
    { l: "Garantía", v: () => "6 meses" },
  ];
  return (
    <section style={{ padding: "100px 24px", background: B_BG_SOFT }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 56, fontWeight: 700, margin: "0 0 16px", letterSpacing: -2 }}>
            Compara modelos.
          </h2>
          <p style={{ fontSize: 20, color: B_GRAY, margin: 0 }}>Para que elijas con confianza.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "200px repeat(4, 1fr)", gap: 16, alignItems: "end" }}>
          <div></div>
          {compared.map(p => (
            <div key={p.id} style={{ textAlign: "center" }}>
              <img src={p.img} alt={p.name} style={{ height: 200, objectFit: "contain", maxWidth: "100%" }} />
              <div style={{ fontWeight: 700, fontSize: 18, marginTop: 12, color: B_TEXT }}>{p.name}</div>
            </div>
          ))}
          {rows.map((r, i) => (
            <React.Fragment key={r.l}>
              <div style={{ fontSize: 14, color: B_GRAY, fontWeight: 500, paddingTop: 16, borderTop: "1px solid #e5e5e7" }}>{r.l}</div>
              {compared.map(p => (
                <div key={p.id} style={{ fontSize: 15, fontWeight: 600, color: B_TEXT, paddingTop: 16, borderTop: "1px solid #e5e5e7", textAlign: "center" }}>{r.v(p)}</div>
              ))}
            </React.Fragment>
          ))}
          <div></div>
          {compared.map(p => (
            <div key={p.id} style={{ textAlign: "center", paddingTop: 24 }}>
              <button style={{ background: B_GREEN, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Ver modelo
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BTradeIn() {
  return (
    <section style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, color: B_GREEN_DARK, fontWeight: 600, marginBottom: 12 }}>Compramos tu iPhone</div>
          <h2 style={{ fontSize: 56, fontWeight: 700, margin: "0 0 24px", letterSpacing: -2, lineHeight: 1.05 }}>
            Cambia el<br />tuyo por uno<br />mejor.
          </h2>
          <p style={{ fontSize: 18, color: B_GRAY, lineHeight: 1.5, margin: "0 0 32px" }}>
            Entrega tu iPhone como parte de pago y descuéntalo del próximo. Cotización
            online en 60 segundos, evaluación final gratis en tienda.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={{ background: B_GREEN, color: "#fff", border: "none", padding: "14px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Cotizar mi iPhone
            </button>
            <button style={{ background: "#fff", color: B_TEXT, border: `1px solid ${B_TEXT}`, padding: "14px 28px", borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Cómo funciona
            </button>
          </div>
        </div>
        <div style={{ background: B_BG_SOFT, borderRadius: 22, padding: 40 }}>
          <div style={{ fontSize: 13, color: B_GRAY, marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Estimación rápida
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <select style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e5e7", background: "#fff", fontSize: 15, fontWeight: 500, color: B_TEXT }}>
              {["iPhone 13 Pro","iPhone 14","iPhone 14 Pro","iPhone 15","iPhone 15 Pro","iPhone 16"].map(m => <option key={m}>{m}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <select style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e5e7", background: "#fff", fontSize: 15, fontWeight: 500, color: B_TEXT }}>
                {["128GB","256GB","512GB"].map(s => <option key={s}>{s}</option>)}
              </select>
              <select style={{ padding: 14, borderRadius: 10, border: "1px solid #e5e5e7", background: "#fff", fontSize: 15, fontWeight: 500, color: B_TEXT }}>
                {["Excelente","Bueno","Regular"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #e5e5e7", marginTop: 28, paddingTop: 24 }}>
            <div style={{ fontSize: 13, color: B_GRAY, marginBottom: 4 }}>Tu iPhone vale hasta</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: B_GREEN_DARK, letterSpacing: -1.5 }}>{fmtCLP(330000)}</div>
            <div style={{ fontSize: 12, color: B_GRAY, marginTop: 8 }}>
              Estimación referencial. Valor final tras revisión técnica en tienda.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BServices() {
  const services = [
    { t: "Servicio técnico", d: "Reparaciones por profesionales con piezas 100% originales.", icon: "🔧" },
    { t: "Garantía 6 meses", d: "Todos nuestros equipos incluyen garantía oficial UP.", icon: "🛡️" },
    { t: "Envío a todo Chile", d: "Despacho asegurado a regiones. Gratis en RM sobre $500.000.", icon: "🚚" },
    { t: "Atención presencial", d: "Por tu seguridad, te atendemos en nuestra tienda física.", icon: "🏪" },
  ];
  return (
    <section style={{ padding: "100px 24px", background: B_BG_SOFT }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 56, fontWeight: 700, margin: "0 0 16px", letterSpacing: -2 }}>
            Más que vender iPhones.
          </h2>
          <p style={{ fontSize: 20, color: B_GRAY, margin: 0 }}>Cuidamos cada equipo como si fuera nuestro.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {services.map(s => (
            <div key={s.t} style={{ background: "#fff", borderRadius: 18, padding: 32, border: "1px solid #e5e5e7" }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: B_TEXT, marginBottom: 8, letterSpacing: -0.3 }}>{s.t}</div>
              <p style={{ fontSize: 14, color: B_GRAY, lineHeight: 1.5, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BPayments() {
  const methods = ["Transferencia", "Efectivo", "Débito", "Crédito", "PágaloAsí"];
  return (
    <section style={{ padding: "60px 24px", background: "#fff", borderTop: "1px solid #e5e5e7", borderBottom: "1px solid #e5e5e7" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: B_GREEN_DARK, marginBottom: 4 }}>Métodos de pago</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: B_TEXT, letterSpacing: -0.5 }}>Paga como prefieras. Hasta 12x sin interés.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {methods.map(m => (
            <div key={m} style={{ padding: "10px 18px", background: B_BG_SOFT, borderRadius: 999, fontSize: 13, fontWeight: 600, color: B_TEXT }}>
              {m}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BStore() {
  return (
    <section style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 60, alignItems: "stretch" }}>
        <div>
          <div style={{ fontSize: 14, color: B_GREEN_DARK, fontWeight: 600, marginBottom: 12 }}>Visítanos</div>
          <h2 style={{ fontSize: 52, fontWeight: 700, margin: "0 0 24px", letterSpacing: -2, lineHeight: 1.05 }}>
            Tienda física<br />en Providencia.
          </h2>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: B_GRAY, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>Dirección</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: B_TEXT, letterSpacing: -0.5 }}>Av. Padre Mariano 98</div>
            <div style={{ fontSize: 16, color: B_GRAY }}>Oficina 105 · Providencia, Santiago</div>
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: B_GRAY, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Horario de atención</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 6, fontSize: 15 }}>
              <span style={{ color: B_TEXT }}>Lunes a Viernes</span><span style={{ color: B_TEXT, fontWeight: 600 }}>10:00 — 19:00</span>
              <span style={{ color: B_TEXT }}>Sábado</span><span style={{ color: B_TEXT, fontWeight: 600 }}>10:00 — 14:00</span>
              <span style={{ color: B_GRAY }}>Domingo</span><span style={{ color: B_GRAY }}>Cerrado</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={{ background: B_GREEN, color: "#fff", border: "none", padding: "12px 22px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Cómo llegar
            </button>
            <button style={{ background: "#fff", color: B_TEXT, border: `1px solid ${B_TEXT}`, padding: "12px 22px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              WhatsApp
            </button>
          </div>
        </div>
        <div style={{
          borderRadius: 18, overflow: "hidden", background: B_BG_SOFT, position: "relative", minHeight: 480, border: "1px solid #e5e5e7",
        }}>
          <svg viewBox="0 0 600 600" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="600" height="600" fill="#f5f5f7" />
            {Array.from({length: 12}).map((_, i) => (
              <g key={i}>
                <line x1={i * 50} y1="0" x2={i * 50} y2="600" stroke="#e5e5e7" />
                <line x1="0" y1={i * 50} x2="600" y2={i * 50} stroke="#e5e5e7" />
              </g>
            ))}
            <path d="M 0 280 Q 200 270, 600 290" stroke="#d2d2d7" strokeWidth="6" fill="none" />
            <path d="M 0 380 Q 300 360, 600 400" stroke="#d2d2d7" strokeWidth="4" fill="none" />
            <path d="M 280 0 Q 270 200, 290 600" stroke="#d2d2d7" strokeWidth="4" fill="none" />
            <text x="20" y="270" fontSize="11" fill="#86868b">Av. Providencia</text>
            <text x="290" y="20" fontSize="11" fill="#86868b" transform="rotate(90 290 20)">Av. Pedro de Valdivia</text>
            <g transform="translate(300, 285)">
              <circle r="40" fill={`${B_GREEN}33`}>
                <animate attributeName="r" values="20;50;20" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <circle r="14" fill={B_GREEN} />
              <path d="M -7 -2 L 0 -22 L 7 -2 Z" fill={B_GREEN} />
            </g>
            <rect x="240" y="320" width="120" height="34" rx="6" fill="#fff" stroke="#e5e5e7" />
            <text x="300" y="335" textAnchor="middle" fontSize="11" fontWeight="600" fill={B_TEXT}>iPhone UP</text>
            <text x="300" y="348" textAnchor="middle" fontSize="9" fill={B_GRAY}>Av. Padre Mariano 98</text>
          </svg>
        </div>
      </div>
    </section>
  );
}

function BTestimonials() {
  return (
    <section style={{ padding: "100px 24px", background: B_BG_SOFT }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 56, fontWeight: 700, margin: "0 0 16px", letterSpacing: -2 }}>Lo que dicen.</h2>
          <p style={{ fontSize: 20, color: B_GRAY, margin: 0 }}>+5.000 clientes confían en iPhone UP.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {TESTIMONIALS.map((t,i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 18, padding: 28, border: "1px solid #e5e5e7" }}>
              <div style={{ color: B_GREEN, fontSize: 14, marginBottom: 12 }}>{"★".repeat(t.rating)}</div>
              <p style={{ fontSize: 14, color: B_TEXT, lineHeight: 1.55, margin: "0 0 20px" }}>"{t.text}"</p>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: B_GRAY }}>{t.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BFAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section style={{ padding: "100px 24px", background: "#fff" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 48, fontWeight: 700, margin: 0, letterSpacing: -1.5 }}>Preguntas frecuentes.</h2>
        </div>
        <div>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ borderTop: i === 0 ? "1px solid #e5e5e7" : "none", borderBottom: "1px solid #e5e5e7" }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{
                  width: "100%", padding: "20px 0", background: "transparent", border: "none",
                  color: B_TEXT, fontSize: 17, fontWeight: 600, textAlign: "left",
                  cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", letterSpacing: -0.3,
                }}>
                  {f.q}
                  <span style={{ fontSize: 22, color: B_GRAY, transform: isOpen ? "rotate(45deg)" : "none", transition: "transform .2s" }}>+</span>
                </button>
                {isOpen && (
                  <div style={{ paddingBottom: 20, color: B_GRAY, fontSize: 15, lineHeight: 1.6 }}>{f.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BFooter() {
  return (
    <footer style={{ background: B_BG_SOFT, padding: "60px 24px 32px", color: B_GRAY, fontSize: 13 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 40, marginBottom: 32 }}>
          <div>
            <BLogo size={28} />
            <p style={{ marginTop: 16, lineHeight: 1.5, maxWidth: 280 }}>
              Tu iPhone, siempre UP. Del 11 al 17 — sellados y seminuevos, garantía real.
            </p>
          </div>
          {[
            { t: "Comprar", l: ["iPhone 17","iPhone 16","iPhone 15","Ver catálogo"] },
            { t: "Servicios", l: ["Vende tu iPhone","Servicio técnico","Garantía","Envíos"] },
            { t: "Tienda", l: ["Av. Padre Mariano 98","WhatsApp","contacto@iphoneup.cl","Instagram"] },
          ].map(c => (
            <div key={c.t}>
              <div style={{ fontSize: 13, fontWeight: 700, color: B_TEXT, marginBottom: 12 }}>{c.t}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {c.l.map(x => <li key={x}><a href="#" style={{ color: B_GRAY, textDecoration: "none" }}>{x}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 24, borderTop: "1px solid #d2d2d7", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>© 2025 iPhone UP. Providencia, Chile.</div>
          <div>iPhone UP no está afiliado con Apple Inc.</div>
        </div>
      </div>
    </footer>
  );
}

function BWhatsApp() {
  return (
    <button style={{
      position: "absolute", bottom: 24, right: 24, zIndex: 100,
      width: 56, height: 56, borderRadius: 999,
      background: "#25D366", border: "none", color: "#fff",
      display: "grid", placeItems: "center", cursor: "pointer",
      boxShadow: "0 8px 24px rgba(37,211,102,0.35)",
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zM6.597 20.13c1.676.995 3.276 1.591 5.444 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.926-.607zM17.51 14.382c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
      </svg>
    </button>
  );
}

function ProposalB() {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const onAdd = (v) => { setCart(c => [...c, v]); setCartOpen(true); };

  return (
    <div style={bStyles.root}>
      <BAnnouncement />
      <BNav cartCount={cart.length} onCart={() => setCartOpen(true)} />
      <BHero />
      <BTrustBar />
      <BFeaturedPhone />
      <BCatalog onAdd={onAdd} />
      <BCompare />
      <BTradeIn />
      <BServices />
      <BPayments />
      <BStore />
      <BTestimonials />
      <BFAQ />
      <BFooter />
      <BWhatsApp />
      {cartOpen && (
        <div onClick={() => setCartOpen(false)} style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: "absolute", top: 0, right: 0, width: 420, height: "100%",
            background: "#fff", padding: 32, overflow: "auto",
            color: B_TEXT,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Carro ({cart.length})</h3>
              <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", color: B_GRAY, fontSize: 24, cursor: "pointer" }}>×</button>
            </div>
            {cart.length === 0 ? (
              <p style={{ color: B_GRAY }}>Tu carro está vacío.</p>
            ) : (
              <>
                {cart.map((v, i) => (
                  <div key={i} style={{ padding: 16, background: B_BG_SOFT, borderRadius: 12, marginBottom: 10 }}>
                    <div style={{ fontWeight: 600 }}>{v.model}</div>
                    <div style={{ fontSize: 13, color: B_GRAY }}>{v.storage} · {v.sealed ? "Sellado" : "Seminuevo"}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{fmtCLP(v.price)}</div>
                  </div>
                ))}
                <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #e5e5e7" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 14, color: B_GRAY }}>
                    <span>Total</span>
                    <span style={{ fontSize: 24, fontWeight: 700, color: B_TEXT }}>{fmtCLP(cart.reduce((a,v) => a + v.price, 0))}</span>
                  </div>
                  <button style={{
                    width: "100%", padding: 14, background: B_GREEN, color: "#fff", border: "none",
                    borderRadius: 999, fontWeight: 600, cursor: "pointer", fontSize: 15,
                  }}>Continuar al pago</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

window.ProposalB = ProposalB;
