/**
 * Patch 138: Eco-/Aus-Zaehlung auf dem Server statt im Browser.
 *
 * Die Xenia schaltet nach einer einstellbaren Zeit ohne Aktivitaet in Eco und spaeter aus (Timer greifen erst
 * 30 Minuten nach dem Einschalten). Die Maschine meldet die Restzeit nicht; bisher zaehlte jeder Browser selbst
 * mit und lag nach einem Neuladen falsch. Jetzt merkt sich der Server, der die Maschine ohnehin staendig abfragt:
 *   - onSince: wann die Maschine eingeschaltet wurde (aus/getrennt -> an); null = aus oder unbekannt
 *   - last:    letzte Aktivitaet = letzter Zustandswechsel, der nicht nach Eco fuehrt
 * Beides wird in den Einstellungen gespeichert und uebersteht so einen Neustart des Containers.
 * Gleiche Regeln wie vorher im Browser (TopClock).
 *
 * GET /api/eco-timer -> { state, onSinceAgoMs, lastAgoMs }   (Abstaende relativ zur Serverzeit, unabhaengig von der Uhr des Geraets)
 */
import type { FastifyInstance } from "fastify";
import type { SettingsRepo } from "./db/settings-repo.js";

const isOff = (s: string) => s === "off" || s === "disconnected";
const K_ON = "eco_on_since";
const K_LAST = "eco_last_activity";

export class EcoTracker {
  private prev: string | null = null;
  private onSince: number | null;
  private last: number;

  constructor(private readonly settings: Pick<SettingsRepo, "get" | "set">, private readonly now: () => number = () => Date.now()) {
    const read = (k: string): number | null => {
      const v = settings.get(k);
      const n = v !== undefined && v !== "" ? Number(v) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    this.onSince = read(K_ON);
    this.last = read(K_LAST) ?? this.now();
  }

  /** Zustand aus jedem Frame bzw. "disconnected", wenn die Maschine nicht erreichbar ist. */
  onState(state: string): void {
    const t = this.now();
    if (this.prev === null) {
      // Erster Zustand nach dem Start: gespeicherte Werte gelten weiter, nur "aus" loescht den Einschaltzeitpunkt.
      this.prev = state;
      if (isOff(state) && this.onSince !== null) this.setOn(null);
      return;
    }
    if (state === this.prev) return;
    if (isOff(this.prev) && !isOff(state)) this.setOn(t);
    if (isOff(state)) this.setOn(null);
    if (state !== "eco") this.setLast(t);
    this.prev = state;
  }

  view(): { state: string | null; onSinceAgoMs: number | null; lastAgoMs: number } {
    const t = this.now();
    return { state: this.prev, onSinceAgoMs: this.onSince === null ? null : t - this.onSince, lastAgoMs: t - this.last };
  }

  private setOn(v: number | null): void {
    this.onSince = v;
    this.settings.set(K_ON, v === null ? "" : String(v));
  }

  private setLast(v: number): void {
    this.last = v;
    this.settings.set(K_LAST, String(v));
  }
}

export function registerEcoTimerRoutes(app: FastifyInstance, tracker: EcoTracker): void {
  app.get("/api/eco-timer", async () => tracker.view());
}
