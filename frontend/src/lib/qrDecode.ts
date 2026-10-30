/**
 * Patch 141: QR-Code aus einem Foto lesen.
 *
 * Ein Foto (Datei-Auswahl mit Kamera) statt Live-Kamera: die Live-Kamera im
 * Browser verlangt HTTPS, ein Foto klappt auch ueber http://<ip>:3010.
 * Zuerst die eingebaute Erkennung des Browsers (BarcodeDetector, Android/Chrome),
 * sonst jsQR (wird erst beim ersten Gebrauch geladen).
 */

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

/** Inhalt des QR-Codes im Foto oder null. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const src = await toBitmap(file);
  const w0 = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h0 = "naturalHeight" in src ? src.naturalHeight : src.height;

  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(s: unknown): Promise<{ rawValue?: string }[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const found = await new BD({ formats: ["qr_code"] }).detect(src);
      const v = found.find((x) => x.rawValue)?.rawValue;
      if (v) return v;
    } catch { /* weiter mit jsQR */ }
  }

  // Patch 142: mehrere Groessen und Ausschnitte (Mitte), damit auch ein kleiner Code in einem grossen
  // Handyfoto gefunden wird; Kontrast wird vorher gestreckt (Fotos vom Bildschirm sind oft flau).
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  const tries: [number, number][] = [[1, 1000], [0.6, 1000], [1, 1600], [0.4, 900], [0.6, 1600], [1, 600], [0.3, 800], [1, 2200]];
  for (const [crop, edge] of tries) {
    const cw = w0 * crop, ch = h0 * crop, cx = (w0 - cw) / 2, cy = (h0 - ch) / 2;
    const s = Math.min(1, edge / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * s));
    const h = Math.max(1, Math.round(ch * s));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(src as CanvasImageSource, cx, cy, cw, ch, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
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
