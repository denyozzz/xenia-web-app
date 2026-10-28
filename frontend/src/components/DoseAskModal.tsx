import { useState } from "react";
import theme from "../theme";

/** Nach der Bewertung: die im PreShot geaenderte Dosis fuer diese Bohne und Variante merken? */
export function DoseAskModal({ ask, onClose }: {
  ask: { beanId: number; variantId: number; variantName: string; doseG: number };
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const yes = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/shots/bean-dose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beanId: ask.beanId, variantId: ask.variantId, doseG: ask.doseG }),
      });
      if (!r.ok) { setErr("Speichern fehlgeschlagen."); setBusy(false); return; }
      onClose();
    } catch { setErr("Speichern fehlgeschlagen."); setBusy(false); }
  };
  const btn = { padding: "9px 18px", borderRadius: 8, border: `1px solid ${theme.bdr}`, fontFamily: "inherit", fontSize: 14, cursor: "pointer" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: theme.card, color: theme.txt, border: `1px solid ${theme.bdr}`, borderRadius: 12, padding: 20, maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Dosis übernehmen?</div>
        <div style={{ fontSize: 14, color: theme.mut, marginBottom: 16 }}>
          {String(ask.doseG).replace(".", ",")} g für diese Bohne (Variante {ask.variantName}) als neue Standarddosis speichern?
        </div>
        {err && <div style={{ fontSize: 12, color: theme.red, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" disabled={busy} onClick={onClose} style={{ ...btn, background: "transparent", color: theme.mut }}>Nein</button>
          <button type="button" disabled={busy} onClick={() => void yes()} style={{ ...btn, background: theme.acc, color: theme.bg, fontWeight: 700 }}>Ja, übernehmen</button>
        </div>
      </div>
    </div>
  );
}
