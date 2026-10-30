/** Patch 141: Beanconqueror-QR-Import. */
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { parseQrInput, mapServerBean, mapRoast, registerBeanconquerorRoutes } from "../src/routes/beanconqueror.js";

const SAMPLE = {
  name: "Gemischte Tüte",
  roaster: "Teströsterei",
  roast: 9,
  roast_range: 0,
  roastingDate: "2026-10-20T00:00:00",
  aromatics: "Schokolade, Nuss; Karamell, schokolade",
  weight: 250,
  cost: 9.9,
  decaffeinated: false,
  url: "https://example.com/bohne",
  note: "",
  bean_roasting_type: 1,
  beanMix: 2,
  bean_information: [
    { country: "Brasilien", variety: "Arabica", percentage: 70, elevation: "1.100 - 1.300 m", processing: "Natural" },
    { country: "Indien", variety: "Robusta", percentage: 30, elevation: "", processing: "Washed" },
  ],
  beanNote: { roasterDescription: "<p>Kräftig &amp; rund</p>", brewAdvices: "18 g → 36 g", attachments: [] },
  attachment: [{ name: "a", extension: ".jpg", path: "", uri: "https://img.example/a.jpg" }, { uri: "http://unsicher/b.jpg" }],
  qr_code: "abc123",
  error: null,
};

test("Code aus Link oder reinem Code", () => {
  assert.equal(parseQrInput("https://beanconqueror.com/?qr=e7ada0a6"), "e7ada0a6");
  assert.equal(parseQrInput("https://beanconqueror.com?qr=e7ada0a6#x"), "e7ada0a6");
  assert.equal(parseQrInput("https://beanconqueror.com/bean.html?id=XY_12"), "XY_12");
  assert.equal(parseQrInput("  e7ada0a6 "), "e7ada0a6");
  assert.equal(parseQrInput("https://beanconqueror.com/"), null);
  assert.equal(parseQrInput("a b c"), null);
  assert.equal(parseQrInput(""), null);
});

test("Röstgrad: 14 Stufen bzw. Bereich -> hell/mittel/dunkel", () => {
  assert.equal(mapRoast(3, 0), "light");
  assert.equal(mapRoast(6, 0), "medium");
  assert.equal(mapRoast(12, 0), "dark");
  assert.equal(mapRoast(0, 4), "dark");
  assert.equal(mapRoast(13, 1), "light");
  assert.equal(mapRoast(0, 0), undefined);
});

test("Abbildung auf den JSON-Import", () => {
  const m = mapServerBean(SAMPLE, "abc123");
  const i = m.import;
  assert.equal(i.name, "Gemischte Tüte");
  assert.equal(i.roaster, "Teströsterei");
  assert.equal(i.roastLevel, "dark");
  assert.equal(i.brewType, "espresso");
  assert.equal(i.arabicaPct, 70);
  assert.equal(i.country, "Brasilien, Indien");
  assert.equal(i.altitudeMin, 1100);
  assert.equal(i.altitudeMax, 1300);
  assert.deepEqual(i.flavorNotes, ["Schokolade", "Nuss", "Karamell"]);
  assert.deepEqual(i.firstRoasting, { roastDate: "2026-10-20", bagSizeG: 250, pricePerBagEur: 9.9 });
  assert.match(i.notes!, /Kräftig & rund/);
  assert.match(i.notes!, /Brühempfehlung: 18 g → 36 g/);
  assert.match(i.notes!, /Beanconqueror-QR: abc123/);
  assert.deepEqual(m.images, ["https://img.example/a.jpg"]);
});

test("Nur Arabica -> 100 %, ohne Angabe -> nichts", () => {
  assert.equal(mapServerBean({ name: "x", bean_information: [{ variety: "Arabica Bourbon" }] }, "q").import.arabicaPct, 100);
  assert.equal(mapServerBean({ name: "x", bean_information: [{ variety: "Bourbon" }] }, "q").import.arabicaPct, undefined);
  assert.equal(mapServerBean({ name: "x", bean_information: [{ variety: "Robusta" }] }, "q").import.arabicaPct, 0);
});

function fakeFetch(map: Record<string, { status?: number; json?: unknown; bytes?: Uint8Array; type?: string }>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const e = map[url];
    if (!e) throw new Error("offline");
    return {
      ok: (e.status ?? 200) < 400,
      status: e.status ?? 200,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? e.type ?? null : null) },
      json: async () => e.json,
      arrayBuffer: async () => (e.bytes ?? new Uint8Array()).buffer as ArrayBuffer,
    };
  };
  return { f, calls };
}

const API = "https://backend.beanconqueror.com/Roaster/GetBeanFromQrCodeId?id=";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test("Route liefert Import; Fehlerfälle", async () => {
  const { f } = fakeFetch({
    [API + "abc123"]: { json: SAMPLE },
    [API + "nope"]: { json: { error: { errorCode: "beannotapproved", message: "" } } },
    "https://img.example/a.jpg": { bytes: JPEG, type: "image/jpeg" },
  });
  const app = Fastify({ logger: false });
  registerBeanconquerorRoutes(app, { fetch: f });
  const ok = await app.inject({ method: "GET", url: "/api/beanconqueror/qr?code=" + encodeURIComponent("https://beanconqueror.com/?qr=abc123") });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().qr, "abc123");
  assert.equal(ok.json().hasImage, true);
  assert.equal(ok.json().import.name, "Gemischte Tüte");

  assert.equal((await app.inject({ method: "GET", url: "/api/beanconqueror/qr?code=" })).statusCode, 400);
  const na = await app.inject({ method: "GET", url: "/api/beanconqueror/qr?code=nope" });
  assert.equal(na.statusCode, 404);
  assert.match(na.json().error, /nicht freigegeben/);
  assert.equal((await app.inject({ method: "GET", url: "/api/beanconqueror/qr?code=offline1" })).statusCode, 502);

  const img = await app.inject({ method: "GET", url: "/api/beanconqueror/qr-image?code=abc123" });
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers["content-type"], "image/jpeg");
  assert.equal(img.rawPayload.length, JPEG.length);
});

test("Bild nur von Adressen aus der Beanconqueror-Antwort, kein Bild -> 404", async () => {
  const { f, calls } = fakeFetch({
    [API + "abc123"]: { json: { ...SAMPLE, attachment: [{ uri: "https://img.example/kaputt.jpg" }] } },
    "https://img.example/kaputt.jpg": { bytes: new Uint8Array([1, 2, 3]), type: "image/jpeg" },
  });
  const app = Fastify({ logger: false });
  registerBeanconquerorRoutes(app, { fetch: f });
  const r = await app.inject({ method: "GET", url: "/api/beanconqueror/qr-image?code=abc123&url=https://evil" });
  assert.equal(r.statusCode, 404);
  assert.deepEqual(calls, [API + "abc123", "https://img.example/kaputt.jpg"]);
});
