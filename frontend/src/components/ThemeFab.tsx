import { Maximize2, Minimize2, Moon, Sun } from "lucide-react";
import theme from "../theme";
import { useThemeChoice } from "../themeStartup.js";
import { setSimple, useSimple } from "../viewMode.js";

const KEY = "xenia_theme";

function isLight(): boolean {
  return typeof document !== "undefined" && document.documentElement.style.colorScheme === "light";
}

/** Schwebende Knoepfe unten rechts: Einfach/Experten-Ansicht und Hell/Dunkel. */
export function ThemeFab() {
  const light = isLight();
  const simple = useSimple();
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
        onClick={() => void toggle()}
        title={light ? "Dunkel" : "Hell"}
        aria-label={light ? "Dunkel" : "Hell"}
        style={btn}
        {...hover}
      >
        {light ? <Moon size={18} /> : <Sun size={20} />}
      </button>
    </div>
  );
}
