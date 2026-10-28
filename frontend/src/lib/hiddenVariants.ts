/** Welche Varianten erscheinen bei einer Bohne im Dashboard als Schaltflaeche? */

export interface HiddenState {
  /** Je Bohne (coffeeId): ausdruecklich ausgeblendete Varianten-IDs. */
  hidden: Record<string, number[]>;
  /** Je Bohne: ausdruecklich eingeblendete Varianten-IDs (gehen dem Standard vor). */
  shown: Record<string, number[]>;
}

export const EMPTY_HIDDEN: HiddenState = { hidden: {}, shown: {} };

/** Hell = Röstgrad hell oder mittelhell (wie der Schalter „Hell“ im Bohnen-Editor). */
export const isLightRoast = (level: string | null | undefined): boolean => level === "light" || level === "light-medium";

/**
 * Ausdrueckliche Wahl (an/aus) gilt immer. Ohne Wahl ist bei hellen Bohnen die Variante „Single“ aus,
 * alles andere an.
 */
export function variantHidden(v: { id: number; name: string }, coffeeId: number, light: boolean, st: HiddenState): boolean {
  const k = String(coffeeId);
  if ((st.hidden[k] ?? []).includes(v.id)) return true;
  if ((st.shown[k] ?? []).includes(v.id)) return false;
  return light && v.name.trim().toLowerCase() === "single";
}
