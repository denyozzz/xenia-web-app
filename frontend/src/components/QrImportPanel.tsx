/**
 * Patch 141: Bohne aus einem Beanconqueror-QR-Code (Roester-QR auf der Tuete).
 * Foto vom QR-Code aufnehmen oder Link/Code einfuegen -> Server holt die Angaben
 * bei Beanconqueror -> der Sorten-Editor wird damit vorausgefuellt (nichts wird
 * ohne "Speichern" angelegt).
 */
import { useRef, useState } from "react";
import { Camera, QrCode } from "lucide-react";
import theme from "../theme.js";
import { decodeQrFromFile } from "../lib/qrDecode.js";

const C = theme;

export interface QrResult { qr: string; hasImage: boolean; import: Record<string, unknown> }

export function QrImportPanel({ onLoaded, onCancel }: { onLoaded: (r: QrResult) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    try { code = await decodeQrFromFile(f); } catch { code = null; }
    setBusy(null);
    if (!code) { setErr("Kein QR-Code im Foto erkannt. Bitte näher heran und scharf fotografieren."); return; }
    setText(code);
    await load(code);
  };

  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 12px",
    fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 10, padding: 12, background: C.bg }}>
      <div style={{ fontSize: 12, color: C.mut, marginBottom: 8 }}>
        QR-Code von der Kaffeetüte (Beanconqueror): Foto aufnehmen oder Link einfügen.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}
          style={{ ...btn, background: C.accG2, border: `1px solid ${C.accB}`, color: C.acc }}>
          <Camera size={15} />Foto vom QR-Code
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e)} style={{ display: "none" }} />
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void load(text); } }}
          placeholder="https://beanconqueror.com/?qr=…"
          style={{ flex: "1 1 200px", minWidth: 0, padding: "8px 10px", borderRadius: 7, background: C.bg, border: `1px solid ${C.bdr}`, color: C.txt, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button type="button" disabled={!!busy || !text.trim()} onClick={() => void load(text)}
          style={{ ...btn, background: "transparent", border: `1px solid ${C.bdr}`, color: text.trim() ? C.txtS : C.mut }}>
          <QrCode size={14} />Laden
        </button>
        <button type="button" onClick={onCancel}
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.mut, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Abbrechen
        </button>
      </div>
      {busy && <div style={{ color: C.mut, fontSize: 12, marginTop: 8 }}>{busy}</div>}
      {err && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
