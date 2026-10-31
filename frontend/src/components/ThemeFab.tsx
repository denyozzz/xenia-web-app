import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Moon, Sun, X } from "lucide-react";
import theme from "../theme";
import { useThemeChoice } from "../themeStartup.js";
import { setSimple, useSimple } from "../viewMode.js";
import { RECIPE_LINKS, SWITCH_GROUPS } from "../switchConfig.js";

const KEY = "xenia_theme";
type SwitchInfo = { values: Record<string, number>; options: { id: number; label: string }[] };

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
  const panelRef = useRef<HTMLDivElement>(null);

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
      .catch((error: unknown) => {
        if (active) setSwitchError(`Schalterbelegung nicht geladen: ${String(error)}`);
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
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
  const panel = {
    position: "absolute" as const,
    right: 0,
    bottom: 46,
    width: "min(360px, calc(100vw - 24px))",
    maxHeight: "min(70vh, 560px)",
    overflowY: "auto" as const,
    padding: 14,
    color: theme.txt,
    background: theme.card,
    border: `1px solid ${theme.bdr}`,
    borderRadius: 8,
    boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
  };
  const sectionTitle = { margin: "14px 0 7px", fontSize: 13, fontWeight: 700 } as const;
  const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12, borderTop: `1px solid ${theme.bdr}` } as const;

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
        <div ref={panelRef} role="dialog" aria-label="Lichtmodus, Schalter und Rezepte" style={panel}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ fontSize: 15 }}>Lichtmodus &amp; Schalter</strong>
            <button onClick={() => setOpen(false)} aria-label="Schließen" title="Schließen" style={{ ...btn, width: 32, height: 32, opacity: 1 }}>
              <X size={16} />
            </button>
          </div>

          <button
            onClick={() => void toggle()}
            style={{ ...btn, width: "100%", height: 42, justifyContent: "flex-start", gap: 9, padding: "0 10px", marginTop: 10, opacity: 1, color: theme.txt }}
          >
            {light ? <Moon size={17} /> : <Sun size={17} />}
            <span>{light ? "In den Dunkelmodus wechseln" : "In den Hellmodus wechseln"}</span>
          </button>

          <h3 style={sectionTitle}>Schalterbelegung</h3>
          {switchError ? (
            <div style={{ fontSize: 12, color: theme.red }}>{switchError}</div>
          ) : !switchInfo ? (
            <div style={{ fontSize: 12, color: theme.mut }}>Lade Schalterbelegung …</div>
          ) : SWITCH_GROUPS.map((group) => (
            <section key={group.title}>
              <div style={{ margin: "8px 0 4px", fontSize: 12, fontWeight: 600 }}>{group.title}</div>
              {group.parts.flat().map((row) => {
                const id = switchInfo.values[row.key];
                const label = switchInfo.options.find((option) => option.id === id)?.label ?? `Funktion ${id ?? "?"}`;
                return (
                  <div key={row.key} style={rowStyle}>
                    <span style={{ color: theme.mut }}>{row.label}</span>
                    <span style={{ textAlign: "right", fontWeight: 600 }}>{label}</span>
                  </div>
                );
              })}
            </section>
          ))}

          <h3 style={sectionTitle}>Rezepte</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 12 }}>
            {RECIPE_LINKS.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: theme.acc, textDecoration: "underline" }}>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
