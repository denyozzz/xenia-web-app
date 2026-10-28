/** Notiz des letzten bewerteten gleichen Bezugs im Start-Dialog (preshot-defaults -> lastNote). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";

process.env.DB_PATH = path.join(os.tmpdir(), `last-note-${process.pid}-${Date.now()}.db`);

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

const coffee = id(db.prepare("INSERT INTO coffee (name, created_at, updated_at) VALUES ('Notiz-Bohne', ?, ?)").run(now, now));
const bean = id(db.prepare("INSERT INTO bean (coffee_id, created_at, updated_at) VALUES (?, ?, ?)").run(coffee, now, now));
const grinder = id(db.prepare("INSERT INTO grinder (name, created_at, updated_at) VALUES ('Sculptor', ?, ?)").run(now, now));
const basketA = (db.prepare("SELECT id FROM basket ORDER BY id LIMIT 1").get() as { id: number }).id;
const basketB = id(db.prepare("INSERT INTO basket (name, type, created_at, updated_at) VALUES ('Zweites', 'single', ?, ?)").run(now, now));
const profiles = new SqliteProfileRepo();
const steps = { version: 1 as const, steps: [{ kind: "flow" as const, targetFlowGs: 1.4, exit: {} }] };
const prof = profiles.insert({ name: "P1", scriptIdSingle: null, brewSteps: steps, yieldTargetSingleG: 36 });

let t = now - 100_000;
const shot = (p: { basket: number; note: string | null; grindNote: string | null }) =>
  id(db.prepare(
    `INSERT INTO shot (profile_id, basket_id, shot_size, category, started_at, ended_at, bean_id, grinder_id, grind_setting, notes, grind_note)
     VALUES (?, ?, 'single', 'brew', ?, ?, ?, ?, 15, ?, ?)`,
  ).run(prof, p.basket, (t += 1000), t + 500, bean, grinder, p.note, p.grindNote));

const app = Fastify({ logger: false });
registerShotRoutes(app, {} as never, new SqliteShotRepo(), {} as never, new SqliteBeanRepo(), new SqliteProfileRepo(), {} as never, {} as never, () => {}, {} as never);
const lastNote = async (basketId: number) => {
  const q = new URLSearchParams({ beanId: String(bean), grinderId: String(grinder), profileId: String(prof), basketId: String(basketId) });
  return ((await app.inject({ method: "GET", url: `/api/shots/preshot-defaults?${q}` })).json() as { lastNote?: { notes: string } | null }).lastNote ?? null;
};

test("ohne Bezuege keine Notiz", async () => {
  assert.equal(await lastNote(basketA), null);
});

test("Notiz des bewerteten Bezugs erscheint beim naechsten gleichen Bezug", async () => {
  shot({ basket: basketA, note: "Vorinfusion laenger, Kanaele am Rand", grindNote: "coarser" });
  assert.equal((await lastNote(basketA))?.notes, "Vorinfusion laenger, Kanaele am Rand");
});

test("ein nicht bewerteter Bezug dazwischen ist egal - die Notiz bleibt", async () => {
  shot({ basket: basketA, note: "ungewertet", grindNote: null });
  shot({ basket: basketA, note: null, grindNote: null });
  assert.equal((await lastNote(basketA))?.notes, "Vorinfusion laenger, Kanaele am Rand");
});

test("anderes Sieb: eigene Historie, die Notiz gilt dort nicht", async () => {
  assert.equal(await lastNote(basketB), null);
});

test("erst der naechste bewertete gleiche Bezug loest die Notiz ab - ohne eigene Notiz verschwindet sie", async () => {
  shot({ basket: basketA, note: null, grindNote: "ok" });
  assert.equal(await lastNote(basketA), null);
});

test("hat der neue bewertete Bezug eine Notiz, gilt diese", async () => {
  shot({ basket: basketA, note: "  etwas feiner, passt dann  ", grindNote: "finer" });
  assert.equal((await lastNote(basketA))?.notes, "etwas feiner, passt dann");
});

test("nur Leerzeichen als Notiz gilt als keine", async () => {
  shot({ basket: basketA, note: "   ", grindNote: "ok" });
  assert.equal(await lastNote(basketA), null);
});
