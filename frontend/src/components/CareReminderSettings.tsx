/**
 * Einstellungen der Pflege-Erinnerungen (Rueckspuelen ohne / mit Kaffeefettloeser, Duschsieb reinigen) - wie beim
 * Rueckspuel-Reminder: an/aus, Intervall in Tagen und (bei den beiden Rueckspuelen) welche Wartungsprofile als erledigt zaehlen.
 */
import { useEffect, useState } from "react";
import { Toggle } from "./Toggle.js";
import { useCareReminders } from "../hooks/useCareReminders.js";
import type { CareReminder, CareReminderPatch } from "../hooks/useCareReminders.js";
import { useProfiles } from "../hooks/useProfiles.js";
import theme from "../theme.js";

const C = theme;

function Block({ item, maintenance, onUpdate, onDone }: {
  item: CareReminder;
  maintenance: Array<{ id: number; name: string }>;
  onUpdate: (p: CareReminderPatch) => Promise<boolean>;
  onDone: () => void;
}) {
  const [days, setDays] = useState(String(item.intervalDays));
  const [err, setErr] = useState(false);
  useEffect(() => { setDays(String(item.intervalDays)); }, [item.intervalDays]);
  const last = item.daysAgo === 0 ? "heute" : item.daysAgo === 1 ? "vor 1 Tag" : `vor ${item.daysAgo} Tagen`;
  const next = !item.enabled ? "aus" : item.dueInDays <= 0 ? "fällig" : item.dueInDays === 1 ? "morgen" : `in ${item.dueInDays} Tagen`;
  const sel = new Set(item.profileIds);
  const toggle = (id: number) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else n.add(id);
    void onUpdate({ profileIds: [...n] });
  };
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.bdr}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.txt, fontWeight: 500 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: C.mut }}>Zuletzt {last}, nächste Erinnerung {next}</div>
        </div>
        <Toggle checked={item.enabled} onChange={(v) => { void onUpdate({ enabled: v }); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.mut }}>Erinnern nach</span>
        <input
          type="number" min={1} max={365} value={days} disabled={!item.enabled}
          onChange={(e) => { setDays(e.target.value); setErr(false); }}
          onBlur={() => {
            const n = Math.round(parseFloat(days));
            if (!Number.isFinite(n) || n < 1 || n > 365) { setErr(true); setDays(String(item.intervalDays)); return; }
            if (n !== item.intervalDays) void onUpdate({ intervalDays: n }).then((ok) => { if (!ok) setErr(true); });
          }}
          style={{ width: 64, padding: "6px 8px", borderRadius: 8, background: C.sunken, border: `1px solid ${C.bdr2}`, color: C.txt, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", textAlign: "right", outline: "none" }}
        />
        <span style={{ fontSize: 12, color: C.mut }}>{item.id === "flush-cleaner" ? "Tagen nach dem letzten Rückspülen mit Fettlöser" : item.id === "flush-water" ? "Tagen nach dem letzten Rückspülen (entfällt, wenn „mit Fettlöser“ bis dahin dran ist)" : "Tagen"}</span>
        <button
          type="button" onClick={onDone} title="Als jetzt erledigt markieren"
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: C.txtS, background: C.sunken, border: `1px solid ${C.bdr2}` }}
        >
          Erledigt
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>Ungültig (1 bis 365 Tage).</div>}
      {item.auto && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: C.mut, marginBottom: 4 }}>Diese Wartungsprofile zählen als erledigt, sobald sie laufen:</div>
          {maintenance.length === 0 ? (
            <div style={{ fontSize: 12, color: C.mut }}>Noch kein Wartungsprofil angelegt – dann nur „Erledigt“ von Hand.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {maintenance.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.txt }}>
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => { toggle(p.id); }} />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CareReminderSettings() {
  const { items, done, update } = useCareReminders();
  const { profiles } = useProfiles();
  if (items.length === 0) return null;
  const maintenance = profiles.filter((p) => p.kind === "maintenance").map((p) => ({ id: p.id, name: p.name }));
  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mut, fontWeight: 600, margin: "22px 0 4px" }}>
        Pflege-Erinnerungen
      </div>
      <div style={{ fontSize: 12, color: C.mut, marginBottom: 4 }}>
        Wie der Rückspül-Hinweis: erscheinen im Dashboard, bis sie erledigt sind. „Später“ blendet sie bis zum nächsten beendeten Bezug aus.
      </div>
      {items.map((it) => (
        <Block key={it.id} item={it} maintenance={maintenance} onUpdate={(p) => update(it.id, p)} onDone={() => { void done(it.id); }} />
      ))}
    </>
  );
}
