import { test, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerCommunityRoutes } from "../src/routes/community.js";

const apps: FastifyInstance[] = [];
after(async () => { await Promise.all(apps.map((app) => app.close())); });

function makeSettingsRepo(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: string) => { values.set(key, value); },
    readIds: () => JSON.parse(values.get("visualizer_not_importable") ?? "[]") as string[],
  };
}

function makeApp(fetchImpl: typeof fetch): FastifyInstance {
  const app = Fastify({ logger: false });
  registerCommunityRoutes(app, makeSettingsRepo(), { fetchImpl });
  apps.push(app);
  return app;
}

function makeAppWithSettings(fetchImpl: typeof fetch, settingsRepo: ReturnType<typeof makeSettingsRepo>): FastifyInstance {
  const app = Fastify({ logger: false });
  registerCommunityRoutes(app, settingsRepo, { fetchImpl });
  apps.push(app);
  return app;
}

const shot = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  profile_title: "Blooming Espresso",
  user_name: "Anna",
  bean_brand: "Röstwerk",
  bean_type: "Kenia",
  roast_level: "light",
  bean_weight: 18,
  drink_weight: 40.5,
  duration: 40.1,
  espresso_enjoyment: 85,
  start_time: "2026-10-25T10:15:00.000Z",
};

test("Community-Suche bildet Filter und Treffer ab und cached die Antwort", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const app = makeApp(async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ data: [shot] });
  });
  const url = "/api/community/shots?page=2&profile_title=Blooming&bean_brand=R%C3%B6stwerk&bean_type=Kenia&grinder_model=%20%20DF64%20%20&min_enjoyment=80";
  const first = await app.inject({ url });
  const second = await app.inject({ url });

  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json().items[0], {
    id: shot.id,
    title: "Blooming Espresso",
    user: "Anna",
    roaster: "Röstwerk",
    bean: "Kenia",
    roast: "light",
    dose: 18,
    yield: 40.5,
    ratio: 2.3,
    time: 40.1,
    enjoyment: 85,
    startTime: "2026-10-25T10:15:00.000Z",
  });
  assert.deepEqual(second.json(), first.json());
  assert.equal(calls.length, 1);
  const upstream = new URL(calls[0]!.url);
  assert.equal(upstream.origin + upstream.pathname, "https://visualizer.coffee/api/shots");
  assert.deepEqual(Object.fromEntries(upstream.searchParams), {
    items: "20", page: "2", full: "true", profile_title: "Blooming", bean_brand: "Röstwerk", bean_type: "Kenia", grinder_model: "DF64", min_enjoyment: "80",
  });
  assert.equal(calls[0]!.init?.redirect, "error");
  assert.equal(new Headers(calls[0]!.init?.headers).get("User-Agent"), "Xenia-Web-App-Fork (+https://github.com/denyozzz/xenia-web-app)");
  assert.ok(calls[0]!.init?.signal);
});

test("Decent-Profil ruft den Profilendpunkt ab, gibt JSON unverändert zurück und wird gecached", async () => {
  let calls = 0;
  let upstreamUrl = "";
  const detail = { title: "Blooming", steps: [{ pump: "pressure", pressure: 9 }] };
  const app = makeApp(async (input) => {
    calls++;
    upstreamUrl = String(input);
    return Response.json(detail);
  });
  const url = `/api/community/shots/${shot.id}`;

  assert.deepEqual((await app.inject({ url })).json(), detail);
  assert.deepEqual((await app.inject({ url })).json(), detail);
  assert.equal(upstreamUrl, `https://visualizer.coffee/api/shots/${shot.id}/profile?format=json`);
  assert.equal(calls, 1);
});

test("Detailroute kennzeichnet Gaggiuino-Profile anhand von phases", async () => {
  const app = makeApp(async () => Response.json({ title: "Ohne Profil", phases: [] }));
  const response = await app.inject({ url: `/api/community/shots/${shot.id}` });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error, "Gaggiuino-Profil – dafür gibt es keinen Übersetzer");
});

test("Detailroute meldet Profilantwort ohne steps oder phases", async () => {
  const app = makeApp(async () => Response.json({ title: "Ohne Profil" }));
  const response = await app.inject({ url: `/api/community/shots/${shot.id}` });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error, "Zu diesem Bezug hat Visualizer kein Profil");
});

test("Detailroute merkt 404- und phases-IDs in settingsRepo", async () => {
  for (const [status, payload] of [
    [404, null],
    [200, { title: "Gaggiuino", phases: [] }],
  ] as const) {
    const settingsRepo = makeSettingsRepo();
    const app = makeAppWithSettings(async () => status === 404
      ? new Response("{}", { status })
      : Response.json(payload), settingsRepo);
    await app.inject({ url: `/api/community/shots/${shot.id}` });
    assert.deepEqual(settingsRepo.readIds(), [shot.id]);
  }
});

test("Community-Suche blendet dauerhaft gemerkte IDs aus", async () => {
  const settingsRepo = makeSettingsRepo({ visualizer_not_importable: JSON.stringify([shot.id]) });
  const app = makeAppWithSettings(async () => Response.json({ data: [shot] }), settingsRepo);
  const response = await app.inject({ url: "/api/community/shots" });

  assert.deepEqual(response.json().items, []);
});

test("Community-404-Erinnerung bleibt auf höchstens 2000 IDs begrenzt", async () => {
  const existing = Array.from({ length: 2000 }, (_, index) => `old-${index}`);
  const settingsRepo = makeSettingsRepo({ visualizer_not_importable: JSON.stringify(existing) });
  const app = makeAppWithSettings(async () => new Response("{}", { status: 404 }), settingsRepo);
  await app.inject({ url: `/api/community/shots/${shot.id}` });

  const ids = settingsRepo.readIds();
  assert.equal(ids.length, 2000);
  assert.equal(ids[0], "old-1");
  assert.equal(ids.at(-1), shot.id);
});

test("Detailroute lehnt nicht-UUIDs ohne Visualizer-Aufruf ab", async () => {
  let calls = 0;
  const app = makeApp(async () => {
    calls++;
    return Response.json({});
  });
  const response = await app.inject({ url: "/api/community/shots/not-a-uuid" });

  assert.equal(response.statusCode, 400);
  assert.equal(calls, 0);
});

test("Visualizer-429 wird verständlich weitergegeben", async () => {
  const settingsRepo = makeSettingsRepo();
  const app = makeAppWithSettings(async () => new Response("{}", { status: 429 }), settingsRepo);
  const response = await app.inject({ url: `/api/community/shots/${shot.id}` });
  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error, "visualizer.coffee bremst gerade – bitte eine Minute warten.");
  assert.deepEqual(settingsRepo.readIds(), []);
});

test("Visualizer-404 meldet fehlendes Profil", async () => {
  const app = makeApp(async () => new Response("{}", { status: 404 }));
  const response = await app.inject({ url: `/api/community/shots/${shot.id}` });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "Zu diesem Bezug ist kein Profil hinterlegt");
});

test("Visualizer-Antworten über 3 MB werden abgelehnt", async () => {
  const app = makeApp(async () => new Response(new Uint8Array(3 * 1024 * 1024 + 1)));
  const response = await app.inject({ url: "/api/community/shots" });

  assert.equal(response.statusCode, 502);
  assert.match(response.json().error, /größer als 3 MB/);
});

test("Cache behält höchstens 100 verschiedene Einträge", async () => {
  let calls = 0;
  const app = makeApp(async () => {
    calls++;
    return Response.json({ data: [] });
  });
  for (let i = 0; i < 101; i++) {
    await app.inject({ url: `/api/community/shots?profile_title=${i}` });
  }
  await app.inject({ url: "/api/community/shots?profile_title=0" });

  assert.equal(calls, 102, "der älteste Eintrag wurde beim Überschreiten des Limits entfernt");
});

test("Community-Suche begrenzt grinder_model auf 60 Zeichen", async () => {
  let upstreamUrl = "";
  const app = makeApp(async (input) => {
    upstreamUrl = String(input);
    return Response.json({ data: [] });
  });
  const model = "M".repeat(61);
  await app.inject({ url: `/api/community/shots?grinder_model=${model}` });

  assert.equal(new URL(upstreamUrl).searchParams.get("grinder_model")?.length, 60);
});