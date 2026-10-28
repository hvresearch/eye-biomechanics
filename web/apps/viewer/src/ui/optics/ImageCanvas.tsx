import { useEffect, useRef } from "react";

/**
 * A square grayscale-or-colormapped image drawn pixel by pixel into a canvas and scaled up with
 * crisp pixels. `pixel(i)` gives the RGBA of source cell i (row-major, `n` wide), or null for
 * transparent; only the centered `crop × crop` window is shown.
 */
export function ImageCanvas({
  n,
  crop,
  pixel,
  size,
  label,
  testId,
  version,
}: {
  n: number;
  crop: number;
  pixel: (i: number) => [number, number, number] | null;
  size: number;
  label: string;
  testId?: string;
  /** Changes when the image changes (redraw trigger). */
  version: unknown;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const c = Math.max(1, Math.min(n, Math.round(crop)));
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = ctx.createImageData(c, c);
    const off = Math.floor((n - c) / 2);
    for (let r = 0; r < c; r++) {
      for (let q = 0; q < c; q++) {
        const rgb = pixel((off + r) * n + off + q);
        const k = (r * c + q) * 4;
        if (rgb === null) continue;
        img.data[k] = rgb[0];
        img.data[k + 1] = rgb[1];
        img.data[k + 2] = rgb[2];
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [version, c, n]);
  return <canvas ref={ref} width={c} height={c} className="optics-image" style={{ width: size, height: size }} role="img" aria-label={label} data-testid={testId} />;
}
