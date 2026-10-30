/**
 * PreShotDialog — Phase 1 Step 9.
 *
 * Opens from every start path (dashboard chip, profile list, repeat) before the
 * brew actually starts. The user picks the variant and the sieve (basket), bean,
 * grinder, grind setting, RPM and dose; "Bezug starten"
 * sends everything to POST /api/scripts/execute via the onStart callback.
 *
 * Field visibility is configured in Settings (usePreShotFieldSettings).
 * The bean field is always shown — the most important pre-shot context.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Scale, X } from "lucide-react";
import { useTranslation } from "../i18n/index.js";
import { usePreShotData } from "../hooks/usePreShotData.js";
import { usePreShotFieldSettings } from "../hooks/usePreShotFieldSettings.js";
import { BeanPicker, BeanLabelInput, isPickableBean } from "./BeanPicker.js";
import { resolveColor } from "./Gauge.js";
import type { GrindSource, Profile, ProfileVariant, ShotSize } from "@shared/types.js";
import { startVariants, shotSizeForBasket } from "@shared/profile-slots.js";
import { useBaskets } from "../hooks/useBaskets.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { formatDay } from "../lib/dates.js";
import theme, { alpha } from "../theme.js";
import { dec } from "../lib/num.js";
import { useSimple } from "../viewMode.js";

const C = theme;

// ---------------------------------------------------------------------------
// Payload sent to the parent's onStart handler
// ---------------------------------------------------------------------------

export interface PreShotPayload {
  beanId: number | null;
  /** Freitext-Bohne, wenn keine gepflegte Sorte gewaehlt ist (Fremdbohne). */
  beanLabel: string | null;
  grinderId: number | null;
  grindSetting: number | null;
  grinderRpm: number | null;
  doseG: number | null;
  /** Per-shot yield override (null = use profile default). */
  yieldTargetOverrideG: number | null;
}

/** Repeat-flow prefill — includes the yield override (UP-1) so a repeat carries
 *  a non-default target. */
export type PreShotInitialValues = PreShotPayload;

/** Was gestartet wird: die Variante, das Sieb und die Groesse, die daraus folgt. */
export interface StartChoice {
  /** true: die Dosis wurde gegenueber der Vorbelegung geaendert. */
  doseChanged?: boolean;
  variant: ProfileVariant;
  basketId: number | null;
  shotSize: ShotSize;
  /** Im Dialog umgeschaltetes Profil (nur fuer diesen Bezug); fehlt = das uebergebene. */
  profile?: Profile;
}

interface PreShotDialogProps {
  profile: Profile;
  /** Alle Profile: damit laesst sich das Profil fuer diesen einen Bezug wechseln. */
  profiles?: Profile[];
  /** Vorgewaehlte Variante; null = die erste. Im Dialog umschaltbar. */
  variantId: number | null;
  /** Vorgewaehltes Sieb (Wiederholen); fehlt es, gilt das Vorgabe-Sieb der Variante. */
  basketId?: number | null;
  /** Start aus der Sorten-Ansicht: diese Roestung statt der zuletzt mit dem Profil benutzten. */
  beanId?: number | null;
  /** Start vom Dashboard-Chip: Variante und Sieb wie beim letzten Bezug mit diesem Profil. */
  suggest?: boolean;
  /** Stoppt das Skript dieser Variante selbst (Cmd 27)? */
  hasCmd27For?: (variant: ProfileVariant, profile?: Profile) => boolean;
  /**
   * When set (repeat flow), the dialog opens prefilled with these exact
   * values instead of the active bean/grinder + the prefill cascade.
   */
  initialValues?: PreShotInitialValues;
  /** Performs the execute. Resolves to an error message, or null on success. */
  onStart: (payload: PreShotPayload, choice: StartChoice) => Promise<string | null>;
  onClose: () => void;
  /** PT-2: live brew-group temperature (°C) for the readiness ampel. null = unknown. */
  liveBgTempC?: number | null;
  /** Live-Gewicht der Waage (g) — bietet es als Dosis an. null = unbekannt. */
  liveScaleG?: number | null;
  /** PT-2: current brew-group SETPOINT (°C) — gates the "Setzen" button. null = unknown. */
  currentBgSetpointC?: number | null;
  /** PT-2: current brew-boiler SETPOINT (°C) — also gates "Setzen" (both are set). null = unknown. */
  currentBbSetpointC?: number | null;
  /** PT-2: push the profile target temp onto the machine (sets both BG + BB). */
  onSetFromProfile?: (targetTempC: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Bean filtering, ordering and labelling (§3g/§3l) now live in the shared
// BeanPicker component — Pre-Brew, Dashboard-repeat and Shot-Edit all use it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  background: C.bg,
  border: `1px solid ${C.bdr}`,
  color: C.txt,
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

const numInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: "'JetBrains Mono', monospace",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: C.txtS,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

/** `aside` steht rechts in der Beschriftungszeile — kostet keine Hoehe. */
function Field({ label, aside, style, children }: { label: string; aside?: string | null; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8, ...style }}>
      {aside ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <label style={labelStyle}>{label}</label>
          <span style={{ marginLeft: "auto", minWidth: 0, fontSize: 10.5, lineHeight: 1, color: C.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {aside}
          </span>
        </div>
      ) : (
        <label style={labelStyle}>{label}</label>
      )}
      {children}
    </div>
  );
}

/** Mahlgrad-Empfehlung vom Server (backend/src/grind-advice.ts). */
interface GrindAdviceInfo {
  kind: "keep" | "between" | "narrow" | "step";
  value: number | null;
  tooCoarse: number | null;
  tooFine: number | null;
  basedOn: number;
  /** Naechste bekannte Grenzen um die Empfehlung (zu fein darunter, zu grob darueber), auch aus aelteren Bezuegen. */
  nearFine?: number | null;
  nearCoarse?: number | null;
  /** Letzte Bezuege (neueste zuerst): Mahlgrad, Bewertung, Zeit (nur bei Gewichtsstopp) und Menge. */
  recent?: Array<{ grind: number; note: "finer" | "coarser" | "ok" | null; durationS: number | null; yieldG: number | null; missedTargetG?: number | null }>;
  /** Gesetzt, wenn die Schrittweite aus der Bezugszeit stammt. */
  timeBasis?: { lastS: number; targetS: number; lastEstimated?: boolean } | null;
}

const fmtG = (g: number) => dec(Number.isInteger(g) ? String(g) : g.toFixed(1));

/** Eintraege der Auswahlmenues: feste Farben, sonst weiss auf weiss im dunklen Design. */
const optionStyle: React.CSSProperties = { background: C.cardElev, color: C.txt };

/** Dosis-Schritt der −/+ Knoepfe (g). */
const DOSE_STEP = 0.5;
/** Roestgrad-Texte fuer die Einfachansicht. */
const ROAST_LABEL: Record<string, { de: string; en: string }> = {
  "light": { de: "Hell", en: "Light" },
  "light-medium": { de: "Hell", en: "Light" },
  "medium": { de: "Mittel", en: "Medium" },
  "medium-dark": { de: "Dunkel", en: "Dark" },
  "dark": { de: "Dunkel", en: "Dark" },
};
/** Rahmen um eine Feldgruppe (Bohne+Dosis, Muehle+Mahlgrad). */
const groupBox: React.CSSProperties = {
  minWidth: 0, boxSizing: "border-box", padding: "8px 10px 0",
  border: `1px solid ${C.accB}`, borderRadius: 10, background: C.accG,
};
const doseBtn: React.CSSProperties = {
  width: 44, height: 40, flexShrink: 0, borderRadius: 8, border: `1px solid ${C.bdr}`,
  background: C.bg, color: C.txt, fontSize: 20, lineHeight: 1, cursor: "pointer", fontFamily: "inherit",
};

/** Mahlgrad-Schritt der Knoepfe — die Einstellungen liegen in halben Schritten. */
const GRIND_STEP = 1;

/**
 * Mahlgrad mit −/+: der Wert, der sich zwischen zwei Bezuegen am haeufigsten
 * aendert, ohne Tastatur und mit nassen Fingern. Zwischenwerte gehen weiter
 * per Eingabe.
 */
function GrindStepper({ value, onChange, inputStyle }: {
  value: string; onChange: (v: string) => void; inputStyle: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const bump = (dir: 1 | -1) => {
    const n = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(n)) return;
    onChange(String(Math.max(0, dir > 0
      ? (Math.floor(n / GRIND_STEP) + 1) * GRIND_STEP
      : (Math.ceil(n / GRIND_STEP) - 1) * GRIND_STEP)));
  };
  // Immer ganze Zahlen — auch ein vorbelegtes 12,5 wird gerundet angezeigt.
  const parsed = parseFloat(value.replace(",", "."));
  const shown = Number.isFinite(parsed) ? String(Math.round(parsed)) : value;
  const btn: React.CSSProperties = {
    width: 44, height: 40, flexShrink: 0, borderRadius: 8, border: `1px solid ${C.bdr}`,
    background: C.bg, color: C.txt, fontSize: 20, lineHeight: 1, cursor: "pointer", fontFamily: "inherit",
  };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" aria-label={t("ui.preshot.grindFiner")} onClick={() => bump(-1)} style={btn}>−</button>
      <input
        style={{ ...inputStyle, textAlign: "center" }}
        type="number"
        step={1}
        inputMode="numeric"
        value={shown}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? String(Math.max(0, n)) : "");
        }}
      />
      <button type="button" aria-label={t("ui.preshot.grindCoarser")} onClick={() => bump(1)} style={btn}>+</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreShotDialog({
  profile: profileProp,
  profiles = [],
  variantId: initialVariantId,
  basketId: initialBasketId,
  beanId: initialBeanId = null,
  suggest = false,
  hasCmd27For,
  initialValues,
  onStart,
  onClose,
  liveBgTempC,
  liveScaleG = null,
  currentBgSetpointC,
  currentBbSetpointC,
  onSetFromProfile,
}: PreShotDialogProps) {
  const { t, lang } = useTranslation();
  // Das Profil laesst sich im Dialog wechseln — nur fuer diesen Bezug.
  const [profile, setProfile] = useState<Profile>(profileProp);
  // Einfach/Experte: Standard ist die Ansicht, aus der der Bezug gestartet wurde; im Dialog umschaltbar.
  const appSimple = useSimple();
  const [simpleMode, setSimpleMode] = useState<boolean>(appSimple);
  // Handy: die Profilzeile bricht um, das Sieb bekommt eine eigene Zeile.
  const mobile = useBreakpoint() === "mobile";
  const { beans, grinders, activeBeanId, activeGrinderId, loading } = usePreShotData();
  const { settings: fieldSettings } = usePreShotFieldSettings();
  // Messlauf: ohne Bohne, Muehle, Mahlgrad und Dosis — er zaehlt nirgends.
  const measurement = profile.kind === "test";
  const fields = measurement
    ? { ...fieldSettings, grinder: false, grindSetting: false, grinderRpm: false, dose: false }
    : fieldSettings;
  // Variante und Sieb (Schnitt 3d). Das Sieb folgt der Variante (Vorgabe-Sieb),
  // bis es im Dialog oder vom Wiederholen ausdruecklich gewaehlt ist.
  const variants = startVariants(profile);
  const [variantId, setVariantId] = useState<number | null>(initialVariantId ?? variants[0]?.id ?? null);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
  const { baskets } = useBaskets();
  const basketsRef = useRef(baskets);
  basketsRef.current = baskets;
  const [basketChoice, setBasketChoice] = useState<number | null | undefined>(initialBasketId ?? undefined);
  const basketId = basketChoice !== undefined ? basketChoice : (variant?.defaultBasketId ?? null);
  const basket = baskets.find((b) => b.id === basketId) ?? null;
  const defaultBasket = baskets.find((b) => b.id === variant?.defaultBasketId) ?? null;
  // Anderes Sieb als das der Variante — weiche Sperre wie bei der Dosis. Verglichen
  // wird das Sieb selbst, nicht ein Typ: zwei 1er-Siebe sind zwei Siebe.
  const basketMismatch = basket !== null && defaultBasket !== null && basket.id !== defaultBasket.id;
  const [basketWarn, setBasketWarn] = useState(false);
  // Das Sieb-Dropdown entfaellt, wenn jede Variante ihr eigenes Sieb hat (Single/Double/Triple): das Sieb folgt der Variante.
  const showBasket = baskets.length > 0 && variant?.defaultBasketId != null
    && !(variants.length > 1 && variants.every((v) => v.defaultBasketId != null)
      && new Set(variants.map((v) => v.defaultBasketId)).size === variants.length);
  // Das Sieb waehlt die Variante (Flavio: das Dropdown reicht). Die Varianten-
  // Knoepfe bleiben nur, wo das nicht eindeutig geht: eine Variante ohne eigenes
  // Sieb oder zwei Varianten auf demselben Sieb.
  const variantByBasket = variants.length > 1
    && variants.every((v) => v.defaultBasketId != null)
    && new Set(variants.map((v) => v.defaultBasketId)).size === variants.length;
  const showVariantButtons = variants.length > 1;
  const lineControls = variants.length > 1 || showBasket;
  const hasCmd27 = variant ? (hasCmd27For?.(variant, profile) ?? false) : false;

  // --- Selection state ---
  const [beanId, setBeanId]       = useState<number | null>(null);
  // Fremdbohne: nur relevant, wenn KEINE gepflegte Bohne gewaehlt ist. Bewusst
  // keine dritte Option im Picker — "Keine Bohne" gab es schon, das Textfeld
  // haengt sich darunter, wenn man sie waehlt.
  const [beanLabel, setBeanLabel] = useState("");
  const selectedBean = beans.find((b) => b.id === beanId) ?? null;
  const selectedBeanDepleted = selectedBean?.stockDepleted ?? false;

  const [grinderId, setGrinderId] = useState<number | null>(null);
  const [grindSetting, setGrindSetting] = useState("");
  /** Woher der vorbelegte Mahlgrad kommt; null, sobald er von Hand geaendert ist. */
  const [grindSource, setGrindSource]   = useState<GrindSource | null>(null);
  const [grindAdvice, setGrindAdvice]   = useState<GrindAdviceInfo | null>(null);
  const [lastNote, setLastNote] = useState<{ notes: string; startedAt: number } | null>(null);
  const [beanRatio, setBeanRatio] = useState<number | null>(null);
  const [doseAdvice, setDoseAdvice] = useState<{ doseG: number; lastDoseG: number; note: "less" | "ok" | "more"; startedAt: number } | null>(null);
  const [grinderRpm, setGrinderRpm]     = useState("");
  const [doseG, setDoseG]               = useState("");
  /** Dosis des letzten Bezugs (gleiche Bohne + Sieb) — wird zum Uebernehmen angeboten. */
  const [lastShotDoseG, setLastShotDoseG] = useState<number | null>(null);
  /** Zuletzt automatisch eingetragene Dosis; nur solange sie unveraendert ist, wird sie nachgezogen. */
  const dosePrefilled = useRef<string | null>(null);
  /** true: die Vorbelegung stammt aus dem Profil — die Nenndosis des Siebs darf sie nicht ersetzen. */
  const dosePlanned = useRef(false);
  // Die Siebe laden evtl. nach der Vorbelegung: dann die Nenndosis des Siebs nachtragen (nur wenn noch nichts geaendert wurde).
  useEffect(() => {
    if (baskets.length === 0 || dosePrefilled.current === null || dosePlanned.current) return;
    const nom = baskets.find((b) => b.id === basketId)?.nominalDoseG ?? null;
    if (nom !== null && doseG === dosePrefilled.current && String(nom) !== doseG) {
      dosePrefilled.current = String(nom);
      setDoseG(String(nom));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baskets, basketId]);

  const [starting, setStarting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // Scale-connected warning: shown after a first click finds no scale connected.
  // Soft gate — a second click starts anyway (never blocks the brew).
  const [scaleWarn, setScaleWarn] = useState(false);
  // Dosis vergessen: der erste Klick auf Start haelt an und markiert das Feld,
  // ein zweiter startet trotzdem (wie beim Waagen-Hinweis). Bewusst KEIN
  // stilles Auffuellen — ein Wert, den niemand eingetragen hat, faellt nicht
  // auf; die letzte Dosis gibt es nur als Knopf zum Antippen.
  const [doseWarn, setDoseWarn] = useState(false);
  const [lastDoseG, setLastDoseG] = useState<number | null>(null);
  const doseRef = useRef<HTMLInputElement>(null);
  const [settingTemp, setSettingTemp] = useState(false); // PT-2: "Setzen" in-flight

  // The whole dialog is one scroll container; the scale-not-connected notice
  // appears on the first click and pushes the start button below the fold on
  // small tablet screens. Pull the action area (warning + button) back into
  // view so the user doesn't have to scroll again for "Trotzdem starten".
  const actionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scaleWarn || basketWarn) actionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scaleWarn, basketWarn]);

  // --- Yield override (per-shot only; null = use profile default) ---
  const [yieldOverrideG, setYieldOverrideG] = useState<number | null>(null);
  const [yieldPopupOpen, setYieldPopupOpen] = useState(false);
  // Temperatur (Einfachansicht): eigener Wert statt Profil-Soll, in einem kleinen Fenster einstellbar.
  const [tempPopupOpen, setTempPopupOpen] = useState(false);
  const [tempInput, setTempInput] = useState("");
  const [tempOverrideC, setTempOverrideC] = useState<number | null>(null);
  const [yieldInput, setYieldInput]         = useState("");
  const [ratioInput, setRatioInput]         = useState("");

  // Fetch the grind/RPM/dose prefill cascade for a bean+grinder pair and
  // write the result into the number fields. Called on the initial (non-repeat)
  // load and whenever the user changes the bean, grinder or basket. With the
  // profile and basket the cascade starts at "this profile + this basket"
  // (Schnitt 3e); without a bean the profile would pick one, so it is only sent
  // with a bean — or on the initial load, where that pick is wanted.
  const fetchDefaults = useCallback(
    async (
      bId: number | null,
      gId: number | null,
      profileId?: number,
      bkId?: number | null,
    ): Promise<{ suggestedBeanId: number | null; suggestedGrinderId: number | null; suggestedVariantId: number | null; suggestedBasketId: number | null }> => {
      const params = new URLSearchParams();
      if (bId !== null) params.set("beanId", String(bId));
      if (gId !== null) params.set("grinderId", String(gId));
      if (profileId !== undefined) params.set("profileId", String(profileId));
      if (bkId !== undefined && bkId !== null) params.set("basketId", String(bkId));
      try {
        const r = await fetch(`/api/shots/preshot-defaults?${params.toString()}`);
        const d = (await r.json()) as {
          grindSetting: number | null;
          grinderRpm: number | null;
          doseG: number | null;
          suggestedBeanId?: number | null;
          suggestedGrinderId?: number | null;
          suggestedVariantId?: number | null;
          suggestedBasketId?: number | null;
          grindSource?: GrindSource | null;
          lastShotDoseG?: number | null;
          plannedDoseG?: number | null;
          grindAdvice?: GrindAdviceInfo | null;
          lastNote?: { notes: string; startedAt: number } | null;
          beanRatio?: number | null;
          doseAdvice?: { doseG: number; lastDoseG: number; note: "less" | "ok" | "more"; startedAt: number } | null;
        };
        setGrindSetting(d.grindSetting !== null ? String(d.grindSetting) : "");
        setGrindSource(d.grindSource ?? null);
        setGrindAdvice(d.grindAdvice ?? null);
        setLastNote(d.lastNote ?? null);
        setBeanRatio(d.beanRatio ?? null);
        setDoseAdvice(d.doseAdvice ?? null);
        setGrinderRpm(d.grinderRpm !== null ? String(d.grinderRpm) : "");
        // Dosis aus dem Profil (Nenndosis des Siebs); fehlt sie, die aus dem letzten Bezug.
        const effBasket = bkId ?? d.suggestedBasketId ?? null;
        const nominal = effBasket !== null ? (basketsRef.current.find((b) => b.id === effBasket)?.nominalDoseG ?? null) : null;
        const planned = d.plannedDoseG ?? null;
        dosePlanned.current = planned !== null;
        const doseStr = planned !== null ? String(planned) : nominal !== null ? String(nominal) : d.doseG !== null ? String(d.doseG) : "";
        dosePrefilled.current = doseStr;
        setDoseG(doseStr);
        setLastShotDoseG(d.lastShotDoseG ?? null);
        return {
          suggestedBeanId: d.suggestedBeanId ?? null,
          suggestedGrinderId: d.suggestedGrinderId ?? null,
          suggestedVariantId: d.suggestedVariantId ?? null,
          suggestedBasketId: d.suggestedBasketId ?? null,
        };
      } catch {
        // Leave fields as-is — prefill is a convenience, not a requirement
        return { suggestedBeanId: null, suggestedGrinderId: null, suggestedVariantId: null, suggestedBasketId: null };
      }
    },
    [],
  );

  // Initial prefill, once the dialog's data has loaded.
  const initRef = useRef(false);
  /** Ab hier holt ein Siebwechsel Mahlgrad und Dosis neu; `cascadeBasket` = das Sieb dazu. */
  const cascadeReady = useRef(false);
  const cascadeBasket = useRef<number | null>(basketId);
  useEffect(() => {
    if (loading || initRef.current) return;
    initRef.current = true;

    if (initialValues) {
      cascadeReady.current = true;
      // Repeat flow — use the source shot's exact values, no cascade.
      setBeanId(initialValues.beanId);
      setBeanLabel(initialValues.beanLabel ?? "");
      setGrinderId(initialValues.grinderId);
      setGrindSetting(initialValues.grindSetting !== null ? String(initialValues.grindSetting) : "");
      setGrinderRpm(initialValues.grinderRpm !== null ? String(initialValues.grinderRpm) : "");
      setDoseG(initialValues.doseG !== null ? String(initialValues.doseG) : "");
      // UP-1: carry the source shot's yield override (already null when it
      // matched the profile default → no "geändert" marker).
      setYieldOverrideG(initialValues.yieldTargetOverrideG);
      return;
    }

    // Normal flow (profile start) — default the bean to the one last brewed
    // with THIS profile; the grinder comes via that bean. Fall back to the
    // global active ids, then unset. §3g: the bean must be a pickable
    // (active-source) roasting to appear in the picker.
    const beanPickable = (id: number | null) =>
      id !== null && beans.some((b) => b.id === id && isPickableBean(b));
    const grinderValid = (id: number | null) =>
      id !== null && grinders.some((g) => g.id === id);

    void (async () => {
      // Vom Chip kennt erst die Antwort das Sieb — dann nimmt der Server das des letzten Bezugs.
      const sug = await fetchDefaults(initialBeanId, null, profile.id, suggest ? undefined : basketId);
      let basketNow = basketId;
      // Vom Chip: Variante und Sieb wie beim letzten Bezug mit diesem Profil.
      if (suggest && sug.suggestedVariantId !== null && variants.some((v) => v.id === sug.suggestedVariantId)) {
        setVariantId(sug.suggestedVariantId);
        if (sug.suggestedBasketId !== null) setBasketChoice(sug.suggestedBasketId);
        basketNow = sug.suggestedBasketId ?? variants.find((v) => v.id === sug.suggestedVariantId)?.defaultBasketId ?? null;
      }

      const finalBean = beanPickable(sug.suggestedBeanId)
        ? sug.suggestedBeanId
        : beanPickable(activeBeanId)
          ? activeBeanId
          : null;
      const finalGrinder = grinderValid(sug.suggestedGrinderId)
        ? sug.suggestedGrinderId
        : grinderValid(activeGrinderId)
          ? activeGrinderId
          : null;

      setBeanId(finalBean);
      setGrinderId(finalGrinder);

      // If we fell back off either suggestion, re-run the cascade so grind/dose
      // match the (bean, grinder) pair we actually show.
      if (finalBean !== sug.suggestedBeanId || finalGrinder !== sug.suggestedGrinderId) {
        void fetchDefaults(finalBean, finalGrinder, finalBean !== null ? profile.id : undefined, basketNow);
      }
      cascadeBasket.current = basketNow;
      cascadeReady.current = true;
    })();
  }, [loading, activeBeanId, activeGrinderId, beans, grinders, initialValues, fetchDefaults, profile.id]);

  // Anderes Sieb (gewaehlt oder mit der Variante): Mahlgrad und Dosis neu fuer dieses Sieb.
  useEffect(() => {
    if (!cascadeReady.current || cascadeBasket.current === basketId) return;
    cascadeBasket.current = basketId;
    void fetchDefaults(beanId, grinderId, beanId !== null ? profile.id : undefined, basketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketId]);

  // „wie zuletzt mit Profil + Sieb (12.10.) · passt“ — Stufe, Datum und Mahlgrad-Hinweis des Quellbezugs.
  const grindAside = (() => {
    if (!grindSource) return null;
    const date = formatDay(grindSource.startedAt, { style: "numeric", locale: lang === "de" ? "de-DE" : "en-US" });
    const note = grindSource.grindNote === "finer" ? t("shotRating.grindFiner")
      : grindSource.grindNote === "coarser" ? t("shotRating.grindCoarser")
      : grindSource.grindNote === "ok" ? t("shotRating.grindOk") : null;
    return `${t(`preshot.grindFrom.${grindSource.stage}`, { date })}${note ? ` · ${note.toLowerCase()}` : ""}`;
  })();

  const doseMissing = doseWarn && doseG.trim() === "";
  // Dosis des letzten Bezugs, falls sie von der eingetragenen abweicht.
  const doseEl = doseAdvice ? (
    parseFloat(doseG.replace(",", ".")) !== doseAdvice.doseG ? (
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, fontSize: 12, color: C.mut }}>
        <span>
          {simpleMode
            ? `Empfehlung: ${fmtG(doseAdvice.doseG)} g`
            : `Empfehlung: ${fmtG(doseAdvice.doseG)} g (zuletzt ${fmtG(doseAdvice.lastDoseG)} g, ${doseAdvice.note === "less" ? "weniger" : doseAdvice.note === "more" ? "mehr" : "passte"})`}
        </span>
        <button
          type="button"
          onClick={() => { setDoseG(String(doseAdvice.doseG)); setDoseWarn(false); }}
          style={{ background: "transparent", border: `1px solid ${C.accB}`, color: C.acc, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}
        >
          übernehmen
        </button>
      </div>
    ) : null
  ) : lastShotDoseG !== null && parseFloat(doseG.replace(",", ".")) !== lastShotDoseG ? (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: C.mut }}>
      <span>{`Letzter Bezug: ${fmtG(lastShotDoseG)} g`}</span>
      <button
        type="button"
        onClick={() => { setDoseG(String(lastShotDoseG)); setDoseWarn(false); }}
        style={{ background: "transparent", border: `1px solid ${C.accB}`, color: C.acc, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
      >
        übernehmen
      </button>
    </div>
  ) : null;
  // Empfehlung zum Mahlgrad aus den letzten bewerteten Bezuegen.
  const adviceEl = grindAdvice ? (() => {
    const a = grindAdvice;
    // Grenzen um die Empfehlung: zu fein (darunter) und zu grob (darueber), soweit bekannt.
    const lim = [
      a.nearFine != null ? `${a.nearFine} zu fein` : null,
      a.nearCoarse != null ? `${a.nearCoarse} zu grob` : null,
    ].filter((x): x is string => x !== null).join(", ");
    // Einfach-Ansicht: nur die Empfehlung, ohne Erklaerung; die Grenzen, Zeiten und letzten Bezuege nur im Experten-Dialog.
    const txt = simpleMode && a.value !== null ? `Empfehlung: ${a.value}` : a.kind === "keep" ? `Empfehlung: ${a.value} halten (letzter Bezug passte${lim ? `; ${lim}` : ""})`
      : a.kind === "narrow" ? `Eng eingegrenzt: zwischen ${a.tooFine} (zu fein) und ${a.tooCoarse} (zu grob)`
      : a.timeBasis ? `Empfehlung: ${a.value} (${lim !== "" ? `${lim}; ` : ""}${a.timeBasis.lastEstimated ? `letzter Bezug ≈ ${a.timeBasis.lastS} s bis zur Zielmenge (geschätzt)` : `letzter Bezug ${a.timeBasis.lastS} s`}, Ziel ca. ${a.timeBasis.targetS} s)`
      : lim !== "" ? `Empfehlung: ${a.value} (${lim})`
      : `Empfehlung: ${a.value}`;
    // Messwerte der letzten Bezuege neben dem Urteil: Mahlgrad · Zeit · Menge · Bewertung.
    const noteTxt = (n: string | null) => (n === "finer" ? "zu grob" : n === "coarser" ? "zu fein" : n === "ok" ? "passt" : null);
    const g1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
    const recentRows = (a.recent ?? [])
      .filter((r) => r.durationS !== null || r.yieldG !== null)
      .slice(0, 3)
      .map((r) => [
        `Mahlgrad ${String(r.grind)}`,
        r.yieldG !== null
          ? r.missedTargetG != null ? `${g1(r.yieldG)} von ${g1(r.missedTargetG)} g` : `${g1(r.yieldG)} g`
          : "–",
        r.durationS !== null ? `${Math.round(r.durationS)} s` : "–",
        noteTxt(r.note) !== null ? `(${noteTxt(r.note)})` : "–",
      ]);
    const cur = Math.round(parseFloat(grindSetting.replace(",", ".")));
    const can = a.value !== null && cur !== a.value;
    return (
      <div style={{ marginTop: 6, fontSize: 12, color: C.mut }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span>{txt}</span>
          {can && (
            <button
              type="button"
              onClick={() => { setGrindSetting(String(a.value)); setGrindSource(null); }}
              style={{ background: "transparent", border: `1px solid ${C.accB}`, color: C.acc, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}
            >
              übernehmen
            </button>
          )}
        </div>
        {!simpleMode && recentRows.length > 0 && (
          <div style={{ flexBasis: "100%", fontSize: 11 }}>
            <div style={{ marginBottom: 2 }}>Letzte Bezüge</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto", justifyContent: "start", columnGap: 22, rowGap: 2, fontSize: 10.5, maxWidth: "100%", fontFamily: "'JetBrains Mono', monospace" }}>
              {recentRows.flatMap((cells, i) => cells.map((c, j) => <span key={`${i}-${j}`} style={{ whiteSpace: "nowrap" }}>{c}</span>))}
            </div>
          </div>
        )}
      </div>
    );
  })() : null;
  // Notiz vom letzten bewerteten gleichen Bezug - bis ein neuerer gleicher Bezug bewertet ist.
  const noteEl = lastNote ? (
    <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.bdr}`, background: C.bg, fontSize: 12, color: C.txtS, whiteSpace: "pre-wrap" }}>
      <span style={{ color: C.mut }}>Notiz vom letzten gleichen Bezug ({new Date(lastNote.startedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}): </span>
      {lastNote.notes}
    </div>
  ) : null;
  // Die Bohnen liegen auf der Waage: das Gewicht als Dosis anbieten, sobald es
  // nach einer Dosis aussieht (nicht 0, keine Tasse).
  const scaleDoseG = liveScaleG !== null && liveScaleG >= 3 && liveScaleG <= 40 ? Math.round(liveScaleG * 10) / 10 : null;
  const selectedGrinder = grinders.find((g) => g.id === grinderId) ?? null;
  const showRpm = fields.grinderRpm && selectedGrinder?.supportsRpm === true;
  // Die Profil-Notiz ist die einzige Notiz im Pre-Brew (Bezugs-Notizen werden
  // nach dem Bezug im Rating erfasst) — sie haengt an der Einstellung.
  const showProfileNotes = fields.profileNotes && !!profile.notes;
  // Tablet/PC ohne Notiz: die Breite fuer zwei Feldspalten nutzen (Flavio 24.10.: „sehr
  // gequetscht“) — Bohne ueber die ganze Breite, dann Muehle | Dosis, Mahlgrad | RPM.
  const twoCol = !mobile && !showProfileNotes;
  // Beide Kaesten teilen sich die Zeilen: Bohne|Muehle, Dosis|Mahlgrad, (RPM).
  const row = (n: number): React.CSSProperties | undefined => (twoCol ? { gridRow: n } : undefined);

  const rpmNum = grinderRpm.trim() === "" ? null : parseFloat(grinderRpm);
  const rpmOutOfRange =
    rpmNum !== null &&
    !Number.isNaN(rpmNum) &&
    selectedGrinder !== null &&
    ((selectedGrinder.rpmMin !== null && rpmNum < selectedGrinder.rpmMin) ||
      (selectedGrinder.rpmMax !== null && rpmNum > selectedGrinder.rpmMax));

  const yieldG = variant?.yieldG ?? null;

  // Variante im Dialog umschalten: Sieb zurueck auf ihre Vorgabe, eine
  // Yield-Aenderung galt der alten Variante.
  // Profil nur fuer diesen Bezug wechseln: gleichnamige Variante, Vorgaben neu.
  const switchable = measurement ? [] : profiles.filter((p) => p.kind !== "test" || p.id === profile.id);
  function pickProfile(id: number): void {
    const next = profiles.find((p) => p.id === id);
    if (!next || next.id === profile.id) return;
    const nextVariants = startVariants(next);
    const nv = nextVariants.find((v) => v.name === variant?.name) ?? nextVariants[0] ?? null;
    const nextBasket = nv?.defaultBasketId ?? null;
    setProfile(next);
    setVariantId(nv?.id ?? null);
    setBasketChoice(undefined);
    setBasketWarn(false);
    setYieldOverrideG(null);
    cascadeBasket.current = nextBasket;
    void fetchDefaults(beanId, grinderId, beanId !== null ? next.id : undefined, nextBasket);
  }

  function pickVariant(next: number): void {
    if (next === variantId) return;
    setVariantId(next);
    setBasketChoice(undefined);
    setBasketWarn(false);
    setYieldOverrideG(null);
  }

  // Sieb waehlen: die Variante, deren Vorgabe-Sieb es ist, kommt mit (die erste
  // in der Reihenfolge). Hat keine Variante dieses Sieb, bleibt die Variante —
  // das Sieb wird trotzdem aufgezeichnet, der Hinweis beim Start sagt es.
  function pickBasket(next: number | null): void {
    const match = next === null ? undefined : variants.find((v) => v.defaultBasketId === next);
    if (match && match.id !== variantId) {
      setVariantId(match.id);
      setYieldOverrideG(null);
    }
    setBasketChoice(next);
    setBasketWarn(false);
  }

  // Effective yield = override if set, else profile default. The override is
  // "active" (and gets the changed-indicator) only when it differs from default.
  // Ratio: Yield und 1:x haengen ueber die eingetragene Dosis zusammen — nur,
  // wenn das Profil eine Dosis abfragt und eine eingetragen ist.
  const doseVal = fields.dose ? parseFloat(doseG) : NaN;
  const hasDose = Number.isFinite(doseVal) && doseVal > 0;
  // Ratio der Bohne: Dosis x Ratio ersetzt das Profil-Yield fuer diesen Bezug (das Profil selbst bleibt unveraendert).
  // Eine Eingabe im Yield-Fenster geht vor.
  const ratioYieldG = beanRatio !== null && hasDose ? Math.round(doseVal * beanRatio * 10) / 10 : null;
  const effectiveYieldG = yieldOverrideG ?? ratioYieldG ?? yieldG;
  const overrideActive = effectiveYieldG !== yieldG;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const ratioText = (r: number) => (lang === "de" ? String(round2(r)).replace(".", ",") : String(round2(r)));

  /** Dosis in 0,5-g-Schritten auf dem Raster; leer startet bei der Waage (falls Bohnen aufliegen) oder 0. */
  function bumpDose(dir: 1 | -1): void {
    const n = parseFloat(doseG.replace(",", "."));
    const base = Number.isFinite(n) ? n : (scaleDoseG ?? 0);
    const next = dir > 0
      ? (Math.floor(base / DOSE_STEP + 1e-9) + 1) * DOSE_STEP
      : (Math.ceil(base / DOSE_STEP - 1e-9) - 1) * DOSE_STEP;
    setDoseG(String(Math.round(Math.max(0, next) * 10) / 10));
    setDoseWarn(false);
  }

  function openTempPopup(): void {
    const cur = tempOverrideC ?? profile.targetTempC;
    setTempInput(cur !== null ? String(cur) : "");
    setTempPopupOpen(true);
  }

  /** reset = zurueck auf das Profil-Soll; sonst den eingegebenen Wert (70-105 °C) auf die Maschine setzen. */
  async function applyTemp(reset: boolean): Promise<void> {
    const target = profile.targetTempC;
    const n = parseFloat(tempInput.replace(",", "."));
    const val: number | null = reset ? target : Number.isFinite(n) && n >= 70 && n <= 105 ? n : null;
    if (val === null || !onSetFromProfile) return;
    setTempPopupOpen(false);
    setSettingTemp(true);
    try {
      await onSetFromProfile(val);
      setTempOverrideC(reset || val === target ? null : val);
    } finally {
      setSettingTemp(false);
    }
  }

  function openYieldPopup(): void {
    setYieldInput(effectiveYieldG !== null ? String(effectiveYieldG) : "");
    setRatioInput(hasDose && effectiveYieldG !== null ? String(round2(effectiveYieldG / doseVal)) : "");
    setYieldPopupOpen(true);
  }

  function changeYieldInput(v: string): void {
    setYieldInput(v);
    const n = parseFloat(v);
    if (hasDose) setRatioInput(Number.isFinite(n) && n > 0 ? String(round2(n / doseVal)) : "");
  }

  function changeRatioInput(v: string): void {
    setRatioInput(v);
    const r = parseFloat(v);
    if (hasDose && Number.isFinite(r) && r > 0) setYieldInput(String(Math.round(doseVal * r * 10) / 10));
  }

  function applyYieldPopup(): void {
    // Sanitization (Entscheidung 5 / Task 3): empty / non-numeric / ≤ 0 → fall
    // back to the profile default (override = null). No upper bound — large
    // legitimate targets (e.g. 150 g) are accepted. A 0/negative target must
    // never become an override, or the BBW stop would fire instantly.
    const n = parseFloat(yieldInput);
    const valid = yieldInput.trim() !== "" && !Number.isNaN(n) && n > 0;
    setYieldOverrideG(valid ? n : null);
    setYieldPopupOpen(false);
  }

  function resetYieldOverride(): void {
    setYieldOverrideG(null);
    setYieldPopupOpen(false);
  }

  // Einfach-Ansicht: Maschine automatisch auf die Soll-Temperatur des Profils (einmal je Profil/Soll).
  const autoTempRef = useRef("");
  useEffect(() => {
    if (!simpleMode || !onSetFromProfile || profile.targetTempC === null) return;
    const target = profile.targetTempC;
    const bgD = currentBgSetpointC != null && Math.abs(currentBgSetpointC - target) >= 0.05;
    const bbD = currentBbSetpointC != null && Math.abs(currentBbSetpointC - target) >= 0.05;
    const key = `${profile.id}:${target}`;
    if ((!bgD && !bbD) || autoTempRef.current === key) return;
    autoTempRef.current = key;
    setSettingTemp(true);
    void onSetFromProfile(target).finally(() => setSettingTemp(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simpleMode, profile.id, profile.targetTempC, currentBgSetpointC, currentBbSetpointC]);

  // --- Start ---
  async function handleStart(): Promise<void> {
    setStarting(true);
    setError(null);

    if (fields.dose && doseG.trim() === "" && !doseWarn) {
      setDoseWarn(true);
      setStarting(false);
      doseRef.current?.focus();
      if (beanId !== null) {
        const q = new URLSearchParams({ beanId: String(beanId) });
        if (grinderId !== null) q.set("grinderId", String(grinderId));
        if (basketId !== null) q.set("basketId", String(basketId));
        fetch(`/api/shots/preshot-defaults?${q.toString()}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ doseG: number | null }>) : null))
          .then((d) => setLastDoseG(d?.doseG ?? null))
          .catch(() => { /* Vorschlag ist Komfort */ });
      }
      return;
    }

    if (basketMismatch && !basketWarn) {
      setBasketWarn(true);
      setStarting(false);
      return;
    }

    // One-off scale-connected check. If no scale is paired, surface a warning
    // and stop — a second click (scaleWarn already true) proceeds. Fail-open:
    // any error/timeout on the check must never prevent a brew from starting.
    if (!scaleWarn) {
      try {
        const r = await fetch("/api/scale");
        if (r.ok) {
          const d = (await r.json()) as { connected?: boolean };
          if (d.connected === false) {
            setScaleWarn(true);
            setStarting(false);
            return;
          }
        }
      } catch {
        // ignore — proceed without warning
      }
    }

    // Hidden fields contribute null — a fresh shot record, nothing to preserve.
    const payload: PreShotPayload = {
      beanId: measurement ? null : beanId,
      // Nur mitschicken, wenn keine gepflegte Bohne gewaehlt ist — sonst
      // stuenden zwei Bohnen am selben Bezug.
      beanLabel: !measurement && beanId === null && beanLabel.trim() !== "" ? beanLabel.trim() : null,
      grinderId: fields.grinder ? grinderId : null,
      grindSetting:
        fields.grindSetting && grindSetting.trim() !== ""
          ? Math.round(parseFloat(grindSetting.replace(",", ".")))
          : null,
      grinderRpm:
        showRpm && grinderRpm.trim() !== "" ? parseInt(grinderRpm, 10) : null,
      doseG: fields.dose && doseG.trim() !== "" ? parseFloat(doseG) : null,
      yieldTargetOverrideG: yieldOverrideG ?? (ratioYieldG !== yieldG ? ratioYieldG : null),
    };

    if (!variant) {
      setError(t("preshot.noVariant"));
      setStarting(false);
      return;
    }
    const preDose = parseFloat((dosePrefilled.current ?? "").replace(",", "."));
    const doseChanged = payload.doseG !== null && !(Number.isFinite(preDose) && Math.abs(preDose - payload.doseG) < 0.001);
    const err = await onStart(payload, { variant, basketId, shotSize: shotSizeForBasket(basket?.type ?? null), profile, doseChanged });
    if (err) {
      setError(err);
      setStarting(false);
    } else {
      onClose();
    }
  }

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: C.overlay,
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); }}
        style={{
          background: C.cardElev,
          border: `1px solid ${C.bdrL}`,
          borderRadius: 14,
          // 14 px oben und unten: so passt der Dialog bei 1072×590 ohne
          // Scrollen (vorher 4 px zu hoch, gemessen 533 bei 529 Platz).
          padding: "14px 24px 14px",
          // Tablet/PC immer breit: neben den Feldern steht die Notiz, ohne Notiz
          // laufen die Felder zweispaltig. Am Handy ohne Notiz schmal wie bisher.
          width: showProfileNotes || !mobile ? "min(760px, 96vw)" : "min(440px, 96vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: `0 8px 40px ${alpha(C.black, 0.5)}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.txt }}>
            {t("preshot.title")}
          </h2>
          <span role="radiogroup" aria-label="Ansicht" style={{ display: "inline-flex", border: `1px solid ${C.bdr}`, borderRadius: 6, overflow: "hidden", opacity: 0.75 }}>
            {([[true, "Einfach"], [false, "Experte"]] as const).map(([k, label]) => (
              <button
                key={label}
                role="radio"
                aria-checked={simpleMode === k}
                onClick={() => setSimpleMode(k)}
                style={{
                  height: 22, padding: "0 9px", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 500,
                  background: simpleMode === k ? C.accG : "transparent",
                  color: simpleMode === k ? C.txtS : C.mut,
                }}
              >
                {label}
              </button>
            ))}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.mut,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {simpleMode && (
          <div>
            {/* Info — nicht aenderbar */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 16px", background: C.accG, border: `1px solid ${C.accB}`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.txt }}>{profile.name}</span>
              {variant && <span style={{ fontSize: 15, fontWeight: 700, color: C.acc }}>{variant.name}</span>}
              {profile.targetTempC !== null && (() => {
                const shown = tempOverrideC ?? profile.targetTempC;
                const changed = tempOverrideC !== null;
                return (
                  <button
                    type="button"
                    onClick={onSetFromProfile ? openTempPopup : undefined}
                    title="Temperatur ändern"
                    style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: "transparent", border: "none", padding: 0, cursor: onSetFromProfile ? "pointer" : "default", fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: C.txtS }}
                  >
                    <span style={{ color: changed ? C.acc : undefined, fontWeight: changed ? 700 : 400 }}>
                      {lang === "de" ? shown.toFixed(1).replace(".", ",") : shown.toFixed(1)} °C
                    </span>
                    {settingTemp && <span>· wird gesetzt …</span>}
                    {changed && !settingTemp && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.acc, background: C.accG, border: `1px solid ${C.accB}`, borderRadius: 6, padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        geändert
                      </span>
                    )}
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={openYieldPopup}
                title={t("preshot.yieldEditTitle")}
                style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: C.txtS }}
              >
                {effectiveYieldG !== null ? (
                  <span>
                    →{" "}
                    <span style={{ color: overrideActive ? C.acc : undefined, fontWeight: overrideActive ? 700 : 400 }}>{effectiveYieldG}</span>
                    {" "}g {t("preshot.yield")}
                    {hasDose && ` · 1:${ratioText(effectiveYieldG / doseVal)}`}
                  </span>
                ) : (
                  <span>{t("preshot.noYield")}, {t("preshot.yieldSetHint")}</span>
                )}
                {overrideActive && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.acc, background: C.accG, border: `1px solid ${C.accB}`, borderRadius: 6, padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {t("preshot.yieldChanged")}
                  </span>
                )}
              </button>
            </div>

            {loading ? (
              <div style={{ color: C.mut, fontSize: 13, padding: "24px 0", textAlign: "center" }}>{t("preshot.loading")}</div>
            ) : (
              <>
                {(() => {
                  const roastRaw = (selectedBean as unknown as { roastLevel?: string | null } | null)?.roastLevel ?? null;
                  const roast = roastRaw && ROAST_LABEL[roastRaw] ? ROAST_LABEL[roastRaw]![lang === "de" ? "de" : "en"] : null;
                  const showLeft = !measurement || fields.dose;
                  const showRight = fields.grinder || fields.grindSetting;
                  const split = !mobile && showLeft && showRight;
                  const boxStyle: React.CSSProperties = {
                    ...groupBox,
                    ...(split ? { display: "grid", gridTemplateRows: "subgrid", gridRow: "1 / span 2" } : {}),
                  };
                  const r = (n: number): React.CSSProperties | undefined => (split ? { gridRow: n } : undefined);
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gridTemplateRows: split ? "auto auto" : undefined, columnGap: 12, rowGap: 10 }}>
                      {showLeft && (
                        <div style={boxStyle}>
                          {!measurement && (
                            <div style={{ marginBottom: 8, minWidth: 0, ...r(1) }}>
                              <div style={{ fontSize: 24, fontWeight: 700, color: C.txt, marginBottom: 3 }}>{t("preshot.bean")}</div>
                              <div style={{ ...labelStyle, textTransform: "none", fontSize: 14, letterSpacing: 0, marginBottom: 0 }}>
                                {selectedBean?.name ?? (beanId === null && beanLabel.trim() !== "" ? beanLabel.trim() : t("beanPicker.noBean"))}
                                {roast && <span style={{ fontWeight: 400, color: C.mut }}>{` · ${roast}`}</span>}
                              </div>
                            </div>
                          )}
                          {fields.dose && (
                            <Field label={`${t("preshot.dose")} (g)`} style={r(2)}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button type="button" aria-label="Dosis 0,5 g weniger" onClick={() => bumpDose(-1)} style={{ ...doseBtn, width: 56, height: 52, fontSize: 26 }}>−</button>
                                <input
                                  ref={doseRef}
                                  style={{ ...numInputStyle, flex: 1, minWidth: 0, textAlign: "center", fontSize: 24, ...(doseMissing ? { borderColor: C.red } : {}) }}
                                  type="number" step={0.1} min={0} inputMode="decimal"
                                  value={doseG}
                                  onChange={(e) => { setDoseG(e.target.value); if (e.target.value.trim() !== "") setDoseWarn(false); }}
                                />
                                <button type="button" aria-label="Dosis 0,5 g mehr" onClick={() => bumpDose(1)} style={{ ...doseBtn, width: 56, height: 52, fontSize: 26 }}>+</button>
                              </div>
                              {doseEl}
                              {doseMissing && <div style={{ fontSize: 11.5, color: C.red, marginTop: 5 }}>{t("preshot.doseMissing")}</div>}
                            </Field>
                          )}
                        </div>
                      )}
                      {showRight && (
                        <div style={boxStyle}>
                          {fields.grinder && (
                            <div style={{ marginBottom: 8, minWidth: 0, ...r(1) }}>
                              <div style={{ fontSize: 24, fontWeight: 700, color: C.txt, marginBottom: 3 }}>{t("preshot.grinder")}</div>
                              <div style={{ ...labelStyle, textTransform: "none", fontSize: 14, letterSpacing: 0, marginBottom: 0 }}>{selectedGrinder?.name ?? t("preshot.noGrinder")}</div>
                            </div>
                          )}
                          {fields.grindSetting && (
                            <Field label={t("preshot.grindSetting")} aside={grindAside} style={r(2)}>
                              <GrindStepper value={grindSetting} onChange={(v) => { setGrindSetting(v); setGrindSource(null); }} inputStyle={{ ...numInputStyle, fontSize: 24 }} />
                          {adviceEl}
                          {noteEl}
                            </Field>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {!simpleMode && (
        <>
        {/* Profile summary — read-only */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            ...(mobile ? { flexWrap: "wrap" as const, rowGap: 6 } : {}),
            background: C.accG,
            border: `1px solid ${C.accB}`,
            borderRadius: 8,
            // Mit Varianten-Umschalter oder Sieb 1 px weniger Polster: die Zeile
            // bleibt so hoch wie vorher, der Dialog wird nicht laenger.
            padding: lineControls ? "4px 12px" : "7px 12px",
            marginBottom: 10,
          }}
        >
          {switchable.length > 1 ? (
            <select
              aria-label="Profil für diesen Bezug"
              title="Gilt nur für diesen Bezug"
              value={profile.id}
              onChange={(e) => { pickProfile(Number(e.target.value)); }}
              style={{
                height: 26, boxSizing: "border-box", padding: "0 6px", maxWidth: mobile ? "100%" : 280, borderRadius: 7,
                fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                background: C.bg, border: `1px solid ${C.accB}`, color: C.txt,
              }}
            >
              {switchable.map((p) => <option key={p.id} value={p.id} style={optionStyle}>{p.name}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>
              {profile.name}
            </span>
          )}
          {showVariantButtons ? (
            <select
              aria-label={t("preshot.variant")}
              title={t("preshot.variant")}
              value={variant?.id ?? ""}
              onChange={(e) => { pickVariant(Number(e.target.value)); }}
              style={{
                height: 26, boxSizing: "border-box", padding: "0 6px", maxWidth: mobile ? "100%" : 170, borderRadius: 7,
                fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                background: C.bg, border: `1px solid ${C.accB}`, color: C.acc,
              }}
            >
              {variants.map((v) => <option key={v.id} value={v.id} style={optionStyle}>{v.name}</option>)}
            </select>
          ) : variantByBasket ? null : (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.acc }}>{variant?.name ?? ""}</span>
          )}
          {mobile && showBasket && <span aria-hidden="true" style={{ order: 1, flexBasis: "100%", height: 0 }} />}
          {showBasket && (
            <select
              aria-label={t("preshot.basket")}
              title={basket?.description ?? undefined}
              value={basketId ?? ""}
              onChange={(e) => { pickBasket(e.target.value === "" ? null : Number(e.target.value)); }}
              style={{
                height: 19, boxSizing: "border-box", padding: "0 4px", maxWidth: mobile ? "100%" : 150, borderRadius: 7, fontSize: 12,
                order: mobile ? 2 : undefined,
                fontFamily: "inherit", background: C.bg, cursor: "pointer",
                border: `1px solid ${basketMismatch ? C.warnSoft : C.accB}`, color: basketMismatch ? C.warnSoft : C.mut,
              }}
            >
              {baskets.map((b) => <option key={b.id} value={b.id} title={b.description ?? undefined} style={optionStyle}>{b.name}</option>)}
            </select>
          )}
          {/* Yield — tappable, opens the per-shot override popup. Shown even
              when the profile has no yield (placeholder invites setting one). */}
          <button
            onClick={openYieldPopup}
            title={t("preshot.yieldEditTitle")}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              whiteSpace: "nowrap",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              color: C.mut,
            }}
          >
            {effectiveYieldG !== null ? (
              <span>
                →{" "}
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: overrideActive ? C.acc : C.txt,
                    fontWeight: overrideActive ? 700 : 400,
                  }}
                >
                  {effectiveYieldG}
                </span>{" "}
                g {t("preshot.yield")}
                {hasDose && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}> · 1:{ratioText(effectiveYieldG / doseVal)}</span>
                )}
              </span>
            ) : (
              <span style={{ color: C.mut }}>
                {t("preshot.noYield")}, {t("preshot.yieldSetHint")}
              </span>
            )}
            {overrideActive && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: C.acc,
                  background: C.accG,
                  border: `1px solid ${C.accB}`,
                  borderRadius: 6,
                  padding: "1px 5px",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {t("preshot.yieldChanged")}
              </span>
            )}
          </button>
        </div>

        {/* Profile target brew temp (PT-2) — readiness ampel (always shown when
            the profile has a target, D4). Steht ein Sollwert der Maschine (BG
            oder BB) anders als das Profil, kommt an dieselbe Stelle ein gelber
            Hinweis mit grossem Knopf — klein und grau wurde er uebersehen
            (17.10.). Starting a brew stays enabled either way (non-blocking,
            Fork 2). */}
        {profile.targetTempC !== null && (() => {
          const target = profile.targetTempC;
          const ist = liveBgTempC ?? null;
          // Ampel color = same 4-step thresholds as the dashboard gauge (§5.7),
          // relative to the profile target. Grey when the live temp is unknown.
          const istColor = ist !== null ? resolveColor(ist, target, false) : C.mut;
          // Gate on the SETPOINTS (not the live temp). Both BG and BB are set,
          // so the hint shows while EITHER still differs. Tolerance 0.05 °C since
          // setpoints are whole/one-decimal values.
          const bgDiffers = currentBgSetpointC != null && Math.abs(currentBgSetpointC - target) >= 0.05;
          const bbDiffers = currentBbSetpointC != null && Math.abs(currentBbSetpointC - target) >= 0.05;
          async function handleSet() {
            if (!onSetFromProfile) return;
            setSettingTemp(true);
            try {
              await onSetFromProfile(target);
            } finally {
              setSettingTemp(false);
            }
          }
          if ((bgDiffers || bbDiffers) && tempOverrideC === null) {
            const machine = bgDiffers ? currentBgSetpointC! : currentBbSetpointC!;
            const deg = (v: number) => (Number.isInteger(v) ? String(v) : lang === "de" ? v.toFixed(1).replace(".", ",") : v.toFixed(1));
            // Am Tablet so hoch wie die alte Knopfzeile (der Dialog darf nicht
            // scrollen), der Knopf sitzt buendig am rechten Rand; am Handy groesser.
            return (
              <div
                role="status"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: -4,
                  marginBottom: 8,
                  paddingLeft: 10,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: C.orgD,
                  border: `1px solid ${alpha(C.org, 0.45)}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.org, lineHeight: 1.25 }}>
                  {t("preshot.tempMismatch", { machine: deg(machine), target: deg(target) })}
                </span>
                {onSetFromProfile !== undefined && (
                  <button
                    onClick={() => void handleSet()}
                    disabled={settingTemp}
                    style={{
                      flexShrink: 0,
                      alignSelf: "stretch",
                      minHeight: mobile ? 34 : 26,
                      padding: "0 12px",
                      borderRadius: 0,
                      background: C.org,
                      border: "none",
                      color: C.bg,
                      fontSize: 12.5,
                      fontWeight: 700,
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      cursor: settingTemp ? "not-allowed" : "pointer",
                      opacity: settingTemp ? 0.6 : 1,
                    }}
                  >
                    {settingTemp ? t("preshot.settingTemp") : t("preshot.setTempTo", { target: deg(target) })}
                  </button>
                )}
              </div>
            );
          }
          return (
            <div
              style={{
                marginTop: -4,
                marginBottom: 10,
                fontSize: 11,
                color: C.mut,
              }}
            >
              {tempOverrideC !== null ? "Temperatur" : t("preshot.profileTargetTemp")}{" "}
              <button
                type="button"
                onClick={onSetFromProfile ? openTempPopup : undefined}
                title="Temperatur ändern"
                style={{ background: "transparent", border: "none", padding: 0, cursor: onSetFromProfile ? "pointer" : "default", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: tempOverrideC !== null ? C.acc : C.txtS, fontWeight: tempOverrideC !== null ? 700 : 400 }}
              >
                {(tempOverrideC ?? target).toFixed(1)} °C
              </button>
              {tempOverrideC !== null && (
                <>
                  {" "}
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.acc, background: C.accG, border: `1px solid ${C.accB}`, borderRadius: 6, padding: "1px 5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    geändert
                  </span>
                </>
              )}
              {settingTemp && " · wird gesetzt …"}
              {ist !== null && (
                <>
                  {" · "}
                  {t("preshot.currentTemp")}{" "}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: istColor }}>
                    {ist.toFixed(1)} °C
                  </span>
                </>
              )}
            </div>
          );
        })()}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "3 1 260px", minWidth: 0 }}>
        {loading ? (
          <div style={{ color: C.mut, fontSize: 13, padding: "24px 0", textAlign: "center" }}>
            {t("preshot.loading")}
          </div>
        ) : (
          <div style={twoCol ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gridTemplateRows: showRpm ? "auto auto auto" : "auto auto", columnGap: 12 } : undefined}>
            <div style={{ ...groupBox, marginBottom: twoCol ? 0 : 8, ...(twoCol ? { display: "grid", gridTemplateRows: "subgrid", gridRow: `1 / span ${showRpm ? 3 : 2}` } : {}) }}>
            {/* Bean — immer, ausser beim Messlauf */}
            {!measurement && <Field label={t("preshot.bean")} style={row(1)}>
              <BeanPicker
                beans={beans}
                value={beanId}
                onChange={(v) => {
                  setBeanId(v);
                  void fetchDefaults(v, grinderId, v !== null ? profile.id : undefined, basketId);
                }}
                style={inputStyle}
              />
              {beans.length === 0 && (
                <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>
                  {t("preshot.noBeansHint")}
                </div>
              )}
              {selectedBean && selectedBean.remainingG !== null && selectedBean.remainingG >= 0 && (
                <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedBean.bagSizeG !== null
                    ? t("preshot.remaining").replace("{rest}", fmtG(selectedBean.remainingG)).replace("{bag}", fmtG(selectedBean.bagSizeG))
                    : t("preshot.remainingNoBag").replace("{rest}", fmtG(selectedBean.remainingG))}
                </div>
              )}
              {/* Fremdbohne: Bohnen, die hier bewusst nicht gepflegt werden. */}
              {beanId === null && (
                <BeanLabelInput
                  listId="preshot-bean-labels"
                  value={beanLabel}
                  onChange={setBeanLabel}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              )}
              {/* Vor dem Mahlen sichtbar: der Beutel traegt keinen Bezug mehr. */}
              {selectedBeanDepleted && (
                <div style={{ fontSize: 11, color: C.org, marginTop: 4 }}>
                  {t("stockAlert.preBrew")}
                </div>
              )}
            </Field>}

            {/* Dose */}
            {fields.dose && (
              <Field label={`${t("preshot.dose")} (g)`} style={row(2)}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" aria-label="Dosis 0,5 g weniger" onClick={() => bumpDose(-1)} style={doseBtn}>−</button>
                  <input
                    ref={doseRef}
                    style={{ ...numInputStyle, flex: 1, minWidth: 0, textAlign: "center", ...(doseMissing ? { borderColor: C.red } : {}) }}
                    type="number"
                    step={0.1}
                    min={0}
                    value={doseG}
                    onChange={(e) => {
                      setDoseG(e.target.value);
                      if (e.target.value.trim() !== "") setDoseWarn(false);
                    }}
                  />
                  <button type="button" aria-label="Dosis 0,5 g mehr" onClick={() => bumpDose(1)} style={doseBtn}>+</button>
                  {scaleDoseG !== null && (
                    <button
                      type="button"
                      onClick={() => { setDoseG(String(scaleDoseG)); setDoseWarn(false); }}
                      title={t("preshot.doseFromScale")}
                      aria-label={t("preshot.doseFromScale")}
                      style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "0 10px", borderRadius: 7,
                        border: `1px solid ${alpha(C.acc, 0.55)}`, background: alpha(C.acc, 0.12), color: C.acc,
                        fontSize: 13, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      <Scale size={14} />
                      {fmtG(scaleDoseG)} g
                    </button>
                  )}
                </div>
                {doseEl}
                {doseMissing && (
                  <div style={{ fontSize: 11.5, color: C.red, marginTop: 5 }}>
                    {t("preshot.doseMissing")}
                    {lastDoseG !== null && (
                      <>
                        {" · "}
                        <button
                          onClick={() => { setDoseG(String(lastDoseG)); setDoseWarn(false); }}
                          style={{ background: "transparent", border: "none", padding: 0, color: C.acc, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                        >
                          {t("preshot.doseLast").replace("{g}", dec(String(lastDoseG)))}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </Field>
            )}
            </div>
            <div style={{ ...groupBox, marginBottom: twoCol ? 0 : 8, ...(twoCol ? { display: "grid", gridTemplateRows: "subgrid", gridRow: `1 / span ${showRpm ? 3 : 2}` } : {}) }}>
            {/* Grinder */}
            {fields.grinder && (
              <Field label={t("preshot.grinder")} style={row(1)}>
                <select
                  style={inputStyle}
                  value={grinderId === null ? "" : String(grinderId)}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    setGrinderId(v);
                    void fetchDefaults(beanId, v, beanId !== null ? profile.id : undefined, basketId);
                  }}
                >
                  <option value="">{t("preshot.noGrinder")}</option>
                  {grinders.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </Field>
            )}

            {/* Grind setting */}
            {fields.grindSetting && (
              <Field label={t("preshot.grindSetting")} aside={grindAside} style={row(2)}>
                <GrindStepper value={grindSetting} onChange={(v) => { setGrindSetting(v); setGrindSource(null); }} inputStyle={numInputStyle} />
                {adviceEl}
                {noteEl}
              </Field>
            )}

            {/* RPM — only when the selected grinder supports it */}
            {showRpm && (
              <Field label={t("preshot.grinderRpm")} style={row(3)}>
                <input
                  style={{
                    ...numInputStyle,
                    borderColor: rpmOutOfRange ? C.red : C.bdr,
                  }}
                  type="number"
                  step={1}
                  value={grinderRpm}
                  onChange={(e) => setGrinderRpm(e.target.value)}
                />
                {selectedGrinder !== null &&
                  selectedGrinder.rpmMin !== null &&
                  selectedGrinder.rpmMax !== null && (
                    <div
                      style={{
                        fontSize: 11,
                        color: rpmOutOfRange ? C.red : C.mut,
                        marginTop: 4,
                      }}
                    >
                      {t("preshot.rpmRange")
                        .replace("{{min}}", String(selectedGrinder.rpmMin))
                        .replace("{{max}}", String(selectedGrinder.rpmMax))}
                    </div>
                  )}
              </Field>
            )}

            </div>
          </div>
        )}
        </div>

        {/* Profile note — read-only context beside the fields (never editable
            here; it belongs to the profile, not to this shot). */}
        {showProfileNotes && (
          <aside
            style={{
              flex: "1 1 200px",
              minWidth: 0,
              background: C.bg,
              border: `1px solid ${C.bdr}`,
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 6 }}>{t("preshot.profileNotes")}</div>
            {/* Hoechstens 4 Zeilen — eine uebernommene Decent-Beschreibung ist lang, der
                Dialog darf nicht scrollen. Der ganze Text steht im Editor („Notiz“). */}
            <div style={{ fontSize: 12.5, color: C.txtS, lineHeight: 1.5, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {profile.notes}
            </div>
          </aside>
        )}
        </div>

        </>
        )}

        <div ref={actionRef}>
        {/* Sieb passt nicht zur Variante (weich — der zweite Klick startet trotzdem) */}
        {basketWarn && basketMismatch && basket && defaultBasket && variant && (
          <div
            style={{
              color: C.warnSoft,
              background: alpha(C.warnSoft, 0.10),
              border: `1px solid ${alpha(C.warnSoft, 0.30)}`,
              borderRadius: 8,
              fontSize: 12,
              padding: "8px 12px",
              margin: "4px 0 8px",
            }}
          >
            {t("preshot.basketMismatch", { basket: basket.name, variant: variant.name, default: defaultBasket.name })}
          </div>
        )}

        {/* Scale-not-connected warning (soft — second click starts anyway) */}
        {scaleWarn && (
          <div
            style={{
              color: C.warnSoft,
              background: alpha(C.warnSoft, 0.10),
              border: `1px solid ${alpha(C.warnSoft, 0.30)}`,
              borderRadius: 8,
              fontSize: 12,
              padding: "8px 12px",
              margin: "4px 0 8px",
            }}
          >
            {t("preshot.scaleNotConnected")}
          </div>
        )}

        {/* Error bar */}
        {error && (
          <div style={{ color: C.red, fontSize: 12, margin: "4px 0 8px" }}>{error}</div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={starting}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              background: "transparent",
              border: `1px solid ${C.bdr}`,
              color: C.mut,
              fontSize: 13,
              fontWeight: 500,
              cursor: starting ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {t("preshot.cancel")}
          </button>
          <button
            onClick={() => { void handleStart(); }}
            disabled={starting || loading}
            style={{
              flex: 2,
              padding: "10px 0",
              borderRadius: 8,
              background: C.accG2,
              border: `1px solid ${C.accB}`,
              color: C.acc,
              fontSize: 13,
              fontWeight: 600,
              cursor: starting || loading ? "wait" : "pointer",
              opacity: starting || loading ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {starting
              ? t("preshot.starting")
              : doseMissing
                ? t("preshot.startWithoutDose")
              : scaleWarn || (basketWarn && basketMismatch)
                ? t("preshot.startAnyway")
                : t("preshot.start")}
          </button>
        </div>
        </div>
      </div>
    </div>

    {/* Temperatur-Fenster (Einfachansicht): setzt Brenngruppe + Boiler auf den eingegebenen Wert. */}
    {tempPopupOpen && (
      <div
        onClick={() => { setTempPopupOpen(false); }}
        style={{ position: "fixed", inset: 0, background: C.overlay, backdropFilter: "blur(4px)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); }}
          style={{ background: C.cardElev, border: `1px solid ${C.bdrL}`, borderRadius: 14, padding: "20px 24px 24px", width: "min(340px, 92vw)", boxShadow: `0 8px 40px ${alpha(C.black, 0.5)}` }}
        >
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600, color: C.txt }}>Temperatur setzen</h2>
          <Field label="Temperatur (°C)">
            <input
              autoFocus
              style={numInputStyle}
              type="number"
              inputMode="decimal"
              step={0.5}
              value={tempInput}
              onChange={(e) => { setTempInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") void applyTemp(false); }}
            />
          </Field>
          <div style={{ fontSize: 11, color: C.mut, margin: "-4px 0 12px" }}>
            Stellt Brühgruppe und Boiler der Maschine auf diesen Wert (70–105 °C).
            {profile.targetTempC !== null && ` Profil-Soll: ${profile.targetTempC.toFixed(1)} °C.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { void applyTemp(true); }}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "transparent", border: `1px solid ${C.bdr}`, color: C.mut, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
            >
              Profil-Soll
            </button>
            <button
              onClick={() => { void applyTemp(false); }}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: C.accG2, border: `1px solid ${C.accB}`, color: C.acc, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Setzen
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Yield-override popup — direct numeric entry, no bounds (Entscheidung 5). */}
    {yieldPopupOpen && (
      <div
        onClick={() => { setYieldPopupOpen(false); }}
        style={{
          position: "fixed",
          inset: 0,
          background: C.overlay,
          backdropFilter: "blur(4px)",
          zIndex: 110,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); }}
          style={{
            background: C.cardElev,
            border: `1px solid ${C.bdrL}`,
            borderRadius: 14,
            padding: "20px 24px 24px",
            width: "min(340px, 92vw)",
            boxShadow: `0 8px 40px ${alpha(C.black, 0.5)}`,
          }}
        >
          <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600, color: C.txt }}>
            {t("preshot.yieldEditTitle")}
          </h2>

          {/* Yield und Ratio nebeneinander — beide ueber die Dosis gekoppelt. */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field label={`${t("preshot.yield")} (g)`}>
                <input
                  autoFocus
                  style={numInputStyle}
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  value={yieldInput}
                  placeholder={t("preshot.yieldPlaceholder")}
                  onChange={(e) => { changeYieldInput(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") applyYieldPopup(); }}
                />
              </Field>
            </div>
            {fields.dose && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label={t("preshot.ratio")}>
                  <input
                    style={{ ...numInputStyle, opacity: hasDose ? 1 : 0.5 }}
                    type="number"
                    inputMode="decimal"
                    step={0.05}
                    disabled={!hasDose}
                    value={ratioInput}
                    placeholder={hasDose ? "2" : "–"}
                    onChange={(e) => { changeRatioInput(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") applyYieldPopup(); }}
                  />
                </Field>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.mut, margin: "-4px 0 8px" }}>
            {t("preshot.yieldEmptyHint")}
            {fields.dose && !hasDose && <> · {t("preshot.ratioNeedsDose")}</>}
            {hasDose && <> · {t("preshot.ratioDose", { g: String(doseVal).replace(".", lang === "de" ? "," : ".") })}</>}
          </div>

          {hasCmd27 && (
            <div
              style={{
                fontSize: 11,
                color: C.mut,
                background: C.bg,
                border: `1px solid ${C.bdr}`,
                borderRadius: 7,
                padding: "8px 10px",
                marginBottom: 12,
                lineHeight: 1.4,
              }}
            >
              {t("preshot.yieldCmd27Hint")}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={resetYieldOverride}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                background: "transparent",
                border: `1px solid ${C.bdr}`,
                color: C.mut,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("preshot.yieldReset")}
            </button>
            <button
              onClick={applyYieldPopup}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                background: C.accG2,
                border: `1px solid ${C.accB}`,
                color: C.acc,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t("preshot.yieldApply")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
