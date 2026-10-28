/**
 * Pro Bohne aus- bzw. eingeblendete Varianten im Dashboard.
 * GET /api/hidden-variants -> { ok, hidden: { "<coffeeId>": [variantId, ...] }, shown: { ... } }
 * PUT /api/hidden-variants  Body: { coffeeId, variantId, hidden: boolean } - setzt die ausdrueckliche Wahl:
 *   hidden=true -> aus, hidden=false -> an (geht dem Standard vor: bei hellen Bohnen ist Single sonst aus).
 * Liegt im Einstellungsspeicher (Schluessel bean_hidden_variants / bean_shown_variants), wie die Dosen je Bohne.
 * Profile und andere Bohnen bleiben unberuehrt; die Variante bleibt anderswo startbar.
 */
import type { FastifyInstance } from "fastify";
import type { SqliteSettingsRepo } from "../db/settings-repo.js";

const KEY = "bean_hidden_variants";
const SHOWN_KEY = "bean_shown_variants";
type Hidden = Record<string, number[]>;

function load(repo: SqliteSettingsRepo, key: string = KEY): Hidden {
  try {
    const v = JSON.parse(repo.get(key) ?? "{}") as unknown;
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Hidden) : {};
  } catch { return {}; }
}

export function registerBeanHiddenVariantRoutes(app: FastifyInstance, settingsRepo: SqliteSettingsRepo): void {
  app.get("/api/hidden-variants", async () => ({ ok: true, hidden: load(settingsRepo), shown: load(settingsRepo, SHOWN_KEY) }));

  app.put("/api/hidden-variants", async (req, reply) => {
    const q = (req.body ?? {}) as { coffeeId?: unknown; variantId?: unknown; hidden?: unknown };
    const cid = Number(q.coffeeId), vid = Number(q.variantId);
    if (!Number.isInteger(cid) || !Number.isInteger(vid) || typeof q.hidden !== "boolean") {
      reply.code(400); return { ok: false, error: "Ungültige Angaben." };
    }
    const put = (key: string, on: boolean) => {
      const all = load(settingsRepo, key);
      const mine = new Set(all[String(cid)] ?? []);
      if (on) mine.add(vid); else mine.delete(vid);
      if (mine.size === 0) delete all[String(cid)]; else all[String(cid)] = [...mine].sort((a, b) => a - b);
      settingsRepo.set(key, JSON.stringify(all));
    };
    put(KEY, q.hidden);
    put(SHOWN_KEY, !q.hidden);
    return { ok: true };
  });
}
