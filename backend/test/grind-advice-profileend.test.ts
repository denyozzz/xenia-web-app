/** Mahlgrad-Empfehlung: Bezuege, die am Profil statt am Gewicht enden - die Menge in der Tasse zaehlt. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { grindAdvice } from "../src/grind-advice.js";

type Note = "finer" | "coarser" | "ok" | null;
const wt = (g: number, note: Note, t: number, y = 36) => ({ grindSetting: g, grindNote: note, durationS: t, weightStop: true, yieldActualG: y, yieldTargetG: 36, profileEnd: false });
const pe = (g: number, note: Note, t: number, y: number, target = 36) => ({ grindSetting: g, grindNote: note, durationS: t, weightStop: false, yieldActualG: y, yieldTargetG: target, profileEnd: true });

test("Profilende vor der Zielmenge: Zeit bis zum Ziel wird aus der Menge hochgerechnet", () => {
  // 14: nach 45 s nur 31 von 36 g -> geschaetzt 45*36/31 = 52 s; "passt" bei 17 in 29 s; 21 war zu grob (15 s)
  const a = grindAdvice([pe(14, "coarser", 45, 31), wt(17, "ok", 29), wt(21, "finer", 15)])!;
  assert.equal(a.kind, "step");
  assert.equal(a.value, 16);
  assert.deepEqual(a.timeBasis, { lastS: 52, targetS: 29, lastEstimated: true });
});

test("Profilende knapp vor der Zielmenge (>= 97 %) gilt nicht als verfehlt", () => {
  const a = grindAdvice([pe(14, "coarser", 45, 35.5), wt(17, "ok", 29)])!;
  assert.equal(a.value, 15);
  assert.equal(a.timeBasis, null);
  assert.equal(a.recent[0]!.missedTargetG, null);
});

test("recent zeigt bei verfehltem Ziel die Zielmenge", () => {
  const a = grindAdvice([pe(14, "coarser", 45, 31), wt(17, "ok", 29)])!;
  assert.deepEqual(a.recent[0], { grind: 14, note: "coarser", durationS: 45, yieldG: 31, missedTargetG: 36 });
  assert.deepEqual(a.recent[1], { grind: 17, note: "ok", durationS: 29, yieldG: 36, missedTargetG: null });
});

test("Gewichtsstopp zaehlt weiter mit der echten Zeit (lastEstimated false)", () => {
  const a = grindAdvice([wt(14, "coarser", 40), wt(17, "ok", 29), wt(21, "finer", 15)])!;
  assert.equal(a.value, 16);
  assert.equal(a.timeBasis!.lastEstimated, false);
});

test("ohne Menge oder Zielmenge keine Hochrechnung", () => {
  const a = grindAdvice([{ grindSetting: 14, grindNote: "coarser" as const, durationS: 45, weightStop: false, yieldActualG: null, yieldTargetG: 36, profileEnd: true }, wt(17, "ok", 29), wt(21, "finer", 15)])!;
  assert.equal(a.value, 15);
  assert.equal(a.timeBasis, null);
});
