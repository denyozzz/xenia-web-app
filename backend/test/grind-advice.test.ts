/** Mahlgrad-Empfehlung: Grenzen um den empfohlenen Wert (zu fein / zu grob), auch aus aelteren Bezuegen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { grindAdvice } from "../src/grind-advice.js";

const s = (grindSetting: number, grindNote: "finer" | "coarser" | "ok" | null) => ({ grindSetting, grindNote });

test("ein Schritt ab dem neuesten: Gegenseite kommt aus aelterer Historie", () => {
  // neuester Bezug 21 war zu fein; davor ein "passt" bei 23, noch davor 24 zu grob (ausserhalb des Fensters nach "passt")
  const a = grindAdvice([s(21, "coarser"), s(23, "ok"), s(24, "finer")])!;
  assert.equal(a.kind, "step");
  assert.equal(a.value, 22);
  assert.equal(a.nearFine, 21);
  assert.equal(a.nearCoarse, 24);
});

test("nur eine Seite bekannt: die andere bleibt leer", () => {
  const a = grindAdvice([s(21, "coarser")])!;
  assert.equal(a.value, 22);
  assert.equal(a.nearFine, 21);
  assert.equal(a.nearCoarse, null);
});

test("zwischen zu fein und zu grob: Grenzen wie bisher", () => {
  const a = grindAdvice([s(21, "coarser"), s(24, "finer")])!;
  assert.equal(a.kind, "between");
  assert.equal(a.value, 23);
  assert.equal(a.nearFine, 21);
  assert.equal(a.nearCoarse, 24);
});

test("halten: auch hier die bekannten Grenzen", () => {
  const a = grindAdvice([s(22, "ok"), s(21, "coarser"), s(24, "finer")])!;
  assert.equal(a.kind, "keep");
  assert.equal(a.value, 22);
  assert.equal(a.nearFine, 21);
  assert.equal(a.nearCoarse, 24);
});

test("Werte auf der falschen Seite zaehlen nicht als Grenze", () => {
  // 20 war zu grob (obwohl kleiner als die Empfehlung) widerspricht und gilt nicht als obere Grenze
  const a = grindAdvice([s(21, "coarser"), s(20, "finer")])!;
  assert.equal(a.nearCoarse, null);
});

test("ohne bewertete Bezuege keine Empfehlung", () => {
  assert.equal(grindAdvice([s(21, null)]), null);
});
