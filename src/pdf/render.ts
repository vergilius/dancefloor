// Survey PDF underlay (PLAN.md §5 M1c): page 1 rendered once to a canvas, used as a texture.
// pdfjs is loaded lazily so it stays out of the main bundle; its worker is a Vite-bundled asset.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Target resolution of the render (the map's text is outlines, so detail lives in the raster). */
export const TARGET_DPI = 200;
/** Placeholder map scale until the PDF is aligned: sheet coords assume 1:500. */
const MAP_SCALE = 500;
/** One PDF point in sheet metres at the placeholder scale (1 pt = 25.4/72 mm on paper). */
export const M_PER_PT = (25.4 / 72 / 1000) * MAP_SCALE;

export type PdfRender = {
  canvas: HTMLCanvasElement;
  /** Page size in points (rotation applied). */
  pagePt: { w: number; h: number };
  /** Page size in sheet metres at the placeholder 1:500: the quad spans (0, 0)…(w, h), origin bottom-left. */
  sheetM: { w: number; h: number };
  dpi: number;
  /** True when the target dpi didn't fit the GPU's max texture size. */
  clamped: boolean;
  ms: number;
};

/** The GPU's max texture edge (px); falls back to a size every WebGL2 GPU supports. */
function maxTextureSize(): number {
  const gl = document.createElement('canvas').getContext('webgl2');
  const n = gl?.getParameter(gl.MAX_TEXTURE_SIZE) as number | undefined;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return n ?? 4096;
}

export async function renderPdf(bytes: ArrayBuffer): Promise<PdfRender> {
  const t0 = performance.now();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // No wasm/font/cmap URLs are set and wasm is off, so pdfjs fetches nothing.
  const task = pdfjs.getDocument({ data: bytes, useWasm: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const unit = page.getViewport({ scale: 1 });
    const max = maxTextureSize();
    const target = TARGET_DPI / 72;
    const scale = Math.min(target, max / Math.max(unit.width, unit.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return {
      canvas,
      pagePt: { w: unit.width, h: unit.height },
      sheetM: { w: unit.width * M_PER_PT, h: unit.height * M_PER_PT },
      dpi: scale * 72,
      clamped: scale < target,
      ms: Math.round(performance.now() - t0),
    };
  } finally {
    void task.destroy();
  }
}
