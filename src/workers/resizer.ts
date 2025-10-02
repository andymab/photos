// workers/resizer.ts
// Simple resizer using OffscreenCanvas (works in modern browsers)
self.onmessage = async (e: MessageEvent) => {
  const { file, sizes, crop } = e.data as {
    file: Blob;
    sizes: number[];
    crop?: { x: number; y: number; w: number; h: number };
  };
  const bmp = await createImageBitmap(file);
  const sx = crop?.x ?? 0;
  const sy = crop?.y ?? 0;
  const sw = crop?.w ?? bmp.width;
  const sh = crop?.h ?? bmp.height;
  const out: any[] = [];
  for (const side of sizes) {
    const scale = side / Math.max(sw, sh);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await c.convertToBlob({
      type: "image/webp",
      quality: side < 500 ? 0.72 : 0.82,
    });
    out.push({ size: side, blob, width: w, height: h });
  }
  (self as any).postMessage(out);
};
export {};
