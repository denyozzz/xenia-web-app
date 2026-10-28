/**
 * BasketEditor — Dialog zum Anlegen oder Bearbeiten eines Siebs (wie GrinderEditor).
 * Felder: Name (kurz, Pflicht), Beschreibung (frei) und Nenndosis (g). Einen
 * Typ gibt es nicht mehr — das Sieb selbst ist die Einheit.
 */

import { useState, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../i18n/index.js";
import type { Basket, BasketCreate, Profile } from "@shared/types.js";
import theme from "../theme.js";
import { dec } from "../lib/num.js";

const C = theme;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  background: C.bg,
  border: `1px solid ${C.bdr}`,
  color: C.txt,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: C.mut,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

interface BasketEditorProps {
  basket?: Basket;
  /** `variants`: Profile, in denen eine Variante mit diesem Sieb neu entstehen (`profileIds`) bzw. wegfallen soll (`removeIds`). */
  onSave: (data: BasketCreate, variants?: { profileIds: number[]; likeName: string | null; removeIds?: number[] }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function BasketEditor({ basket, onSave, onDelete, onClose }: BasketEditorProps) {
  const { t } = useTranslation();
  const isEdit = basket !== undefined;
  const [name, setName] = useState(basket?.name ?? "");
  const [description, setDescription] = useState(basket?.description ?? "");
  const [dose, setDose] = useState(basket?.nominalDoseG != null ? dec(String(basket.nominalDoseG)) : "");
  const [yieldG, setYieldG] = useState(basket?.targetYieldG != null ? dec(String(basket.targetYieldG)) : "");
  const [variantName, setVariantName] = useState(basket?.variantName ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Beim Anlegen: Profile, in denen gleich eine Variante mit diesem Sieb entstehen kann.
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // Profile, in denen das Sieb schon eine Variante hat (nur beim Bearbeiten).
  const [linked, setLinked] = useState<Set<number>>(new Set());
  const [likeName, setLikeName] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((list: Profile[]) => {
      if (!live) return;
      const brew = list.filter((p) => p.kind === "brew" && !p.isArchived && (p.variants?.length ?? 0) > 0);
      setProfiles(brew);
      if (basket) {
        const l = new Set(brew.filter((p) => (p.variants ?? []).some((v) => v.defaultBasketId === basket.id)).map((p) => p.id));
        setLinked(l);
        setPicked(new Set(l));
      }
    }).catch(() => { /* ohne Profilliste bleibt der Abschnitt leer */ });
    return () => { live = false; };
  }, [basket]);

  const likeNames = [...new Set(profiles.flatMap((p) => (p.variants ?? []).map((v) => v.name)))];
  // Was sich gegenueber dem gespeicherten Stand aendert: neu verknuepfen bzw. loesen.
  const addIds = [...picked].filter((id) => !linked.has(id));
  const removeIds = [...linked].filter((id) => !picked.has(id));

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setSaveError(t("settings.baskets.nameRequired")); return; }
    const doseRaw = dose.trim().replace(",", ".");
    const nominalDoseG = doseRaw === "" ? null : Number(doseRaw);
    if (nominalDoseG !== null && !(Number.isFinite(nominalDoseG) && nominalDoseG > 0 && nominalDoseG <= 40)) {
      setSaveError(t("settings.baskets.doseInvalid"));
      return;
    }
    const yRaw = yieldG.trim().replace(",", ".");
    const targetYieldG = yRaw === "" ? null : Number(yRaw);
    if (targetYieldG !== null && !(Number.isFinite(targetYieldG) && targetYieldG > 0 && targetYieldG <= 200)) {
      setSaveError("Zielmenge: eine Zahl über 0 bis 200 g.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(
        { name: name.trim(), description: description.trim() || null, nominalDoseG, targetYieldG, variantName: variantName.trim() || null },
        addIds.length > 0 || removeIds.length > 0 ? { profileIds: addIds, likeName: likeName || null, removeIds } : undefined,
      );
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [name, description, dose, yieldG, variantName, isEdit, addIds, removeIds, likeName, onSave, onClose, t]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    if (!window.confirm(t("settings.baskets.deleteConfirm"))) return;
    setDeleting(true);
    try { await onDelete(); onClose(); }
    catch (err) { setSaveError(err instanceof Error ? err.message : String(err)); }
    finally { setDeleting(false); }
  }, [onDelete, onClose, t]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 100 }} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 101,
          width: "min(420px, 95vw)", background: C.cardElev, border: `1px solid ${C.bdrL}`, borderRadius: 14,
          padding: "20px 24px 24px", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 16px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.txt }}>
            {isEdit ? t("settings.baskets.editTitle") : t("settings.baskets.createTitle")}
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.mut, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t("settings.baskets.fields.name")}</label>
          <input
            style={inputStyle}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.baskets.fields.namePlaceholder")}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t("settings.baskets.fields.description")}</label>
          <input
            style={inputStyle}
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("settings.baskets.fields.descriptionPlaceholder")}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t("settings.baskets.fields.nominalDose")}</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              style={{ ...inputStyle, width: 90 }}
              value={dose}
              inputMode="decimal"
              onChange={(e) => setDose(e.target.value)}
              placeholder="–"
            />
            <span style={{ fontSize: 12, color: C.mut }}>g</span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Zielmenge</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              style={{ ...inputStyle, width: 90 }}
              value={yieldG}
              inputMode="decimal"
              onChange={(e) => setYieldG(e.target.value)}
              placeholder="–"
            />
            <span style={{ fontSize: 12, color: C.mut }}>g</span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Variantenname (Schaltfläche im Dashboard)</label>
          <input
            style={inputStyle}
            value={variantName}
            maxLength={20}
            onChange={(e) => setVariantName(e.target.value)}
            placeholder="leer = keine eigene Schaltfläche"
          />
        </div>

        {profiles.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{isEdit ? "Variante in diesen Profilen (Haken = verknüpft)" : "Als Variante in Profilen anlegen"}</label>
            <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${C.bdr}`, borderRadius: 7, padding: "4px 10px" }}>
              {profiles.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, color: C.txt, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                  />
                  {p.name}
                </label>
              ))}
            </div>
            {removeIds.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.org }}>
                Abgewählte Profile verlieren die Variante – nur wenn sie keine eigene Kurve hat und kein Grundplatz (Single/Double) ist.
              </div>
            )}
            {addIds.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label style={labelStyle}>Kurve wie Variante</label>
                <select style={inputStyle} value={likeName} onChange={(e) => setLikeName(e.target.value)}>
                  <option value="">jeweils die letzte Variante</option>
                  {likeNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        </div>

        {saveError && <div style={{ color: C.red, fontSize: 12, margin: "8px 0", flexShrink: 0 }}>{saveError}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexShrink: 0 }}>
          <div>
            {isEdit && onDelete && (
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                style={{ background: C.redD, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "8px 14px", color: C.red, fontSize: 13, cursor: "pointer" }}
              >
                {deleting ? "…" : t("settings.baskets.delete")}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "8px 16px", color: C.mut, fontSize: 13, cursor: "pointer" }}
            >
              {t("settings.baskets.cancel")}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ background: C.accG2, border: `1px solid ${C.accB}`, borderRadius: 8, padding: "8px 18px", color: C.acc, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {saving ? t("settings.baskets.saving") : t("settings.baskets.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
