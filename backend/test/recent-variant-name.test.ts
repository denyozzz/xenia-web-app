/** Dashboard-"Letzte Bezuege": Sieb-/Variantenname statt 1x/2x (listRecentBrew -> variantName). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.DB_PATH = path.join(os.tmpdir(), `recent-variant-${process.pid}-${Date.now()}.db`);

const { initDb, closeDb, getDb } = await import("../src/db/index.js");
const { applySchema } = await import("../src/db/schema.js");
const { SqliteShotRepo } = await import("../src/db/shot-repo.js");

after(() => {
  closeDb();
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH!}${s}`, { force: true });
});

initDb();
applySchema();
const db = getDb();
const now = Date.now();
const id = (r: unknown) => Number((r as { lastInsertRowid: number }).lastInsertRowid);

const basket = id(db.prepare("INSERT INTO basket (name, type, variant_name, created_at, updated_at) VALUES ('Triple IMS', 'single', 'Triple', ?, ?)").run(now, now));
const plain = id(db.prepare("INSERT INTO basket (name, type, created_at, updated_at) VALUES ('Ohne Namen', 'double', ?, ?)").run(now, now));
const ins = (b: number | null, t: number) =>
  id(db.prepare("INSERT INTO shot (shot_size, category, started_at, ended_at, basket_id) VALUES ('single', 'brew', ?, ?, ?)").run(t, t + 500, b));

test("Variantenname des Siebs wird mitgegeben, auch wenn shot_size nur single/double kennt", () => {
  const a = ins(basket, now + 1000);
  const r = new SqliteShotRepo().listRecentBrew(5).find((s) => s.id === a)!;
  assert.equal(r.variantName, "Triple");
  assert.equal(r.shotSize, "single");
});

test("ohne Variantennamen und ohne Sieb: null (Karte nimmt das Groessenkuerzel)", () => {
  const b = ins(plain, now + 2000);
  const c = ins(null, now + 3000);
  const list = new SqliteShotRepo().listRecentBrew(5);
  assert.equal(list.find((s) => s.id === b)!.variantName, null);
  assert.equal(list.find((s) => s.id === c)!.variantName, null);
});
