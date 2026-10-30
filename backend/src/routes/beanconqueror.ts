/**
 * Patch 141: Bohne aus einem Beanconqueror-QR-Code (Roester-QR) anlegen.
 *
 * Viele Roestereien drucken einen QR-Code der App Beanconqueror auf die Tuete
 * (https://beanconqueror.com/?qr=<code>). Hinter dem Code liegen die Angaben
 * des Roesters auf dem Beanconqueror-Server. Die Nutzung erfolgt mit
 * Zustimmung des Beanconqueror-Entwicklers.
 *
 * Der Server fragt dort an (der Browser darf das wegen CORS nicht) und liefert
 * die Angaben im Format des JSON-Imports im Sorten-Editor zurueck. Gespeichert
 * wird hier nichts: der Editor oeffnet sich vorausgefuellt, gespeichert wird
 * erst mit "Speichern".
 *
 *   GET /api/beanconqueror/qr?code=<Code oder Link>  -> { qr, import, hasImage }
 *   GET /api/beanconqueror/qr-image?code=<...>       -> erstes Bild des Roesters (JPEG/PNG/WebP)
 *
 * Das Bild wird nur von Adressen geladen, die der Beanconqueror-Server selbst
 * zu diesem Code nennt (keine beliebigen URLs vom Browser).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sniffImageMime } from "../../../shared/src/image-mime.js";

const API = "https://backend.beanconqueror.com/Roaster/GetBeanFromQrCodeId?id=";
const TIMEOUT_MS = 10_000;
const MAX_REMOTE_IMAGE = 10_000_000;

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Code aus Link oder reinem Code; null = nicht erkennbar. */
export function parseQrInput(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const ok = (v: string | null | undefined) => (v && /^[A-Za-z0-9_-]{3,64}$/.test(v.trim()) ? v.trim() : null);
  if (s.includes("?") || s.includes("://")) {
    const q = s.includes("?") ? s.slice(s.indexOf("?") + 1) : "";
    const p = new URLSearchParams(q.split("#")[0]);
    return ok(p.get("qr")) ?? ok(p.get("id"));
  }
  return ok(s);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const stripHtml = (s: string) =>
  s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n").trim();
const uniqJoin = (xs: string[], max = 200) => {
  const out: string[] = [];
  for (const x of xs.map((y) => y.trim()).filter(Boolean)) if (!out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
  return out.join(", ").slice(0, max);
};

/** Beanconqueror-Roestgrad -> hell / mittel / dunkel. */
export function mapRoast(roast: unknown, range: unknown): "light" | "medium" | "dark" | undefined {
  const r = num(roast);
  if (r !== null && r >= 1 && r <= 5) return "light"; // Cinnamon .. Moderate-Light
  if (r !== null && r >= 6 && r <= 8) return "medium"; // City .. Full City
  if (r !== null && r >= 9 && r <= 12) return "dark"; // Full City+ .. French
  const g = num(range);
  if (g !== null && g >= 1 && g <= 2) return "light";
  if (g === 3) return "medium";
  if (g !== null && g >= 4 && g <= 5) return "dark";
  return undefined;
}

export interface QrImport {
  name: string;
  roaster?: string;
  country?: string;
  region?: string;
  farm?: string;
  variety?: string;
  processing?: string;
  altitudeMin?: number;
  altitudeMax?: number;
  roastLevel?: "light" | "medium" | "dark";
  brewType?: "espresso" | "filter" | "omni";
  arabicaPct?: number;
  flavorNotes: string[];
  notes?: string;
  firstRoasting: { roastDate?: string; bagSizeG?: number; pricePerBagEur?: number };
}

/** Antwort des Beanconqueror-Servers -> Format des JSON-Imports im Sorten-Editor. */
export function mapServerBean(sb: Record<string, unknown>, qr: string): { import: QrImport; images: string[] } {
  const info = (Array.isArray(sb.bean_information) ? sb.bean_information : []) as Record<string, unknown>[];
  const out: QrImport = { name: str(sb.name) || "Unbenannte Bohne", flavorNotes: [], firstRoasting: {} };
  const roaster = str(sb.roaster);
  if (roaster) out.roaster = roaster;

  const country = uniqJoin(info.map((i) => str(i.country)));
  const region = uniqJoin(info.map((i) => str(i.region)));
  const farm = uniqJoin(info.map((i) => str(i.farm)));
  const variety = uniqJoin(info.map((i) => str(i.variety)));
  const processing = uniqJoin(info.map((i) => str(i.processing)));
  if (country) out.country = country;
  if (region) out.region = region;
  if (farm) out.farm = farm;
  if (variety) out.variety = variety;
  if (processing) out.processing = processing;

  const alts = info.flatMap((i) => (str(i.elevation).match(/\d[\d.]*/g) ?? []).map((x) => Number(x.replace(/\./g, ""))))
    .filter((n) => n >= 100 && n <= 3500);
  if (alts.length) { out.altitudeMin = Math.min(...alts); out.altitudeMax = Math.max(...alts); }

  const roast = mapRoast(sb.roast, sb.roast_range);
  if (roast) out.roastLevel = roast;
  const bt = num(sb.bean_roasting_type);
  if (bt === 0) out.brewType = "filter";
  else if (bt === 1) out.brewType = "espresso";
  else if (bt === 2) out.brewType = "omni";

  // Arabica/Robusta nur, wenn der Roester es angibt (Varietaet nennt Robusta bzw. Arabica).
  const isRob = (i: Record<string, unknown>) => /robusta|canephora/i.test(str(i.variety));
  const isAra = (i: Record<string, unknown>) => /arabica/i.test(str(i.variety));
  if (info.some(isRob)) {
    const total = info.reduce((a, i) => a + (num(i.percentage) ?? 0), 0);
    const rob = info.filter(isRob).reduce((a, i) => a + (num(i.percentage) ?? 0), 0);
    let robPct: number | null = null;
    if (total > 0) robPct = Math.round((rob / total) * 10) * 10;
    else if (info.every(isRob)) robPct = 100;
    if (robPct !== null) out.arabicaPct = 100 - robPct;
  } else if (info.length > 0 && info.every(isAra)) {
    out.arabicaPct = 100;
  }

  out.flavorNotes = uniqJoin(str(sb.aromatics).split(/[,;\n]/), 2000).split(", ").filter(Boolean).slice(0, 20);

  const bn = (sb.beanNote ?? {}) as Record<string, unknown>;
  const notes: string[] = [];
  const note = stripHtml(str(sb.note));
  const desc = stripHtml(str(bn.roasterDescription));
  const advice = stripHtml(str(bn.brewAdvices));
  if (desc) notes.push(desc);
  if (note && note !== desc) notes.push(note);
  if (advice) notes.push("Brühempfehlung: " + advice);
  if (sb.decaffeinated === true) notes.push("Entkoffeiniert");
  if (info.length > 1) {
    const parts = info.map((i) => [str(i.country), str(i.variety)].filter(Boolean).join(" ") + (num(i.percentage) ? ` ${num(i.percentage)} %` : ""))
      .filter((p) => p.trim());
    if (parts.length) notes.push("Blend: " + parts.join(", "));
  }
  const url = str(sb.url);
  if (/^https?:\/\//i.test(url)) notes.push(url);
  notes.push(`Beanconqueror-QR: ${qr}`);
  out.notes = notes.join("\n\n").slice(0, 4000);

  const rd = str(sb.roastingDate).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rd) && !rd.startsWith("0001")) out.firstRoasting.roastDate = rd;
  const w = num(sb.weight);
  if (w !== null && w > 0) out.firstRoasting.bagSizeG = w;
  const c = num(sb.cost);
  if (c !== null && c > 0) out.firstRoasting.pricePerBagEur = c;

  const images: string[] = [];
  for (const a of (Array.isArray(sb.attachment) ? sb.attachment : []) as Record<string, unknown>[]) {
    const u = str(a?.uri);
    if (/^https:\/\//i.test(u)) images.push(u);
  }
  for (const u of (Array.isArray(bn.attachments) ? bn.attachments : []) as unknown[]) {
    if (typeof u === "string" && /^https:\/\//i.test(u.trim())) images.push(u.trim());
  }
  return { import: out, images: [...new Set(images)] };
}

class QrError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function loadBean(f: FetchLike, qr: string): Promise<Record<string, unknown>> {
  let r;
  try {
    r = await f(API + encodeURIComponent(qr), { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  } catch {
    throw new QrError(502, "Beanconqueror-Server nicht erreichbar.");
  }
  let body: unknown = null;
  try { body = await r.json(); } catch { /* kein JSON */ }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const err = b.error as Record<string, unknown> | null | undefined;
  if (err && typeof err === "object") {
    if (str(err.errorCode) === "beannotapproved") throw new QrError(404, "Diese Bohne ist bei Beanconqueror (noch) nicht freigegeben.");
    throw new QrError(404, "Zu diesem QR-Code gibt es bei Beanconqueror keine Bohne.");
  }
  if (!r.ok) throw new QrError(r.status === 404 ? 404 : 502, `Beanconqueror antwortet mit Fehler ${r.status}.`);
  if (!str(b.name)) throw new QrError(404, "Zu diesem QR-Code gibt es bei Beanconqueror keine Bohne.");
  return b;
}

export function registerBeanconquerorRoutes(app: FastifyInstance, opts: { fetch?: FetchLike } = {}): void {
  const f: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);

  app.get("/api/beanconqueror/qr", async (req: FastifyRequest<{ Querystring: { code?: string } }>, reply: FastifyReply) => {
    const qr = parseQrInput(req.query.code ?? "");
    if (!qr) return reply.status(400).send({ error: "Kein gültiger Beanconqueror-Code oder -Link." });
    try {
      const sb = await loadBean(f, qr);
      const m = mapServerBean(sb, qr);
      return { qr, import: m.import, hasImage: m.images.length > 0 };
    } catch (e) {
      if (e instanceof QrError) return reply.status(e.status).send({ error: e.message });
      throw e;
    }
  });

  app.get("/api/beanconqueror/qr-image", async (req: FastifyRequest<{ Querystring: { code?: string } }>, reply: FastifyReply) => {
    const qr = parseQrInput(req.query.code ?? "");
    if (!qr) return reply.status(400).send({ error: "Kein gültiger Beanconqueror-Code oder -Link." });
    try {
      const sb = await loadBean(f, qr);
      for (const url of mapServerBean(sb, qr).images) {
        try {
          const r = await f(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!r.ok) continue;
          const len = Number(r.headers.get("content-length") ?? "0");
          if (len > MAX_REMOTE_IMAGE) continue;
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length === 0 || bytes.length > MAX_REMOTE_IMAGE) continue;
          const mime = sniffImageMime(bytes);
          if (!mime) continue;
          return reply.header("Content-Type", mime).header("Cache-Control", "no-store").send(bytes);
        } catch { /* naechstes Bild */ }
      }
      return reply.status(404).send({ error: "Kein Bild zu dieser Bohne." });
    } catch (e) {
      if (e instanceof QrError) return reply.status(e.status).send({ error: e.message });
      throw e;
    }
  });
}
