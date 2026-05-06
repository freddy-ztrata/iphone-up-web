// Propuesta A — Dark Neon Premium
// Fiel a la línea IG: negro profundo + verde lima + glow neón + tipografía bold
const { useState, useEffect, useRef, useMemo } = React;

// A_GREEN can be overridden live via window.__A_TWEAKS (dispatched on 'a-tweaks' event)
let A_GREEN = "#A4E83A";
let A_GREEN_SOFT = "#7FC42E";
let A_SHOW_WAVES = true;
function useATweaks() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onChange = () => {
      const t = window.__A_TWEAKS || {};
      if (t.accentColor) { A_GREEN = t.accentColor; }
      if (typeof t.showWaves === "boolean") { A_SHOW_WAVES = t.showWaves; }
      force(x => x + 1);
    };
    window.addEventListener("a-tweaks", onChange);
    onChange();
    return () => window.removeEventListener("a-tweaks", onChange);
  }, []);
}

const aStyles = {
  root: {
    width: "100%", background: "#000", color: "#fff",
    fontFamily: "'Inter', system-ui, sans-serif",
    overflow: "hidden", position: "relative",
  },
};

// Decorative wavy lines (mimics IG posts background)
function ANeonWaves({ opacity = 0.35, color = A_GREEN }) {
  if (!A_SHOW_WAVES) return null;
  return (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none" }}>
      <defs>
        <linearGradient id="aw" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.0" />
          <stop offset="50%" stopColor={color} stopOpacity="0.7" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 24 }).map((_, i) => (
        <path key={i}
          d={`M -100 ${100 + i * 30} Q 300 ${50 + i * 25}, 600 ${200 + i * 28} T 1300 ${150 + i * 30}`}
          stroke={i % 3 === 0 ? "url(#aw)" : "rgba(255,255,255,0.08)"}
          strokeWidth={i % 5 === 0 ? "1.2" : "0.6"}
          fill="none" />
      ))}
    </svg>
  );
}

function ALogo({ size = 36 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <img src="assets/logo-full.jpg" alt="iPhone UP"
        style={{ height: size, mixBlendMode: "screen", filter: "contrast(1.1)" }} />
    </div>
  );
}

function ANav({ cartCount, onCart }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(18px)",
      borderBottom: "1px solid rgba(164,232,58,0.15)",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <ALogo size={32} />
        <nav style={{ display: "flex", gap: 32, fontSize: 14, fontWeight: 500, letterSpacing: 0.3 }}>
          {["Catálogo", "Vende tu iPhone", "Servicio Técnico", "Tienda", "Soporte"].map(x => (
            <a key={x} href="#" style={{ color: "#d8d8d8", textDecoration: "none", transition: "color .2s" }}
              onMouseEnter={e => e.currentTarget.style.color = A_GREEN}
              onMouseLeave={e => e.currentTarget.style.color = "#d8d8d8"}>{x}</a>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button style={{
            background: "transparent", border: `1px solid rgba(164,232,58,0.4)`,
            color: A_GREEN, padding: "8px 16px", borderRadius: 999, cursor: "pointer",
            fontSize: 13, fontWeight: 600, letterSpacing: 0.5,
          }}>+56 9 0000 0000</button>
          <button onClick={onCart} style={{
            position: "relative", background: A_GREEN, color: "#000",
            border: "none", padding: "10px 20px", borderRadius: 999, cursor: "pointer",
            fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
            boxShadow: `0 0 24px ${A_GREEN}55`,
          }}>
            CARRO {cartCount > 0 && <span style={{ marginLeft: 6, background: "#000", color: A_GREEN, padding: "2px 8px", borderRadius: 999, fontSize: 11 }}>{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}

function AHero() {
  return (
    <section style={{
      position: "relative", padding: "80px 32px 100px",
      background: "radial-gradient(ellipse at 80% 50%, rgba(164,232,58,0.18), transparent 60%), #000",
      overflow: "hidden",
    }}>
      <ANeonWaves opacity={0.5} />
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 60, alignItems: "center", position: "relative", zIndex: 2 }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 999,
            background: "rgba(164,232,58,0.1)", border: `1px solid ${A_GREEN}55`,
            fontSize: 12, fontWeight: 600, letterSpacing: 1, color: A_GREEN, textTransform: "uppercase",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: A_GREEN, boxShadow: `0 0 10px ${A_GREEN}` }} />
            Tienda física en Providencia
          </div>
          <h1 style={{
            fontSize: 88, lineHeight: 0.95, fontWeight: 900,
            margin: "24px 0 24px", letterSpacing: -2,
          }}>
            Tu iPhone,<br />
            <span style={{ color: A_GREEN, textShadow: `0 0 40px ${A_GREEN}80` }}>siempre UP.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "#b8b8b8", maxWidth: 520, margin: 0 }}>
            iPhones del 11 al 17 — sellados y seminuevos 100% originales, probados y garantizados por 6 meses.
            Atención presencial, garantía real, confianza demostrada.
          </p>
          <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
            <button style={{
              background: A_GREEN, color: "#000", border: "none",
              padding: "16px 28px", borderRadius: 999, cursor: "pointer",
              fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
              boxShadow: `0 0 32px ${A_GREEN}66`,
            }}>EXPLORAR CATÁLOGO →</button>
            <button style={{
              background: "transparent", color: "#fff",
              border: "1.5px solid rgba(255,255,255,0.25)",
              padding: "16px 28px", borderRadius: 999, cursor: "pointer",
              fontSize: 15, fontWeight: 600,
            }}>Vende tu iPhone</button>
          </div>
          <div style={{ display: "flex", gap: 40, marginTop: 56, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {STATS.map(s => (
              <div key={s.l}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{s.n}</div>
                <div style={{ fontSize: 12, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", height: 580 }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(circle at 50% 50%, ${A_GREEN}33, transparent 60%)`,
            filter: "blur(40px)",
          }} />
          <img src="assets/iphone-17.png" alt="iPhone 17" style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "contain", filter: `drop-shadow(0 0 60px ${A_GREEN}66)`,
          }} />
          <div style={{
            position: "absolute", top: 32, right: 32,
            padding: "8px 14px", background: "rgba(0,0,0,0.7)", border: `1px solid ${A_GREEN}`,
            borderRadius: 999, fontSize: 11, fontWeight: 700, color: A_GREEN, letterSpacing: 1,
            boxShadow: `0 0 20px ${A_GREEN}66`,
          }}>iPhone 17 · DISPONIBLE</div>
        </div>
      </div>
    </section>
  );
}

function ATrustStrip() {
  const items = [
    { i: "✓", t: "Equipos 100% originales" },
    { i: "🛡", t: "Garantía 6 meses" },
    { i: "↻", t: "Recibimos tu iPhone" },
    { i: "⚡", t: "Servicio técnico propio" },
    { i: "🚚", t: "Envío a todo Chile" },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${A_GREEN}33`, borderBottom: `1px solid ${A_GREEN}33`,
      background: "linear-gradient(90deg, rgba(164,232,58,0.04), rgba(164,232,58,0.08), rgba(164,232,58,0.04))",
      padding: "20px 32px",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        {items.map(x => (
          <div key={x.t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 999,
              background: `${A_GREEN}22`, border: `1px solid ${A_GREEN}`,
              display: "grid", placeItems: "center", color: A_GREEN, fontSize: 14, fontWeight: 700,
            }}>{x.i}</span>
            <span style={{ fontSize: 13, color: "#d0d0d0", fontWeight: 500 }}>{x.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function APhoneCard({ phone, onAdd, idx }) {
  const [storageIdx, setStorageIdx] = useState(0);
  const [tab, setTab] = useState("all"); // all | sealed | used
  const variants = useMemo(() => {
    if (tab === "all") return phone.variants;
    return phone.variants.filter(v => tab === "sealed" ? v.sealed : !v.sealed);
  }, [phone, tab]);
  const baseModels = useMemo(() => [...new Set(variants.map(v => v.model))], [variants]);
  const [modelIdx, setModelIdx] = useState(0);
  const currentModel = baseModels[Math.min(modelIdx, baseModels.length - 1)] || phone.variants[0].model;
  const modelVariants = variants.filter(v => v.model === currentModel);
  const variant = modelVariants[Math.min(storageIdx, modelVariants.length - 1)] || modelVariants[0];

  return (
    <div style={{
      position: "relative", borderRadius: 28, padding: 1,
      background: `linear-gradient(160deg, ${A_GREEN}, ${A_GREEN}22 30%, rgba(255,255,255,0.05) 70%)`,
      boxShadow: `0 0 40px ${A_GREEN}1f, inset 0 0 1px ${A_GREEN}66`,
    }}>
      <div style={{
        background: "linear-gradient(180deg, #0a0d08, #000)",
        borderRadius: 27, padding: 24, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 200, height: 200,
          background: `radial-gradient(circle, ${A_GREEN}33, transparent 70%)`, borderRadius: "50%" }} />
        {/* Tabs sealed/used */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, position: "relative", zIndex: 2 }}>
          {[["all","Todos"],["sealed","Sellado"],["used","Seminuevo"]].map(([k,l]) => {
            const active = tab === k;
            return (
              <button key={k} onClick={() => { setTab(k); setStorageIdx(0); setModelIdx(0); }}
                style={{
                  flex: 1, padding: "8px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  border: active ? `1px solid ${A_GREEN}` : "1px solid rgba(255,255,255,0.1)",
                  background: active ? `${A_GREEN}22` : "transparent",
                  color: active ? A_GREEN : "#888",
                  borderRadius: 999, cursor: "pointer", textTransform: "uppercase",
                }}>{l}</button>
            );
          })}
        </div>

        <div style={{ position: "relative", height: 200, marginBottom: 20 }}>
          <img src={phone.img} alt={phone.name}
            style={{ width: "100%", height: "100%", objectFit: "contain",
              filter: `drop-shadow(0 0 30px ${A_GREEN}44)` }} />
        </div>

        <h3 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", letterSpacing: -0.5 }}>{currentModel}</h3>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 16, fontWeight: 500 }}>
          {phone.year} · {variant.sealed ? "Sellado en caja" : "Seminuevo A+"}
        </div>

        {/* Model selector if multiple */}
        {baseModels.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {baseModels.map((m, i) => (
              <button key={m} onClick={() => { setModelIdx(i); setStorageIdx(0); }}
                style={{
                  padding: "5px 10px", fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                  border: i === modelIdx ? `1px solid ${A_GREEN}` : "1px solid rgba(255,255,255,0.1)",
                  background: i === modelIdx ? `${A_GREEN}11` : "transparent",
                  color: i === modelIdx ? A_GREEN : "#888",
                  borderRadius: 6, cursor: "pointer",
                }}>{m.replace(`iPhone ${phone.line}`, "").trim() || "Base"}</button>
            ))}
          </div>
        )}

        {/* Storage */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {modelVariants.map((v, i) => (
            <button key={i} onClick={() => setStorageIdx(i)}
              style={{
                flex: 1, padding: "8px", fontSize: 11, fontWeight: 700,
                border: i === storageIdx ? `1.5px solid ${A_GREEN}` : "1px solid rgba(255,255,255,0.12)",
                background: i === storageIdx ? `${A_GREEN}22` : "rgba(255,255,255,0.02)",
                color: i === storageIdx ? A_GREEN : "#aaa",
                borderRadius: 10, cursor: "pointer",
                boxShadow: i === storageIdx ? `0 0 12px ${A_GREEN}44` : "none",
              }}>{v.storage}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Desde</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: A_GREEN, letterSpacing: -0.5,
              textShadow: `0 0 24px ${A_GREEN}66` }}>{fmtCLP(variant.price)}</div>
          </div>
          <div style={{ fontSize: 11, color: "#888", textAlign: "right" }}>
            o 12x<br /><span style={{ color: "#fff", fontWeight: 700 }}>{fmtCLP(Math.round(variant.price/12))}</span>
          </div>
        </div>

        <button onClick={() => onAdd(variant)} style={{
          width: "100%", padding: "14px", borderRadius: 12,
          background: A_GREEN, color: "#000", border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
          boxShadow: `0 0 24px ${A_GREEN}55`,
        }}>Agregar al carro</button>
      </div>
    </div>
  );
}

function ACatalog({ onAdd }) {
  const [filter, setFilter] = useState("all"); // all | new | classic
  const phones = useMemo(() => {
    if (filter === "new") return IPHONE_CATALOG.filter(p => p.id >= 15);
    if (filter === "classic") return IPHONE_CATALOG.filter(p => p.id < 15);
    return IPHONE_CATALOG;
  }, [filter]);

  return (
    <section style={{ padding: "100px 32px", position: "relative" }}>
      <ANeonWaves opacity={0.2} />
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 40, flexWrap: "wrap", gap: 24 }}>
          <div>
            <div style={{ color: A_GREEN, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
              · Catálogo completo
            </div>
            <h2 style={{ fontSize: 56, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
              Del 11 al 17.<br />
              <span style={{ color: "#666" }}>Encuentra el tuyo.</span>
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,0.04)", padding: 6, borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)" }}>
            {[["all","Todos"],["new","Nuevos (15-17)"],["classic","Clásicos (11-14)"]].map(([k,l]) => {
              const active = filter === k;
              return (
                <button key={k} onClick={() => setFilter(k)} style={{
                  padding: "10px 20px", fontSize: 13, fontWeight: 600,
                  border: "none", borderRadius: 999, cursor: "pointer",
                  background: active ? A_GREEN : "transparent",
                  color: active ? "#000" : "#aaa",
                  boxShadow: active ? `0 0 20px ${A_GREEN}55` : "none",
                }}>{l}</button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {phones.map((p, i) => <APhoneCard key={p.id} phone={p} onAdd={onAdd} idx={i} />)}
        </div>
      </div>
    </section>
  );
}

function ATradeIn() {
  const [step, setStep] = useState(0);
  const [model, setModel] = useState("iPhone 13 Pro");
  const [storage, setStorage] = useState("256GB");
  const [condition, setCondition] = useState("Bueno");
  const estimate = useMemo(() => {
    const base = { "iPhone 11": 90000, "iPhone 12": 140000, "iPhone 13": 200000,
      "iPhone 13 Pro": 270000, "iPhone 14": 240000, "iPhone 14 Pro": 330000,
      "iPhone 15": 320000, "iPhone 15 Pro": 420000, "iPhone 16": 400000, "iPhone 16 Pro": 520000 };
    const stMul = { "64GB": 1, "128GB": 1.05, "256GB": 1.12, "512GB": 1.2 };
    const cMul = { "Excelente": 1.1, "Bueno": 1, "Regular": 0.8 };
    return Math.round((base[model] || 200000) * (stMul[storage] || 1) * (cMul[condition] || 1));
  }, [model, storage, condition]);

  return (
    <section style={{
      padding: "100px 32px", position: "relative",
      background: `linear-gradient(180deg, transparent, ${A_GREEN}11, transparent)`,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 60, alignItems: "center" }}>
          <div>
            <div style={{ color: A_GREEN, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
              · Compramos tu iPhone
            </div>
            <h2 style={{ fontSize: 52, fontWeight: 900, margin: "0 0 20px", letterSpacing: -1.2, lineHeight: 1 }}>
              Pasa al<br />siguiente nivel.
            </h2>
            <p style={{ fontSize: 17, color: "#aaa", lineHeight: 1.6, margin: "0 0 32px" }}>
              Entrega tu iPhone actual y descuéntalo del próximo. Cotización en línea, evaluación final en tienda.
              Te ofrecemos el mejor precio del mercado, sin vueltas.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {["Cotización en 60 segundos", "Evaluación gratis en tienda", "Pago al instante o como abono"].map(t => (
                <li key={t} style={{ display: "flex", gap: 12, alignItems: "center", color: "#ccc", fontSize: 15 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: A_GREEN, color: "#000", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800 }}>✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div style={{
            background: "linear-gradient(180deg, rgba(164,232,58,0.08), rgba(0,0,0,0.6))",
            border: `1px solid ${A_GREEN}55`, borderRadius: 24, padding: 36,
            boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 80px ${A_GREEN}1a`,
          }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i <= step ? A_GREEN : "rgba(255,255,255,0.1)",
                  boxShadow: i <= step ? `0 0 8px ${A_GREEN}` : "none",
                }} />
              ))}
            </div>
            <div style={{ fontSize: 12, color: A_GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Paso {step + 1} de 3
            </div>
            {step === 0 && (
              <>
                <h3 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 20px" }}>¿Qué iPhone tienes?</h3>
                <select value={model} onChange={e => setModel(e.target.value)}
                  style={{ width: "100%", padding: "16px", background: "rgba(0,0,0,0.5)", color: "#fff",
                    border: `1px solid ${A_GREEN}66`, borderRadius: 12, fontSize: 15, fontWeight: 600 }}>
                  {["iPhone 11","iPhone 12","iPhone 13","iPhone 13 Pro","iPhone 14","iPhone 14 Pro","iPhone 15","iPhone 15 Pro","iPhone 16","iPhone 16 Pro"].map(m => <option key={m}>{m}</option>)}
                </select>
              </>
            )}
            {step === 1 && (
              <>
                <h3 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 20px" }}>Capacidad y condición</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                  {["64GB","128GB","256GB","512GB"].map(s => (
                    <button key={s} onClick={() => setStorage(s)} style={{
                      padding: "12px 8px", fontSize: 13, fontWeight: 700,
                      border: storage === s ? `1.5px solid ${A_GREEN}` : "1px solid rgba(255,255,255,0.12)",
                      background: storage === s ? `${A_GREEN}22` : "transparent",
                      color: storage === s ? A_GREEN : "#aaa", borderRadius: 10, cursor: "pointer",
                    }}>{s}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["Excelente","Bueno","Regular"].map(c => (
                    <button key={c} onClick={() => setCondition(c)} style={{
                      padding: "12px 8px", fontSize: 13, fontWeight: 700,
                      border: condition === c ? `1.5px solid ${A_GREEN}` : "1px solid rgba(255,255,255,0.12)",
                      background: condition === c ? `${A_GREEN}22` : "transparent",
                      color: condition === c ? A_GREEN : "#aaa", borderRadius: 10, cursor: "pointer",
                    }}>{c}</button>
                  ))}
                </div>
              </>
            )}
            {step === 2 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Tu iPhone vale hasta</div>
                <div style={{ fontSize: 56, fontWeight: 900, color: A_GREEN, letterSpacing: -2, textShadow: `0 0 32px ${A_GREEN}66`, margin: "8px 0" }}>
                  {fmtCLP(estimate)}
                </div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
                  {model} · {storage} · {condition}
                </div>
                <p style={{ fontSize: 13, color: "#888", margin: "0 0 24px" }}>
                  Estimación referencial. El valor final se confirma en tienda tras revisión técnica.
                </p>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} style={{
                  padding: "14px 24px", background: "transparent", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, fontWeight: 600, cursor: "pointer",
                }}>Atrás</button>
              )}
              <button onClick={() => setStep(s => Math.min(s + 1, 2))} style={{
                flex: 1, padding: "14px 24px", background: A_GREEN, color: "#000",
                border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5,
                boxShadow: `0 0 24px ${A_GREEN}66`, textTransform: "uppercase", fontSize: 13,
              }}>{step === 2 ? "Agendar evaluación" : "Continuar →"}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AStore() {
  return (
    <section style={{ padding: "100px 32px", position: "relative" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "stretch" }}>
        <div style={{
          background: "linear-gradient(180deg, #0a0d08, #000)",
          border: `1px solid ${A_GREEN}33`, borderRadius: 24, padding: 48, position: "relative", overflow: "hidden",
        }}>
          <ANeonWaves opacity={0.3} />
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ color: A_GREEN, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              · Visítanos
            </div>
            <h2 style={{ fontSize: 44, fontWeight: 900, margin: "0 0 24px", letterSpacing: -1, lineHeight: 1 }}>
              Tienda física<br /><span style={{ color: A_GREEN }}>en Providencia.</span>
            </h2>
            <div style={{
              padding: 24, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: A_GREEN, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>📍 DIRECCIÓN</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Av. Padre Mariano 98</div>
              <div style={{ fontSize: 16, color: "#aaa" }}>Oficina 105 · Providencia, Santiago</div>
            </div>
            <div style={{
              padding: 24, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: A_GREEN, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>🕐 HORARIO</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 15 }}>
                <span style={{ color: "#aaa" }}>Lunes a Viernes</span><span style={{ fontWeight: 700 }}>10:00 — 19:00</span>
                <span style={{ color: "#aaa" }}>Sábado</span><span style={{ fontWeight: 700 }}>10:00 — 14:00</span>
                <span style={{ color: "#aaa" }}>Domingo</span><span style={{ color: "#666" }}>Cerrado</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button style={{
                flex: 1, padding: "14px", background: A_GREEN, color: "#000",
                border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13,
                letterSpacing: 0.5, textTransform: "uppercase", boxShadow: `0 0 24px ${A_GREEN}55`,
              }}>Cómo llegar</button>
              <button style={{
                flex: 1, padding: "14px", background: "transparent", color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, fontWeight: 700,
                cursor: "pointer", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase",
              }}>WhatsApp</button>
            </div>
          </div>
        </div>
        {/* Map */}
        <div style={{
          borderRadius: 24, overflow: "hidden", position: "relative",
          background: "#0a0a0a", border: `1px solid ${A_GREEN}33`, minHeight: 500,
        }}>
          <svg viewBox="0 0 600 600" style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
            <rect width="600" height="600" fill="#0d100a" />
            {/* Grid */}
            {Array.from({length: 12}).map((_, i) => (
              <g key={i}>
                <line x1={i * 50} y1="0" x2={i * 50} y2="600" stroke="rgba(164,232,58,0.06)" />
                <line x1="0" y1={i * 50} x2="600" y2={i * 50} stroke="rgba(164,232,58,0.06)" />
              </g>
            ))}
            {/* Streets */}
            <path d="M 0 280 Q 200 270, 600 290" stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" />
            <path d="M 0 380 Q 300 360, 600 400" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" />
            <path d="M 280 0 Q 270 200, 290 600" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" />
            <path d="M 100 0 Q 110 300, 90 600" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" fill="none" />
            <path d="M 450 0 Q 460 300, 440 600" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" fill="none" />
            {/* Pin */}
            <g transform="translate(300, 285)">
              <circle r="60" fill={`${A_GREEN}22`}>
                <animate attributeName="r" values="40;80;40" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <circle r="14" fill={A_GREEN} />
              <path d="M -8 -2 L 0 -22 L 8 -2 Z" fill={A_GREEN} />
            </g>
            <text x="300" y="340" textAnchor="middle" fill={A_GREEN} fontSize="14" fontWeight="800" letterSpacing="2">
              iPhone UP
            </text>
            <text x="300" y="358" textAnchor="middle" fill="#888" fontSize="11">
              Av. Padre Mariano 98, Of. 105
            </text>
          </svg>
          <div style={{ position: "absolute", bottom: 16, right: 16, fontSize: 10, color: "#555", letterSpacing: 1 }}>PROVIDENCIA · STGO</div>
        </div>
      </div>
    </section>
  );
}

function ATestimonials() {
  return (
    <section style={{ padding: "100px 32px", position: "relative" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ color: A_GREEN, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
            · Confianza real
          </div>
          <h2 style={{ fontSize: 52, fontWeight: 900, margin: 0, letterSpacing: -1.2 }}>
            +5.000 clientes <span style={{ color: A_GREEN }}>UP</span>.
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} style={{
              padding: 28, background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20,
              position: "relative",
            }}>
              <div style={{ color: A_GREEN, marginBottom: 12, fontSize: 16, letterSpacing: 2 }}>
                {"★".repeat(t.rating)}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "#d8d8d8", margin: "0 0 24px" }}>
                "{t.text}"
              </p>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function APayments() {
  const methods = [
    { name: "Transferencia", icon: "⇄" },
    { name: "Efectivo", icon: "💵" },
    { name: "Débito", icon: "💳" },
    { name: "Crédito", icon: "🏦" },
    { name: "PágaloAsí", icon: "▼" },
  ];
  return (
    <section style={{ padding: "60px 32px", borderTop: `1px solid ${A_GREEN}22`, borderBottom: `1px solid ${A_GREEN}22` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: A_GREEN, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>· Métodos de pago</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Paga como prefieras. Hasta 12x sin interés.</div>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          {methods.map(m => (
            <div key={m.name} style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${A_GREEN}55`,
                background: `${A_GREEN}11`, display: "grid", placeItems: "center", color: A_GREEN,
                fontSize: 22, margin: "0 auto 8px" }}>{m.icon}</div>
              <div style={{ fontSize: 12, color: "#aaa", fontWeight: 600 }}>{m.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AFAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section style={{ padding: "100px 32px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ color: A_GREEN, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>· Preguntas frecuentes</div>
          <h2 style={{ fontSize: 48, fontWeight: 900, margin: 0, letterSpacing: -1.2 }}>Resolvemos tus dudas.</h2>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${isOpen ? A_GREEN + "55" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 16, overflow: "hidden",
                boxShadow: isOpen ? `0 0 20px ${A_GREEN}1a` : "none",
              }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{
                  width: "100%", padding: "20px 24px", background: "transparent",
                  border: "none", color: "#fff", fontSize: 16, fontWeight: 700, textAlign: "left",
                  cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  {f.q}
                  <span style={{ color: A_GREEN, fontSize: 22, transform: isOpen ? "rotate(45deg)" : "none", transition: "transform .2s" }}>+</span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 24px 20px", color: "#bbb", fontSize: 15, lineHeight: 1.6 }}>{f.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${A_GREEN}33`, padding: "60px 32px 32px", background: "#000" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
          <div>
            <ALogo size={36} />
            <p style={{ fontSize: 14, color: "#888", lineHeight: 1.6, margin: "20px 0 0", maxWidth: 320 }}>
              Tu iPhone, siempre UP. iPhones del 11 al 17 — sellados y seminuevos, garantía real, atención experta.
            </p>
          </div>
          {[
            { t: "Catálogo", l: ["iPhone 17", "iPhone 16", "iPhone 15", "Ver todos"] },
            { t: "Servicios", l: ["Compramos tu iPhone", "Servicio técnico", "Parte de pago", "Garantía"] },
            { t: "Tienda", l: ["Av. Padre Mariano 98", "WhatsApp", "+56 9 0000 0000", "contacto@iphoneup.cl"] },
          ].map(c => (
            <div key={c.t}>
              <div style={{ fontSize: 12, color: A_GREEN, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>{c.t}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                {c.l.map(x => <li key={x}><a href="#" style={{ color: "#aaa", textDecoration: "none", fontSize: 14 }}>{x}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#666" }}>© 2025 iPhone UP · Providencia, Chile · Todos los derechos reservados.</div>
          <div style={{ fontSize: 12, color: "#666" }}>iPhone UP no está afiliado con Apple Inc.</div>
        </div>
      </div>
    </footer>
  );
}

function AWhatsApp() {
  return (
    <button style={{
      position: "absolute", bottom: 24, right: 24, zIndex: 100,
      width: 56, height: 56, borderRadius: 999,
      background: "#25D366", border: "none", color: "#fff",
      display: "grid", placeItems: "center", cursor: "pointer",
      boxShadow: "0 8px 24px rgba(37,211,102,0.45), 0 0 0 6px rgba(37,211,102,0.2)",
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zM6.597 20.13c1.676.995 3.276 1.591 5.444 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.926-.607zM17.51 14.382c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
      </svg>
    </button>
  );
}

function ProposalA() {
  useATweaks();
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const onAdd = (v) => { setCart(c => [...c, v]); setCartOpen(true); };

  return (
    <div style={aStyles.root}>
      <ANav cartCount={cart.length} onCart={() => setCartOpen(true)} />
      <AHero />
      <ATrustStrip />
      <ACatalog onAdd={onAdd} />
      <ATradeIn />
      <APayments />
      <AStore />
      <ATestimonials />
      <AFAQ />
      <AFooter />
      <AWhatsApp />
      {cartOpen && (
        <div onClick={() => setCartOpen(false)} style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: "absolute", top: 0, right: 0, width: 420, height: "100%",
            background: "#0a0a0a", borderLeft: `1px solid ${A_GREEN}33`, padding: 32, overflow: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Tu carro ({cart.length})</h3>
              <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 24, cursor: "pointer" }}>×</button>
            </div>
            {cart.length === 0 ? (
              <p style={{ color: "#888" }}>Tu carro está vacío.</p>
            ) : (
              <>
                {cart.map((v, i) => (
                  <div key={i} style={{ padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 12, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700 }}>{v.model}</div>
                    <div style={{ fontSize: 13, color: "#888" }}>{v.storage} · {v.sealed ? "Sellado" : "Seminuevo"}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: A_GREEN, marginTop: 8 }}>{fmtCLP(v.price)}</div>
                  </div>
                ))}
                <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${A_GREEN}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 14, color: "#aaa" }}>
                    <span>Total</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: A_GREEN }}>{fmtCLP(cart.reduce((a,v) => a + v.price, 0))}</span>
                  </div>
                  <button style={{
                    width: "100%", padding: 16, background: A_GREEN, color: "#000", border: "none",
                    borderRadius: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase",
                    boxShadow: `0 0 24px ${A_GREEN}55`,
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

window.ProposalA = ProposalA;
