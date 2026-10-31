import { useEffect, useState } from "react";
import { RECIPE_LINKS, SWITCH_GROUPS } from "../switchConfig.js";
import type { SwitchRow } from "../switchConfig.js";

type Opt = { id: number; label: string };

export function Switches() {
  const [values, setValues] = useState<Record<string, number> | null>(null);
  const [options, setOptions] = useState<Opt[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/switches");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setValues(d.values); setOptions(d.options); setMsg("");
    } catch (e) { setMsg("Laden fehlgeschlagen: " + String(e)); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!values) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/switches", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      if (!r.ok) throw new Error(String(r.status));
      setMsg("Gespeichert.");
    } catch (e) { setMsg("Speichern fehlgeschlagen: " + String(e)); }
    setBusy(false);
  };

  const box = { border: "1px solid rgba(128,128,128,0.4)", borderRadius: 8, padding: 16, marginBottom: 16 } as const;

  const group = (title: string, parts: SwitchRow[][], last = false) => (
    <div style={last ? { ...box, marginBottom: 0 } : box}>
      <h3 style={{ marginTop: 0, marginBottom: 28, fontSize: 28, fontWeight: 800 }}>{title}</h3>
      {parts.map((rows, i) => (
        <div key={i} style={i > 0 ? { marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(128,128,128,0.3)" } : undefined}>
          {rows.map((r) => (
            <label key={r.key} style={{ display: "block", marginBottom: 12 }}>
              <div style={{ fontSize: 14, opacity: r.key.endsWith("_0") ? 1 : 0.5, fontWeight: r.key.endsWith("_0") ? 700 : 400, marginBottom: 4 }}>{r.label}</div>
              <select
                value={values![r.key]}
                onChange={(e) => setValues({ ...values!, [r.key]: Number(e.target.value) })}
                style={{ width: "100%", height: 40, fontSize: 16, fontWeight: r.key.endsWith("_0") ? 700 : 400, opacity: r.key.endsWith("_0") ? 1 : 0.6 }}
              >
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: "0 20px 20px", maxWidth: 900, overflowY: "auto", height: "100%" }}>
      {!values && <div>{msg || "Lade …"}</div>}
      {values && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch" }}>
            <div style={{ flex: "1 1 320px", minWidth: 280, display: "flex", flexDirection: "column" }}>
              {group(SWITCH_GROUPS[0].title, SWITCH_GROUPS[0].parts)}
              <div style={{ ...box, padding: 10, marginBottom: 12 }}>
                <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 14, fontWeight: 700 }}>Rezepte</h3>
                {RECIPE_LINKS.map((l) => (
                  <div key={l.url} style={{ marginBottom: 3, fontSize: 13 }}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                      {l.label}
                    </a>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: "auto" }}>
                <button onClick={save} disabled={busy} style={{ height: 44, padding: "0 24px", fontSize: 16, cursor: "pointer" }}>
                  Speichern
                </button>
                <span>{msg}</span>
              </div>
            </div>
            <div style={{ flex: "1 1 320px", minWidth: 280 }}>
              {group(SWITCH_GROUPS[1].title, SWITCH_GROUPS[1].parts, true)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
