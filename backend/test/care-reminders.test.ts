/** Pflege-Erinnerungen (Patch 128): "mit Fettloeser" fester Takt, "ohne Fettloeser" fuellt die Luecken; Erledigt, Spaeter/unsnooze, Wartungsprofile, Einstellungen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerCareReminderRoutes } from "../src/routes/care-reminders.js";

const DAY = 86_400_000;
type Item = { id: string; title: string; due: boolean; daysAgo: number; intervalDays: number; enabled: boolean; profileIds: number[]; auto: boolean; dueInDays: number };

function setup() {
  const store = new Map<string, string>();
  const settings = { get: (k: string) => store.get(k), getAll: () => new Map(store), insertIfAbsent: (k: string, v: string) => { if (!store.has(k)) store.set(k, v); }, set: (k: string, v: string) => { store.set(k, v); }, delete: (k: string) => { store.delete(k); } };
  const runs = new Map<number, number>();
  const log = { insert: () => {}, lastRanAt: (ids: number[]) => { const t = ids.map((i) => runs.get(i) ?? 0); return t.length && Math.max(...t) > 0 ? Math.max(...t) : null; } };
  const app = Fastify({ logger: false });
  registerCareReminderRoutes(app, settings as never, log as never);
  const items = async () => ((await app.inject({ method: "GET", url: "/api/care-reminders" })).json() as { items: Item[] }).items;
  const by = async (id: string) => (await items()).find((i) => i.id === id)!;
  /** Letzter Lauf dieser Erinnerung vor n Tagen (Baseline setzen; vorher einmal lesen, damit die Vorgaben angelegt sind). */
  const last = (id: string, days: number) => store.set(`care_${id}_baseline`, String(Date.now() - days * DAY));
  const post = (url: string) => app.inject({ method: "POST", url });
  const put = (id: string, payload: unknown) => app.inject({ method: "PUT", url: `/api/care-reminders/${id}`, payload: payload as object });
  /** [ohne faellig, mit faellig] */
  const dues = async () => (await items()).slice(0, 2).map((i) => i.due);
  return { app, store, runs, items, by, last, post, put, dues };
}

test("Reihenfolge, Namen, Vorgaben 14/28/28; nichts sofort faellig; zuerst ohne Fettloeser", async () => {
  const { items } = setup();
  const l = await items();
  assert.deepEqual(l.map((i) => i.title), ["Rückspülen ohne Kaffeefettlöser", "Rückspülen mit Kaffeefettlöser", "Duschsieb reinigen"]);
  assert.ok(l.every((i) => !i.due && i.enabled));
  assert.deepEqual(l.map((i) => i.intervalDays), [14, 28, 28]);
  assert.deepEqual(l.map((i) => i.auto), [true, true, false]);
  // Beim ersten Lesen werden die Baselines angelegt; ein paar ms Versatz koennen beim Aufrunden einen Tag ausmachen.
  assert.ok(l[0]!.dueInDays >= 13 && l[0]!.dueInDays <= 15);
  assert.ok(l[1]!.dueInDays >= 27 && l[1]!.dueInDays <= 29);
});

test("Takt 10/28: ohne an Tag 10 und 20, an Tag 30 entfaellt es, weil mit an Tag 28 frueher dran ist", async () => {
  const { items, last, put, dues } = setup();
  await items();
  await put("flush-water", { intervalDays: 10 });
  // Tag 11: mit vor 11, ohne nie dazwischen -> ohne faellig
  last("flush-cleaner", 11); last("flush-water", 40);
  assert.deepEqual(await dues(), [true, false]);
  // Tag 21: ohne zuletzt an Tag 10 -> wieder ohne faellig
  last("flush-cleaner", 21); last("flush-water", 11);
  assert.deepEqual(await dues(), [true, false]);
  // Tag 25: ohne zuletzt an Tag 20 -> naechstes ohne waere Tag 30, mit kommt an Tag 28 -> ohne entfaellt
  last("flush-cleaner", 25); last("flush-water", 5);
  const l = await items();
  assert.deepEqual([l[0]!.due, l[1]!.due], [false, false]);
  assert.equal(l[1]!.dueInDays, 3);
  assert.equal(l[0]!.dueInDays, 13); // erst nach dem mit (Tag 28) + 10
  // Tag 29: mit faellig, ohne nicht
  last("flush-cleaner", 29); last("flush-water", 9);
  assert.deepEqual(await dues(), [false, true]);
});

test("ohne ist auch dann nicht faellig, wenn es ueberfaellig ist, solange mit faellig ist", async () => {
  const { items, last, dues } = setup();
  await items();
  last("flush-cleaner", 30); last("flush-water", 20);
  assert.deepEqual(await dues(), [false, true]);
});

test("mit erledigt: ohne zaehlt ab dann neu, mit ab dann 28 Tage", async () => {
  const { items, last, post, by } = setup();
  await items();
  last("flush-cleaner", 30); last("flush-water", 20);
  assert.equal((await post("/api/care-reminders/flush-cleaner/done")).statusCode, 200);
  const l = await items();
  assert.deepEqual([l[0]!.due, l[1]!.due], [false, false]);
  assert.equal(l[0]!.dueInDays, 14);
  assert.equal((await by("flush-cleaner")).dueInDays, 28);
});

test("ohne zusaetzlich: verschiebt nur das naechste ohne, mit bleibt fest", async () => {
  const { items, last, by } = setup();
  await items();
  last("flush-cleaner", 10); last("flush-water", 1);
  assert.equal((await by("flush-cleaner")).dueInDays, 18);
  assert.equal((await by("flush-water")).dueInDays, 13);
});

test("Zuletzt zeigt je Art das eigene letzte Rueckspuelen", async () => {
  const { items, last } = setup();
  await items();
  last("flush-cleaner", 12); last("flush-water", 2);
  const l = await items();
  assert.deepEqual([l[0]!.daysAgo, l[1]!.daysAgo], [2, 12]);
});

test("ein Lauf des gewaehlten Wartungsprofils zaehlt als erledigt", async () => {
  const { runs, last, items, put } = setup();
  await items();
  last("flush-water", 40); last("flush-cleaner", 20);
  await put("flush-water", { profileIds: [7] });
  assert.equal((await items())[0]!.due, true);
  runs.set(7, Date.now() - DAY);
  const l = await items();
  assert.deepEqual([l[0]!.due, l[0]!.daysAgo, l[1]!.due], [false, 1, false]);
});

test("ist mit aus, laeuft ohne in seinem eigenen Abstand; ist ohne aus, laeuft mit allein", async () => {
  const { items, last, put, dues } = setup();
  await items();
  last("flush-cleaner", 30); last("flush-water", 15);
  assert.deepEqual(await dues(), [false, true]);
  await put("flush-cleaner", { enabled: false });
  assert.deepEqual(await dues(), [true, false]);
  await put("flush-cleaner", { enabled: true });
  await put("flush-water", { enabled: false });
  assert.deepEqual(await dues(), [false, true]);
});

test("Spaeter blendet aus, unsnooze blendet alle wieder ein", async () => {
  const { items, by, last, post } = setup();
  await items();
  last("showerscreen", 40);
  assert.equal((await by("showerscreen")).due, true);
  await post("/api/care-reminders/showerscreen/snooze");
  assert.equal((await by("showerscreen")).due, false);
  await post("/api/care-reminders/unsnooze");
  assert.equal((await by("showerscreen")).due, true);
});

test("Einstellungen: Intervall, Validierung, Duschsieb ohne Wartungsprofile", async () => {
  const { put, by } = setup();
  await put("showerscreen", { intervalDays: 60 });
  assert.equal((await by("showerscreen")).intervalDays, 60);
  for (const p of [{ intervalDays: 0 }, { intervalDays: 366 }, { intervalDays: "7" }, { enabled: "ja" }, { profileIds: "7" }]) assert.equal((await put("flush-cleaner", p)).statusCode, 400);
  assert.equal((await put("showerscreen", { profileIds: [1] })).statusCode, 400);
  assert.equal((await put("gibtsnicht", { intervalDays: 7 })).statusCode, 404);
});

test("Umstellung auf den Takt: mit Fettloeser einmal von 14 auf 28, danach bleibt die eigene Wahl", async () => {
  const { store, by, put } = setup();
  store.set("care_coupled_v1", "1");
  store.set("care_flush-cleaner_days", "14");
  assert.equal((await by("flush-cleaner")).intervalDays, 28);
  await put("flush-cleaner", { intervalDays: 14 });
  assert.equal((await by("flush-cleaner")).intervalDays, 14);
});

test("Umstellung auf den Takt: ein anderer Wert als 14 bleibt", async () => {
  const { store, by } = setup();
  store.set("care_coupled_v1", "1");
  store.set("care_flush-cleaner_days", "21");
  assert.equal((await by("flush-cleaner")).intervalDays, 21);
});

test("Werte der Vorversion (care_reminders) werden einmal uebernommen", async () => {
  const s = setup();
  s.store.set("care_reminders", JSON.stringify([{ id: "showerscreen", intervalDays: 21, lastDoneAt: Date.now() - 25 * DAY, snoozeUntil: 0 }]));
  const x = await s.by("showerscreen");
  assert.deepEqual([x.intervalDays, x.due, x.daysAgo], [21, true, 25]);
});
