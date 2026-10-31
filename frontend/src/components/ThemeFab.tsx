import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Moon, Sun, X } from "lucide-react";
import theme from "../theme";
import { useThemeChoice } from "../themeStartup.js";
import { setSimple, useSimple } from "../viewMode.js";
import { RECIPE_LINKS, SWITCH_GROUPS } from "../switchConfig.js";

const KEY = "xenia_theme";
type SwitchInfo = { values: Record<string, number>; options: { id: number; label: string }[] };
type MachineSettings = { machine_ip_real?: string | null; machine_ip?: string | null };

function isLight(): boolean {
  return typeof document !== "undefined" && document.documentElement.style.colorScheme === "light";
}

/** Schwebende Ansichtsknoepfe und Infofenster fuer Lichtmodus, Schalter und Rezepte. */
export function ThemeFab() {
  const light = isLight();
  const simple = useSimple();
  const [open, setOpen] = useState(false);
  const [switchInfo, setSwitchInfo] = useState<SwitchInfo | null>(null);
  const [switchError, setSwitchError] = useState("");
  const [machineUrl, setMachineUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSwitchInfo(null);
    setSwitchError("");
    fetch("/api/switches")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<SwitchInfo>;
      })
      .then((data) => {
        if (active) setSwitchInfo(data);
      })
      .catch(() => {
        if (active) setSwitchError("Schalterbelegung nicht verfügbar");
      });
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<MachineSettings>;
      })
      .then((data) => {
        const address = data.machine_ip_real?.trim() || data.machine_ip?.trim();
        if (active) setMachineUrl(address ? `http://${address}` : "");
      })
      .catch(() => {
        if (active) setMachineUrl("");
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = async () => {
    let ui = light ? "dark" : "light";
    let schemes: unknown[] = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const c = JSON.parse(raw); if (Array.isArray(c.schemes)) schemes = c.schemes;
        const ids = (schemes as { id?: string }[]).map((x) => x.id);
        if (c.ui === "scheme:crema" && ids.includes("mediterran")) ui = "scheme:mediterran";
        else if (c.ui === "scheme:mediterran" && ids.includes("crema")) ui = "scheme:crema"; }
    } catch { /* ohne Kopie: keine Schemata */ }
    try {
      const r = await fetch("/api/settings");
      if (r.ok) {
        const st = await r.json();
        const list = JSON.parse(st.ui_color_schemes || "[]");
        if (Array.isArray(list)) schemes = list;
        const cur = String(st.ui_theme || "");
        const ids = (schemes as { id?: string }[]).map((x) => x.id);
        if (cur === "scheme:crema" && ids.includes("mediterran")) ui = "scheme:mediterran";
        else if (cur === "scheme:mediterran" && ids.includes("crema")) ui = "scheme:crema";
        else ui = light ? "dark" : "light";
      }
    } catch { /* Server nicht lesbar: lokale Kopie bleibt */ }
    try {
      const res = await fetch("/api/settings/ui_theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: ui }),
      });
      if (!res.ok) return;
    } catch { return; }
    useThemeChoice({ ui, schemes: schemes as never });
  };
  const btn = {
    width: 44, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    background: theme.card, color: theme.mut, border: `1px solid ${theme.bdr}`,
    borderRadius: 6, cursor: "pointer", opacity: 0.6,
  } as const;
  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.opacity = "1"; },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.opacity = "0.6"; },
  };
  const overlay = {
    position: "fixed" as const,
    inset: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "rgba(0,0,0,0.6)",
  };
  const panel = {
    width: "85%",
    maxWidth: 450,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto" as const,
    boxSizing: "border-box" as const,
    padding: 20,
    color: theme.txt,
    background: theme.card,
    border: `1px solid ${theme.bdr}`,
    borderRadius: 8,
  };
  const sectionTitle = { margin: "24px 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const };
  const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", fontSize: 13, borderBottom: "1px solid rgba(128,128,128,0.2)" } as const;

  return (
    <div style={{ position: "fixed", bottom: 12, right: 12, zIndex: 50, display: "flex", gap: 8 }}>
      <button
        onClick={() => setSimple(!simple)}
        title={simple ? "Experten-Ansicht" : "Einfache Ansicht"}
        aria-label={simple ? "Experten-Ansicht" : "Einfache Ansicht"}
        style={btn}
        {...hover}
      >
        {simple ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
      </button>
      <button
        onClick={() => setOpen(!open)}
        title="Lichtmodus und Schalterinfos"
        aria-label="Lichtmodus und Schalterinfos"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={btn}
        {...hover}
      >
        {light ? <Moon size={18} /> : <Sun size={20} />}
      </button>
      {open && (
        <div style={overlay} onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Lichtmodus, Schalter und Rezepte" aria-modal="true" style={panel} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              {machineUrl ? (
                <a href={machineUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.mut, fontSize: 15, fontWeight: 400, textDecoration: "none" }}>Xenia</a>
              ) : (
                <span style={{ color: theme.mut, fontSize: 15 }}>Xenia</span>
              )}
              <button onClick={() => setOpen(false)} aria-label="Schließen" title="Schließen" style={{ ...btn, width: 32, height: 32, opacity: 1 }}>
                <X size={16} />
              </button>
            </div>

            {switchError ? (
              <div style={{ ...sectionTitle, color: theme.mut }}>Schalterbelegung nicht verfügbar</div>
            ) : !switchInfo ? (
              <div style={{ ...sectionTitle, color: theme.mut }}>Lade Schalterbelegung …</div>
            ) : SWITCH_GROUPS.map((group, groupIndex) => {
              const rows = group.parts.flat();
              return (
                <section key={group.title}>
                  <h3 style={{ ...sectionTitle, marginTop: groupIndex === 0 ? 24 : 44 }}>{group.title}</h3>
                  {rows.map((row, rowIndex) => {
                    const id = switchInfo.values[row.key];
                    const label = switchInfo.options.find((option) => option.id === id)?.label ?? `Funktion ${id ?? "?"}`;
                    const isLast = rowIndex === rows.length - 1;
                    const isLong = row.label.includes("lang");
                    return (
                      <div key={row.key} style={{ ...rowStyle, borderBottom: isLast ? "none" : rowStyle.borderBottom, marginTop: groupIndex === 1 && rowIndex === 2 ? 20 : 0, opacity: isLong ? 0.6 : 1 }}>
                        <span style={{ color: theme.mut }}>{row.label.replace(" drücken", "")}</span>
                        <span style={{ textAlign: "right" }}>{label}</span>
                      </div>
                    );
                  })}
                </section>
              );
            })}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, fontSize: 14 }}>
                {RECIPE_LINKS.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: theme.mut, textDecoration: "underline", opacity: 0.4 }}
                    onMouseEnter={(event) => { event.currentTarget.style.opacity = "0.8"; }}
                    onMouseLeave={(event) => { event.currentTarget.style.opacity = "0.4"; }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <button
                onClick={() => { setOpen(false); void toggle(); }}
                style={{ ...btn, width: "auto", maxWidth: "60%", height: "auto", minHeight: 42, justifyContent: "flex-start", gap: 9, padding: "8px 10px", opacity: 1, color: theme.txt, flexShrink: 1 }}
              >
                {light ? <Moon size={17} /> : <Sun size={17} />}
                <span>{light ? "In den Dunkelmodus wechseln" : "In den Hellmodus wechseln"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
