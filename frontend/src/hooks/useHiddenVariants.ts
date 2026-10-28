import { useEffect, useState } from "react";
import { EMPTY_HIDDEN } from "../lib/hiddenVariants.js";
import type { HiddenState } from "../lib/hiddenVariants.js";

export const HIDDEN_VARIANTS_EVENT = "xenia-hidden-variants";

/** Pro Bohne (coffeeId) die ausdruecklich aus- bzw. eingeblendeten Varianten. Laedt beim Start, bei Fokus und nach Aenderungen im Bohnen-Editor. */
export function useHiddenVariants(): HiddenState {
  const [st, setSt] = useState<HiddenState>(EMPTY_HIDDEN);
  useEffect(() => {
    let live = true;
    const load = () => {
      fetch("/api/hidden-variants")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Partial<HiddenState> | null) => { if (live && d) setSt({ hidden: d.hidden ?? {}, shown: d.shown ?? {} }); })
        .catch(() => { /* ohne Angabe: Standard */ });
    };
    load();
    window.addEventListener(HIDDEN_VARIANTS_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener(HIDDEN_VARIANTS_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);
  return st;
}
