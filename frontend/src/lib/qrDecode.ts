/**
 * Patch 141/142/143: QR-Code aus einem Foto oder aus dem Livebild der Kamera lesen.
 *
 * Foto (Datei-Auswahl mit Kamera): klappt auch ueber http://<ip>:3010.
 * Livebild (Patch 143): nur ueber HTTPS – Browser geben die Kamera sonst nicht frei.
 * Zuerst die eingebaute Erkennung des Browsers (BarcodeDetector, Android/Chrome),
 * sonst jsQR (wird erst beim ersten Gebrauch geladen).
 */

type Detector = { detect(s: unknown): Promise<{ rawValue?: string }[]> };
type JsQR = (d: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }) => { data: string } | null;

let detector: Detector | null | undefined;
function getDetector(): Detector | null {
  if (detector !== undefined) return detector;
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try { detector = BD ? new BD({ formats: ["qr_code"] }) : null; } catch { detector = null; }
  return detector;
}

let jsqrMod: JsQR | null = null;
async function getJsQR(): Promise<JsQR> {
  if (!jsqrMod) jsqrMod = (await import("jsqr")).default as unknown as JsQR;
  return jsqrMod;
}

async function toBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("decode")); img.src = url; });
      return img;
    } finally {
      // Patch 142: erst spaeter freigeben – Safari zeichnet das Bild sonst u. U. leer.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
}

const canvas = () => {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  return { c, ctx };
};
let shared: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

/** Bild in Groessen/Ausschnitten (crop = Anteil der Mitte, edge = laengste Kante) mit jsQR durchsuchen. */
async function scan(src: CanvasImageSource, w0: number, h0: number, tries: [number, number][]): Promise<string | null> {
  const jsQR = await getJsQR();
  shared ??= canvas();
  const { c, ctx } = shared;
  for (const [crop, edge] of tries) {
    const cw = w0 * crop, ch = h0 * crop, cx = (w0 - cw) / 2, cy = (h0 - ch) / 2;
    const s = Math.min(1, edge / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * s));
    const h = Math.max(1, Math.round(ch * s));
    c.width = w;
    c.height = h;
    ctx.drawImage(src, cx, cy, cw, ch, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    // Kontrast strecken (Fotos vom Bildschirm sind oft flau).
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 16) { const g = (d[i] + d[i + 1] + d[i + 2]) / 3; if (g < lo) lo = g; if (g > hi) hi = g; }
    if (hi - lo > 20 && hi - lo < 200) {
      const k = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        const g = ((d[i] + d[i + 1] + d[i + 2]) / 3 - lo) * k;
        d[i] = d[i + 1] = d[i + 2] = g < 0 ? 0 : g > 255 ? 255 : g;
      }
    }
    const code = jsQR(d, w, h, { inversionAttempts: "attemptBoth" });
    if (code?.data) return code.data;
  }
  return null;
}

/** Inhalt des QR-Codes im Foto oder null. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const src = await toBitmap(file);
  const w0 = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h0 = "naturalHeight" in src ? src.naturalHeight : src.height;
  const det = getDetector();
  if (det) {
    try {
      const v = (await det.detect(src)).find((x) => x.rawValue)?.rawValue;
      if (v) return v;
    } catch { /* weiter mit jsQR */ }
  }
  return scan(src, w0, h0, [[1, 1000], [0.6, 1000], [1, 1600], [0.4, 900], [0.6, 1600], [1, 600], [0.3, 800], [1, 2200]]);
}

/** Patch 143: ein Bild aus dem laufenden Video pruefen (schnell, fuer den Live-Scan). */
export async function decodeQrFromVideo(video: HTMLVideoElement): Promise<string | null> {
  const w0 = video.videoWidth, h0 = video.videoHeight;
  if (!w0 || !h0) return null;
  const det = getDetector();
  if (det) {
    try {
      return (await det.detect(video)).find((x) => x.rawValue)?.rawValue ?? null;
    } catch { /* weiter mit jsQR */ }
  }
  return scan(video, w0, h0, [[0.7, 640], [1, 800]]);
}

/** Patch 143: Live-Scan moeglich? (HTTPS bzw. localhost und eine Kamera-Schnittstelle) */
export function canLiveScan(): boolean {
  return window.isSecureContext === true && !!navigator.mediaDevices?.getUserMedia;
}
