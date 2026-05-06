// Propuesta C — Mobile-first Cards (UI tipo app)
// Concepto: la web se siente como una app móvil — tarjetas grandes, swipe horizontal,
// bottom-tab nav, gestos. Marca presente con verde lima sobre fondo casi-negro tipo iOS dark.
const { useState, useEffect, useRef, useMemo } = React;

const C_GREEN = "#B5F23A";
const C_BG = "#0E0E10";
const C_CARD = "#19191D";
const C_CARD_ALT = "#222227";
const C_TEXT = "#fff";
const C_DIM = "#9A9AA2";

// The "phone canvas" frames a mobile-first hero PLUS a desktop preview to the side.
// This visualizes "ambos dispositivos con foco mobile".

function CDeviceFrame({ children, scale = 1 }) {
  return (
    <div style={{
      width: 390 * scale, height: 800 * scale, borderRadius: 50 * scale,
      padding: 12 * scale, background: "linear-gradient(180deg,#1c1c1e,#0a0a0a)",
      boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 0 2px #2a2a2e, 0 0 60px ${C_GREEN}1a`,
      position: "relative", flexShrink: 0,
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 38 * scale,
        background: C_BG, overflow: "hidden", position: "relative",
      }}>
        {/* Dynamic island */}
        <div style={{
          position: "absolute", top: 12 * scale, left: "50%", transform: "translateX(-50%)",
          width: 110 * scale, height: 32 * scale, background: "#000", borderRadius: 999, zIndex: 50,
        }} />
        {children}
      </div>
    </div>
  );
}

function CStatusBar() {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 28px 0", fontSize: 14, fontWeight: 600, color: C_TEXT,
    }}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        <span>●●●●</span>
        <span>5G</span>
        <span style={{ width: 24, height: 12, border: "1.5px solid #fff", borderRadius: 3, position: "relative", display: "inline-block" }}>
          <span style={{ position: "absolute", top: 2, left: 2, right: 6, bottom: 2, background: "#fff", borderRadius: 1 }}></span>
        </span>
      </span>
    </div>
  );
}

function CBottomTab({ active, onChange }) {
  const tabs = [
    { id: "home", icon: "🏠", l: "Inicio" },
    { id: "cat", icon: "📱", l: "Catálogo" },
    { id: "sell", icon: "↻", l: "Vender" },
    { id: "store", icon: "📍", l: "Tienda" },
    { id: "cart", icon: "🛒", l: "Carro" },
  ];
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 40,
      background: "rgba(20,20,23,0.85)", backdropFilter: "blur(20px)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      padding: "12px 8px 28px",
      display: "flex", justifyContent: "space-around",
    }}>
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            color: isActive ? C_GREEN : C_DIM, padding: "4px 8px",
          }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>{t.l}</span>
          </button>
        );
      })}
    </div>
  );
}

function CHomeScreen({ onAdd, goCart }) {
  const [filter, setFilter] = useState("all");
  const featured = IPHONE_CATALOG.slice(0, 3);
  return (
    <div style={{ height: "100%", overflow: "auto", paddingBottom: 100 }}>
      <CStatusBar />
      {/* Header */}
      <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: C_DIM, fontWeight: 500 }}>Hola 👋</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C_TEXT, letterSpacing: -0.5 }}>iPhone <span style={{ color: C_GREEN }}>UP</span></div>
        </div>
        <button onClick={goCart} style={{
          width: 40, height: 40, borderRadius: 14, background: C_CARD,
          border: "1px solid rgba(255,255,255,0.06)", color: C_TEXT, fontSize: 16, cursor: "pointer",
        }}>🛒</button>
      </div>

      {/* Search */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{
          background: C_CARD, borderRadius: 16, padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 10,
          border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <span style={{ fontSize: 16, color: C_DIM }}>🔍</span>
          <span style={{ color: C_DIM, fontSize: 14 }}>Buscar iPhone, modelo, capacidad…</span>
        </div>
      </div>

      {/* Hero card */}
      <div style={{ padding: "24px 24px 0" }}>
        <div style={{
          borderRadius: 28, padding: 24, position: "relative", overflow: "hidden", height: 220,
          background: `linear-gradient(135deg, #1a1f0a, #0a0a0a 70%), radial-gradient(circle at 80% 30%, ${C_GREEN}33, transparent 60%)`,
          border: `1px solid ${C_GREEN}33`,
        }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 80% 30%, ${C_GREEN}33, transparent 60%)` }} />
          <div style={{ position: "relative", zIndex: 2, maxWidth: "55%" }}>
            <div style={{ fontSize: 11, color: C_GREEN, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Nuevo · Sellado</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C_TEXT, letterSpacing: -0.8, lineHeight: 1.1, marginBottom: 6 }}>iPhone 17<br />Pro Max</div>
            <div style={{ fontSize: 13, color: C_DIM, marginBottom: 12 }}>Desde {fmtCLP(1350000)}</div>
            <button style={{
              padding: "8px 14px", background: C_GREEN, color: "#000",
              border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              boxShadow: `0 0 20px ${C_GREEN}55`,
            }}>Comprar →</button>
          </div>
          <img src="assets/iphone-17.png" style={{
            position: "absolute", right: -30, top: 10, height: 230, objectFit: "contain",
            filter: `drop-shadow(0 0 30px ${C_GREEN}66)`,
          }} />
        </div>
      </div>

      {/* Trust pills */}
      <div style={{ padding: "20px 24px 0", display: "flex", gap: 8, overflowX: "auto" }}>
        {["✓ Originales", "🛡 6m garantía", "↻ Parte de pago", "🚚 Envío Chile"].map(x => (
          <div key={x} style={{
            padding: "8px 14px", background: C_CARD, borderRadius: 999, fontSize: 12,
            color: C_TEXT, fontWeight: 600, whiteSpace: "nowrap",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>{x}</div>
        ))}
      </div>

      {/* Filter chips */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3 }}>Por modelo</div>
          <button style={{ background: "transparent", border: "none", color: C_GREEN, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Ver todos →</button>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {[["all","Todos"],["sealed","Sellados"],["used","Seminuevos"],["pro","Pro"],["max","Max"]].map(([k,l]) => {
            const active = filter === k;
            return (
              <button key={k} onClick={() => setFilter(k)} style={{
                padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: active ? C_GREEN : C_CARD, color: active ? "#000" : C_DIM,
                border: "none", cursor: "pointer", whiteSpace: "nowrap",
                boxShadow: active ? `0 0 16px ${C_GREEN}55` : "none",
              }}>{l}</button>
            );
          })}
        </div>
      </div>

      {/* Horizontal swipe of featured */}
      <div style={{ padding: "16px 0 0 24px", display: "flex", gap: 14, overflowX: "auto" }}>
        {featured.map(p => (
          <CFeaturedCard key={p.id} phone={p} onAdd={onAdd} />
        ))}
      </div>

      {/* Sell your iPhone CTA */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{
          borderRadius: 24, padding: 20,
          background: `linear-gradient(135deg, ${C_GREEN}, ${C_GREEN}aa)`,
          color: "#000", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Vende tu iPhone</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2 }}>
              Cotiza en<br />60 segundos
            </div>
          </div>
          <button style={{
            padding: "10px 16px", background: "#000", color: C_GREEN,
            border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>Empezar →</button>
        </div>
      </div>

      {/* All models grid */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3, marginBottom: 14 }}>Todos los modelos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {IPHONE_CATALOG.map(p => <CGridCard key={p.id} phone={p} />)}
        </div>
      </div>

      {/* Store card */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{
          background: C_CARD, borderRadius: 24, padding: 20, position: "relative", overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, background: `radial-gradient(circle, ${C_GREEN}33, transparent 70%)` }} />
          <div style={{ fontSize: 11, color: C_GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>📍 Visítanos</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3, marginBottom: 4 }}>Av. Padre Mariano 98</div>
          <div style={{ fontSize: 13, color: C_DIM, marginBottom: 12 }}>Oficina 105 · Providencia</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: 12, color: C_TEXT, marginBottom: 16 }}>
            <span style={{ color: C_DIM }}>Lun — Vie</span><span style={{ fontWeight: 700 }}>10:00 - 19:00</span>
            <span style={{ color: C_DIM }}>Sábado</span><span style={{ fontWeight: 700 }}>10:00 - 14:00</span>
          </div>
          <button style={{
            width: "100%", padding: 12, background: C_GREEN, color: "#000",
            border: "none", borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: "pointer",
            boxShadow: `0 0 16px ${C_GREEN}44`,
          }}>Cómo llegar</button>
        </div>
      </div>

      {/* Reviews */}
      <div style={{ padding: "28px 0 0 24px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3, marginBottom: 14 }}>Opiniones</div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingRight: 24 }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} style={{
              flexShrink: 0, width: 240, background: C_CARD, borderRadius: 18, padding: 18,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ color: C_GREEN, fontSize: 12, marginBottom: 8 }}>{"★".repeat(t.rating)}</div>
              <p style={{ fontSize: 12, color: C_TEXT, lineHeight: 1.5, margin: "0 0 14px" }}>"{t.text}"</p>
              <div style={{ fontSize: 11, fontWeight: 700, color: C_TEXT }}>{t.name}</div>
              <div style={{ fontSize: 10, color: C_DIM }}>{t.role}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 24px 0", textAlign: "center", color: C_DIM, fontSize: 11 }}>
        Tu iPhone, siempre <span style={{ color: C_GREEN, fontWeight: 700 }}>UP</span>.
      </div>
    </div>
  );
}

function CFeaturedCard({ phone, onAdd }) {
  const variant = phone.variants[0];
  return (
    <div style={{
      flexShrink: 0, width: 220, height: 300, borderRadius: 24, padding: 16, position: "relative",
      background: `linear-gradient(180deg, ${C_CARD_ALT}, ${C_CARD})`,
      border: `1px solid rgba(255,255,255,0.06)`, overflow: "hidden",
    }}>
      {variant.sealed && (
        <div style={{
          padding: "3px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
          background: C_GREEN, color: "#000", borderRadius: 999, alignSelf: "flex-start",
          display: "inline-block",
        }}>NUEVO</div>
      )}
      <div style={{ position: "absolute", inset: "10% 10% 45% 10%" }}>
        <img src={phone.img} style={{ width: "100%", height: "100%", objectFit: "contain",
          filter: `drop-shadow(0 0 20px ${C_GREEN}33)` }} />
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3 }}>{phone.name}</div>
        <div style={{ fontSize: 11, color: C_DIM, marginBottom: 8 }}>Desde</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C_GREEN, letterSpacing: -0.5 }}>{fmtCLP(variant.price)}</div>
      </div>
    </div>
  );
}

function CGridCard({ phone }) {
  const minPrice = Math.min(...phone.variants.map(v => v.price));
  return (
    <div style={{
      background: C_CARD, borderRadius: 18, padding: 14, position: "relative",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ height: 110, marginBottom: 10 }}>
        <img src={phone.img} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: C_TEXT, letterSpacing: -0.2 }}>{phone.name}</div>
      <div style={{ fontSize: 10, color: C_DIM }}>Desde</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: C_GREEN }}>{fmtCLP(minPrice)}</div>
    </div>
  );
}

// Catalog screen — full filter UI
function CCatalogScreen({ onAdd }) {
  const [cond, setCond] = useState("all");
  const [storage, setStorage] = useState("all");
  const [open, setOpen] = useState(null); // phone id

  const phones = useMemo(() => {
    return IPHONE_CATALOG.map(p => {
      let v = p.variants;
      if (cond !== "all") v = v.filter(x => cond === "sealed" ? x.sealed : !x.sealed);
      if (storage !== "all") v = v.filter(x => x.storage === storage);
      return { ...p, variants: v };
    }).filter(p => p.variants.length > 0);
  }, [cond, storage]);

  return (
    <div style={{ height: "100%", overflow: "auto", paddingBottom: 100 }}>
      <CStatusBar />
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C_TEXT, letterSpacing: -0.8, marginBottom: 4 }}>Catálogo</div>
        <div style={{ fontSize: 13, color: C_DIM, marginBottom: 16 }}>Del 11 al 17. Sellados y seminuevos.</div>
        {/* Tabs sealed/used */}
        <div style={{ display: "flex", gap: 6, padding: 4, background: C_CARD, borderRadius: 999, marginBottom: 14 }}>
          {[["all","Todos"],["sealed","Sellado"],["used","Seminuevo"]].map(([k,l]) => {
            const active = cond === k;
            return (
              <button key={k} onClick={() => setCond(k)} style={{
                flex: 1, padding: "8px", border: "none", borderRadius: 999,
                background: active ? C_GREEN : "transparent",
                color: active ? "#000" : C_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{l}</button>
            );
          })}
        </div>
        {/* Storage chips */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {[["all","Capacidad"],["64GB","64GB"],["128GB","128GB"],["256GB","256GB"],["512GB","512GB"]].map(([k,l]) => {
            const active = storage === k;
            return (
              <button key={k} onClick={() => setStorage(k)} style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: active ? `${C_GREEN}33` : C_CARD,
                color: active ? C_GREEN : C_DIM,
                border: active ? `1px solid ${C_GREEN}` : "1px solid transparent",
                cursor: "pointer", whiteSpace: "nowrap",
              }}>{l}</button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "20px 24px 0", display: "grid", gap: 12 }}>
        {phones.map(p => <CCatalogRow key={p.id} phone={p} onAdd={onAdd} expanded={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}
      </div>
    </div>
  );
}

function CCatalogRow({ phone, onAdd, expanded, onToggle }) {
  const minPrice = Math.min(...phone.variants.map(v => v.price));
  const maxPrice = Math.max(...phone.variants.map(v => v.price));
  return (
    <div style={{
      background: C_CARD, borderRadius: 22, overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>
      <button onClick={onToggle} style={{
        width: "100%", background: "transparent", border: "none", color: C_TEXT,
        padding: 14, display: "flex", gap: 14, alignItems: "center", cursor: "pointer", textAlign: "left",
      }}>
        <div style={{ width: 70, height: 90, flexShrink: 0 }}>
          <img src={phone.img} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>{phone.name}</div>
          <div style={{ fontSize: 12, color: C_DIM }}>{phone.variants.length} variantes · {phone.year}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C_GREEN, marginTop: 4 }}>
            {fmtCLP(minPrice)} <span style={{ color: C_DIM, fontSize: 11, fontWeight: 500 }}>— {fmtCLP(maxPrice)}</span>
          </div>
        </div>
        <span style={{ fontSize: 18, color: C_DIM, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 14px 14px", display: "grid", gap: 6 }}>
          {phone.variants.map((v, i) => (
            <div key={i} style={{
              padding: 12, background: C_CARD_ALT, borderRadius: 12,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C_TEXT }}>{v.model}</div>
                <div style={{ fontSize: 11, color: C_DIM }}>{v.storage} · {v.sealed ? "Sellado" : "Seminuevo A+"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C_GREEN }}>{fmtCLP(v.price)}</div>
                <button onClick={() => onAdd(v)} style={{
                  padding: "8px 12px", background: C_GREEN, color: "#000",
                  border: "none", borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer",
                }}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sell screen
function CSellScreen() {
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
    <div style={{ height: "100%", overflow: "auto", paddingBottom: 100 }}>
      <CStatusBar />
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C_TEXT, letterSpacing: -0.8, marginBottom: 4 }}>Vende tu iPhone</div>
        <div style={{ fontSize: 13, color: C_DIM, marginBottom: 24 }}>Cotización en 60 segundos. Pago al instante en tienda.</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? C_GREEN : "rgba(255,255,255,0.1)",
              boxShadow: i <= step ? `0 0 8px ${C_GREEN}` : "none" }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: C_GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
          Paso {step + 1} de 3
        </div>

        {step === 0 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3, marginBottom: 16 }}>¿Qué modelo tienes?</div>
            <div style={{ display: "grid", gap: 8 }}>
              {["iPhone 13","iPhone 13 Pro","iPhone 14","iPhone 14 Pro","iPhone 15","iPhone 15 Pro","iPhone 16","iPhone 16 Pro"].map(m => (
                <button key={m} onClick={() => setModel(m)} style={{
                  padding: 14, textAlign: "left", borderRadius: 14,
                  background: model === m ? `${C_GREEN}22` : C_CARD,
                  color: model === m ? C_GREEN : C_TEXT,
                  border: model === m ? `1.5px solid ${C_GREEN}` : "1px solid rgba(255,255,255,0.04)",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>{m}</button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3, marginBottom: 16 }}>Capacidad</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
              {["64GB","128GB","256GB","512GB"].map(s => (
                <button key={s} onClick={() => setStorage(s)} style={{
                  padding: 16, borderRadius: 14,
                  background: storage === s ? `${C_GREEN}22` : C_CARD,
                  color: storage === s ? C_GREEN : C_TEXT,
                  border: storage === s ? `1.5px solid ${C_GREEN}` : "1px solid rgba(255,255,255,0.04)",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3, marginBottom: 16 }}>Condición</div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                ["Excelente","Como nuevo, sin marcas, batería 90%+"],
                ["Bueno","Pequeñas marcas de uso, batería 80-90%"],
                ["Regular","Marcas visibles, batería <80%"],
              ].map(([c,d]) => (
                <button key={c} onClick={() => setCondition(c)} style={{
                  padding: 14, textAlign: "left", borderRadius: 14,
                  background: condition === c ? `${C_GREEN}22` : C_CARD,
                  border: condition === c ? `1.5px solid ${C_GREEN}` : "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: condition === c ? C_GREEN : C_TEXT, marginBottom: 2 }}>{c}</div>
                  <div style={{ fontSize: 11, color: C_DIM }}>{d}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 12, color: C_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Tu iPhone vale hasta</div>
            <div style={{ fontSize: 52, fontWeight: 900, color: C_GREEN, letterSpacing: -2, textShadow: `0 0 32px ${C_GREEN}66`, lineHeight: 1 }}>
              {fmtCLP(estimate)}
            </div>
            <div style={{ fontSize: 13, color: C_DIM, marginTop: 16 }}>
              {model} · {storage} · {condition}
            </div>
            <div style={{ marginTop: 24, padding: 16, background: C_CARD, borderRadius: 14, fontSize: 12, color: C_DIM, lineHeight: 1.5 }}>
              Estimación referencial. El valor final se confirma en tienda tras revisión técnica gratuita.
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "absolute", bottom: 100, left: 24, right: 24, display: "flex", gap: 10 }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{
            padding: 14, background: C_CARD, color: C_TEXT,
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, fontWeight: 700, cursor: "pointer",
          }}>← Atrás</button>
        )}
        <button onClick={() => setStep(s => Math.min(s + 1, 2))} style={{
          flex: 1, padding: 14, background: C_GREEN, color: "#000",
          border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 13,
          boxShadow: `0 0 24px ${C_GREEN}55`, letterSpacing: 0.5, textTransform: "uppercase",
        }}>{step === 2 ? "Agendar evaluación" : "Continuar →"}</button>
      </div>
    </div>
  );
}

// Store screen
function CStoreScreen() {
  return (
    <div style={{ height: "100%", overflow: "auto", paddingBottom: 100 }}>
      <CStatusBar />
      {/* Map */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C_TEXT, letterSpacing: -0.8, marginBottom: 16 }}>Tienda física</div>
        <div style={{
          height: 200, borderRadius: 22, overflow: "hidden", background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.04)", marginBottom: 16,
        }}>
          <svg viewBox="0 0 400 200" style={{ width: "100%", height: "100%" }}>
            <rect width="400" height="200" fill="#0d100a" />
            {Array.from({length: 8}).map((_, i) => (
              <g key={i}>
                <line x1={i * 50} y1="0" x2={i * 50} y2="200" stroke="rgba(181,242,58,0.06)" />
                <line x1="0" y1={i * 25} x2="400" y2={i * 25} stroke="rgba(181,242,58,0.06)" />
              </g>
            ))}
            <path d="M 0 90 Q 200 80, 400 100" stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" />
            <path d="M 200 0 Q 195 100, 210 200" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" />
            <g transform="translate(200, 95)">
              <circle r="40" fill={`${C_GREEN}22`}>
                <animate attributeName="r" values="20;50;20" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <circle r="10" fill={C_GREEN} />
              <path d="M -6 -2 L 0 -16 L 6 -2 Z" fill={C_GREEN} />
            </g>
          </svg>
        </div>
        <div style={{ background: C_CARD, borderRadius: 18, padding: 18, marginBottom: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 11, color: C_GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>📍 Dirección</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C_TEXT, letterSpacing: -0.3 }}>Av. Padre Mariano 98</div>
          <div style={{ fontSize: 13, color: C_DIM }}>Oficina 105 · Providencia, Santiago</div>
        </div>
        <div style={{ background: C_CARD, borderRadius: 18, padding: 18, marginBottom: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 11, color: C_GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>🕐 Horario</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 13, color: C_TEXT }}>
            <span style={{ color: C_DIM }}>Lunes a Viernes</span><span style={{ fontWeight: 700 }}>10:00 - 19:00</span>
            <span style={{ color: C_DIM }}>Sábado</span><span style={{ fontWeight: 700 }}>10:00 - 14:00</span>
            <span style={{ color: C_DIM }}>Domingo</span><span style={{ color: C_DIM }}>Cerrado</span>
          </div>
        </div>
        <button style={{
          width: "100%", padding: 14, background: C_GREEN, color: "#000",
          border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 13,
          boxShadow: `0 0 24px ${C_GREEN}55`, letterSpacing: 0.5, textTransform: "uppercase",
          marginBottom: 8,
        }}>Cómo llegar</button>
        <button style={{
          width: "100%", padding: 14, background: "#25D366", color: "#fff",
          border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 13,
          letterSpacing: 0.5, textTransform: "uppercase",
        }}>WhatsApp</button>
      </div>
    </div>
  );
}

// Cart screen
function CCartScreen({ cart, onRemove }) {
  const total = cart.reduce((a, v) => a + v.price, 0);
  return (
    <div style={{ height: "100%", overflow: "auto", paddingBottom: 100 }}>
      <CStatusBar />
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C_TEXT, letterSpacing: -0.8, marginBottom: 16 }}>Tu carro</div>
        {cart.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: C_DIM }}>
            <div style={{ fontSize: 60, marginBottom: 16, opacity: 0.4 }}>🛒</div>
            <div style={{ fontSize: 14 }}>Aún no agregas nada.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {cart.map((v, i) => (
              <div key={i} style={{
                background: C_CARD, borderRadius: 16, padding: 14,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                border: "1px solid rgba(255,255,255,0.04)",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C_TEXT }}>{v.model}</div>
                  <div style={{ fontSize: 11, color: C_DIM }}>{v.storage} · {v.sealed ? "Sellado" : "Seminuevo"}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C_GREEN, marginTop: 4 }}>{fmtCLP(v.price)}</div>
                </div>
                <button onClick={() => onRemove(i)} style={{ background: "transparent", border: "none", color: C_DIM, fontSize: 18, cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {cart.length > 0 && (
        <div style={{ position: "absolute", bottom: 100, left: 24, right: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 13, color: C_DIM }}>
            <span>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: C_GREEN }}>{fmtCLP(total)}</span>
          </div>
          <button style={{
            width: "100%", padding: 14, background: C_GREEN, color: "#000",
            border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 13,
            boxShadow: `0 0 24px ${C_GREEN}55`, letterSpacing: 0.5, textTransform: "uppercase",
          }}>Continuar al pago</button>
        </div>
      )}
    </div>
  );
}

function ProposalC() {
  const [tab, setTab] = useState("home");
  const [cart, setCart] = useState([]);
  const onAdd = (v) => { setCart(c => [...c, v]); setTab("cart"); };
  const onRemove = (i) => setCart(c => c.filter((_, k) => k !== i));

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#000",
      backgroundImage: `radial-gradient(ellipse at 30% 20%, ${C_GREEN}15, transparent 50%), radial-gradient(ellipse at 70% 80%, ${C_GREEN}10, transparent 50%)`,
      color: C_TEXT, fontFamily: "'Inter', system-ui, sans-serif",
      padding: "60px 40px", display: "flex", justifyContent: "center", gap: 60, alignItems: "flex-start",
    }}>
      {/* Left: marketing copy */}
      <div style={{ flex: 1, maxWidth: 480, paddingTop: 80 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 999, marginBottom: 24,
          background: `${C_GREEN}11`, border: `1px solid ${C_GREEN}55`,
          fontSize: 12, color: C_GREEN, fontWeight: 600, letterSpacing: 0.5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C_GREEN }} />
          App-first · Mobile experience
        </div>
        <h1 style={{
          fontSize: 72, lineHeight: 1, fontWeight: 900,
          margin: "0 0 20px", letterSpacing: -2.5, color: C_TEXT,
        }}>
          La tienda<br />de iPhones<br />en tu <span style={{ color: C_GREEN, textShadow: `0 0 30px ${C_GREEN}66` }}>bolsillo</span>.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.5, color: C_DIM, margin: "0 0 32px", maxWidth: 420 }}>
          Una experiencia móvil pensada para el chileno tech-savvy.
          Catálogo del 11 al 17, cotizador instantáneo, y atención presencial en Providencia —
          todo a un swipe de distancia.
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 48 }}>
          <button style={{
            background: C_GREEN, color: "#000", border: "none",
            padding: "14px 22px", borderRadius: 999, cursor: "pointer",
            fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
            boxShadow: `0 0 24px ${C_GREEN}55`,
          }}>Probar la app web</button>
          <button style={{
            background: "transparent", color: C_TEXT,
            border: "1px solid rgba(255,255,255,0.2)",
            padding: "14px 22px", borderRadius: 999, cursor: "pointer",
            fontSize: 14, fontWeight: 600,
          }}>Vende tu iPhone →</button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {STATS.map(s => (
            <div key={s.l} style={{
              padding: 18, background: C_CARD, borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: C_TEXT, letterSpacing: -0.5 }}>{s.n}</div>
              <div style={{ fontSize: 11, color: C_DIM, marginTop: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div style={{ marginTop: 48 }}>
          <div style={{ fontSize: 13, color: C_GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Cómo funciona</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
            {[
              { i: "01", t: "Explora del 11 al 17", d: "Filtra por sellado o seminuevo, capacidad y modelo." },
              { i: "02", t: "Agrega al carro", d: "Selector de capacidad que actualiza el precio al instante." },
              { i: "03", t: "Cotiza tu iPhone", d: "3 pasos. Te decimos cuánto vale en 60 segundos." },
              { i: "04", t: "Visítanos o recíbelo", d: "Tienda física en Providencia o despacho a todo Chile." },
            ].map(s => (
              <li key={s.i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  width: 36, height: 36, flexShrink: 0, borderRadius: 12,
                  background: `${C_GREEN}22`, border: `1px solid ${C_GREEN}55`,
                  color: C_GREEN, display: "grid", placeItems: "center",
                  fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
                }}>{s.i}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C_TEXT }}>{s.t}</div>
                  <div style={{ fontSize: 13, color: C_DIM, marginTop: 2 }}>{s.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right: phone mockup */}
      <div style={{ position: "sticky", top: 60, flexShrink: 0 }}>
        <CDeviceFrame>
          {tab === "home" && <CHomeScreen onAdd={onAdd} goCart={() => setTab("cart")} />}
          {tab === "cat" && <CCatalogScreen onAdd={onAdd} />}
          {tab === "sell" && <CSellScreen />}
          {tab === "store" && <CStoreScreen />}
          {tab === "cart" && <CCartScreen cart={cart} onRemove={onRemove} />}
          <CBottomTab active={tab} onChange={setTab} />
        </CDeviceFrame>
      </div>
    </div>
  );
}

window.ProposalC = ProposalC;
