import { useEffect, useState } from "react";
import theme from "../theme";

interface BatteryManager extends EventTarget { level: number; charging: boolean; }

/** Kleine Batterieanzeige oben rechts. Nichts sichtbar, wenn der Browser keine Batteriedaten liefert. */
export function BatteryIndicator() {
  const [b, setB] = useState<{ level: number; charging: boolean } | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (typeof nav.getBattery !== "function") return;
    let cancelled = false;
    let mgr: BatteryManager | null = null;
    const update = () => { if (mgr && !cancelled) setB({ level: mgr.level, charging: mgr.charging }); };
    nav.getBattery().then((m) => {
      if (cancelled) return;
      mgr = m;
      update();
      m.addEventListener("levelchange", update);
      m.addEventListener("chargingchange", update);
    }).catch(() => { /* nicht verfuegbar */ });
    return () => {
      cancelled = true;
      mgr?.removeEventListener("levelchange", update);
      mgr?.removeEventListener("chargingchange", update);
    };
  }, []);

  if (!b) return null;
  const pct = Math.round(b.level * 100);
  const low = pct < 20 && !b.charging;
  return (
    <div style={{ position: "fixed", top: 4, right: 10, zIndex: 40, fontSize: 11, fontWeight: 600, color: low ? theme.red : theme.mut, pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
      {b.charging ? "\u26A1 " : ""}{pct} %
    </div>
  );
}
