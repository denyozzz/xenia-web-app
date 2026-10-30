/**
 * Dashboard — Phase 1 Step 2 / Step 5.5.
 *
 * Context-sensitive layout:
 *   Idle (nie ein Bezug / Bewertung gespeichert):
 *            Gauges row (+ Einschaltknöpfe, wenn die Maschine aus ist)
 *            + die Favoriten groß in der Mitte
 *   Brewing: Gauges row + Chart + Live values + Stop button
 *   Ended:   Chart bleibt stehen, bis die Bewertung gespeichert ist — dann
 *            verschwindet der Verlauf und die Favoriten erscheinen wieder.
 *
 * Opacity rules (nur Gauges):
 *   disconnected (WS) → 0.3  (greyed out)
 *   off                → 0.6  (dimmed)
 *   all other states   → 1.0  (full opacity)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Octagon, Droplet, Droplets, Power, Star } from "lucide-react";
import { useTranslation } from "../i18n/index.js";
import { useCoffees } from "../hooks/useCoffees.js";
import type { CoffeeView } from "../hooks/useCoffees.js";
import { Gauge } from "../components/Gauge.js";
import { TopClock } from "../components/TopClock.js";
import { ProfileSparkline } from "../components/ProfileSparkline.js";
import { ShotChart } from "../components/ShotChart.js";
import { useShotGhosts } from "../hooks/useShotGhosts.js";
import { RecentShots } from "../components/RecentShots.js";
import type { ChartMode } from "../components/ShotChart.js";
import type { ConnectionState } from "../hooks/useXeniaFrame.js";
import type { ChartSample, EndedShotStages } from "../hooks/useShotSamples.js";
import type { ChartXSettings } from "../hooks/useChartSettings.js";
import { canStartShotFromState } from "../lib/shotReadiness.js";
<<<<<<< HEAD
import { startVariants, variantRunsInApp } from "@shared/profile-slots.js";
import { useHiddenVariants } from "../hooks/useHiddenVariants.js";
import { isLightRoast, variantHidden } from "../lib/hiddenVariants.js";
import { useSayingPrefs } from "../sayingPrefs.js";
=======
import { dec } from "../lib/num.js";
import { liveSollCurve, liveStageEntries, recordedStageEntries } from "@shared/live-stage.js";
import { preinfusionArrivalGs } from "@shared/pump-curve.js";
>>>>>>> origin/main
import type {
  DriveStage,
  LiveFrame,
  MachineState,
  MaintenanceRun,
  SetpointsFrame,
  Profile,
  ProfileVariant,
  Shot,
  RecentShot,
  XeniaScript,
} from "@shared/types";
import theme, { alpha } from "../theme";

const C = theme;

const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

/** Ablese-Werte beginnen rechts der Druck-Achsenzahlen (Kartenrand 1 + Innenabstand 4 + Achse 28 = 33). */
const READOUT_LEFT = 32;
/** Handy: so viel Platz lässt das Diagramm über der Kurve für die einzeilige Wertezeile. */
const MOBILE_READOUT_INSET = 28;

/** Gramm-Wert unter den Start-Knöpfen (aus). */
const SHOW_YIELD = false;
const SHOW_POWER_BUTTONS = false; // Ein/Eco im Kopf: jetzt in der Seitenleiste
const fmtG = (g: number) => (Number.isInteger(g) ? String(g) : g.toFixed(1)).replace(".", ",");

/** Röstung eines Favoriten, gelesen aus der Profil-Notiz („Dark“ / „Light“). */
type FavGroup = "dark" | "light" | "other";
const FAV_GROUP_ORDER: FavGroup[] = ["dark", "light", "other"];
const FAV_GROUP_LABEL: Record<FavGroup, string> = { dark: "Dunkel", light: "Hell", other: "Weitere" };
/** Höchstens so viele Favoriten je Gruppe. */
const FAV_PER_GROUP = 3;
/** Röstgrad einer Sorte -> Gruppe auf der Startseite. */
function beanGroupOf(level: string | null): FavGroup {
  if (level === "dark" || level === "medium-dark" || level === "medium") return "dark";
  if (level === "light" || level === "light-medium") return "light";
  return "other";
}
const DARK_RE = /(^|[^a-zäöüß])(dark|dunkel)([^a-zäöüß]|$)/i;
const LIGHT_RE = /(^|[^a-zäöüß])(light|hell)([^a-zäöüß]|$)/i;
function favGroupOf(p: Profile): FavGroup {
  const n = p.notes ?? "";
  if (DARK_RE.test(n)) return "dark";
  if (LIGHT_RE.test(n)) return "light";
  return "other";
}

/** Rückspül-Reminder banner action button style. */
const backflushBtn = (primary: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
  color: primary ? C.org : C.txtS,
  background: primary ? C.orgD : C.sunken,
  border: `1px solid ${primary ? C.org : C.bdr2}`,
});

/** Einschaltknöpfe (Maschine aus). */
const powerBtn = (primary: boolean, disabled: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  justifyContent: "center",
  width: 96,
  padding: 0,
  minHeight: 44,
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  whiteSpace: "nowrap",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  color: primary ? C.red : C.txtS,
  background: primary ? alpha(C.red, 0.12) : C.sunken,
  border: `1px solid ${primary ? alpha(C.red, 0.55) : C.bdr2}`,
});

// ---- Beep direkt im Browser (Web Audio API) ----
// Browser sperren Ton, bis der Nutzer die Seite einmal angetippt hat. Der
// AudioContext wird daher einmal angelegt und beim ersten Tippen freigeschaltet
// (siehe unlock-Effect in der Komponente).
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/** Muss in einem Tipp-/Klick-Handler laufen, damit der Browser Ton erlaubt. */
function unlockAudio(): void {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** Drei kurze Töne. Gibt false zurück, wenn der Ton noch gesperrt ist. */
function playBeep(): boolean {
  const ctx = getAudioCtx();
  if (!ctx || ctx.state !== "running") return false;
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    const t0 = now + i * 0.3;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.6, t0 + 0.02);
    gain.gain.linearRampToValueAtTime(0, t0 + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  }
  return true;
}

interface DashboardProps {
  frame: LiveFrame | null;
  setpoints: SetpointsFrame | null;
  /** Patch 124: Rueckspuelen-Anzeige im Kopf (Experten-Ansicht), gespeist aus den Pflege-Erinnerungen. */
  backflushDue?: boolean;
  backflushDaysAgo?: number | null;
  /** Patch 125: welche Art als Naechstes dran ist ("ohne Fettlöser" / "mit Fettlöser"), steht als Beschriftung; null = keine Rueckspuel-Erinnerung an, Anzeige aus. */
  backflushNext?: string | null;
  /** Patch 127: in wie vielen Tagen die naechste Art dran ist (<= 0 = faellig); null = Anzeige "zuletzt" wie frueher. */
  backflushDueInDays?: number | null;
  /** Whether "Jetzt rückspülen" is possible (a matching maintenance profile exists). */
  backflushCanRun?: boolean;
  onBackflushRun?: () => void;
  /** Faellige Pflege-Erinnerungen (Rueckspuelen mit Fettloeser / Wasser, Duschsieb). */
  careDue?: Array<{ id: string; title: string; hint: string; daysAgo: number; runProfileId: number | null }>;
  onCareRun?: (id: string) => void;
  onCareDone?: (id: string) => void;
  onCareSnooze?: (id: string) => void;
  connectionState: ConnectionState;
  machineState: MachineState;
  /** Called when BG or BB gauge is tapped. */
  onGaugeTap?: (gauge: "brewGroup" | "brewBoiler") => void;
  /** Favorite profiles (die ersten 3 stehen groß in der Mitte). */
  favorites?: Profile[];
  /** Fallback, falls onExecute nicht angebunden ist: Tipp auf ein Favoriten-Profil. */
  onPillTap?: (profile: Profile) => void;
  /** Start einer Variante (null = die erste) — wie im Reiter Profile. */
  onExecute?: (profile: Profile, variantId: number | null) => void;
  /** Start einer Variante, die in der App läuft (Schrittfolge). */
  onExecuteDrive?: (profile: Profile, variantId: number | null) => void;
  /** Klick auf einen gesperrten Start — die App sagt, WARUM gesperrt ist. */
  onBlockedStart?: () => void;
  /** Skripte der Maschine (für die Kurvenvorschau der Favoriten). */
  scripts?: XeniaScript[];
  /** Klick auf den Namen eines Favoriten: Profil-Editor öffnen. */
  onEditProfile?: (profileId: number) => void;
  /** Klick auf den Bohnennamen: Sorte öffnen. */
  onEditCoffee?: (coffeeId: number) => void;
  /** Start mit bevorzugtem Profil der Bohne; die aktive Röstung wird im Vorab-Dialog vorgewählt. */
  onStartBean?: (profile: Profile, variantId: number | null, beanId: number) => void;
  /** Maschine einschalten (nur sichtbar, wenn sie aus ist). */
  onPowerOn?: () => void | Promise<void>;
  /** Maschine ohne Dampfboiler einschalten (nur sichtbar, wenn sie aus ist). */
  onPowerOnNoSteam?: () => void | Promise<void>;
  /** Einfache Ansicht: grosse Ein/Aus-Felder statt der Temperaturen. */
  simple?: boolean;
  onSimplePower?: (on: boolean) => void | Promise<void>;
  onSimpleSteam?: (on: boolean) => void | Promise<void>;
  mobile?: boolean;
  /** Set when a shot is in progress — switches to brewing layout. */
  activeShot?: Shot | null;
  /** Last completed shot — keeps brewing layout visible after shot ends. */
  lastEndedShot?: Shot | null;
  /** lastEndedShot kommt aus der DB (App neu geladen), nicht aus einem eben
   *  beendeten Bezug — dann kein "Bezug beendet"-Hinweis. */
  restoredShot?: boolean;
  /** Bewertungsfenster offen — Schliessen (auch ohne Speichern) startet die 10 s, dann verschwindet der Verlauf. */
  reviewOpen?: boolean;
  /** Alle Profile — fuer den Namen des gezeigten Bezugs ueber dem Diagramm. */
  profiles?: Profile[];
  /** Aktuelle Stufe eines laufenden App-Bezugs (null bei Skript-Bezuegen). */
  driveStage?: DriveStage | null;
  /** Alle Stufen des laufenden bzw. zuletzt gelaufenen App-Bezugs (Soll-Kurve, Ziel). */
  driveStages?: DriveStage[];
  /** Gespeicherte Stufen des zuletzt beendeten Bezugs (Soll-Kurve nach dem Bezug). */
  endedStages?: EndedShotStages | null;
  /** ÄW-B: app-initiated maintenance run in progress (backflush etc.). When set,
   *  the chart area shows a "maintenance running" banner + countdown instead. */
  maintenance?: MaintenanceRun | null;
  /** A finished backflush, held in the chart area until acknowledged — the drip
   *  tray is full at this point and must be emptied before the next brew. */
  maintenanceDone?: MaintenanceRun | null;
  onMaintenanceDoneAck?: () => void;
  /** Called when user clicks the stop button. */
  onStop?: () => Promise<void>;
  /** Live + finalized chart samples from useShotSamples. */
  samples?: ChartSample[];
  /** Chart x-axis settings loaded from backend (sliding window, resize). */
  xSettings?: ChartXSettings;
  /** Bumped by the app after a rating save → forces a recent-shots refetch.
   *  Das Dashboard nutzt das auch als Signal „Bewertung gespeichert“. */
  recentRefreshKey?: number;
  /** Central start-readiness guard (machine ready + not brewing). When provided,
   *  it drives both the favourite cards and the recent-card repeat. */
  canStartBrew?: boolean;
  /** Called when a recent-shot card's repeat button is clicked. */
  onRepeatShot?: (shot: RecentShot) => void;
}

function resolveOpacity(
  connectionState: ConnectionState,
  machineState: MachineState,
): number {
  if (connectionState === "disconnected") return 0.3;
  if (machineState === "off") return 0.6;
  return 1;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Dashboard({
  frame,
  setpoints,
  connectionState,
  machineState,
  onGaugeTap,
  favorites = [],
  onPillTap,
  onExecute,
  onExecuteDrive,
  onBlockedStart,
  scripts = [],
  onEditProfile,
  onEditCoffee,
  onStartBean,
  onPowerOn,
  onPowerOnNoSteam,
  simple = false,
  onSimplePower,
  onSimpleSteam,
  mobile = false,
  activeShot = null,
  lastEndedShot = null,
  restoredShot = false,
  reviewOpen = false,
  profiles = [],
  driveStage = null,
  driveStages = [],
  endedStages = null,
  maintenance = null,
  maintenanceDone = null,
  onMaintenanceDoneAck,
  onStop,
  samples = [],
  xSettings,
  recentRefreshKey = 0,
  canStartBrew,
  onRepeatShot,
  backflushDue = false,
  backflushDaysAgo = null,
  backflushCanRun = false,
  backflushNext,
  backflushDueInDays = null,
  onBackflushRun,
  careDue,
  onCareDone,
  onCareSnooze,
  onCareRun,
}: DashboardProps) {
  const { t } = useTranslation();
  const opacity = resolveOpacity(connectionState, machineState);
  // Show brewing layout while shot is active OR just ended
  const isBrewing = activeShot !== null;

  // ÄW-B maintenance banner: tick once a second while a run is active so the
  // countdown updates. Only runs during maintenance (cheap, self-clearing).
  const [maintNow, setMaintNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!maintenance) return;
    setMaintNow(Date.now());
    const iv = setInterval(() => setMaintNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [maintenance]);
  const maintRemainingMs =
    maintenance && maintenance.durationMs != null
      ? Math.max(0, maintenance.startedAt + maintenance.durationMs - maintNow)
      : null;

  // Water tank: machine reports 2 = empty (1 = full). Surface a persistent
  // banner while idle so a low tank is noticed before the next brew. Hidden
  // during a brew (no point — the machine is already pulling) and gone the
  // moment the tank reads full again. Only the ~60s setpoints poll updates it.
  const waterTankEmpty = !isBrewing && setpoints?.waterTankLevel === 2;

  // The chart fills the available vertical space (flex), so no measured height.

  // Central guard from the app (machine ready + not brewing); falls back to the
  // local readiness check if the prop isn't supplied.
  const canStartShot = canStartBrew ?? canStartShotFromState(
    connectionState,
    machineState,
    frame?.machineStatus,
  );
  // The shot to display: active takes priority, otherwise the last ended one
  const displayShot = activeShot ?? lastEndedShot;

  // Kopfzeile des Diagramms: Profil (+ Variante, wenn es mehrere gibt), waehrend
  // eines App-Bezugs dazu die Stufe. Skript-Bezuege haben keine: die Maschine
  // meldet ihren Skriptschritt nicht — und so bleibt auch keine alte Stufe stehen.
  const chartTitle = useMemo(() => {
    const p = displayShot ? profiles.find((x) => x.id === displayShot.profileId) : undefined;
    if (!p) return null;
    const variant = (p.variants?.length ?? 0) > 1 ? p.variants!.find((v) => v.id === displayShot!.variantId) : undefined;
    return [p.name, variant?.name].filter(Boolean).join(" · ");
  }, [displayShot, profiles]);
  /** Stufe ohne Namen im Profil — dann ihre Art. */
  const stageKindLabel: Record<DriveStage["kind"], string> = {
    preinfusion: t("ui.dashboard.stageKind.preinfusion"), flow: t("ui.dashboard.stageKind.flow"),
    pressure: t("ui.dashboard.stageKind.pressure"), power: t("ui.dashboard.stageKind.power"),
  };
  const chartStage = activeShot !== null && activeShot.scriptId === null && driveStage !== null
    ? (driveStage.name ?? stageKindLabel[driveStage.kind]) : null;

  // App-Bezug: die Stufen auf der Zeitachse des gezeigten Bezugs. Läuft er, kommen
  // sie vom Treiber (Eintritt + Sollwert, nach dem Neuladen vom Server nachgespielt;
  // Stufe 0 kommt kurz vor dem Bezugsbeginn — gehört die Liste zu einem anderen
  // Bezug, nichts). Ist er beendet, aus der DB wie in der Historie, auch nach dem
  // Neuladen; die letzte Stufe endet dann mit dem Pumpenstopp, nicht mit dem Nachlauf.
  const lastSampleT = samples.length > 0 ? samples[samples.length - 1]!.t : 0;
  const ended = activeShot === null && endedStages !== null && endedStages.shotId === displayShot?.id ? endedStages : null;
  const stageEntries = useMemo(() => {
    if (!displayShot || displayShot.scriptId !== null) return null;
    if (ended) return recordedStageEntries(ended.stages, ended.steps, samples);
    if (driveStages.length === 0 || Math.abs(driveStages[0]!.enteredAt - displayShot.startedAt) > 10_000) return null;
    return liveStageEntries(driveStages, displayShot.startedAt);
  }, [displayShot, driveStages, ended, samples]);
  const stagesEndT = ended ? ended.brewEndS : lastSampleT;

  // Stufen der Variante, mit der der angezeigte App-Bezug läuft („wie X“ folgt X) — für die Ausstiege.
  const appSteps = useMemo(() => {
    if (!displayShot || displayShot.scriptId !== null) return null;
    const p = profiles.find((x) => x.id === displayShot.profileId);
    const v = p?.variants?.find((x) => x.id === displayShot.variantId);
    const src = v?.sameAsId != null ? p?.variants?.find((x) => x.id === v.sameAsId) : v;
    return src?.brewSteps?.steps ?? null;
  }, [displayShot, profiles]);

  // Soll-Kurve der gelaufenen Druck-/Flussstufen (Schalter „Soll-Kurve im Live-Diagramm“).
  const liveOverlay = useMemo(() => {
    if (!xSettings?.liveSoll || !stageEntries) return null;
    const s = liveSollCurve(stageEntries, stagesEndT);
    if (s.bar.length === 0 && s.flow.length === 0) return null;
    return { barSolid: s.bar, barHeld: [], flowSolid: s.flow, flowHeld: [], markers: [], endT: 0 };
  }, [xSettings?.liveSoll, stageEntries, stagesEndT]);

  const bg = frame?.brewGroupTempC ?? 0;
  const sb = frame?.steamBoilerPressureBar ?? 0;

  const showColorLogic =
    machineState !== "off" && machineState !== "disconnected";

  // Setpoints stay editable in every machine state (on, off, eco, heating) —
  // only blocked when fully disconnected, since there's no machine to talk to.
  const canEditSetpoints = machineState !== "disconnected";

  const bgTarget = showColorLogic ? setpoints?.brewGroupTargetC : undefined;

  // ---- Bewertung gespeichert? → Verlauf weg, Favoriten in die Mitte ----
  // Die App erhöht recentRefreshKey nach dem Speichern einer Bewertung. Wir
  // merken uns den Wert, solange der Bezug frisch beendet ist; ändert er sich
  // danach, gilt dieser Bezug als bewertet. Ein aus der DB wiederhergestellter
  // Bezug (App neu geladen) bekommt keine Bewertung mehr → gilt als erledigt.
  const [ratedShotId, setRatedShotId] = useState<number | null>(() => lastEndedShot?.id ?? null);
  // ^ beim Neuaufbau (Ansicht umgeschaltet) zaehlt ein schon beendeter Bezug als erledigt
  // Nach dem Speichern der Bewertung bleibt der Verlauf noch kurz stehen.
  const HOLD_AFTER_RATING_MS = 10000;
  const [holdRated, setHoldRated] = useState(false);
  useEffect(() => {
    if (!holdRated) return;
    const id = setTimeout(() => setHoldRated(false), HOLD_AFTER_RATING_MS);
    return () => clearTimeout(id);
  }, [holdRated]);
  const endKeyRef = useRef<{ id: number; key: number } | null>(null);
  // Bewertung uebersprungen: Schliessen des Fensters zaehlt wie "bewertet" (Haltezeit, dann Favoriten).
  const prevReviewOpen = useRef(false);
  useEffect(() => {
    const was = prevReviewOpen.current;
    prevReviewOpen.current = reviewOpen;
    if (was && !reviewOpen && lastEndedShot && !restoredShot) {
      setRatedShotId(lastEndedShot.id);
      setHoldRated(true);
    }
  }, [reviewOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lastEndedShot && !restoredShot && endKeyRef.current?.id !== lastEndedShot.id) {
      endKeyRef.current = { id: lastEndedShot.id, key: recentRefreshKey };
    }
  }, [lastEndedShot?.id, restoredShot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ref = endKeyRef.current;
    if (ref && lastEndedShot?.id === ref.id && recentRefreshKey !== ref.key) {
      setRatedShotId(ref.id);
      setHoldRated(true);
    }
  }, [recentRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratingDone =
    lastEndedShot !== null && (restoredShot || ratedShotId === lastEndedShot.id);
  const showFavoritesCenter = !isBrewing && !holdRated && (lastEndedShot === null || ratingDone);

  // ---- Audio freischalten: erster Tipp irgendwo in der App ----
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      if (audioCtx?.state === "running") {
        window.removeEventListener("pointerdown", handler);
        window.removeEventListener("keydown", handler);
      }
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  // ---- Beep-Zeit der laufenden Variante ----
  // Der Shot kennt nur profileId + variantId. Die Beep-Zeit steht an der
  // Variante (beepSeconds); null = kein Beep eingestellt. Der Zugriff ist
  // bewusst lose typisiert, damit das Dashboard auch baut, solange die Typen
  // das Feld noch nicht kennen.
  const beepKey = useMemo<string>(() => {
    if (activeShot === null) return "";
    const p = profiles.find((x) => x.id === activeShot.profileId) as { beepTimes?: number[] } | undefined;
    const raw = p?.beepTimes;
    return Array.isArray(raw) ? raw.filter((n) => Number.isFinite(n) && n >= 0).join(",") : "";
  }, [activeShot?.profileId, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Elapsed timer (rAF — no React re-renders per frame) + Beep ----
  const elapsedRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const firedBeepsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!isBrewing || !displayShot) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      firedBeepsRef.current = new Set();
      return;
    }

    const startedAt = displayShot.startedAt;
    const targets = beepKey === "" ? [] : beepKey.split(",").map(Number);

    function tick(): void {
      // Math.max(0, …): guard against tablet↔LXC clock skew showing a
      // negative elapsed time in the first seconds of a brew (Bug 3).
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const elapsedSeconds = Math.floor(elapsedMs / 1000);

      if (elapsedRef.current) {
        elapsedRef.current.textContent = formatElapsed(elapsedMs);
      }

      // >= statt ===: überspringt rAF (gedrosselt/Bildschirm gedimmt) genau
      // die Sekunde, wird der Beep trotzdem ausgelöst — aber nur einmal.
      // Jede Zeit genau einmal je Bezug. Liegt sie schon laenger als 5 s zurueck
      // (App erst mitten im Bezug geoeffnet), wird sie still uebersprungen.
      let due = false;
      for (const sec of targets) {
        if (elapsedSeconds >= sec && !firedBeepsRef.current.has(sec)) {
          firedBeepsRef.current.add(sec);
          if (elapsedSeconds - sec <= 5) due = true;
        }
      }
      if (due && !playBeep()) {
        console.log("Beep nicht abgespielt: Ton noch gesperrt (einmal in die App tippen).");
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isBrewing, displayShot?.startedAt, beepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Stop button ----
  const [stopping, setStopping] = useState(false);

  async function handleStop(): Promise<void> {
    if (!onStop) return;
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  }

  // ---- Einschalten (nur wenn die Maschine aus ist) ----
  const [powering, setPowering] = useState(false);

  async function handlePower(fn?: () => void | Promise<void>): Promise<void> {
    if (!fn) return;
    setPowering(true);
    try {
      await fn();
    } finally {
      setPowering(false);
    }
  }

  const showPowerButtons =
    machineState === "off" &&
    connectionState !== "disconnected" &&
    !isBrewing &&
    (onPowerOn !== undefined || onPowerOnNoSteam !== undefined);

  // Chart mode
  const chartMode: ChartMode = activeShot !== null ? "brewing" : lastEndedShot !== null ? "ended" : "idle";

  // Yield target: Cmd27 takes precedence over profile target
  const yieldTarget = displayShot?.cmd27Value ?? displayShot?.yieldTargetG ?? null;

  // Was die laufende Stufe tun soll: Ziel (Rampe ab Eintritt, „vom Puck“) und Ende.
  const chartGoal = (() => {
    if (!isBrewing || !driveStage || !stageEntries || !appSteps) return null;
    const step = appSteps[driveStage.index];
    const entry = stageEntries[stageEntries.length - 1];
    if (!step || !entry || driveStages[driveStages.length - 1]!.index !== driveStage.index) return null;
    const sp = driveStage.setpoint;
    const unit = driveStage.kind === "pressure" ? "bar" : driveStage.kind === "flow" ? "g/s" : "%";
    const num = (v: number) => dec(v.toFixed(unit === "%" ? 0 : 1));
    const parts: string[] = [];
    if (step.kind === "preinfusion") parts.push(t(step.fill === "fast" ? "ui.dashboard.goal.fillFast" : "ui.dashboard.goal.fill"));
    else if (sp) {
      if (sp.adopted) parts.push(t("ui.dashboard.goal.adopted", { to: num(sp.to), unit }));
      else if (sp.rampMs > 0) parts.push(t("ui.dashboard.goal.ramp", { from: num(sp.from), to: num(sp.to), unit, s: Math.round(sp.rampMs / 1000) }));
      else parts.push(t("ui.dashboard.goal.hold", { to: num(sp.to), unit }));
    }
    const ex = step.exit;
    const ends: string[] = [];
    if (ex.seconds !== undefined) ends.push(t("ui.dashboard.goal.left", { s: Math.max(0, Math.ceil(ex.seconds - (lastSampleT - entry.t))) }));
    if (ex.weightG !== undefined) ends.push(t("ui.dashboard.goal.atWeight", { v: dec(String(ex.weightG)) }));
    if (ex.pressureBar !== undefined) ends.push(t("ui.dashboard.goal.atPressure", { v: dec(String(ex.pressureBar)) }));
    if (ex.pressureBelowBar !== undefined) ends.push(t("ui.dashboard.goal.belowPressure", { v: dec(String(ex.pressureBelowBar)) }));
    if (ex.flowGs !== undefined) ends.push(t("ui.dashboard.goal.belowFlow", { v: dec(String(ex.flowGs)) }));
    if (ex.flowAboveGs !== undefined) ends.push(t("ui.dashboard.goal.aboveFlow", { v: dec(String(ex.flowAboveGs)) }));
    if (step.kind === "preinfusion" && preinfusionArrivalGs(appSteps[driveStage.index + 1]) !== null) ends.unshift(t("ui.dashboard.goal.arrived"));
    if (ends.length === 0 && driveStage.index === appSteps.length - 1 && yieldTarget !== null) ends.push(t("ui.dashboard.goal.atWeight", { v: dec(yieldTarget.toFixed(0)) }));
    if (ends.length) parts.push(ends.join(" / "));
    return parts.length ? parts.join(" · ") : null;
  })();

  // Post-shot comparison: once the shot is finished, draw the past shots of the
  // same brew behind it. Not while brewing — the ghosts would have to slide
  // with the moving x-window on every frame (see ShotGhostLayer).
  // Nicht nötig, solange die Favoriten statt des Verlaufs angezeigt werden.
  const { ghosts } = useShotGhosts(
    chartMode === "ended" && !showFavoritesCenter && (xSettings?.showGhosts ?? false) ? (displayShot?.id ?? null) : null,
    true,
    xSettings?.ghostCount ?? 20,
  );

  // Aggregate values over the full shot for post-shot review only.
  // During brewing live tiles use frame/latest-sample values and avoid O(n) work.
  const shotAggregates = useMemo(() => {
    if (chartMode !== "ended") return null;
    if (samples.length === 0) return null;
    let sumP = 0, nP = 0, sumF = 0, nF = 0, sumT = 0, nT = 0;
    for (const s of samples) {
      if (s.pressure !== null) { sumP += s.pressure; nP++; }
      if (s.flow !== null)     { sumF += s.flow;     nF++; }
      if (s.temp !== null)     { sumT += s.temp;     nT++; }
    }
    return {
      avgPressure:  nP > 0 ? sumP / nP : null,
      avgFlow:      nF > 0 ? sumF / nF : null,
      avgTemp:      nT > 0 ? sumT / nT : null,
      finalWeight:  samples[samples.length - 1].weight,
    };
  }, [samples.length, chartMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chart Y-weight max: expand if target is above default 50g
  const yWeightMax = yieldTarget !== null && yieldTarget > 50 ? Math.ceil(yieldTarget / 10) * 10 + 10 : 50;
  const weightReached =
    yieldTarget !== null && frame !== null && frame.scaleWeightG >= yieldTarget;

  // DURATION cell text. While brewing the rAF loop overwrites it live; the
  // rendered value covers the ended (final duration) and idle ("—:—") cases.
  const durationText = isBrewing
    ? "0:00"
    : displayShot?.endedAt != null
      ? formatElapsed(displayShot.endedAt - displayShot.startedAt)
      : "—:—";

  // ---- Favoriten in der Mitte (wie im Reiter Profile), nach Röstung gruppiert ----
  const favGroups = useMemo(() => {
    const g: Record<FavGroup, Profile[]> = { dark: [], light: [], other: [] };
    for (const p of favorites) {
      const k = favGroupOf(p);
      if (g[k].length < FAV_PER_GROUP) g[k].push(p);
    }
    return g;
  }, [favorites]);
  const hasRoastGroups = favGroups.dark.length > 0 || favGroups.light.length > 0;
  const scriptById = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);

  // ---- Bohnen (Sorten mit aktiver Röstung) statt Profil-Favoriten ----
  const { coffees, updateCoffee } = useCoffees();
  // Einfache Ansicht: letzte Bezuege (fuer Dosis und Mahlgrad je Bohne/Variante).
  const [lastShots, setLastShots] = useState<RecentShot[]>([]);
  useEffect(() => {
    if (!simple) return;
    let off = false;
    fetch("/api/shots/recent?limit=100")
      .then((r) => r.json())
      .then((d: unknown) => {
        const list = Array.isArray(d) ? d : (d as { shots?: unknown })?.shots;
        if (!off) setLastShots(Array.isArray(list) ? (list as RecentShot[]) : []);
      })
      .catch(() => { /* ohne Werte: Striche */ });
    return () => { off = true; };
  }, [simple, lastEndedShot?.id, recentRefreshKey]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const hiddenVariants = useHiddenVariants();
  const sayingPrefs = useSayingPrefs();
  const beanCards = useMemo(
    () =>
      coffees
        .filter((c) => c.activeRoasting !== null)
        .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)),
    [coffees],
  );
  const beanGroups = useMemo(() => {
    const g: Record<FavGroup, CoffeeView[]> = { dark: [], light: [], other: [] };
    for (const c of beanCards) g[beanGroupOf(c.roastLevel)].push(c);
    return g;
  }, [beanCards]);
  const hasBeanRoastGroups = beanGroups.dark.length > 0 || beanGroups.light.length > 0;

  const renderBeanRow = (c: CoffeeView) => {
    const bean = c.activeRoasting;
    if (bean === null) return null;
    const p = c.preferredProfileId != null ? profileById.get(c.preferredProfileId) : undefined;
    // Pro Bohne ausgeblendete Varianten (Bohnen-Editor); bei hellen Bohnen ist Single standardmaessig aus.
    // Sind alle ausgeblendet, zeigen wir alle.
    const shownAll: ProfileVariant[] = p ? startVariants(p) : [];
    const visible = shownAll.filter((v) => !variantHidden(v, c.id, isLightRoast(c.roastLevel), hiddenVariants));
    const shown: ProfileVariant[] = visible.length > 0 ? visible : shownAll;
    const start = (v: ProfileVariant | null) => {
      if (!p) return;
      if (onStartBean) { onStartBean(p, v?.id ?? null, bean.id); return; }
      if (!onExecute) { onPillTap?.(p); return; }
      if (v !== null && variantRunsInApp(p, v)) (onExecuteDrive ?? onExecute)(p, v.id);
      else onExecute(p, v?.id ?? null);
    };
    const arab = c.arabicaPct ?? (c.robustaPct != null ? 100 - c.robustaPct : null);
    const rob = c.robustaPct ?? (c.arabicaPct != null ? 100 - c.arabicaPct : null);
    const sub = arab !== null && rob !== null ? (arab >= 100 ? "100 % Arabica" : rob >= 100 ? "100 % Robusta" : `${arab} % Arabica · ${rob} % Robusta`) : "";
    const meta = p
      ? [`#${p.id}`, p.targetTempC !== null ? `${p.targetTempC.toFixed(1).replace(".", ",")} °C` : null]
          .filter(Boolean).join(" · ")
      : null;
    return (
      <div
        key={c.id}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: mobile ? "wrap" : "nowrap",
          gap: mobile ? 8 : 10,
          minHeight: 56,
          boxSizing: "border-box",
          padding: mobile ? "6px 10px" : "5px 12px",
          background: C.accG,
          border: `1px solid ${C.accB}`,
          borderRadius: 14,
        }}
      >
        {/* links: Bohne */}
        <div style={{ flex: 1, minWidth: mobile ? 100 : 110, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {c.favourite && <Star size={13} color={C.acc} fill={C.acc} style={{ flexShrink: 0 }} />}
            <button
              onClick={() => onEditCoffee?.(c.id)}
              disabled={!onEditCoffee}
              title={onEditCoffee ? "Bohne öffnen" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 6, minWidth: 0, padding: 0,
                border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left",
                cursor: onEditCoffee ? "pointer" : "default",
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 600, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
            </button>
          </div>
          {sub !== "" && (
            <span style={{ fontSize: 11, color: C.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sub}
            </span>
          )}
        </div>
        {/* Mitte: Start je Variante */}
        {p && (
          <div style={{ display: "flex", flexWrap: mobile ? "wrap" : "nowrap", gap: 4, justifyContent: "flex-start", flexShrink: 0 }}>
            {shown.length > 0
              ? shown.map((v) => favStartButton(`v${v.id}`, v.name, v.yieldG, () => start(v)))
              : favStartButton("start", "Start", p.yieldTargetSingleG, () => start(null))}
          </div>
        )}
        {/* Mitte: Profil (oder Auswahl, solange keins hinterlegt ist) */}
        <div style={{ flex: 1, minWidth: mobile ? 100 : 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {p ? (
            <>
              <button
                onClick={() => onEditProfile?.(p.id)}
                disabled={!onEditProfile}
                title={onEditProfile ? "Profil bearbeiten" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: "100%", padding: 0,
                  border: "none", background: "transparent", fontFamily: "inherit",
                  cursor: onEditProfile ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </button>
              <span style={{ ...MONO, fontSize: 11, color: C.mut }}>{meta}</span>
            </>
          ) : (
            <select
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id > 0) void updateCoffee(c.id, { preferredProfileId: id });
              }}
              style={{
                maxWidth: "100%", height: 40, borderRadius: 8, padding: "0 8px", fontFamily: "inherit",
                fontSize: 14, color: C.txt, background: C.sunken, border: `1px solid ${C.bdr2}`,
              }}
            >
              <option value="">Profil wählen …</option>
              {profiles.map((q) => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
          )}
        </div>
        {p && !mobile && (
          <span style={{ width: 110, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <ProfileSparkline
              profile={p}
              script={p.scriptIdSingle !== null ? scriptById.get(p.scriptIdSingle) : undefined}
            />
          </span>
        )}

      </div>
    );
  };

  const favStartButton = (
    key: string,
    label: string,
    yieldG: number | null,
    onTap: () => void,
    big = false,
  ) => {
    const ready = canStartShot;
    return (
      <button
        key={key}
        onClick={() => { if (ready) onTap(); else onBlockedStart?.(); }}
        title={ready ? undefined : "Maschine nicht bereit oder Bezug läuft"}
        style={{
          ...(big ? { width: mobile ? 92 : 120 } : mobile ? { minWidth: 60, maxWidth: 110, padding: "0 4px" } : { width: 84 }),
          height: big ? 56 : 46,
          boxSizing: "border-box",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          borderRadius: 10,
          border: `2px solid ${ready ? alpha(C.acc, 0.8) : C.bdr3}`,
          background: ready ? C.sunken : "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ maxWidth: "100%", padding: "0 6px", boxSizing: "border-box", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: big ? 20 : 14, fontWeight: 600, color: ready ? C.acc : C.mut }}>
          {label}
        </span>
        {SHOW_YIELD && yieldG !== null && <span style={{ ...MONO, fontSize: 11, color: C.mut }}>{fmtG(yieldG)} g</span>}
      </button>
    );
  };

  // ---- Einfache Ansicht: Kopf-Felder und hohe Bohnenkarten ----
  const simpleTile = (title: string, sub: string, color: string, bg: string, disabled: boolean, onTap: () => void) => (
    <button
      onClick={onTap}
      disabled={disabled}
      style={{
        minWidth: mobile ? 0 : 170,
        flex: mobile ? "1 1 0" : undefined,
        minHeight: 44,
        padding: "3px 14px",
        borderRadius: 14,
        border: `2px solid ${color}`,
        background: bg,
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: C.txtS }}>{sub}</span>
    </button>
  );
  const mOff = machineState === "off" || machineState === "disconnected";
  const steamOnNow = frame?.steamBoilerStatus === 2;
  const steamReadyNow = steamOnNow && setpoints != null && sb >= setpoints.steamBoilerTargetPressureBar - 0.1;
  const simpleTiles = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch", flex: mobile ? "1 1 100%" : undefined }}>
      {machineState === "off" || machineState === "disconnected"
        ? simpleTile("Maschine aus", "Tippen zum Einschalten", C.dim, C.dimG,
            machineState === "disconnected" || powering, () => { void handlePower(() => onSimplePower?.(true)); })
        : machineState === "brewing" || machineState === "draining"
        ? simpleTile("Bezug läuft", "", C.acc, C.accG, true, () => { /* gesperrt */ })
        : machineState === "heating"
        ? simpleTile("Maschine heizt auf", "Tippen zum Ausschalten", C.red, C.redD, powering, () => { void handlePower(() => onSimplePower?.(false)); })
        : machineState === "eco"
        ? simpleTile("Eco-Modus", "Tippen zum Aufwecken", C.blu, C.bluD, powering, () => { void handlePower(() => onSimplePower?.(true)); })
        : simpleTile("Espresso bereit", "Tippen zum Ausschalten", C.grn, C.grnD, powering, () => { void handlePower(() => onSimplePower?.(false)); })}
      {mOff
        ? simpleTile("Dampf aus", "Maschine ist aus", C.dim, C.dimG, true, () => { /* Maschine aus */ })
        : !steamOnNow
        ? simpleTile("Dampf aus", "Tippen zum Einschalten", C.blu, C.bluD, powering, () => { void handlePower(() => onSimpleSteam?.(true)); })
        : steamReadyNow
        ? simpleTile("Dampf bereit", "Tippen zum Ausschalten", C.grn, C.grnD, powering, () => { void handlePower(() => onSimpleSteam?.(false)); })
        : simpleTile("Dampf heizt auf", "Tippen zum Ausschalten", C.red, C.redD, powering, () => { void handlePower(() => onSimpleSteam?.(false)); })}
    </div>
  );

  /** Letzter Bezug dieser Bohne (alle Roestungen der Sorte) mit dem hinterlegten Profil. */
  const lastFor = (c: CoffeeView, profileId: number, variantId: number | null) => {
    const ids = new Set(c.roastings.map((r) => r.id));
    const mine = lastShots
      .filter((s) => s.beanId !== null && ids.has(s.beanId) && s.profileId === profileId)
      .sort((a, b) => b.startedAt - a.startedAt);
    const byVariant = variantId !== null ? mine.find((s) => s.variantId === variantId) : undefined;
    return { dose: byVariant?.doseG ?? null, grind: (byVariant ?? mine[0])?.grindSetting ?? null };
  };
  const fmtGrind = (n: number) => String(n).replace(".", ",");

  // Dosis/Mahlgrad der letzten Bezuege stehen nur noch im PreShot-Dialog.
  const SHOW_LAST_VALUES_SIMPLE = false;
  const renderBeanRowSimple = (c: CoffeeView) => {
    const bean = c.activeRoasting;
    if (bean === null) return null;
    const p = c.preferredProfileId != null ? profileById.get(c.preferredProfileId) : undefined;
    const shownAll: ProfileVariant[] = p ? startVariants(p) : [];
    const visible = shownAll.filter((v) => !variantHidden(v, c.id, isLightRoast(c.roastLevel), hiddenVariants));
    const shown: ProfileVariant[] = visible.length > 0 ? visible : shownAll;
    const start = (v: ProfileVariant | null) => {
      if (!p) return;
      if (onStartBean) { onStartBean(p, v?.id ?? null, bean.id); return; }
      if (!onExecute) { onPillTap?.(p); return; }
      if (v !== null && variantRunsInApp(p, v)) (onExecuteDrive ?? onExecute)(p, v.id);
      else onExecute(p, v?.id ?? null);
    };
    const arab = c.arabicaPct ?? (c.robustaPct != null ? 100 - c.robustaPct : null);
    const rob = c.robustaPct ?? (c.arabicaPct != null ? 100 - c.arabicaPct : null);
    const sub = arab !== null && rob !== null ? (arab >= 100 ? "100 % Arabica" : rob >= 100 ? "100 % Robusta" : `${arab} % Arabica · ${rob} % Robusta`) : "";
    const variantCol = (key: string, label: string, v: ProfileVariant | null) => {
      const info = p ? lastFor(c, p.id, v?.id ?? null) : { dose: null, grind: null };
      return (
        <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          {favStartButton(key, label, null, () => start(v), true)}
          {SHOW_LAST_VALUES_SIMPLE && (
            <div style={{ ...MONO, fontSize: 12, lineHeight: 1.25, color: C.txtS, textAlign: "center", whiteSpace: "nowrap" }}>
              <div>{info.dose !== null ? `${fmtG(info.dose)} g` : "– g"}</div>
              <div style={{ color: C.mut }}>{info.grind !== null ? `Mahlgrad ${fmtGrind(info.grind)}` : "Mahlgrad –"}</div>
            </div>
          )}
        </div>
      );
    };
    return (
      <div
        key={c.id}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: mobile ? "wrap" : "nowrap",
          gap: mobile ? 12 : 20,
          minHeight: 0,
          boxSizing: "border-box",
          padding: mobile ? "8px 10px" : "8px 16px",
          background: C.accG,
          border: `1px solid ${C.accB}`,
          borderRadius: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: mobile ? 120 : 160, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {c.favourite && <Star size={16} color={C.acc} fill={C.acc} style={{ flexShrink: 0 }} />}
            <span style={{ fontSize: 32, fontWeight: 700, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}
            </span>
          </div>
          {sub !== "" && <span style={{ fontSize: 13, color: C.mut }}>{sub}</span>}
        </div>
        {p ? (
          <div style={{ display: "flex", flexWrap: mobile ? "wrap" : "nowrap", gap: 12, justifyContent: "flex-end", flexShrink: 0 }}>
            {shown.length > 0
              ? shown.map((v) => variantCol(`v${v.id}`, v.name, v))
              : variantCol("start", "Start", null)}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: C.mut }}>Kein Profil hinterlegt</span>
        )}
      </div>
    );
  };
  const beanRowFn = simple ? renderBeanRowSimple : renderBeanRow;

  const renderFavRow = (p: Profile) => {
    const isFlow = p.brewSteps != null;
    // Ein Startknopf je Variante (alle, nicht nur die ersten zwei).
    const shown: ProfileVariant[] = startVariants(p);
    const start = (v: ProfileVariant | null) => {
      if (!onExecute) { onPillTap?.(p); return; }
      if (v !== null && variantRunsInApp(p, v)) (onExecuteDrive ?? onExecute)(p, v.id);
      else onExecute(p, v?.id ?? null);
    };
    const meta = [`#${p.id}`, p.targetTempC !== null ? `${p.targetTempC.toFixed(1).replace(".", ",")} °C` : null]
      .filter(Boolean).join(" · ");
    return (
      <div
        key={p.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: mobile ? 8 : 14,
          minHeight: 76,
          boxSizing: "border-box",
          padding: mobile ? "8px 10px" : "8px 16px",
          background: C.accG,
          border: `1px solid ${C.accB}`,
          borderRadius: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: mobile ? 90 : 140, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Star size={13} color={C.acc} fill={C.acc} style={{ flexShrink: 0 }} />
            <button
              onClick={() => onEditProfile?.(p.id)}
              disabled={!onEditProfile}
              title={onEditProfile ? "Profil bearbeiten" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 6, minWidth: 0, padding: 0,
                border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left",
                cursor: onEditProfile ? "pointer" : "default",
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 600, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
            </button>
          </div>
          <span style={{ ...MONO, fontSize: 11, color: C.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta}
          </span>
        </div>
        {!mobile && (
          <span style={{ width: 120, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <ProfileSparkline
              profile={p}
              script={p.scriptIdSingle !== null ? scriptById.get(p.scriptIdSingle) : undefined}
            />
          </span>
        )}
        {!mobile && (
          <span style={{ width: 56, flexShrink: 0, fontSize: 11, color: isFlow ? C.blu : C.txtS, textAlign: "center", border: `1px solid ${C.bdrL}`, borderRadius: 6, padding: "3px 0" }}>
            {isFlow ? "App" : "Skript"}
          </span>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", flexShrink: 0, maxWidth: mobile ? "58%" : 460 }}>
          {shown.length > 0
            ? shown.map((v) => favStartButton(`v${v.id}`, v.name, v.yieldG, () => start(v)))
            : favStartButton("start", "Start", p.yieldTargetSingleG, () => start(null))}
        </div>
      </div>
    );
  };

  // ---- Readout values (overlay over the chart, brewing/ended only) ----
  // Brewing: live frame values. Ended: aggregates over the whole shot, so the
  // overlay matches the (now legend-less) chart's post-shot summary.
  const useAggregates = chartMode === "ended" && shotAggregates !== null;
  const lastSample = samples.length > 0 ? samples[samples.length - 1] : null;
  const liveFlow = lastSample?.flow ?? null;
  const dPressure = useAggregates ? shotAggregates!.avgPressure : (frame?.pumpPressureBar ?? null);
  const dFlow     = useAggregates ? shotAggregates!.avgFlow     : liveFlow;
  const dWeight   = useAggregates ? shotAggregates!.finalWeight : (frame?.scaleWeightG ?? null);
  const dTemp     = useAggregates ? shotAggregates!.avgTemp     : (frame?.brewGroupTempC ?? null);
  const bgTargetVal = setpoints?.brewGroupTargetC ?? null;
  // Same 4-step logic as Gauge.tsx resolveColor (non-steam) — keep in sync.
  const tempColor = (() => {
    if (useAggregates || dTemp === null || bgTargetVal === null) return C.txt;
    const diff = dTemp - bgTargetVal;
    if (diff > 2)    return C.red;
    if (diff >= -0.5) return C.grn;
    if (diff >= -5)   return C.org;
    return C.blu;
  })();

  // One readout cell: 3px curve-colour bar (left) + key over mono value.
  // barColor ties the cell to its chart curve; valueColor highlights state.
  // Handy: die Ablese-Werte stehen in einer Zeile über der Kurve statt darauf —
  // zweizeilig verdeckten sie das obere Viertel des Diagramms.
  const roGap = mobile ? 5 : 8;
  const roValueSize = mobile ? 14 : 19;
  const roUnitSize = mobile ? 9.5 : 11;
  const roCell = (
    key: string,
    value: string,
    unit: string,
    barColor: string,
    valueColor: string = C.txt,
  ) => (
    <div style={{ display: "flex", gap: roGap }}>
      <div style={{ width: 3, borderRadius: 2, background: barColor, alignSelf: "stretch", flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.1em", color: C.mut, textTransform: "uppercase" }}>
          {key}
        </div>
        <div style={{ ...MONO, fontWeight: 700, fontSize: roValueSize, lineHeight: 1, color: valueColor, whiteSpace: "nowrap" }}>
          {value}
          {unit ? (
            <small style={{ fontSize: roUnitSize, color: C.mut, fontWeight: 400, marginLeft: 2 }}>{unit}</small>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="dash-root" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Water-tank-low banner (idle only): persistent until refilled. */}
      {waterTankEmpty && (
        <div
          role="status"
          style={{
            flexShrink: 0,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            background: C.orgD,
            border: `1px solid ${C.org}`,
          }}
        >
          <Droplet size={18} color={C.org} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.org }}>
              {t("dashboard.waterLow.title")}
            </span>
            <span style={{ fontSize: 12, color: C.txt }}>
              {t("dashboard.waterLow.message")}
            </span>
          </div>
        </div>
      )}

      {/* Pflege-Erinnerungen (idle only): wie der Rueckspuel-Hinweis, je faellige Erinnerung eine Zeile. */}
      {!isBrewing && (careDue ?? []).map((c) => (
        <div
          key={c.id}
          role="status"
          style={{
            flexShrink: 0,
            marginBottom: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            background: C.orgD,
            border: `1px solid ${C.org}`,
          }}
        >
          <Droplets size={18} color={C.org} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.org }}>{c.title}</span>
            <span style={{ fontSize: 12, color: C.txt }}>
              {c.daysAgo === 1 ? "Zuletzt vor 1 Tag. " : `Zuletzt vor ${c.daysAgo} Tagen. `}{c.hint}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
            {c.runProfileId !== null && (
              <button onClick={() => onCareRun?.(c.id)} style={backflushBtn(true)}>
                {t("dashboard.backflush.run")}
              </button>
            )}
            <button onClick={() => onCareDone?.(c.id)} style={backflushBtn(false)}>
              {t("dashboard.backflush.done")}
            </button>
            <button onClick={() => onCareSnooze?.(c.id)} style={backflushBtn(false)}>
              {t("dashboard.backflush.snooze")}
            </button>
          </div>
        </div>
      ))}

      {/* Header row (Variante C): gauge chips left, Stop (brewing) / Einschalten (Maschine aus) right */}
      <div
        style={{
          marginBottom: simple ? 6 : 14,
          flexShrink: 0,
          display: "flex",
          alignItems: "stretch",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {simple && simpleTiles}
        {/* Gauges: gedimmt, wenn die Maschine aus ist / getrennt. Die Knöpfe
            rechts bleiben bewusst voll sichtbar. */}
        {!simple && (
        <div
          style={{
            opacity,
            transition: "opacity 0.3s",
            display: "flex",
            alignItems: "stretch",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <Gauge
            label="Brühgruppe"
            value={bg}
            unit="°C"
            target={bgTarget}
            setpoint={setpoints?.brewGroupTargetC}
            onTap={canEditSetpoints ? () => onGaugeTap?.("brewGroup") : undefined}
            mobile={mobile}
          />
          {/* Dampf: setpoint is a pressure (bar) — display only, no color logic
              (the steam thresholds in Gauge are in °C and don't apply to bar). */}
          <Gauge
            label={t("ui.dashboard.steam")}
            value={sb}
            unit="bar"
            color={machineState === "off" || machineState === "disconnected" ? C.dim : frame?.steamBoilerStatus !== 2 ? C.blu : setpoints && sb >= setpoints.steamBoilerTargetPressureBar - 0.1 ? C.grn : C.red}
            decimals={2}
            setpoint={setpoints?.steamBoilerTargetPressureBar}
            setpointDecimals={1}
            mobile={mobile}
          />
        </div>
        )}

        <TopClock machineState={machineState} mobile={mobile} hideTimers={simple} showSaying={simple ? sayingPrefs.simple : sayingPrefs.expert} />

        {/* Right side: dezenter Stop (brewing) oder Einschaltknöpfe (Maschine aus).
            Mobile (UP-4): drops to its own full-width line flush with the gauges. */}
        <div style={{ marginLeft: mobile ? 0 : "auto", flexBasis: mobile ? "100%" : "auto", display: "flex", alignItems: "stretch", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, minWidth: 0, position: "relative" }}>
          {isBrewing ? (
            // On mobile the Stop lives in the top bar — avoid a duplicate here.
            !mobile && (
            <button
              onClick={() => { void handleStop(); }}
              disabled={stopping}
              title={t("ui.stop.title")}
              onMouseEnter={(e) => { if (!stopping) e.currentTarget.style.background = alpha(C.red, 0.18); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = alpha(C.red, 0.10); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 16px",
                borderRadius: 10,
                background: alpha(C.red, 0.10),
                border: `1px solid ${alpha(C.red, 0.45)}`,
                color: C.red,
                fontSize: 13,
                fontWeight: 600,
                cursor: stopping ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.red,
                  animation: "xenia-pulse 1.4s ease-in-out infinite",
                  flexShrink: 0,
                }}
              />
              <Octagon size={15} strokeWidth={2.2} />
              {stopping ? t("ui.stop.busy") : t("ui.stop.button")}
            </button>
            )
          ) : SHOW_POWER_BUTTONS && showPowerButtons ? (
            <>
              {onPowerOn && (
                <button
                  onClick={() => { void handlePower(onPowerOn); }}
                  disabled={powering}
                  title="Einschalten" style={powerBtn(true, powering)}
                >
                  <Power size={15} strokeWidth={2.2} />
                  Ein
                </button>
              )}
              {onPowerOnNoSteam && (
                <button
                  onClick={() => { void handlePower(onPowerOnNoSteam); }}
                  disabled={powering}
                  title="Ohne Dampfboiler einschalten" style={powerBtn(false, powering)}
                >
                  <Power size={15} strokeWidth={2.2} />
                  Eco
                </button>
              )}
            </>
          ) : null}
          {!isBrewing && !simple && backflushNext !== null && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, opacity: backflushDue ? 1 : 0.4, transition: "opacity 0.2s" }}
              onMouseEnter={(e) => { if (!backflushDue) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { if (!backflushDue) e.currentTarget.style.opacity = "0.4"; }}
            >
              <div style={{ textAlign: "right", lineHeight: 1.25 }}>
                <div style={{ fontSize: 11, color: backflushDue ? C.org : C.mut }}>{backflushNext ?? "Rückspülen"}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: backflushDue ? C.org : C.txt }}>
                  {backflushDueInDays !== null
                    ? (backflushDueInDays <= 0 ? "fällig" : backflushDueInDays === 1 ? "morgen" : `in ${backflushDueInDays} Tagen`)
                    : (backflushDaysAgo === null ? "noch nie" : backflushDaysAgo === 0 ? "heute" : backflushDaysAgo === 1 ? "vor 1 Tag" : `vor ${backflushDaysAgo} Tagen`)}
                </div>
              </div>
              {backflushCanRun && (
                <button onClick={() => onBackflushRun?.()} style={backflushBtn(true)}>
                  {t("dashboard.backflush.run")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

<<<<<<< HEAD
      {/* ---- Mitte — füllt den verfügbaren Platz (flex) auf allen Breakpoints.
              ÄW-B: während eines Wartungslaufs ersetzt ein Banner + Countdown den
              Bereich (kein Bezug wird aufgezeichnet). Sonst: Verlauf, solange ein
              Bezug läuft oder noch nicht bewertet ist; danach die Favoriten. ---- */}
      <div style={{ marginBottom: 12, flex: "1 1 0", minHeight: 0, position: "relative" }}>
=======
      {/* ---- Chart — fills the available vertical space (flex); handy quer eine
              feste Hoehe und die Seite scrollt (.dash-chart in index.html).
              ÄW-B: while a maintenance run is active the chart area is replaced by
              a "maintenance running" banner + countdown (no shot is recorded). ---- */}
      <div className="dash-chart" style={{ marginBottom: 12, flex: "1 1 0", minHeight: 0, position: "relative" }}>
>>>>>>> origin/main
        {maintenance ? (
          <div
            style={{
              height: "100%",
              minHeight: 140,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              textAlign: "center",
              borderRadius: 12,
              border: `1px solid ${C.org}`,
              background: alpha(C.maintWarm, 0.06),
            }}
          >
            <Droplets size={40} color={C.org} style={{ opacity: 0.9 }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: C.org, letterSpacing: "0.01em" }}>
              {t("dashboard.maintenance.running")}
            </div>
            <div style={{ fontSize: 14, color: C.txt }}>{maintenance.label}</div>
            <div style={{ ...MONO, fontSize: 15, color: C.mut }}>
              {maintRemainingMs !== null && maintRemainingMs > 0
                ? t("dashboard.maintenance.remaining", { time: formatElapsed(maintRemainingMs) })
                : t("dashboard.maintenance.almostDone")}
            </div>
          </div>
        ) : maintenanceDone ? (
          <div
            style={{
              height: "100%",
              minHeight: 140,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              textAlign: "center",
              padding: "0 16px",
              borderRadius: 12,
              border: `1px solid ${C.org}`,
              background: alpha(C.maintWarm, 0.06),
            }}
          >
            <Droplets size={40} color={C.org} style={{ opacity: 0.9 }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: C.org, letterSpacing: "0.01em" }}>
              {t("dashboard.maintenance.doneTitle")}
            </div>
            <div style={{ fontSize: 14, color: C.txt, maxWidth: 380, lineHeight: 1.5 }}>
              {t("dashboard.maintenance.doneMessage")}
            </div>
            <button
              onClick={() => onMaintenanceDoneAck?.()}
              style={{
                padding: "10px 28px",
                borderRadius: 8,
                background: C.orgD,
                border: `1px solid ${C.org}`,
                color: C.org,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("dashboard.maintenance.doneAck")}
            </button>
          </div>
        ) : showFavoritesCenter ? (
          <div
            style={{
              height: "100%",
              minHeight: 140,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            {/* margin auto: zentriert, solange alles passt; sonst scrollt es von oben */}
            <div style={{ margin: "auto 0", display: "flex", flexDirection: "column", gap: 14 }}>
              {beanCards.length > 0 ? (
                hasBeanRoastGroups ? (
                  FAV_GROUP_ORDER.filter((k) => beanGroups[k].length > 0).map((k) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "8px 10px 10px",
                        borderRadius: 16,
                        border: `1px solid ${C.bdrL}`,
                      }}
                    >
                      <div style={{ fontSize: 17, color: C.txt, fontWeight: 700, letterSpacing: 0.3, paddingLeft: 4 }}>
                        {FAV_GROUP_LABEL[k]}
                      </div>
                      {beanGroups[k].map(beanRowFn)}
                    </div>
                  ))
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {beanGroups.other.map(beanRowFn)}
                  </div>
                )
              ) : favorites.length === 0 ? (
                <div style={{ fontSize: 13, color: C.mut, textAlign: "center" }}>
                  Noch keine Favoriten. Im Reiter Profile über das Menü „Zu Favoriten“ hinzufügen.
                </div>
              ) : hasRoastGroups ? (
                FAV_GROUP_ORDER.filter((k) => favGroups[k].length > 0).map((k) => (
                  <div key={k} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, color: C.mut, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, paddingLeft: 2 }}>
                      {FAV_GROUP_LABEL[k]}
                    </div>
                    {favGroups[k].map(renderFavRow)}
                  </div>
                ))
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {favGroups.other.map(renderFavRow)}
                </div>
              )}
            </div>
          </div>
        ) : (
        <>
        <ShotChart
          samples={samples}
          mode={chartMode}
          yieldTarget={yieldTarget}
          yWeightMax={yWeightMax}
          showTempAxis={!mobile}
          xSettings={xSettings}
          ghosts={ghosts}
          fill
          endedBadge={!restoredShot}
          title={chartTitle}
          titleTail={chartTitle ? chartStage : null}
          titleGoal={chartTitle && chartStage ? chartGoal : null}
          overlay={liveOverlay}
          topInset={mobile && chartMode !== "idle" ? MOBILE_READOUT_INSET : 0}
        />

        {/* Live readout overlay — over the top of the curve (brewing/ended only).
            Sits just below the chart's mode badge; gradient fades into the plot.
            Starts right of the y-axis numbers so they stay readable.
            Handy: one row in the space the chart leaves above the plot (topInset).
            pointer-events:none so the chart's own hover/tooltip still works. */}
        {chartMode !== "idle" && (
          <div
            style={mobile ? {
              position: "absolute",
              top: 36,
              left: READOUT_LEFT,
              right: 10,
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
              alignItems: "flex-start",
              pointerEvents: "none",
            } : {
              position: "absolute",
              top: 34,
              left: READOUT_LEFT,
              right: 14,
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "flex-start",
              pointerEvents: "none",
              padding: "10px 8px 22px",
              background:
                `linear-gradient(180deg, ${alpha(C.bg, 0.92)}, ${alpha(C.bg, 0)})`,
            }}
          >
            {/* Dauer — no curve, neutral bar; value carries the rAF timer ref */}
            <div style={{ display: "flex", gap: roGap }}>
              <div style={{ width: 3, borderRadius: 2, background: C.dim, alignSelf: "stretch", flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.1em", color: C.mut, textTransform: "uppercase" }}>
                  {t("ui.dashboard.duration")}
                </div>
                <div
                  ref={elapsedRef}
                  style={{ ...MONO, fontWeight: 700, fontSize: roValueSize, lineHeight: 1, color: isBrewing ? C.txt : C.mut }}
                >
                  {durationText}
                </div>
              </div>
            </div>

            {/* Balkenfarben = Kurvenfarben, beide aus den Messreihen-Tokens (theme.ts):
                Druck, Fluss, Gewicht, Temperatur. */}
            {roCell(t("ui.series.pressure"), dPressure !== null ? dPressure.toFixed(1) : "—", "bar", C.seriesPressure)}
            {roCell(t("ui.series.flow"), dFlow !== null ? dFlow.toFixed(2) : "—", "g/s", C.seriesFlow)}
            {roCell(
              t("ui.series.weight"),
              dWeight !== null ? dWeight.toFixed(1) : "—",
              yieldTarget !== null ? `/ ${yieldTarget.toFixed(0)} g` : "g",
              C.seriesWeight,
              weightReached ? C.grn : C.txt,
            )}
            {roCell(t("ui.series.temp"), dTemp !== null ? dTemp.toFixed(1) : "—", "°C", C.seriesTemp, tempColor)}
          </div>
        )}
        </>
        )}
      </div>

      {/* ---- Recent shots — Idle/Post-Brewing only; hidden during a live brew
           to save vertical space on tablet landscape (§5.9 Brewing-Modus). ---- */}
      {!isBrewing && !simple && (
        <div style={{ marginTop: 12, flexShrink: 0 }}>
          <RecentShots
            reloadKey={(lastEndedShot?.id ?? 0) + recentRefreshKey * 1_000_000}
            repeatBlocked={!canStartShot}
            onRepeat={(shot) => onRepeatShot?.(shot)}
          />
        </div>
      )}
    </div>
  );
}
