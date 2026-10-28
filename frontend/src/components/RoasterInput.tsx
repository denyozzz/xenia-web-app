import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/** Textfeld mit Vorschlaegen: alle bisherigen Roestereien (aus den vorhandenen Bohnen), eigene Eingabe bleibt moeglich. */
export function RoasterInput({ value, onChange, style, placeholder }: {
  value: string; onChange: (v: string) => void; style?: CSSProperties; placeholder?: string;
}) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/coffees").then((r) => r.json()).then((d: unknown) => {
      const o = d as { coffees?: unknown; data?: unknown; items?: unknown };
      const list = Array.isArray(d) ? d : Array.isArray(o?.coffees) ? o.coffees : Array.isArray(o?.data) ? o.data : Array.isArray(o?.items) ? o.items : [];
      const set = new Map<string, string>();
      for (const c of list as Array<{ roaster?: unknown }>) {
        const r = typeof c?.roaster === "string" ? c.roaster.trim() : "";
        if (r && !set.has(r.toLowerCase())) set.set(r.toLowerCase(), r);
      }
      setNames([...set.values()].sort((a, b) => a.localeCompare(b, "de")));
    }).catch(() => {});
  }, []);
  return (
    <>
      <input list="xenia-roasters" style={style} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id="xenia-roasters">
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
    </>
  );
}
