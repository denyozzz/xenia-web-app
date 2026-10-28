import { useSyncExternalStore } from "react";

/**
 * Spruch neben der Uhr, je Dashboard-Ansicht ein/aus - gemeinsam fuer alle Geraete (Server: /api/ui-prefs).
 * Einfach: bisher immer an -> Standard an. Experte: bisher kein Spruch -> Standard aus.
 * Der Browser-Speicher ist nur eine Kopie fuer die erste Darstellung; ein Wert vom Server gilt vor ihm.
 */
const KEY_SIMPLE = "xenia_saying_simple";
const KEY_EXPERT = "xenia_saying_expert";

export interface SayingPrefs { simple: boolean; expert: boolean }

function read(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === "1";
  } catch { return def; }
}
function cache(key: string, on: boolean): void {
  try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* ohne Speicher: nur bis zum Neuladen */ }
}

let prefs: SayingPrefs = { simple: read(KEY_SIMPLE, true), expert: read(KEY_EXPERT, false) };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Server-Stand holen; null = dort noch nie gesetzt (dann bleibt der lokale Wert). */
function sync(): void {
  fetch("/api/ui-prefs")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { sayingSimple?: boolean | null; sayingExpert?: boolean | null } | null) => {
      if (!d) return;
      const next: SayingPrefs = {
        simple: typeof d.sayingSimple === "boolean" ? d.sayingSimple : prefs.simple,
        expert: typeof d.sayingExpert === "boolean" ? d.sayingExpert : prefs.expert,
      };
      if (next.simple === prefs.simple && next.expert === prefs.expert) return;
      prefs = next;
      cache(KEY_SIMPLE, next.simple);
      cache(KEY_EXPERT, next.expert);
      emit();
    })
    .catch(() => { /* ohne Server: lokaler Stand */ });
}
if (typeof window !== "undefined") {
  sync();
  window.addEventListener("focus", sync);
}

export function setSayingPref(view: "simple" | "expert", on: boolean): void {
  prefs = { ...prefs, [view]: on };
  cache(view === "simple" ? KEY_SIMPLE : KEY_EXPERT, on);
  emit();
  fetch("/api/ui-prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(view === "simple" ? { sayingSimple: on } : { sayingExpert: on }),
  }).catch(() => { /* bleibt lokal, beim naechsten Aendern wieder versucht */ });
}

export function useSayingPrefs(): SayingPrefs {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => prefs,
  );
}
