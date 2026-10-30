/** Ratio je Bohne (Sorte): PUT/GET /api/shots/coffee-ratio und beanRatio in preshot-defaults. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";

process.env.DB_PATH = path.join(os.tmpdir(), `bean-ratio-${process.pid}-${Date.now()}.db`);

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
const coffee = id(db.prepare("INSERT INTO coffee (name, created_at, updated_at) VALUES ('Ratio-Bohne', ?, ?)").run(now, now));
const bean = id(db.prepare("INSERT INTO bean (coffee_id, created_at, updated_at) VALUES (?, ?, ?)").run(coffee, now, now));
const coffee2 = id(db.prepare("INSERT INTO coffee (name, created_at, updated_at) VALUES ('Andere', ?, ?)").run(now, now));
const bean2 = id(db.prepare("INSERT INTO bean (coffee_id, created_at, updated_at) VALUES (?, ?, ?)").run(coffee2, now, now));
const basket = (db.prepare("SELECT id FROM basket ORDER BY id LIMIT 1").get() as { id: number }).id;
const grinder = id(db.prepare("INSERT INTO grinder (name, created_at, updated_at) VALUES ('Sculptor', ?, ?)").run(now, now));
const prof = new SqliteProfileRepo().insert({ name: "P1", scriptIdSingle: null, brewSteps: { version: 1 as const, steps: [{ kind: "flow" as const, targetFlowGs: 1.4, exit: {} }] }, yieldTargetSingleG: 30 });

const store = new Map<string, string>();
const settings = { get: (k: string) => store.get(k), getAll: () => new Map(store), insertIfAbsent: (k: string, v: string) => { if (!store.has(k)) store.set(k, v); }, set: (k: string, v: string) => { store.set(k, v); }, delete: (k: string) => { store.delete(k); } };
const app = Fastify({ logger: false });
registerShotRoutes(app, {} as never, new SqliteShotRepo(), {} as never, new SqliteBeanRepo(), new SqliteProfileRepo(), {} as never, () => {}, {} as never, settings as never);

const put = (body: unknown) => app.inject({ method: "PUT", url: "/api/shots/coffee-ratio", payload: body as object });
const defaults = async (b: number) => {
  const q = new URLSearchParams({ beanId: String(b), grinderId: String(grinder), profileId: String(prof), basketId: String(basket) });
  return (await app.inject({ method: "GET", url: `/api/shots/preshot-defaults?${q}` })).json() as { beanRatio?: number | null };
};

test("ohne Ratio: beanRatio null", async () => {
  assert.equal((await defaults(bean)).beanRatio ?? null, null);
});

test("Ratio speichern, lesen, im Start-Dialog mitgeben - nur fuer diese Bohne", async () => {
  assert.equal((await put({ coffeeId: coffee, ratio: 2.2 })).statusCode, 200);
  const g = await app.inject({ method: "GET", url: `/api/shots/coffee-ratio?coffeeId=${coffee}` });
  assert.equal((g.json() as { ratio: number | null }).ratio, 2.2);
  assert.equal((await defaults(bean)).beanRatio, 2.2);
  assert.equal((await defaults(bean2)).beanRatio ?? null, null);
});

test("Ratio auf eine Nachkommastelle gerundet, null loescht", async () => {
  await put({ coffeeId: coffee, ratio: 2.25 });
  assert.equal((await defaults(bean)).beanRatio, 2.3);
  assert.equal((await put({ coffeeId: coffee, ratio: null })).statusCode, 200);
  assert.equal((await defaults(bean)).beanRatio ?? null, null);
});

test("Unsinn wird abgelehnt", async () => {
  for (const ratio of [0, -1, 0.5, 30, "viel"]) assert.equal((await put({ coffeeId: coffee, ratio })).statusCode, 400);
  assert.equal((await put({ coffeeId: "x", ratio: 2 })).statusCode, 400);
});

test("das Profil bleibt unveraendert (Yield 30)", () => {
  assert.equal(new SqliteProfileRepo().findById(prof)?.yieldTargetSingleG, 30);
});
