import { useEffect, useRef, useState } from "react";
import theme from "../theme";
import { SAYINGS } from "../sayings.js";

const WARMUP_MIN = 30; // Die Timer greifen laut Maschine erst nach 30 Minuten Laufzeit.
const fmt = (s: number) => `${Math.ceil(s / 60)} min`;
const isOff = (s: string) => s === "off" || s === "disconnected";

/** Uhrzeit gross; darunter "Eco in …" / "aus in …" (Timer der Maschine, im Browser mitgezaehlt). */
const SAYING_MS = 8 * 60 * 1000; // alle 8 Minuten ein neuer Spruch
export function TopClock({ machineState, mobile, hideTimers, showSaying }: { machineState: string; mobile?: boolean; hideTimers?: boolean; showSaying?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [ecoMin, setEcoMin] = useState(0);
  const [pdMin, setPdMin] = useState(0);
  const [extra, setExtra] = useState<string[]>([]);
  const last = useRef(Date.now());
  const onSince = useRef<number | null>(null); // null = unbekannt (Seite bei laufender Maschine geladen)
  const prev = useRef(machineState);
  const sayBase = useRef(Math.floor(Math.random() * 100000));
  const sayStart = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    fetch("/api/switches").then((r) => r.json()).then((d) => {
      setEcoMin(Number(d.ecoMin) || 0);
      setPdMin(Number(d.powerdownMin) || 0);
    }).catch(() => {});
  }, []);
  // Zusaetzliche Sprueche aus sprueche.txt im Datenordner (optional).
  useEffect(() => {
    fetch("/api/sayings").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.lines)) setExtra(d.lines.filter((x: unknown): x is string => typeof x === "string"));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (isOff(prev.current) && !isOff(machineState)) onSince.current = Date.now();
    if (isOff(machineState)) onSince.current = null;
    if (machineState !== "eco") last.current = Date.now(); // Eco-Beginn setzt die Zaehlung nicht zurueck
    prev.current = machineState;
  }, [machineState]);

  const active = !isOff(machineState) && machineState !== "brewing" && machineState !== "draining";
  const warm = onSince.current === null ? 0 : onSince.current + WARMUP_MIN * 60000;
  const left = (min: number) => Math.max(0, Math.ceil((Math.max(last.current + min * 60000, warm) - now) / 1000));
  const ecoLeft = left(ecoMin);
  const pdLeft = left(pdMin);
  const time = new Date(now).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const pool = extra.length > 0 ? [...SAYINGS, ...extra] : SAYINGS;
  const saying = pool[(sayBase.current + Math.floor((now - sayStart.current) / SAYING_MS)) % pool.length];
  const warn = (s: number) => (s < 60 ? theme.red : theme.mut);

  return (
    <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: hideTimers ? "flex-end" : "center", textAlign: hideTimers ? "right" : "center", justifyContent: "center", flexBasis: mobile ? "100%" : "auto", minWidth: 0 }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <div style={{ fontSize: mobile ? 28 : hideTimers ? 46 : 36, fontWeight: 700, lineHeight: 1.1, color: theme.txt, fontVariantNumeric: "tabular-nums" }}>{time}</div>
        {active && !hideTimers && (machineState === "eco" ? pdMin > 0 : ecoMin > 0) && (
          <div style={{ position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: 24, textAlign: "left", whiteSpace: "nowrap", fontSize: 12, lineHeight: 1.2, color: theme.mut, fontVariantNumeric: "tabular-nums" }}>
            <div>{machineState === "eco" ? "aus in" : "Eco in"}</div>
            <div style={{ color: warn(machineState === "eco" ? pdLeft : ecoLeft) }}>{fmt(machineState === "eco" ? pdLeft : ecoLeft)}</div>
          </div>
        )}
      </div>
      {(showSaying ?? hideTimers) && (
        <div style={{ fontSize: 13, fontStyle: "italic", color: theme.mut, maxWidth: 340, marginTop: 2 }}>{saying}</div>
      )}
    </div>
  );
}
