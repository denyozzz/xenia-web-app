/** Sieb von Profilen loesen (POST /api/baskets/:id/variants/remove) und Bohnen-Ausblendung (/api/hidden-variants). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";

process.env.DB_PATH = path.join(os.tmpdir(), `basket-unlink-${process.pid}-${Date.now()}.db`);

const { initDb, closeDb, getDb } = await import("../src/db/index.js");
const { applySchema } = await import("../src/db/schema.js");
const { SqliteBasketRepo } = await import("../src/db/basket-repo.js");
const { SqliteSettingsRepo } = await import("../src/db/settings-repo.js");
const { registerBasketVariantRoutes } = await import("../src/routes/basket-variants.js");
const { registerBeanHiddenVariantRoutes } = await import("../src/routes/bean-hidden-variants.js");

after(() => {
  closeDb();
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH!}${s}`, { force: true });
});

initDb();
applySchema();
const repo = new SqliteBasketRepo();
let changed = 0;
const app = Fastify();
registerBasketVariantRoutes(app, repo, () => { changed++; });
registerBeanHiddenVariantRoutes(app, new SqliteSettingsRepo());

const db = getDb();
const pid = (db.prepare("SELECT id FROM profile WHERE kind = 'brew' ORDER BY id").get() as { id: number }).id;
const variantsOf = () => db.prepare("SELECT * FROM profile_variant WHERE profile_id = ? ORDER BY sort_order, id").all(pid) as any[];

test("loest eine 'wie'-Variante wieder, gibt sie nicht doppelt frei", async () => {
  const bid = repo.insert({ name: "Loesen 4er", variantName: "Quad" });
  await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants`, payload: { profileIds: [pid] } });
  const n = variantsOf().length;
  const r = await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants/remove`, payload: { profileIds: [pid] } });
  assert.equal(r.json().removed, 1);
  assert.equal(variantsOf().length, n - 1);
  assert.equal(variantsOf().some((v) => v.default_basket_id === bid), false);
  const again = await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants/remove`, payload: { profileIds: [pid] } });
  assert.equal(again.json().removed, 0);
});

test("behaelt Grundplaetze, Varianten mit eigener Kurve und Vorbilder anderer Varianten", async () => {
  const vs = variantsOf();
  const slot = vs.find((v) => v.legacy_slot !== null && v.default_basket_id !== null);
  assert.ok(slot, "Beispielprofil hat Grundplatz-Variante mit Sieb");
  const r = await app.inject({ method: "POST", url: `/api/baskets/${slot.default_basket_id}/variants/remove`, payload: { profileIds: [pid] } });
  assert.equal(r.json().removed, 0);
  assert.ok(r.json().kept.length >= 1);
  assert.equal(variantsOf().length, vs.length);
});

test("Ausblenden je Bohne: setzen, wieder zeigen, Pruefung", async () => {
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/hidden-variants" })).json().hidden, {});
  await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: 7, variantId: 3, hidden: true } });
  await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: 7, variantId: 3, hidden: true } });
  await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: 7, variantId: 1, hidden: true } });
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/hidden-variants" })).json().hidden, { "7": [1, 3] });
  await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: 7, variantId: 1, hidden: false } });
  await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: 7, variantId: 3, hidden: false } });
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/hidden-variants" })).json().hidden, {});
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/hidden-variants" })).json().shown, { "7": [1, 3] }, "ausdrueckliches Einblenden bleibt gemerkt");
  assert.equal((await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: "x", variantId: 1, hidden: true } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PUT", url: "/api/hidden-variants", payload: { coffeeId: 1, variantId: 1 } })).statusCode, 400);
});
