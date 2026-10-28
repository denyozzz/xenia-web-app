/**
 * Anzeige-Einstellungen, die fuer alle Geraete gelten.
 * GET /api/ui-prefs -> { ok, sayingSimple: boolean | null, sayingExpert: boolean | null }  (null = nie gesetzt)
 * PUT /api/ui-prefs  Body: { sayingSimple?: boolean, sayingExpert?: boolean }
 * Spruch neben der Uhr, je Dashboard-Ansicht. Liegt im Einstellungsspeicher (ui_saying_simple / ui_saying_expert).
 */
import type { FastifyInstance } from "fastify";
import type { SqliteSettingsRepo } from "../db/settings-repo.js";

const KEYS = { sayingSimple: "ui_saying_simple", sayingExpert: "ui_saying_expert" } as const;

export function registerUiPrefRoutes(app: FastifyInstance, settingsRepo: SqliteSettingsRepo): void {
  const get = (key: string): boolean | null => {
    const v = settingsRepo.get(key);
    return v === "1" ? true : v === "0" ? false : null;
  };

  app.get("/api/ui-prefs", async () => ({ ok: true, sayingSimple: get(KEYS.sayingSimple), sayingExpert: get(KEYS.sayingExpert) }));

  app.put("/api/ui-prefs", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entries = (Object.keys(KEYS) as Array<keyof typeof KEYS>).filter((k) => body[k] !== undefined);
    if (entries.length === 0 || entries.some((k) => typeof body[k] !== "boolean")) {
      reply.code(400); return { ok: false, error: "Ungültige Angaben." };
    }
    for (const k of entries) settingsRepo.set(KEYS[k], body[k] === true ? "1" : "0");
    return { ok: true };
  });
}
