import { useSyncExternalStore } from "react";

/** Ansicht: startet immer einfach (nicht gespeichert); der Knopf neben dem Hell/Dunkel-Schalter wechselt. */
const KEY = "xenia_simple_view";
function load(): boolean {
  try { return sessionStorage.getItem(KEY) !== "0"; } catch { return true; }
}
let simple = load();
const subs = new Set<() => void>();
export function setSimple(v: boolean): void {
  simple = v;
  try { sessionStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ohne Speicher: nur bis zum Neuladen */ }
  subs.forEach((f) => f());
}
export function useSimple(): boolean {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => simple,
  );
}
