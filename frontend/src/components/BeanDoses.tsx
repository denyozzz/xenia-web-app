import { useEffect, useState } from "react";
import theme from "../theme";
import { HIDDEN_VARIANTS_EVENT } from "../hooks/useHiddenVariants.js";
import { EMPTY_HIDDEN, isLightRoast, variantHidden } from "../lib/hiddenVariants.js";
import type { HiddenState } from "../lib/hiddenVariants.js";

interface Variant { id: number; name: string; doseG?: number | null; defaultBasketId?: number | null }
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(r1(n)).replace(".", ",");

/** Dosis je Variante des bevorzugten Profils, nur fuer diese Bohne. Leer = Dosis des Profils. Speichert sofort. */
export function BeanDoses({ coffeeId, profileId, roastLevel = null }: { coffeeId: number; profileId: number; roastLevel?: string | null }) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [own, setOwn] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [nominals, setNominals] = useState<Record<number, number>>({});
  // Varianten, die bei dieser Bohne im Dashboard nicht als Schaltflaeche erscheinen.
  const [hiddenSt, setHiddenSt] = useState<HiddenState>(EMPTY_HIDDEN);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/profiles");
        const d = (await r.json()) as unknown;
        const o = d as { data?: unknown; profiles?: unknown };
        const list = (Array.isArray(d) ? d : Array.isArray(o?.data) ? o.data : Array.isArray(o?.profiles) ? o.profiles : []) as Array<{ id: number; variants?: Variant[] }>;
        const p = list.find((x) => x.id === profileId);
        if (alive) setVariants(p?.variants ?? []);
      } catch { if (alive) setVariants([]); }
      try {
        const rb = await fetch("/api/baskets");
        const db = (await rb.json()) as unknown;
        const ob = db as { data?: unknown; baskets?: unknown };
        const bl = (Array.isArray(db) ? db : Array.isArray(ob?.data) ? ob.data : Array.isArray(ob?.baskets) ? ob.baskets : []) as Array<{ id: number; nominalDoseG?: number | null }>;
        const m: Record<number, number> = {};
        for (const b of bl) if (typeof b.nominalDoseG === "number") m[b.id] = b.nominalDoseG;
        if (alive) setNominals(m);
      } catch { /* ohne Siebe: keine Vorgabe */ }
      try {
        const rd = await fetch(`/api/shots/coffee-doses?coffeeId=${coffeeId}`);
        const dd = (await rd.json()) as { doses?: Record<string, number> };
        if (alive) setOwn(dd.doses ?? {});
      } catch { if (alive) setOwn({}); }
      try {
        const rh = await fetch("/api/hidden-variants");
        const dh = (await rh.json()) as Partial<HiddenState>;
        if (alive) setHiddenSt({ hidden: dh.hidden ?? {}, shown: dh.shown ?? {} });
      } catch { if (alive) setHiddenSt(EMPTY_HIDDEN); }
    })();
    return () => { alive = false; };
  }, [coffeeId, profileId]);

  const save = async (variantId: number, v: number | null) => {
    setErr("");
    try {
      const res = await fetch("/api/shots/coffee-dose", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coffeeId, variantId, doseG: v }),
      });
      if (!res.ok) { setErr("Speichern fehlgeschlagen."); return; }
      const next = { ...own };
      if (v === null) delete next[String(variantId)]; else next[String(variantId)] = v;
      setOwn(next);
    } catch { setErr("Speichern fehlgeschlagen."); }
  };

  const light = isLightRoast(roastLevel);
  const isHid = (v: Variant) => variantHidden(v, coffeeId, light, hiddenSt);
  const toggleHidden = async (variantId: number) => {
    setErr("");
    const cur = variants.find((x) => x.id === variantId);
    const hide = cur ? !isHid(cur) : true;
    try {
      const res = await fetch("/api/hidden-variants", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coffeeId, variantId, hidden: hide }),
      });
      if (!res.ok) { setErr("Speichern fehlgeschlagen."); return; }
      const k = String(coffeeId);
      const without = (m: Record<string, number[]>) => ({ ...m, [k]: (m[k] ?? []).filter((x) => x !== variantId) });
      const withIt = (m: Record<string, number[]>) => ({ ...m, [k]: [...(m[k] ?? []).filter((x) => x !== variantId), variantId] });
      setHiddenSt(hide ? { hidden: withIt(hiddenSt.hidden), shown: without(hiddenSt.shown) } : { hidden: without(hiddenSt.hidden), shown: withIt(hiddenSt.shown) });
      window.dispatchEvent(new Event(HIDDEN_VARIANTS_EVENT));
    } catch { setErr("Speichern fehlgeschlagen."); }
  };

  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/shots/coffee-ratio?coffeeId=${coffeeId}`)
      .then((r) => r.json() as Promise<{ ratio?: number | null }>)
      .then((d) => { if (alive) setRatio(typeof d.ratio === "number" ? d.ratio : null); })
      .catch(() => { if (alive) setRatio(null); });
    return () => { alive = false; };
  }, [coffeeId]);
  const saveRatio = async (v: number | null) => {
    setErr("");
    try {
      const res = await fetch("/api/shots/coffee-ratio", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coffeeId, ratio: v }),
      });
      if (!res.ok) { setErr("Speichern fehlgeschlagen."); return; }
      setRatio(v);
    } catch { setErr("Speichern fehlgeschlagen."); }
  };

  if (variants.length === 0) return null;
  const btn = { width: 30, height: 30, borderRadius: 7, border: `1px solid ${theme.bdr}`, background: theme.card, color: theme.txt, cursor: "pointer", fontFamily: "inherit" } as const;
  return (
    <div style={{ margin: "4px 0 12px", padding: "8px 10px", border: `1px solid ${theme.bdr}`, borderRadius: 9 }}>
      <div style={{ fontSize: 11, color: theme.mut, marginBottom: 6 }}>Dosis dieser Bohne je Variante (leer = Dosis des Profils) und ob die Variante im Dashboard als Schaltfläche erscheint (bei hellen Bohnen ist „Single“ standardmäßig aus, du kannst es hier einschalten). Wird sofort gespeichert.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${theme.bdr}` }}>
        <span style={{ flex: 1, fontSize: 13, color: theme.txt }} title="Dosis × Ratio ergibt das Yield beim Bezug. Das Profil bleibt unverändert. Leer = Yield des Profils.">Ratio (Yield je Gramm Dosis)</span>
        <button type="button" style={btn} onClick={() => void saveRatio(Math.max(1, r1((ratio ?? 2) - 0.1)))}>−</button>
        <span style={{ minWidth: 64, textAlign: "center", fontSize: 14, fontWeight: 600, color: ratio !== null ? theme.txt : theme.mut }}>
          {ratio !== null ? `1 : ${fmt(ratio)}` : "—"}
        </span>
        <button type="button" style={btn} onClick={() => void saveRatio(Math.min(20, r1((ratio ?? 2) + 0.1)))}>+</button>
        <button type="button" style={{ ...btn, opacity: ratio !== null ? 1 : 0.3 }} disabled={ratio === null} title="Ratio entfernen (Yield des Profils gilt)" onClick={() => void saveRatio(null)}>↺</button>
      </div>
      {variants.map((v) => {
        const mine = own[String(v.id)];
        const fromProfile = v.doseG ?? null;
        const base = fromProfile ?? (v.defaultBasketId != null ? (nominals[v.defaultBasketId] ?? null) : null);
        const cur = mine ?? base ?? 18;
        return (
          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ flex: 1, fontSize: 13, color: theme.txt }}>{v.name}</span>
            <button type="button" style={btn} onClick={() => void save(v.id, Math.max(1, r1(cur - 0.5)))}>−</button>
            <span style={{ minWidth: 64, textAlign: "center", fontSize: 14, fontWeight: 600, color: mine !== undefined ? theme.txt : theme.mut }}>
              {mine !== undefined ? fmt(mine) + " g" : base !== null ? fmt(base) + (fromProfile !== null ? " g (Profil)" : " g (Sieb)") : "—"}
            </span>
            <button type="button" style={btn} onClick={() => void save(v.id, r1(cur + 0.5))}>+</button>
            <button type="button" style={{ ...btn, opacity: mine !== undefined ? 1 : 0.3 }} disabled={mine === undefined} title="Auf Dosis des Profils zurücksetzen" onClick={() => void save(v.id, null)}>↺</button>
            <button
              type="button"
              title="Schaltfläche dieser Variante bei dieser Bohne im Dashboard zeigen oder ausblenden"
              onClick={() => void toggleHidden(v.id)}
              style={{ ...btn, width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 600, background: isHid(v) ? theme.card : theme.accG, color: isHid(v) ? theme.mut : theme.acc }}
            >
              {isHid(v) ? "Dashboard: aus" : "Dashboard: an"}
            </button>
          </div>
        );
      })}
      {err && <div style={{ fontSize: 12, color: theme.red }}>{err}</div>}
    </div>
  );
}
