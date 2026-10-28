/**
 * Mahlgrad-Empfehlung aus den letzten Bezuegen mit gleicher Bohne, Muehle, Profil und gleichem Sieb.
 * Rechnet bei jedem Aufruf neu aus der Historie - es gibt nichts zu trainieren oder nachzupflegen.
 * Annahme (Einstellung FINER_IS_LOWER): ein kleinerer Wert mahlt feiner.
 *
 * Grundlage sind deine Bewertungen (zu fein / zu grob / passt). Fehlt eine Seite, sodass nur ein Schritt
 * moeglich waere, nutzt sie zusaetzlich die gemessene Bezugszeit: Bei Brew by Weight stoppt der Bezug bei der
 * Zielmenge - je groeber gemahlen, desto frueher. Endet ein Bezug am Profil, bevor die Zielmenge erreicht ist, wird aus
 * der Menge in der Tasse hochgerechnet, wie lange es bis zur Zielmenge gedauert haette. Aus den Zeiten der bisherigen Bezuege und der Zeit der
 * "passt"-Bezuege wird die Schrittweite geschaetzt (1 bis 2 Schritte, nie ueber bewertete Grenzen hinaus).
 */

export interface GrindAdviceShot {
  grindSetting: number | null;
  grindNote: "finer" | "coarser" | "ok" | null;
  /** Bezugsdauer in s (Ende - Start); null = unbekannt. */
  durationS?: number | null;
  /** Bezug wurde nach Gewicht gestoppt (Brew by Weight) - nur dann sind die Zeiten verschiedener Bezuege vergleichbar. */
  weightStop?: boolean;
  /** Menge in der Tasse am Ende (g). */
  yieldActualG?: number | null;
  /** Zielmenge (g) dieses Bezugs. */
  yieldTargetG?: number | null;
  /** Bezug endete am Profil (Skript/Stufen) statt am Gewicht - dann zaehlt, wie viel bis dahin in der Tasse war. */
  profileEnd?: boolean;
}

/** Ein frueherer Bezug zur Anzeige neben der Empfehlung. */
export interface GrindRecent {
  grind: number;
  note: "finer" | "coarser" | "ok" | null;
  /** Dauer in s (Ende - Start); null = unbekannt. */
  durationS: number | null;
  yieldG: number | null;
  /** Zielmenge (g), wenn der Bezug am Profil endete, bevor sie erreicht war; sonst null. */
  missedTargetG: number | null;
}

export interface GrindAdvice {
  /** keep = passt, between = zwischen zu grob und zu fein, narrow = enger als ganze Schritte, step = ein Schritt */
  kind: "keep" | "between" | "narrow" | "step";
  /** Empfohlener Mahlgrad; null bei "narrow". */
  value: number | null;
  /** Kleinster Wert, der als zu grob bewertet wurde (Bewertung "feiner"). */
  tooCoarse: number | null;
  /** Groesster Wert, der als zu fein bewertet wurde (Bewertung "groeber"). */
  tooFine: number | null;
  /** Anzahl der bewerteten Bezuege, auf denen die Empfehlung beruht. */
  basedOn: number;
  /** Naechster Wert auf der feineren Seite der Empfehlung, der als zu fein bewertet wurde - aus der ganzen Historie, nicht nur dem Fenster. */
  nearFine: number | null;
  /** Naechster Wert auf der groeberen Seite der Empfehlung, der als zu grob bewertet wurde - aus der ganzen Historie. */
  nearCoarse: number | null;
  /** Die letzten Bezuege (neueste zuerst) mit Mahlgrad, Zeit und Menge - zur Anzeige. */
  recent: GrindRecent[];
  /** Gesetzt, wenn die Schrittweite aus der Bezugszeit stammt: Zeit des letzten Bezugs und Zielzeit (Median der "passt"-Bezuege).
   *  lastEstimated: der letzte Bezug endete am Profil; seine Zeit bis zur Zielmenge ist aus der Menge hochgerechnet. */
  timeBasis: { lastS: number; targetS: number; lastEstimated: boolean } | null;
}

/** true: kleinerer Wert = feiner (Sculptor 078s). */
const FINER_IS_LOWER = true;
const WINDOW = 6;
const MAX_TIME_STEP = 2;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** `shots`: neueste zuerst. */
export function grindAdvice(shots: GrindAdviceShot[]): GrindAdvice | null {
  // Intern immer in "kleiner = feiner" rechnen; bei umgekehrter Skala Werte spiegeln.
  const sign = FINER_IS_LOWER ? 1 : -1;
  const all = shots
    .filter((s) => s.grindSetting !== null)
    .map((s) => {
      const d = typeof s.durationS === "number" && s.durationS > 0 ? s.durationS : null;
      const y = s.yieldActualG ?? null;
      const tgt = s.yieldTargetG ?? null;
      // Am Profil gestoppt, Zielmenge nicht erreicht: zu fein. Wie lange es bis zur Zielmenge gedauert haette,
      // wird aus der Menge hochgerechnet (gleichmaessiger Fluss angenommen - eine Naeherung).
      const missed = s.profileEnd === true && d !== null && y !== null && y > 0 && tgt !== null && y < tgt * 0.97;
      // Gewichtsstopp: die Zeit selbst. Sonst nur die Hochrechnung bei verfehlter Zielmenge.
      const t = s.weightStop === true && d !== null ? d : missed ? (d as number) * (tgt as number) / (y as number) : null;
      return { g: sign * (s.grindSetting as number), note: s.grindNote, t, est: missed && s.weightStop !== true, d, y, miss: missed ? tgt : null };
    });
  const list = all.slice(0, WINDOW);
  const recentInfo: GrindRecent[] = all.slice(0, 4).map((s) => ({ grind: sign * s.g, note: s.note, durationS: s.d, yieldG: s.y, missedTargetG: s.miss }));
  // Gegenseite: die naechsten bekannten Grenzen um den empfohlenen Wert, auch aus aelteren Bezuegen.
  // (intern kleiner = feiner: "zu fein" liegt darunter, "zu grob" darueber)
  const around = (v: number | null): Pick<GrindAdvice, "nearFine" | "nearCoarse"> => {
    if (v === null) return { nearFine: null, nearCoarse: null };
    const fine = all.filter((s) => s.note === "coarser" && s.g < v).map((s) => s.g);
    const coarse = all.filter((s) => s.note === "finer" && s.g > v).map((s) => s.g);
    return { nearFine: fine.length ? sign * Math.max(...fine) : null, nearCoarse: coarse.length ? sign * Math.min(...coarse) : null };
  };
  if (list.length === 0) return null;
  const newest = list[0]!;
  if (newest.note === "ok") {
    return { kind: "keep", value: sign * newest.g, tooCoarse: null, tooFine: null, basedOn: 1, ...around(newest.g), recent: recentInfo, timeBasis: null };
  }
  // Nur Bezuege neuer als der letzte "passt".
  const okAt = list.findIndex((s) => s.note === "ok");
  const recent = (okAt === -1 ? list : list.slice(0, okAt)).filter((s) => s.note === "finer" || s.note === "coarser");
  if (recent.length === 0) return null;
  const coarse = recent.filter((s) => s.note === "finer").map((s) => s.g);   // war zu grob -> Ziel kleiner
  const fine = recent.filter((s) => s.note === "coarser").map((s) => s.g);   // war zu fein  -> Ziel groesser
  const U = coarse.length ? Math.min(...coarse) : null;
  const L = fine.length ? Math.max(...fine) : null;
  const out = (kind: GrindAdvice["kind"], value: number | null, u: number | null, l: number | null): GrindAdvice => ({
    kind,
    value: value === null ? null : sign * value,
    tooCoarse: u === null ? null : sign * u,
    tooFine: l === null ? null : sign * l,
    basedOn: recent.length,
    ...around(value),
    recent: recentInfo,
    timeBasis: null,
  });
  if (U !== null && L !== null && L < U) {
    if (U - L >= 2) return out("between", Math.round((L + U) / 2), U, L);
    return out("narrow", null, U, L);
  }

  // Nur eine Seite bekannt oder widerspruechlich: ein Schritt ab dem neuesten bewerteten Bezug -
  // bei vorhandenen Messwerten mit der aus der Bezugszeit geschaetzten Schrittweite (1 bis 2).
  const last = recent[0]!;
  const toFiner = last.note === "finer";
  const timed = (): { g: number; lastS: number; targetS: number; lastEstimated: boolean } | null => {
    if (last.t === null) return null;
    const okT = all.filter((s) => s.note === "ok" && s.t !== null).slice(0, 5).map((s) => s.t as number);
    if (okT.length === 0) return null;
    const targetS = median(okT);
    const pts = all.filter((s) => s.t !== null).slice(0, 10) as Array<{ g: number; t: number }>;
    if (new Set(pts.map((p) => p.g)).size < 2) return null;
    const mg = pts.reduce((a, p) => a + p.g, 0) / pts.length;
    const mt = pts.reduce((a, p) => a + p.t, 0) / pts.length;
    const varG = pts.reduce((a, p) => a + (p.g - mg) ** 2, 0);
    const slope = pts.reduce((a, p) => a + (p.g - mg) * (p.t - mt), 0) / varG;   // s pro Mahlgradstufe
    if (!(slope < 0)) return null;                                                 // feiner muss laenger dauern
    const delta = (targetS - last.t) / slope;                                      // noetige Aenderung (intern)
    if (toFiner ? !(delta < 0) : !(delta > 0)) return null;                        // muss zur Bewertung passen
    const steps = Math.min(MAX_TIME_STEP, Math.max(1, Math.round(Math.abs(delta))));
    let value = toFiner ? last.g - steps : last.g + steps;
    // Nie ueber eine bewertete Gegengrenze hinaus.
    if (toFiner) {
      const lim = all.filter((s) => s.note === "coarser" && s.g < last.g).map((s) => s.g);
      if (lim.length) value = Math.max(value, Math.max(...lim) + 1);
      if (value >= last.g) return null;
    } else {
      const lim = all.filter((s) => s.note === "finer" && s.g > last.g).map((s) => s.g);
      if (lim.length) value = Math.min(value, Math.min(...lim) - 1);
      if (value <= last.g) return null;
    }
    return { g: value, lastS: last.t, targetS, lastEstimated: last.est };
  };
  const t = timed();
  const base = toFiner
    ? out("step", t ? t.g : last.g - 1, last.g, null)
    : out("step", t ? t.g : last.g + 1, null, last.g);
  return t ? { ...base, timeBasis: { lastS: Math.round(t.lastS), targetS: Math.round(t.targetS), lastEstimated: t.lastEstimated } } : base;
}
