/** Offer text to the viewer as a file download. */
export function downloadText(name: string, text: string, mime: string): void {
  downloadBlob(name, new Blob([text], { type: mime }));
}

/** Offer a blob to the viewer as a file download. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled; the download keeps its own reference.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The stage as a PNG (the canvas keeps its drawing buffer, so the last frame is readable). */
export function stagePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The stage could not be captured as a PNG"))), "image/png");
  });
}

/** A file name from a scenario name: lower case, words joined by hyphens. */
export function fileStem(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem || "scenario";
}
