/**
 * Pflege-Erinnerungen - dieselbe Logik wie der Rueckspuel-Reminder, je Erinnerung eigene Einstellungen:
 *   1. Rueckspuelen ohne Kaffeefettloeser   2. Rueckspuelen mit Kaffeefettloeser   3. Duschsieb reinigen
 * Patch 128 - Takt statt Wechsel (solange beide an sind): "mit Fettloeser" ist faellig X Tage nach dem letzten Rueckspuelen mit Fettloeser;
 * "ohne Fettloeser" ist faellig Y Tage nach dem letzten Rueckspuelen gleich welcher Art und entfaellt, wenn "mit" bis dahin schon dran ist.
 * Ist eine Art aus, laeuft die andere allein in ihrem Abstand. Je Erinnerung: an/aus, Intervall in Tagen, Wartungsprofile, deren Lauf als erledigt zaehlt (nur 1 und 2), "Erledigt" von Hand.
 * "Zuletzt" = max(Baseline, juengster Lauf eines gewaehlten Wartungsprofils). "Spaeter" blendet aus, bis der naechste Bezug endet.
 * GET  /api/care-reminders                 -> { ok, items: [...] }
 * POST /api/care-reminders/:id/done        -> jetzt erledigt
 * POST /api/care-reminders/:id/snooze      -> ausblenden (bis unsnooze)
 * POST /api/care-reminders/unsnooze        -> alle Ausblendungen aufheben (die App ruft das nach dem naechsten beendeten Bezug auf)
 * PUT  /api/care-reminders/:id             Body { enabled?, intervalDays?, profileIds? }
 * Einstellungsspeicher, Schluessel care_<id>_enabled | _days | _profiles | _baseline | _snooze. Keine Schemaaenderung.
 */
import type { FastifyInstance } from "fastify";
import type { SettingsRepo } from "../db/settings-repo.js";
import type { MaintenanceLogRepo } from "../db/maintenance-repo.js";

const DAY_MS = 86_400_000;
const SNOOZE_MS = 2 * DAY_MS;

interface Def { id: string; title: string; hint: string; intervalDays: number; startOffsetDays: number; auto: boolean }

/** startOffsetDays: so viele Tage ist der Zaehler beim Anlegen schon gelaufen (Wasser-Lauf versetzt zum Fettloeser-Lauf). auto: Wartungsprofile waehlbar. */
export const CARE_DEFS: Def[] = [
  { id: "flush-water", title: "Rückspülen ohne Kaffeefettlöser", hint: "Blindsieb einsetzen, Rückspülprogramm nur mit Wasser.", intervalDays: 14, startOffsetDays: 14, auto: true },
  { id: "flush-cleaner", title: "Rückspülen mit Kaffeefettlöser", hint: "Danach noch einmal ohne Fettlöser nachspülen, vorher das Tankwasser wechseln.", intervalDays: 28, startOffsetDays: 0, auto: true },
  { id: "showerscreen", title: "Duschsieb reinigen", hint: "Ausbauen und im Fettlöser einweichen; dazwischen mit der Espazzola bürsten.", intervalDays: 28, startOffsetDays: 0, auto: false },
];

const num = (v: string | undefined, fallback: number): number => {
  const n = v !== undefined && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const ids = (v: string | undefined): number[] =>
  (v ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n));

export function registerCareReminderRoutes(app: FastifyInstance, settingsRepo: SettingsRepo, maintenanceLog: MaintenanceLogRepo): void {
  const k = (id: string, what: string) => `care_${id}_${what}`;

  /** Aeltere Vorversion: ein JSON-Eintrag je Erinnerung (care_reminders). Werte einmalig uebernehmen. */
  function legacy(id: string): { lastDoneAt: number; intervalDays: number } | null {
    try {
      const p = JSON.parse(settingsRepo.get("care_reminders") ?? "[]") as Array<{ id?: string; lastDoneAt?: number; intervalDays?: number }>;
      const h = Array.isArray(p) ? p.find((x) => x && x.id === id) : undefined;
      return h && Number.isFinite(h.lastDoneAt) && Number.isFinite(h.intervalDays) ? { lastDoneAt: h.lastDoneAt!, intervalDays: h.intervalDays! } : null;
    } catch { return null; }
  }

  function baselineOf(d: Def): number {
    const have = settingsRepo.get(k(d.id, "baseline"));
    if (have !== undefined && have !== "") return num(have, Date.now());
    const old = legacy(d.id);
    const start = old ? old.lastDoneAt : Date.now() - d.startOffsetDays * DAY_MS;
    settingsRepo.set(k(d.id, "baseline"), String(start));
    if (old) settingsRepo.set(k(d.id, "days"), String(old.intervalDays));
    return start;
  }

  /** Einmalig: die beiden Rueckspuel-Erinnerungen wechseln sich jetzt ab, ihr Intervall gilt ab dem letzten Rueckspuelen (Vorgabe 14 Tage). */
  function migrateCoupling(): void {
    if (settingsRepo.get("care_coupled_v1") === "1") return;
    settingsRepo.set(k("flush-water", "days"), "14");
    settingsRepo.set(k("flush-cleaner", "days"), "14");
    settingsRepo.set("care_coupled_v1", "1");
  }

  /** Patch 128, einmalig: Takt statt Wechsel. Der bisherige Wechsel 14/14 hiess "mit" alle 28 Tage - daher 14 -> 28; ein anderer Wert bleibt. */
  function migrateTakt(): void {
    if (settingsRepo.get("care_takt_v2") === "1") return;
    if ((settingsRepo.get(k("flush-cleaner", "days")) ?? "") === "14") settingsRepo.set(k("flush-cleaner", "days"), "28");
    settingsRepo.set("care_takt_v2", "1");
  }

  function view(): unknown[] {
    migrateCoupling();
    migrateTakt();
    const now = Date.now();
    const base = CARE_DEFS.map((d) => {
      const baseline = baselineOf(d);
      const profileIds = d.auto ? ids(settingsRepo.get(k(d.id, "profiles"))) : [];
      return {
        d,
        enabled: (settingsRepo.get(k(d.id, "enabled")) ?? "true") === "true",
        intervalDays: num(settingsRepo.get(k(d.id, "days")), d.intervalDays),
        profileIds,
        snoozeUntil: num(settingsRepo.get(k(d.id, "snooze")), 0),
        lastAt: Math.max(baseline, maintenanceLog.lastRanAt(profileIds) ?? 0),
      };
    });
    const w = base.find((x) => x.d.id === "flush-water")!;
    const c = base.find((x) => x.d.id === "flush-cleaner")!;
    // Patch 128: "mit" ist der feste Takt, "ohne" fuellt die Luecken (ab dem letzten Rueckspuelen gleich welcher Art).
    const both = w.enabled && c.enabled;
    const cleanerDueAt = c.lastAt + c.intervalDays * DAY_MS;
    return base.map((x) => {
      let dueAt = x.lastAt + x.intervalDays * DAY_MS;
      let myTurn = true;
      const lastShown = x.lastAt;
      if (x === w) {
        dueAt = Math.max(w.lastAt, c.lastAt) + w.intervalDays * DAY_MS;
        // Kaeme "ohne" erst am "mit"-Termin oder spaeter, oder ist "mit" schon faellig: "ohne" entfaellt, naechstes "ohne" nach dem "mit".
        if (both && (dueAt >= cleanerDueAt || now >= cleanerDueAt)) {
          myTurn = false;
          dueAt = cleanerDueAt + w.intervalDays * DAY_MS;
        }
      }
      return {
        id: x.d.id, title: x.d.title, hint: x.d.hint, auto: x.d.auto, enabled: x.enabled, intervalDays: x.intervalDays,
        profileIds: x.profileIds, lastAt: lastShown,
        daysAgo: Math.floor((now - lastShown) / DAY_MS),
        due: x.enabled && myTurn && now > x.snoozeUntil && now > dueAt,
        dueInDays: Math.ceil((dueAt - now) / DAY_MS),
        snoozeUntil: x.snoozeUntil,
      };
    });
  }

  app.get("/api/care-reminders", async () => ({ ok: true, items: view() }));

  app.post("/api/care-reminders/unsnooze", async () => {
    for (const d of CARE_DEFS) settingsRepo.set(k(d.id, "snooze"), "0");
    return { ok: true };
  });

  app.post("/api/care-reminders/:id/done", async (req, reply) => {
    const d = CARE_DEFS.find((x) => x.id === (req.params as { id: string }).id);
    if (!d) { reply.code(404); return { ok: false, error: "Unbekannte Erinnerung." }; }
    settingsRepo.set(k(d.id, "baseline"), String(Date.now()));
    settingsRepo.set(k(d.id, "snooze"), "0");
    return { ok: true };
  });

  app.post("/api/care-reminders/:id/snooze", async (req, reply) => {
    const d = CARE_DEFS.find((x) => x.id === (req.params as { id: string }).id);
    if (!d) { reply.code(404); return { ok: false, error: "Unbekannte Erinnerung." }; }
    settingsRepo.set(k(d.id, "snooze"), String(Date.now() + SNOOZE_MS));
    return { ok: true };
  });

  app.put("/api/care-reminders/:id", async (req, reply) => {
    const d = CARE_DEFS.find((x) => x.id === (req.params as { id: string }).id);
    if (!d) { reply.code(404); return { ok: false, error: "Unbekannte Erinnerung." }; }
    const b = (req.body ?? {}) as { enabled?: unknown; intervalDays?: unknown; profileIds?: unknown };
    const bad =
      (b.enabled !== undefined && typeof b.enabled !== "boolean") ||
      (b.intervalDays !== undefined && (typeof b.intervalDays !== "number" || !Number.isInteger(b.intervalDays) || b.intervalDays < 1 || b.intervalDays > 365)) ||
      (b.profileIds !== undefined && (!d.auto || !Array.isArray(b.profileIds) || !b.profileIds.every((n) => Number.isInteger(n))));
    if (bad) { reply.code(400); return { ok: false, error: "Ungültige Angaben." }; }
    if (b.enabled !== undefined) settingsRepo.set(k(d.id, "enabled"), String(b.enabled));
    if (b.intervalDays !== undefined) settingsRepo.set(k(d.id, "days"), String(b.intervalDays));
    if (b.profileIds !== undefined) settingsRepo.set(k(d.id, "profiles"), (b.profileIds as number[]).join(","));
    return { ok: true };
  });
}
