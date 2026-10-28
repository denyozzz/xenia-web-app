import { useEffect, useState } from "react";
import theme from "../theme";
import { VIRTUAL_EVENT } from "./VirtualFab.js";

/** Schalter "Virtuelle Maschine" fuer die Einstellungen: Mock-Server statt der echten Xenia. */
export function VirtualMachineSetting() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/machine/virtual").then((r) => r.json()).then((d: { active?: boolean }) => setActive(d.active === true)).catch(() => {});
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/machine/virtual", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
      const d = (await r.json()) as { ok?: boolean; active?: boolean; error?: string };
      if (!d.ok) setErr(d.error ?? "Umschalten fehlgeschlagen");
      else { setActive(d.active === true); window.dispatchEvent(new Event(VIRTUAL_EVENT)); }
    } catch { setErr("Umschalten fehlgeschlagen"); }
    setBusy(false);
  };

  return (
    <div style={{ padding: "10px 0" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: busy ? "wait" : "pointer", color: theme.txt, fontSize: 14 }}>
        <input type="checkbox" checked={active} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        <span>Virtuelle Maschine (Test ohne echte Xenia)</span>
      </label>
      <div style={{ fontSize: 12, color: theme.mut, marginTop: 4 }}>
        Startet den eingebauten Mock-Server und schaltet die App darauf. Unten links erscheint der Knopf „Virtuell“; ein Klick darauf schaltet zurück zur echten Maschine.
        Bezüge im virtuellen Modus landen im Verlauf.
      </div>
      {err && <div style={{ fontSize: 12, color: theme.red, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
