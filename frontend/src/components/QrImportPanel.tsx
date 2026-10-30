/**
 * Patch 141/142/143: Bohne aus einem Beanconqueror-QR-Code (Roester-QR auf der Tuete).
 * Live-Scan (nur ueber HTTPS), Foto vom QR-Code, Bild aus der Mediathek oder Link/Code einfuegen
 * -> Server holt die Angaben bei Beanconqueror -> der Sorten-Editor wird damit vorausgefuellt
 * (nichts wird ohne "Speichern" angelegt).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, QrCode, ScanLine, X } from "lucide-react";
import theme from "../theme.js";
import { canLiveScan, decodeQrFromFile, decodeQrFromVideo } from "../lib/qrDecode.js";

const C = theme;

export interface QrResult { qr: string; hasImage: boolean; import: Record<string, unknown> }

/** Patch 143: Livebild der Kamera; meldet den ersten erkannten Code. */
function LiveScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: (err?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hint, setHint] = useState("Kamera wird gestartet …");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        try {
          const code = await decodeQrFromVideo(v);
          if (code && !stopped) { stop(); onCode(code); return; }
        } catch { /* naechstes Bild */ }
      }
      timer = setTimeout(() => void tick(), 200);
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setHint("QR-Code in den Rahmen halten");
        void tick();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        onClose(name === "NotAllowedError"
          ? "Kamera-Zugriff wurde nicht erlaubt (Browser-/App-Einstellungen prüfen)."
          : "Kamera konnte nicht gestartet werden.");
      }
    })();
    return stop;
  }, []);

  // Ueber document.body: im Editor-Fenster (transform) waere "fixed" sonst auf das Fenster beschraenkt.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", width: "min(62vw, 62vh)", aspectRatio: "1", border: "3px solid rgba(255,255,255,0.85)", borderRadius: 18, boxShadow: "0 0 0 100vmax rgba(0,0,0,0.35)" }} />
      <div style={{ position: "absolute", bottom: "8vh", left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: 600, textShadow: "0 1px 3px #000" }}>{hint}</div>
      <button type="button" onClick={() => onClose()} aria-label="Schließen"
        style={{ position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <X size={22} />
      </button>
    </div>,
    document.body,
  );
}

export function QrImportPanel({ onLoaded, onCancel }: { onLoaded: (r: QrResult) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const liveOk = canLiveScan();

  const load = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setErr(null);
    setBusy("Hole Angaben von Beanconqueror …");
    try {
      const r = await fetch(`/api/beanconqueror/qr?code=${encodeURIComponent(c)}`);
      const d = (await r.json().catch(() => ({}))) as Partial<QrResult> & { error?: string };
      if (!r.ok || !d.import || !d.qr) throw new Error(d.error ?? `Fehler ${r.status}`);
      onLoaded({ qr: d.qr, hasImage: !!d.hasImage, import: d.import });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setBusy("Lese QR-Code …");
    let code: string | null = null;
    try { code = await decodeQrFromFile(f); } catch (ex) {
      setBusy(null);
      setErr(`Foto konnte nicht gelesen werden: ${ex instanceof Error ? ex.message : String(ex)}`);
      return;
    }
    setBusy(null);
    if (!code) { setErr("Kein QR-Code im Foto erkannt. Den Code bildfüllend und scharf fotografieren – oder den Link einfügen (iPhone-Kamera: Code antippen → Link kopieren)."); return; }
    setText(code);
    await load(code);
  };

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 12px",
    fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
  };
  const primary: React.CSSProperties = { ...btn, background: C.accG2, border: `1px solid ${C.accB}`, color: C.acc };
  const secondary: React.CSSProperties = { ...btn, background: "transparent", border: `1px solid ${C.bdr}`, color: C.txtS };

  return (
    <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 10, padding: 12, background: C.bg }}>
      <div style={{ fontSize: 12, color: C.mut, marginBottom: 8 }}>
        QR-Code von der Kaffeetüte (Beanconqueror): {liveOk ? "scannen, fotografieren" : "fotografieren"} oder Link einfügen.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {liveOk && (
          <button type="button" disabled={!!busy} onClick={() => { setErr(null); setLive(true); }} style={primary}>
            <ScanLine size={15} />Scannen
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} style={liveOk ? secondary : primary}>
          <Camera size={15} />Foto{liveOk ? "" : " vom QR-Code"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e)} style={{ display: "none" }} />
        <button type="button" disabled={!!busy} onClick={() => pickRef.current?.click()} title="Foto oder Screenshot aus der Mediathek" style={secondary}>
          <ImageIcon size={15} />Bild wählen
        </button>
        <input ref={pickRef} type="file" accept="image/*" onChange={(e) => void onPhoto(e)} style={{ display: "none" }} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void load(text); } }}
          placeholder="https://beanconqueror.com/?qr=…"
          style={{ flex: "1 1 200px", minWidth: 0, padding: "8px 10px", borderRadius: 7, background: C.bg, border: `1px solid ${C.bdr}`, color: C.txt, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button type="button" disabled={!!busy || !text.trim()} onClick={() => void load(text)}
          style={{ ...secondary, color: text.trim() ? C.txtS : C.mut }}>
          <QrCode size={14} />Laden
        </button>
        <button type="button" onClick={onCancel}
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.mut, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Abbrechen
        </button>
      </div>
      {busy && <div style={{ color: C.mut, fontSize: 12, marginTop: 8 }}>{busy}</div>}
      {err && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</div>}
      {live && (
        <LiveScanner
          onCode={(code) => { setLive(false); setText(code); void load(code); }}
          onClose={(e) => { setLive(false); if (e) setErr(e); }}
        />
      )}
    </div>
  );
}
