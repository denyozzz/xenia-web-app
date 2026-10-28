/** Variantenname am Sieb: Umstellung (Rang nach Dosis), Pruefung und Variante mit dem Namen. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";

process.env.DB_PATH = path.join(os.tmpdir(), `basket-vname-${process.pid}-${Date.now()}.db`);

const { initDb, closeDb, getDb } = await import("../src/db/index.js");
const { applySchema, migrateBasketDetails } = await import("../src/db/schema.js");
const { SqliteBasketRepo } = await import("../src/db/basket-repo.js");
const { registerBasketRoutes } = await import("../src/routes/baskets.js");
const { registerBasketVariantRoutes } = await import("../src/routes/basket-variants.js");

after(() => {
  closeDb();
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH!}${s}`, { force: true });
});

test("Umstellung: die drei Siebe mit der kleinsten Nenndosis heissen Single / Double / Triple; ein zweiter Lauf aendert nichts", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE basket (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'single', created_at INTEGER, updated_at INTEGER)");
  migrateBasketDetails(db);
  db.exec("DROP TABLE basket");
  db.exec("CREATE TABLE basket (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'single', description TEXT, nominal_dose_g REAL, target_yield_g REAL, created_at INTEGER, updated_at INTEGER)");
  const ins = db.prepare("INSERT INTO basket (name, nominal_dose_g, created_at, updated_at) VALUES (?, ?, 0, 0)");
  ins.run("Gross", 21); ins.run("Ohne", null); ins.run("Klein", 9); ins.run("Mittel", 18); ins.run("Riese", 24);
  migrateBasketDetails(db);
  const names = () => db.prepare("SELECT name, variant_name FROM basket ORDER BY id").all().map((r: any) => [r.name, r.variant_name]);
  assert.deepEqual(names(), [["Gross", "Triple"], ["Ohne", null], ["Klein", "Single"], ["Mittel", "Double"], ["Riese", null]]);
  db.prepare("UPDATE basket SET variant_name = NULL WHERE name = 'Gross'").run();
  migrateBasketDetails(db);
  assert.equal((names()[0] as any[])[1], null, "nur beim Anlegen der Spalte");
});

initDb();
applySchema();
const repo = new SqliteBasketRepo();
const app = Fastify();
registerBasketRoutes(app, repo);
registerBasketVariantRoutes(app, repo);

test("Routen: Variantenname speichern, leeren, Doppelte und Zu-Langes ablehnen", async () => {
  const a = (await app.inject({ method: "POST", url: "/api/baskets", payload: { name: "Sieb A", variantName: "  Quad " } })).json().id;
  assert.equal(repo.findById(a)!.variantName, "Quad");
  const dup = await app.inject({ method: "POST", url: "/api/baskets", payload: { name: "Sieb B", variantName: "Quad" } });
  assert.equal(dup.statusCode, 409);
  const long = await app.inject({ method: "POST", url: "/api/baskets", payload: { name: "Sieb C", variantName: "x".repeat(21) } });
  assert.equal(long.statusCode, 400);
  assert.equal((await app.inject({ method: "PUT", url: `/api/baskets/${a}`, payload: { variantName: "Quad" } })).statusCode, 200, "sich selbst nicht als Doppelt");
  assert.equal((await app.inject({ method: "PUT", url: `/api/baskets/${a}`, payload: { variantName: "" } })).statusCode, 200);
  assert.equal(repo.findById(a)!.variantName, null);
});

test("neue Variante in Profilen heisst wie der Variantenname, ohne Namen wie das Sieb", async () => {
  const brew = (getDb().prepare("SELECT id FROM profile WHERE kind = 'brew' ORDER BY id").all() as { id: number }[]).map((p) => p.id);
  assert.ok(brew.length >= 1);
  const named = repo.insert({ name: "Sieb Q", variantName: "Quad" });
  const plain = repo.insert({ name: "Sieb P" });
  await app.inject({ method: "POST", url: `/api/baskets/${named}/variants`, payload: { profileIds: [brew[0]] } });
  await app.inject({ method: "POST", url: `/api/baskets/${plain}/variants`, payload: { profileIds: [brew[0]] } });
  const nameOf = (pid: number, bid: number) => (getDb().prepare("SELECT name FROM profile_variant WHERE profile_id = ? AND default_basket_id = ?").get(pid, bid) as { name: string }).name;
  assert.equal(nameOf(brew[0]!, named), "Quad");
  assert.equal(nameOf(brew[0]!, plain), "Sieb P");
});
