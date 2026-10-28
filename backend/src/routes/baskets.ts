/**
 * Sieb-Routen — CRUD wie die Muehlen.
 * Registered at: /api/baskets
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SqliteBasketRepo } from "../db/basket-repo.js";
import { BASKET_TYPES } from "../../../shared/src/types.js";
import type { BasketType, BasketUpdate } from "../../../shared/src/types.js";

/** Name wie ein Profilname: Pflicht, getrimmt, hoechstens 40 Zeichen. */
function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const n = v.trim();
  return n.length > 0 && n.length <= 40 ? n : null;
}

const isType = (v: unknown): v is BasketType => typeof v === "string" && (BASKET_TYPES as string[]).includes(v);

/** Beschreibung: frei, hoechstens 200 Zeichen; leer → null. undefined = ungueltig. */
function cleanDescription(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const d = v.trim();
  if (d.length > 200) return undefined;
  return d.length > 0 ? d : null;
}

/** Nenndosis in g: 0 < x ≤ 40 oder null. undefined = ungueltig. */
function cleanDose(v: unknown): number | null | undefined {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 40 ? Math.round(v * 10) / 10 : undefined;
}

/** Zielmenge in g: 0 < x ≤ 200 oder null. undefined = ungueltig. */
function cleanYield(v: unknown): number | null | undefined {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 200 ? Math.round(v * 10) / 10 : undefined;
}

/** Variantenname: hoechstens 20 Zeichen; leer → null. undefined = ungueltig. */
function cleanVariantName(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const n = v.trim();
  if (n.length > 20) return undefined;
  return n.length > 0 ? n : null;
}

const BAD_VARIANT_NAME = "Variantenname: höchstens 20 Zeichen.";
const BAD_YIELD = "Zielmenge: eine Zahl über 0 bis 200 g.";
const BAD_DESCRIPTION = "Beschreibung: höchstens 200 Zeichen.";
const BAD_DOSE = "Nenndosis: eine Zahl über 0 bis 40 g.";

export function registerBasketRoutes(app: FastifyInstance, basketRepo: SqliteBasketRepo): void {
  /** GET /api/baskets — nach Typ, dann Name */
  app.get("/api/baskets", async () => basketRepo.listAll());

  /** POST /api/baskets — Body: { name, description?, nominalDoseG?, type? } */
  app.post("/api/baskets", async (req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = cleanName(body.name);
    if (name === null) return reply.status(400).send({ error: "name is required (max. 40 characters)" });
    if (body.type !== undefined && !isType(body.type)) return reply.status(400).send({ error: "type must be single, double or he" });
    const description = body.description === undefined ? null : cleanDescription(body.description);
    if (description === undefined) return reply.status(400).send({ error: BAD_DESCRIPTION });
    const nominalDoseG = body.nominalDoseG === undefined ? null : cleanDose(body.nominalDoseG);
    if (nominalDoseG === undefined) return reply.status(400).send({ error: BAD_DOSE });
    const targetYieldG = body.targetYieldG === undefined ? null : cleanYield(body.targetYieldG);
    if (targetYieldG === undefined) return reply.status(400).send({ error: BAD_YIELD });
    const variantName = body.variantName === undefined ? null : cleanVariantName(body.variantName);
    if (variantName === undefined) return reply.status(400).send({ error: BAD_VARIANT_NAME });
    if (variantName !== null && basketRepo.listAll().some((b) => b.variantName === variantName)) return reply.status(409).send({ error: `Variantenname „${variantName}“ ist schon vergeben.` });
    const id = basketRepo.insert({ name, type: isType(body.type) ? body.type : undefined, description, nominalDoseG, targetYieldG, variantName });
    return reply.status(201).send({ id, name });
  });

  /** PUT /api/baskets/:id — Body: { name?, description?, nominalDoseG?, type? } */
  app.put("/api/baskets/:id", async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
    if (!basketRepo.findById(id)) return reply.status(404).send({ error: "Basket not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: BasketUpdate = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (name === null) return reply.status(400).send({ error: "name is required (max. 40 characters)" });
      patch.name = name;
    }
    if (body.type !== undefined) {
      if (!isType(body.type)) return reply.status(400).send({ error: "type must be single, double or he" });
      patch.type = body.type;
    }
    if (body.description !== undefined) {
      const d = cleanDescription(body.description);
      if (d === undefined) return reply.status(400).send({ error: BAD_DESCRIPTION });
      patch.description = d;
    }
    if (body.nominalDoseG !== undefined) {
      const g = cleanDose(body.nominalDoseG);
      if (g === undefined) return reply.status(400).send({ error: BAD_DOSE });
      patch.nominalDoseG = g;
    }
    if (body.targetYieldG !== undefined) {
      const y = cleanYield(body.targetYieldG);
      if (y === undefined) return reply.status(400).send({ error: BAD_YIELD });
      patch.targetYieldG = y;
    }
    if (body.variantName !== undefined) {
      const vn = cleanVariantName(body.variantName);
      if (vn === undefined) return reply.status(400).send({ error: BAD_VARIANT_NAME });
      if (vn !== null && basketRepo.listAll().some((b) => b.id !== id && b.variantName === vn)) return reply.status(409).send({ error: `Variantenname „${vn}“ ist schon vergeben.` });
      patch.variantName = vn;
    }
    basketRepo.update(id, patch);
    return { ok: true };
  });

  /** DELETE /api/baskets/:id */
  app.delete("/api/baskets/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid id" });
    if (!basketRepo.findById(id)) return reply.status(404).send({ error: "Basket not found" });
    // Benutzte Siebe bleiben — sonst verloeren Bezuege und Varianten ihr Sieb.
    const u = basketRepo.usage(id);
    if (u.variants > 0 || u.shots > 0) {
      return reply.status(409).send({ error: `Sieb wird benutzt (${u.shots} Bezüge, ${u.variants} Varianten) und lässt sich nicht löschen.` });
    }
    basketRepo.delete(id);
    return { ok: true };
  });
}
