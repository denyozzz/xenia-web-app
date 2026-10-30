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
      URL.revokeObjectURL(url);
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

  const { default: jsQR } = await import("jsqr");
  for (const edge of [1400, 900, 2200]) {
    const s = Math.min(1, edge / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const code = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
    if (code?.data) return code.data;
    if (s === 1) break; // kleiner als die naechste Stufe: weitere Versuche bringen nichts
  }
  return null;
}
