/**
 * Patch 144: Sorte mit KI ausfuellen (ChatGPT liest Fotos der Packung).
 * Der Befehl wird in die Zwischenablage kopiert, ChatGPT geoeffnet; die kopierte Antwort
 * wird hier in das Format des JSON-Imports im Sorten-Editor gebracht.
 */

export const AI_URL = "https://chatgpt.com/";

export const AI_PROMPT = `Lies die Fotos dieser Kaffeepackung (Vorder- und Rückseite). Antworte NUR mit einem gültigen JSON-Objekt, ohne Erklärung. Lass Felder weg, die nicht auf der Packung stehen – nichts raten.
Felder:
- name: Name der Sorte
- roaster: Rösterei
- country: Herkunftsländer, kommagetrennt
- region, farm, variety (Varietäten), processing (Aufbereitung): Text
- altitudeMin, altitudeMax: Anbauhöhe in Metern (Zahlen)
- roastLevel: "light", "medium" oder "dark"
- brewType: "espresso", "filter" oder "omni"
- arabicaPct: Arabica-Anteil in Prozent (0–100), nur wenn angegeben (100 % Arabica = 100)
- flavorNotes: Liste der Aromen/Geschmacksnoten
- notes: Beschreibung und Zubereitungsempfehlung der Packung, kurz, auf Deutsch
- firstRoasting: { "roastDate": "JJJJ-MM-TT", "bagSizeG": Zahl, "pricePerBagEur": Zahl }`;

const ROAST: Record<string, string> = {
  light: "light", hell: "light", "light-medium": "light", "medium-light": "light", mittelhell: "light",
  medium: "medium", mittel: "medium", "medium-dark": "medium", mitteldunkel: "medium",
  dark: "dark", dunkel: "dark",
};
const BREW: Record<string, string> = { espresso: "espresso", filter: "filter", omni: "omni" };

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);
const n = (v: unknown): number | undefined => {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(x) && x > 0 ? x : undefined;
};
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => s(x)).filter((x): x is string => !!x)
    : typeof v === "string" ? v.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];

/** Antwort der KI (auch mit Codeblock oder Text drumherum) -> Objekt fuer applyImport. Wirft bei unlesbarer Antwort. */
export function parseAiAnswer(text: string): Record<string, unknown> {
  const raw = (text ?? "").replace(/```(?:json)?/gi, "");
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("In der Antwort steht kein JSON. Bitte die komplette Antwort von ChatGPT kopieren.");
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw.slice(a, b + 1).replace(/[“”„]/g, '"').replace(/,\s*([}\]])/g, "$1")) as Record<string, unknown>;
  } catch {
    throw new Error("Die Antwort ist kein gültiges JSON. Bitte nochmal kopieren oder ChatGPT um „nur JSON“ bitten.");
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Unerwartetes Format der Antwort.");
  const name = s(o.name);
  if (!name) throw new Error("In der Antwort fehlt der Name der Sorte.");

  const out: Record<string, unknown> = { name, flavorNotes: list(o.flavorNotes).slice(0, 20) };
  for (const k of ["roaster", "country", "region", "farm", "variety", "processing", "notes"]) {
    const v = s(o[k]);
    if (v) out[k] = k === "notes" ? v.slice(0, 4000) : v.slice(0, 200);
  }
  const lo = n(o.altitudeMin), hi = n(o.altitudeMax);
  if (lo && lo >= 100 && lo <= 3500) out.altitudeMin = Math.round(lo);
  if (hi && hi >= 100 && hi <= 3500) out.altitudeMax = Math.round(hi);
  const rl = ROAST[String(o.roastLevel ?? "").toLowerCase().trim()];
  if (rl) out.roastLevel = rl;
  const bt = BREW[String(o.brewType ?? "").toLowerCase().trim()];
  if (bt) out.brewType = bt;
  const ar = typeof o.arabicaPct === "number" ? o.arabicaPct : typeof o.arabicaPct === "string" ? Number(o.arabicaPct.replace(/[^\d.]/g, "")) : NaN;
  if (Number.isFinite(ar) && ar >= 0 && ar <= 100) out.arabicaPct = Math.round(ar / 10) * 10;

  const fr = (o.firstRoasting && typeof o.firstRoasting === "object" ? o.firstRoasting : {}) as Record<string, unknown>;
  const first: Record<string, unknown> = {};
  const rd = s(fr.roastDate ?? o.roastDate);
  if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) first.roastDate = rd;
  const bag = n(fr.bagSizeG ?? o.bagSizeG);
  if (bag) first.bagSizeG = bag;
  const price = n(fr.pricePerBagEur ?? o.pricePerBagEur);
  if (price) first.pricePerBagEur = price;
  out.firstRoasting = first;
  return out;
}

/** Text in die Zwischenablage (mit Rueckfall fuer aeltere WebViews). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
