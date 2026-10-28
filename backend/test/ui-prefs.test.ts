/** Anzeige-Einstellungen fuer alle Geraete (/api/ui-prefs). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";

process.env.DB_PATH = path.join(os.tmpdir(), `ui-prefs-${process.pid}-${Date.now()}.db`);

const { initDb, closeDb } = await import("../src/db/index.js");
const { applySchema } = await import("../src/db/schema.js");
const { SqliteSettingsRepo } = await import("../src/db/settings-repo.js");
const { registerUiPrefRoutes } = await import("../src/routes/ui-prefs.js");

after(() => {
  closeDb();
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH!}${s}`, { force: true });
});

initDb();
applySchema();
const app = Fastify();
registerUiPrefRoutes(app, new SqliteSettingsRepo());

test("ungesetzt = null, setzen je Ansicht, beide unabhaengig", async () => {
  const g = async () => (await app.inject({ method: "GET", url: "/api/ui-prefs" })).json();
  assert.deepEqual([(await g()).sayingSimple, (await g()).sayingExpert], [null, null]);
  assert.equal((await app.inject({ method: "PUT", url: "/api/ui-prefs", payload: { sayingExpert: true } })).statusCode, 200);
  assert.deepEqual([(await g()).sayingSimple, (await g()).sayingExpert], [null, true]);
  await app.inject({ method: "PUT", url: "/api/ui-prefs", payload: { sayingSimple: false } });
  assert.deepEqual([(await g()).sayingSimple, (await g()).sayingExpert], [false, true]);
  await app.inject({ method: "PUT", url: "/api/ui-prefs", payload: { sayingExpert: false, sayingSimple: true } });
  assert.deepEqual([(await g()).sayingSimple, (await g()).sayingExpert], [true, false]);
});

test("ungueltige Angaben werden abgelehnt", async () => {
  for (const payload of [{}, { sayingSimple: "ja" }, { sayingExpert: 1 }, { foo: true }]) {
    assert.equal((await app.inject({ method: "PUT", url: "/api/ui-prefs", payload })).statusCode, 400);
  }
});
