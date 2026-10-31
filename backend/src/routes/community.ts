import type { FastifyInstance, FastifyReply } from "fastify";
import type { SettingsRepo } from "../db/settings-repo.js";

/**
 * Teile angelehnt an Xenios (server/src/community.js); die LICENSE nennt keinen Copyright-Inhaber,
 * Apache License 2.0, https://github.com/TimS1998/Xenios – angepasst für diesen Fork (TypeScript,
 * Fastify, Import über den Decent-Übersetzer).
 */
const BASE = "https://visualizer.coffee";
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 100;
const MAX_NOT_IMPORTABLE_IDS = 2000;
const NOT_IMPORTABLE_KEY = "visualizer_not_importable";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CacheEntry = { expiresAt: number; data: unknown };
type SearchItem = {
  id: string;
  title: string;
  user: string | null;
  roaster: string | null;
  bean: string | null;
  roast: string | null;
  dose: number | null;
  yield: number | null;
  ratio: number | null;
  time: number | null;
  enjoyment: number | null;
  startTime: string | null;
};

class CommunityError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarize(raw: unknown): SearchItem {
  const shot = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const dose = number(shot.bean_weight);
  const yieldG = number(shot.drink_weight);
  const ratio = dose !== null && dose > 0 && yieldG !== null
    ? Math.round(yieldG / dose * 10) / 10
    : null;
  return {
    id: String(shot.id ?? ""),
    title: text(shot.profile_title) ?? "Ohne Titel",
    user: text(shot.user_name),
    roaster: text(shot.bean_brand),
    bean: text(shot.bean_type),
    roast: text(shot.roast_level),
    dose,
    yield: yieldG,
    ratio,
    time: number(shot.duration),
    enjoyment: number(shot.espresso_enjoyment),
    startTime: text(shot.start_time),
  };
}

function cached(cache: Map<string, CacheEntry>, key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.data;
}

function saveCache(cache: Map<string, CacheEntry>, key: string, data: unknown, ttlMs: number): void {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + ttlMs, data });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function readNotImportable(settingsRepo: SettingsRepo): string[] {
  try {
    const stored: unknown = JSON.parse(settingsRepo.get(NOT_IMPORTABLE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberNotImportable(settingsRepo: SettingsRepo, id: string): void {
  const ids = readNotImportable(settingsRepo).filter((remembered) => remembered !== id);
  ids.push(id);
  settingsRepo.set(NOT_IMPORTABLE_KEY, JSON.stringify(ids.slice(-MAX_NOT_IMPORTABLE_IDS)));
}

async function getVisualizerJson(
  url: string,
  ttlMs: number,
  cache: Map<string, CacheEntry>,
  fetchImpl: typeof fetch,
  notFoundMessage = "Auf visualizer.coffee nicht gefunden.",
): Promise<unknown> {
  const hit = cached(cache, url);
  if (hit !== undefined) return hit;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Xenia-Web-App-Fork (+https://github.com/denyozzz/xenia-web-app)",
      },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError"
      ? "Zeitüberschreitung nach 12 Sekunden"
      : "Verbindung fehlgeschlagen";
    throw new CommunityError(502, `visualizer.coffee nicht erreichbar (${reason})`);
  }

  if (response.status === 429) {
    throw new CommunityError(429, "visualizer.coffee bremst gerade – bitte eine Minute warten.");
  }
  if (response.status === 404) {
    throw new CommunityError(404, notFoundMessage);
  }
  if (!response.ok) {
    throw new CommunityError(502, `visualizer.coffee antwortet mit HTTP ${response.status}.`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) {
    throw new CommunityError(502, "Antwort von visualizer.coffee ist größer als 3 MB.");
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new CommunityError(502, "visualizer.coffee hat ungültiges JSON geliefert.");
  }
  saveCache(cache, url, data, ttlMs);
  return data;
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof CommunityError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  return reply.code(502).send({ error: "visualizer.coffee konnte nicht abgefragt werden." });
}

/** Proxy für die Visualizer-Community; nach dem Vorbild von Xenios (Apache-2.0), server/src/community.js. */
export function registerCommunityRoutes(
  app: FastifyInstance,
  settingsRepo: SettingsRepo,
  options: { fetchImpl?: typeof fetch } = {},
): void {
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  const cache = new Map<string, CacheEntry>();

  app.get("/api/community/shots", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const pageValue = Number(query.page);
    const page = Number.isFinite(pageValue) ? Math.min(50, Math.max(1, Math.round(pageValue))) : 1;
    const params = new URLSearchParams({ items: "20", page: String(page), full: "true" });
    for (const [key, upstreamKey] of [
      ["profile_title", "profile_title"],
      ["bean_brand", "bean_brand"],
      ["bean_type", "bean_type"],
      ["grinder_model", "grinder_model"],
    ]) {
      const value = query[key];
      if (typeof value === "string" && value.trim()) params.set(upstreamKey, value.trim().slice(0, 60));
    }
    const minValue = Number(query.min_enjoyment);
    if (Number.isFinite(minValue) && minValue > 0 && minValue <= 100) {
      params.set("min_enjoyment", String(Math.round(minValue)));
    }

    try {
      const data = await getVisualizerJson(`${BASE}/api/shots?${params}`, 10 * 60_000, cache, fetchImpl);
      const upstream = data && typeof data === "object" ? data as { data?: unknown } : {};
      const shots = Array.isArray(upstream.data) ? upstream.data : [];
      const notImportable = new Set(readNotImportable(settingsRepo));
      const items = shots.map(summarize).filter((item) => !notImportable.has(item.id));
      return { items, page, more: shots.length === 20 };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/api/community/shots/:id", async (request, reply) => {
    if (!UUID.test(request.params.id)) {
      return reply.code(400).send({ error: "Ungültige Visualizer-Bezugs-ID." });
    }
    try {
      const profile = await getVisualizerJson(
        `${BASE}/api/shots/${request.params.id}/profile?format=json`,
        60 * 60_000,
        cache,
        fetchImpl,
        "Zu diesem Bezug ist kein Profil hinterlegt",
      );
      if (!profile || typeof profile !== "object" || !Array.isArray((profile as { steps?: unknown }).steps)) {
        const hasPhases = profile && typeof profile === "object" && Array.isArray((profile as { phases?: unknown }).phases);
        if (hasPhases) rememberNotImportable(settingsRepo, request.params.id);
        const message = hasPhases
          ? "Gaggiuino-Profil – dafür gibt es keinen Übersetzer"
          : "Zu diesem Bezug hat Visualizer kein Profil";
        throw new CommunityError(422, message);
      }
      return profile;
    } catch (error) {
      if (error instanceof CommunityError && error.statusCode === 404) {
        rememberNotImportable(settingsRepo, request.params.id);
      }
      return sendError(reply, error);
    }
  });
}