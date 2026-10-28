/**
 * Neues Sieb -> Varianten in Profilen anlegen.
 * POST /api/baskets/:id/variants  Body: { profileIds: number[], likeName?: string | null }
 *
 * In jedem gewaehlten Brew-Profil entsteht eine Variante mit dem Variantennamen des Siebs (sonst dem Siebnamen), dem Sieb als Vorgabe
 * und „wie Variante X“: X ist die Variante mit dem Namen `likeName`, sonst die letzte des Profils.
 * Die Kurve wird so nicht kopiert, sondern mitgefahren; Aenderungen an X gelten auch hier.
 * Profile, die schon eine Variante mit diesem Sieb haben, und Wartungsprofile werden uebersprungen.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SqliteBasketRepo } from "../db/basket-repo.js";
import { getDb } from "../db/index.js";

interface VarRow { id: number; name: string; sort_order: number; yield_g: number | null; same_as_id: number | null; default_basket_id: number | null }

export function registerBasketVariantRoutes(app: FastifyInstance, basketRepo: SqliteBasketRepo, onProfilesChanged?: () => void): void {
  app.post("/api/baskets/:id/variants", async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const basketId = parseInt(req.params.id, 10);
    if (isNaN(basketId)) return reply.status(400).send({ error: "Invalid id" });
    const basket = basketRepo.findById(basketId);
    if (!basket) return reply.status(404).send({ error: "Basket not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(body.profileIds) ? body.profileIds.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : null;
    if (ids === null || ids.length === 0) return reply.status(400).send({ error: "profileIds: mindestens ein Profil" });
    const likeName = typeof body.likeName === "string" && body.likeName.trim() !== "" ? body.likeName.trim() : null;

    const db = getDb();
    const now = Date.now();
    let created = 0;
    const skipped: number[] = [];
    db.exec("BEGIN");
    try {
      for (const pid of ids) {
        const prof = db.prepare("SELECT kind FROM profile WHERE id = ?").get(pid) as { kind: string } | undefined;
        if (!prof || prof.kind === "maintenance") { skipped.push(pid); continue; }
        const vars = db.prepare("SELECT id, name, sort_order, yield_g, same_as_id, default_basket_id FROM profile_variant WHERE profile_id = ? ORDER BY sort_order, id").all(pid) as unknown as VarRow[];
        if (vars.length === 0 || vars.some((v) => v.default_basket_id === basketId)) { skipped.push(pid); continue; }
        const src = (likeName !== null ? vars.find((v) => v.name === likeName) : undefined) ?? vars[vars.length - 1]!;
        // „wie Variante X“ zeigt immer auf eine Variante mit eigener Kurve, nie auf eine Kette.
        const base = vars.find((v) => v.id === (src.same_as_id ?? src.id)) ?? src;
        const sort = Math.max(...vars.map((v) => v.sort_order)) + 1;
        db.prepare(
          `INSERT INTO profile_variant (profile_id, legacy_slot, name, sort_order, default_basket_id, yield_g, script_id, brew_steps, same_as_id, created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        ).run(pid, basket.variantName ?? basket.name, sort, basketId, basket.targetYieldG ?? base.yield_g, base.id, now, now);
        db.prepare("UPDATE profile SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(pid);
        created++;
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    if (created > 0) onProfilesChanged?.();
    return { created, skipped };
  });

  /**
   * POST /api/baskets/:id/variants/remove  Body: { profileIds: number[] }
   * Loest das Sieb von Profilen: entfernt dessen Variante dort - aber nur, wenn nichts verloren geht:
   * nicht die einzige Variante, kein Grundplatz (1×/2×), keine eigene Kurve, kein Vorbild anderer Varianten.
   * Alles andere bleibt und kommt mit Grund in `kept` zurueck (dort im Profil loeschen).
   */
  app.post("/api/baskets/:id/variants/remove", async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const basketId = parseInt(req.params.id, 10);
    if (isNaN(basketId)) return reply.status(400).send({ error: "Invalid id" });
    if (!basketRepo.findById(basketId)) return reply.status(404).send({ error: "Basket not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(body.profileIds) ? body.profileIds.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : null;
    if (ids === null || ids.length === 0) return reply.status(400).send({ error: "profileIds: mindestens ein Profil" });

    const db = getDb();
    let removed = 0;
    const kept: { profileId: number; profileName: string; variantName: string; reason: string }[] = [];
    db.exec("BEGIN");
    try {
      for (const pid of ids) {
        const prof = db.prepare("SELECT name FROM profile WHERE id = ?").get(pid) as { name: string } | undefined;
        if (!prof) continue;
        const total = (db.prepare("SELECT count(*) AS n FROM profile_variant WHERE profile_id = ?").get(pid) as { n: number }).n;
        const mine = db.prepare("SELECT id, name, legacy_slot, script_id, brew_steps FROM profile_variant WHERE profile_id = ? AND default_basket_id = ?").all(pid, basketId) as unknown as
          { id: number; name: string; legacy_slot: string | null; script_id: number | null; brew_steps: string | null }[];
        let left = total;
        for (const v of mine) {
          const followers = (db.prepare("SELECT count(*) AS n FROM profile_variant WHERE same_as_id = ?").get(v.id) as { n: number }).n;
          const why =
            left <= 1 ? "einzige Variante des Profils"
            : v.legacy_slot !== null ? "Grundplatz des Profils (Single/Double) - im Profil löschen"
            : v.script_id !== null || v.brew_steps !== null ? "hat eine eigene Kurve - im Profil löschen"
            : followers > 0 ? "andere Varianten fahren wie diese - im Profil löschen"
            : null;
          if (why !== null) { kept.push({ profileId: pid, profileName: prof.name, variantName: v.name, reason: why }); continue; }
          db.prepare("DELETE FROM profile_variant WHERE id = ?").run(v.id);
          db.prepare("UPDATE profile SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(pid);
          left--; removed++;
        }
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    if (removed > 0) onProfilesChanged?.();
    return { removed, kept };
  });
}
