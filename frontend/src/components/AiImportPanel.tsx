/**
 * Patch 144: Sorte mit KI ausfuellen.
 * 1. "ChatGPT öffnen": Befehl in die Zwischenablage, ChatGPT oeffnet sich (App oder Website).
 *    Dort Fotos der Packung anhaengen, Befehl einfuegen, Antwort kopieren.
 * 2. "Antwort einfügen": liest die Zwischenablage und fuellt den Editor (oder Antwort ins Feld einfuegen).
 * Optional: Foto der Packung als Bild der Sorte.
 */
import { useRef, useState } from "react";
import { ClipboardPaste, ExternalLink, ImageIcon } from "lucide-react";
import theme from "../theme.js";
import { AI_PROMPT, AI_URL, copyText, parseAiAnswer } from "../lib/aiImport.js";

const C = theme;

export function AiImportPanel({ onLoaded, onCancel, image, onImage }: {
  onLoaded: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  image: File | null;
  onImage: (f: File | null) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const pickRef = useRef<HTMLInputElement>(null);

  const open = async () => {
    setErr(null);
    // Kopieren starten und sofort oeffnen: Safari blockiert Fenster, die erst nach einem await aufgehen.
    const copying = copyText(AI_PROMPT);
    window.open(AI_URL, "_blank", "noopener");
    const ok = await copying;
    setMsg(ok
      ? "Befehl ist kopiert. In ChatGPT: Fotos von Vorder- und Rückseite anhängen, Befehl einfügen, senden, Antwort kopieren – dann hier „Antwort einfügen“."
      : "Befehl konnte nicht kopiert werden – unten „Befehl anzeigen“ und von Hand kopieren.");
  };

  const apply = (t: string) => {
    try {
      onLoaded(parseAiAnswer(t));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const paste = async () => {
    setErr(null);
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) throw new Error("leer");
      apply(t);
    } catch {
      // Zwischenablage nicht lesbar (z. B. ältere WebView): Antwort von Hand einfügen.
      setManual(true);
    }
  };

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 12px",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };
  const primary: React.CSSProperties = { ...btn, background: C.accG2, border: `1px solid ${C.accB}`, color: C.acc };
  const secondary: React.CSSProperties = { ...btn, background: "transparent", border: `1px solid ${C.bdr}`, color: C.txtS };

  return (
    <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 10, padding: 12, background: C.bg }}>
      <div style={{ fontSize: 12, color: C.mut, marginBottom: 8 }}>
        Packung fotografieren und von ChatGPT auslesen lassen.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => void open()} style={primary}><ExternalLink size={15} />1. ChatGPT öffnen</button>
        <button type="button" onClick={() => void paste()} style={primary}><ClipboardPaste size={15} />2. Antwort einfügen</button>
        <button type="button" onClick={onCancel}
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.mut, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Abbrechen
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, color: C.txtS, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <button type="button" onClick={() => pickRef.current?.click()} style={secondary}>
          <ImageIcon size={15} />{image ? "Anderes Packungsfoto" : "Packungsfoto als Bild"}
        </button>
        <input ref={pickRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; if (f) onImage(f); }} />
        {image && (
          <span style={{ fontSize: 12, color: C.grn }}>
            Bild gewählt ✓ <button type="button" onClick={() => onImage(null)} style={{ background: "transparent", border: "none", color: C.mut, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>entfernen</button>
          </span>
        )}
        <button type="button" onClick={() => setManual((v) => !v)}
          style={{ background: "transparent", border: "none", color: C.mut, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
          {manual ? "Feld ausblenden" : "Antwort von Hand einfügen / Befehl anzeigen"}
        </button>
      </div>
      {manual && (
        <div style={{ marginTop: 10 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort von ChatGPT hier einfügen"
            style={{ width: "100%", minHeight: 90, padding: "8px 10px", borderRadius: 7, background: C.bg, border: `1px solid ${C.bdr}`, color: C.txt, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" disabled={!text.trim()} onClick={() => apply(text)} style={{ ...secondary, opacity: text.trim() ? 1 : 0.5 }}>Übernehmen</button>
          </div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 12, color: C.mut, cursor: "pointer" }}>Befehl für ChatGPT</summary>
            <textarea readOnly value={AI_PROMPT} onFocus={(e) => e.target.select()}
              style={{ width: "100%", minHeight: 140, marginTop: 6, padding: "8px 10px", borderRadius: 7, background: C.bg, border: `1px solid ${C.bdr}`, color: C.txtS, fontSize: 12, boxSizing: "border-box", resize: "vertical" }} />
          </details>
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
