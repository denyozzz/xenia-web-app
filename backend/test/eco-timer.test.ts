/** Patch 138: Eco-/Aus-Zaehlung auf dem Server. */
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { EcoTracker, registerEcoTimerRoutes } from "../src/eco-timer.js";

const MIN = 60_000;

function setup(store = new Map<string, string>()) {
  let t = 1_000_000_000;
  const settings = { get: (k: string) => store.get(k), set: (k: string, v: string) => { store.set(k, v); } };
  const tr = new EcoTracker(settings, () => t);
  return { tr, store, tick: (ms: number) => { t += ms; } };
}

test("Einschalten setzt Einschaltzeit und Aktivitaet, Zeit laeuft weiter", () => {
  const { tr, tick } = setup();
  tr.onState("off");
  tick(5 * MIN);
  tr.onState("heating");
  tick(10 * MIN);
  const v = tr.view();
  assert.equal(v.onSinceAgoMs, 10 * MIN);
  assert.equal(v.lastAgoMs, 10 * MIN);
});

test("Zustandswechsel ausser nach Eco zaehlen als Aktivitaet; gleicher Zustand nicht", () => {
  const { tr, tick } = setup();
  tr.onState("off"); tr.onState("heating");
  tick(3 * MIN); tr.onState("ready");
  tick(4 * MIN); tr.onState("ready");
  assert.equal(tr.view().lastAgoMs, 4 * MIN);
  tick(1 * MIN); tr.onState("eco");
  assert.equal(tr.view().lastAgoMs, 5 * MIN, "Wechsel nach Eco setzt nicht zurueck");
  tick(2 * MIN); tr.onState("heating");
  assert.equal(tr.view().lastAgoMs, 0, "Aufwachen aus Eco ist Aktivitaet");
});

test("Ausschalten loescht die Einschaltzeit", () => {
  const { tr, tick } = setup();
  tr.onState("off"); tr.onState("ready");
  tick(MIN); tr.onState("off");
  assert.equal(tr.view().onSinceAgoMs, null);
});

test("Werte ueberstehen einen Neustart; erster Zustand setzt nichts zurueck", () => {
  const store = new Map<string, string>();
  const a = setup(store);
  a.tr.onState("off"); a.tr.onState("ready");
  const b = new EcoTracker({ get: (k) => store.get(k), set: (k, v) => { store.set(k, v); } }, () => 1_000_000_000 + 20 * MIN);
  b.onState("ready");
  const v = b.view();
  assert.equal(v.onSinceAgoMs, 20 * MIN);
  assert.equal(v.lastAgoMs, 20 * MIN);
});

test("Start bei ausgeschalteter Maschine loescht eine alte Einschaltzeit", () => {
  const store = new Map<string, string>([["eco_on_since", "5"], ["eco_last_activity", "5"]]);
  const { tr } = setup(store);
  tr.onState("disconnected");
  assert.equal(tr.view().onSinceAgoMs, null);
});

test("Route liefert die Abstaende", async () => {
  const { tr } = setup();
  tr.onState("off"); tr.onState("ready");
  const app = Fastify({ logger: false });
  registerEcoTimerRoutes(app, tr);
  const r = await app.inject({ method: "GET", url: "/api/eco-timer" });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { state: "ready", onSinceAgoMs: 0, lastAgoMs: 0 });
});
