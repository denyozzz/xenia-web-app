/** Dosis-Empfehlung im Start-Dialog (preshot-defaults -> doseAdvice) aus der Dosis-Bewertung des letzten bewerteten Bezugs. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";

process.env.DB_PATH = path.join(os.tmpdir(), `dose-advice-${process.pid}-${Date.now()}.db`);

const { initDb, closeDb, getDb } = await import("../src/db/index.js");
const { applySchema } = await import("../src/db/schema.js");
const { SqliteShotRepo } = await import("../src/db/shot-repo.js");
const { SqliteBeanRepo } = await import("../src/db/bean-repo.js");
const { SqliteProfileRepo } = await import("../src/db/profile-repo.js");
const { registerShotRoutes } = await import("../src/routes/shots.js");

after(() => {
  closeDb();
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH!}${s}`, { force: true });
});

initDb();
applySchema();
const db = getDb();
const now = Date.now();
const id = (r: unknown) => Number((r as { lastInsertRowid: number }).lastInsertRowid);

const coffee = id(db.prepare("INSERT INTO coffee (name, created_at, updated_at) VALUES ('Dosis-Bohne', ?, ?)").run(now, now));
const bean = id(db.prepare("INSERT INTO bean (coffee_id, created_at, updated_at) VALUES (?, ?, ?)").run(coffee, now, now));
const grinder = id(db.prepare("INSERT INTO grinder (name, created_at, updated_at) VALUES ('Sculptor', ?, ?)").run(now, now));
const basketA = (db.prepare("SELECT id FROM basket ORDER BY id LIMIT 1").get() as { id: number }).id;
const basketB = id(db.prepare("INSERT INTO basket (name, type, created_at, updated_at) VALUES ('Zweites', 'single', ?, ?)").run(now, now));
const profiles = new SqliteProfileRepo();
const steps = { version: 1 as const, steps: [{ kind: "flow" as const, targetFlowGs: 1.4, exit: {} }] };
const prof = profiles.insert({ name: "P1", scriptIdSingle: null, brewSteps: steps, yieldTargetSingleG: 36 });

let t = now - 100_000;
const shot = (p: { basket: number; dose: number | null; doseNote: string | null }) =>
  id(db.prepare(
    `INSERT INTO shot (profile_id, basket_id, shot_size, category, started_at, ended_at, bean_id, grinder_id, grind_setting, dose_g, dose_note)
     VALUES (?, ?, 'single', 'brew', ?, ?, ?, ?, 15, ?, ?)`,
  ).run(prof, p.basket, (t += 1000), t + 500, bean, grinder, p.dose, p.doseNote));

const app = Fastify({ logger: false });
registerShotRoutes(app, {} as never, new SqliteShotRepo(), {} as never, new SqliteBeanRepo(), new SqliteProfileRepo(), {} as never, () => {}, {} as never);
const advice = async (basketId: number) => {
  const q = new URLSearchParams({ beanId: String(bean), grinderId: String(grinder), profileId: String(prof), basketId: String(basketId) });
  return ((await app.inject({ method: "GET", url: `/api/shots/preshot-defaults?${q}` })).json() as { doseAdvice?: { doseG: number; lastDoseG: number; note: string } | null }).doseAdvice ?? null;
};

test("ohne bewertete Dosis keine Empfehlung", async () => {
  shot({ basket: basketA, dose: 18, doseNote: null });
  assert.equal(await advice(basketA), null);
});

test("passt: die Dosis wird uebernommen", async () => {
  shot({ basket: basketA, dose: 18.2, doseNote: "ok" });
  const a = await advice(basketA);
  assert.deepEqual([a?.doseG, a?.lastDoseG, a?.note], [18.2, 18.2, "ok"]);
});

test("mehr: plus 1 g, weniger: minus 1 g", async () => {
  shot({ basket: basketA, dose: 18, doseNote: "more" });
  assert.equal((await advice(basketA))?.doseG, 19);
  shot({ basket: basketA, dose: 17.5, doseNote: "less" });
  assert.equal((await advice(basketA))?.doseG, 16.5);
});

test("nur der letzte bewertete Bezug zaehlt, unbewertete dazwischen nicht", async () => {
  shot({ basket: basketA, dose: 20, doseNote: null });
  assert.equal((await advice(basketA))?.doseG, 16.5);
  shot({ basket: basketA, dose: 16.5, doseNote: "ok" });
  assert.equal((await advice(basketA))?.doseG, 16.5);
});

test("anderes Sieb: eigene Historie", async () => {
  assert.equal(await advice(basketB), null);
});

test("PUT akzeptiert doseNote, lehnt Unsinn ab", async () => {
  const sid = shot({ basket: basketB, dose: 18, doseNote: null });
  const ok = await app.inject({ method: "PUT", url: `/api/shots/${sid}`, payload: { doseNote: "more" } });
  assert.equal(ok.statusCode, 200);
  assert.equal((await advice(basketB))?.doseG, 19);
  const bad = await app.inject({ method: "PUT", url: `/api/shots/${sid}`, payload: { doseNote: "viel" } });
  assert.equal(bad.statusCode, 400);
});
