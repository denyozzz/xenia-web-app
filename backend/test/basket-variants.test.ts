/** Neues Sieb -> Varianten in gewaehlten Profilen (POST /api/baskets/:id/variants). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";

process.env.DB_PATH = path.join(os.tmpdir(), `basket-variants-${process.pid}-${Date.now()}.db`);

const { initDb, closeDb, getDb } = await import("../src/db/index.js");
const { applySchema } = await import("../src/db/schema.js");
const { SqliteBasketRepo } = await import("../src/db/basket-repo.js");
const { registerBasketVariantRoutes } = await import("../src/routes/basket-variants.js");

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

const db = getDb();
const profiles = db.prepare("SELECT id, kind FROM profile ORDER BY id").all() as { id: number; kind: string }[];
const brew = profiles.filter((p) => p.kind === "brew");
const variantsOf = (pid: number) => db.prepare("SELECT * FROM profile_variant WHERE profile_id = ? ORDER BY sort_order, id").all(pid) as any[];

test("legt eine Variante 'wie' der gewaehlten an, mit Sieb als Vorgabe", async () => {
  assert.ok(brew.length > 0, "Beispielprofile vorhanden");
  const pid = brew[0]!.id;
  const before = variantsOf(pid);
  const bid = repo.insert({ name: "Test 4er", nominalDoseG: 22, targetYieldG: 55 });
  const r = await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants`, payload: { profileIds: [pid], likeName: before[0].name } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().created, 1);
  const after_ = variantsOf(pid);
  assert.equal(after_.length, before.length + 1);
  const v = after_[after_.length - 1];
  assert.equal(v.name, "Test 4er");
  assert.equal(v.default_basket_id, bid);
  assert.equal(v.yield_g, 55);
  assert.equal(v.script_id, null);
  assert.equal(v.brew_steps, null);
  assert.equal(v.same_as_id, before[0].same_as_id ?? before[0].id);
  assert.equal(v.legacy_slot, null);
  assert.equal(changed, 1);
});

test("ein zweiter Aufruf legt nichts doppelt an", async () => {
  const pid = brew[0]!.id;
  const bid = (db.prepare("SELECT id FROM basket WHERE name = 'Test 4er'").get() as { id: number }).id;
  const n = variantsOf(pid).length;
  const r = await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants`, payload: { profileIds: [pid] } });
  assert.equal(r.json().created, 0);
  assert.deepEqual(r.json().skipped, [pid]);
  assert.equal(variantsOf(pid).length, n);
});

test("Kette: zeigt die Quelle selbst auf eine andere, gilt deren Ziel", async () => {
  const pid = brew[brew.length - 1]!.id;
  const vs = variantsOf(pid);
  const bid = repo.insert({ name: "Kette 5er" });
  await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants`, payload: { profileIds: [pid] } });
  const first = variantsOf(pid).find((v) => v.name === "Kette 5er");
  const last = vs[vs.length - 1];
  assert.equal(first.same_as_id, last.same_as_id ?? last.id);
  const bid2 = repo.insert({ name: "Kette 6er" });
  await app.inject({ method: "POST", url: `/api/baskets/${bid2}/variants`, payload: { profileIds: [pid] } });
  const second = variantsOf(pid).find((v) => v.name === "Kette 6er");
  assert.equal(second.same_as_id, first.same_as_id, "zeigt auf die Kurve, nicht auf die Variante davor");
});

test("Wartungsprofil und ungueltige Eingaben", async () => {
  const bid = repo.insert({ name: "Nur Test" });
  const maint = profiles.find((p) => p.kind === "maintenance");
  if (maint) {
    const r = await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants`, payload: { profileIds: [maint.id] } });
    assert.equal(r.json().created, 0);
  }
  assert.equal((await app.inject({ method: "POST", url: `/api/baskets/${bid}/variants`, payload: { profileIds: [] } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: `/api/baskets/99999/variants`, payload: { profileIds: [1] } })).statusCode, 404);
});
