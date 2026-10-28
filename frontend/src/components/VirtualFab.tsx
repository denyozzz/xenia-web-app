import { useEffect, useState } from "react";
import theme from "../theme";

export const VIRTUAL_EVENT = "xenia-virtual-changed";

/** Schwebender Knopf "Virtuell": nur sichtbar, solange die virtuelle Maschine aktiv ist; Klick = zurueck zur echten. */
export function VirtualFab() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/machine/virtual").then((r) => r.json()).then((d: { active?: boolean }) => { if (alive) setActive(d.active === true); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    window.addEventListener(VIRTUAL_EVENT, load);
    return () => { alive = false; clearInterval(id); window.removeEventListener(VIRTUAL_EVENT, load); };
  }, []);

  if (!active) return null;
  const back = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/machine/virtual", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: false }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!d.ok) setErr(d.error ?? "Umschalten fehlgeschlagen");
      else setActive(false);
    } catch { setErr("Umschalten fehlgeschlagen"); }
    setBusy(false);
  };
  return (
    <div style={{ position: "fixed", bottom: 12, left: 12, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      {err && <div style={{ fontSize: 12, color: theme.red, background: theme.card, border: `1px solid ${theme.bdr}`, borderRadius: 6, padding: "4px 8px" }}>{err}</div>}
      <button
        onClick={() => void back()}
        disabled={busy}
        title="Virtuelle Maschine aktiv — tippen, um zur echten Maschine zurückzuschalten"
        style={{ height: 36, padding: "0 16px", borderRadius: 18, border: `1px solid ${theme.org}`, background: theme.card, color: theme.org, fontWeight: 700, fontSize: 13, fontFamily: "inherit", cursor: busy ? "wait" : "pointer" }}
      >
        Virtuell
      </button>
    </div>
  );
}
