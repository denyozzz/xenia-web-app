/** Mahlgrad-Empfehlung mit Bezugszeit (Brew by Weight): Schrittweite aus den Zeiten, Grenzen aus den Bewertungen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { grindAdvice } from "../src/grind-advice.js";

const s = (g: number, note: "finer" | "coarser" | "ok" | null, t: number | null, weightStop = true, y: number | null = 36) =>
  ({ grindSetting: g, grindNote: note, durationS: t, weightStop, yieldActualG: y });

test("zwei Schritte statt einem, wenn die Zeit weit von der Zielzeit liegt", () => {
  // neuester Bezug 14 war zu fein und brauchte 40 s; das "passt" bei 17 brauchte 29 s; 21 war zu grob bei 15 s
  const a = grindAdvice([s(14, "coarser", 40), s(17, "ok", 29), s(21, "finer", 15)])!;
  assert.equal(a.kind, "step");
  assert.equal(a.value, 16);
  assert.deepEqual(a.timeBasis, { lastS: 40, targetS: 29, lastEstimated: false });
  assert.equal(a.nearFine, 14);
  assert.equal(a.nearCoarse, 21);
});

test("ohne 'passt'-Bezug keine Zeitschaetzung: ein Schritt wie bisher", () => {
  const a = grindAdvice([s(14, "coarser", 40), s(17, null, 30)])!;
  assert.equal(a.value, 15);
  assert.equal(a.timeBasis, null);
});

test("Zeit steigt mit gröberem Mahlgrad (Unsinn): ein Schritt wie bisher", () => {
  const a = grindAdvice([s(14, "coarser", 20), s(17, "ok", 30)])!;
  assert.equal(a.value, 15);
  assert.equal(a.timeBasis, null);
});

test("Zeit passt nicht zur Bewertung: ein Schritt wie bisher", () => {
  // zu fein bewertet, aber schon schneller als die Zielzeit
  const a = grindAdvice([s(14, "coarser", 25), s(17, "ok", 29), s(21, null, 15)])!;
  assert.equal(a.value, 15);
  assert.equal(a.timeBasis, null);
});

test("nie ueber eine bewertete Grenze hinaus", () => {
  const a = grindAdvice([s(14, "coarser", 40), s(17, "ok", 29), s(16, "finer", 31)])!;
  assert.equal(a.value, 15);
  assert.ok(a.timeBasis);
});

test("Bezuege ohne Gewichtsstopp zaehlen nicht fuer die Zeit", () => {
  const a = grindAdvice([s(14, "coarser", 40, false), s(17, "ok", 29, false), s(21, "finer", 15, false)])!;
  assert.equal(a.value, 15);
  assert.equal(a.timeBasis, null);
  assert.equal(a.recent[0]!.durationS, 40, "Dauer wird angezeigt, zaehlt aber nicht fuer die Rechnung");
});

test("zu grob bewertet: Richtung feiner, auch hier bis zu zwei Schritte", () => {
  // 21 war zu grob und brauchte 15 s; "passt" bei 17 mit 29 s; 14 war zu fein (40 s, aelter als das passt)
  const a = grindAdvice([s(21, "finer", 15), s(17, "ok", 29), s(14, "coarser", 40)])!;
  assert.equal(a.kind, "step");
  assert.equal(a.value, 19);
  assert.deepEqual(a.timeBasis, { lastS: 15, targetS: 29, lastEstimated: false });
});

test("recent: letzte Bezuege mit Grad, Zeit, Menge", () => {
  const a = grindAdvice([s(14, "coarser", 40, true, 36.2), s(17, "ok", 29)])!;
  assert.deepEqual(a.recent[0], { grind: 14, note: "coarser", durationS: 40, yieldG: 36.2, missedTargetG: null });
  assert.equal(a.recent.length, 2);
});
