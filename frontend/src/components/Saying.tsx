import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import theme from "../theme";
import { SAYINGS } from "../sayings.js";

const SAYING_MS = 8 * 60 * 1000; // alle 8 Minuten ein neuer Spruch

/** Kleiner aufheiternder Spruch: eingebaute Liste + optionale sprueche.txt im Datenordner. */
export function Saying({ style }: { style?: CSSProperties }) {
  const [extra, setExtra] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const base = useRef(Math.floor(Math.random() * 100000));
  const start = useRef(Date.now());

  useEffect(() => {
    fetch("/api/sayings").then((r) => r.json()).then((d) => {
      if (Array.isArray(d.lines)) setExtra(d.lines.filter((x: unknown): x is string => typeof x === "string"));
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const pool = extra.length > 0 ? [...SAYINGS, ...extra] : SAYINGS;
  const text = pool[(base.current + Math.floor((now - start.current) / SAYING_MS)) % pool.length];
  return (
    <div style={{ flexBasis: "100%", fontSize: 13, fontStyle: "italic", color: theme.mut, maxWidth: 340, marginLeft: "auto", textAlign: "right", ...style }}>
      {text}
    </div>
  );
}
