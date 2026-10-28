import theme from "../theme";
import { Toggle } from "./Toggle.js";
import { setSayingPref, useSayingPrefs } from "../sayingPrefs.js";

/** Einstellungen: Spruch neben der Uhr je Dashboard-Ansicht ein- oder ausblenden (gilt fuer dieses Geraet). */
export function SayingSettings() {
  const p = useSayingPrefs();
  const row = (label: string, description: string, on: boolean, view: "simple" | "expert") => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.bdr}`, gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: theme.txt, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: theme.mut, marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <Toggle checked={on} onChange={(v) => setSayingPref(view, v)} label={label} />
      </div>
    </div>
  );
  return (
    <>
      {row("Spruch im einfachen Dashboard", "Kleiner Spruch unter der Uhr. Gilt für alle Geräte.", p.simple, "simple")}
      {row("Spruch im Experten-Dashboard", "Derselbe Spruch unter der Uhr, auch in der Expertenansicht. Gilt für alle Geräte.", p.expert, "expert")}
    </>
  );
}
