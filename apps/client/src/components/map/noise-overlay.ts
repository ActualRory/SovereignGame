/**
 * Paper grain noise overlay.
 * Generates a small repeating noise tile as a Data URL
 * for use as a CSS background overlay with mix-blend-mode: multiply.
 */

/**
 * Generate a noise tile Data URL (PNG).
 * @param size Tile dimensions (square)
 * @returns Data URL string for use in CSS background-image
 */
export function generateNoiseDataUrl(size = 128): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Monochrome noise centered around mid-grey
    const v = 128 + (Math.random() * 60 - 30);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Apply the noise overlay to a container element via a ::before pseudo-element.
 * Injects a <style> tag if not already present.
 */
export function applyNoiseOverlay(selector: string): void {
  const styleId = 'parchment-noise-overlay';
  if (document.getElementById(styleId)) return;

  const dataUrl = generateNoiseDataUrl();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    ${selector} {
      position: relative;
    }
    ${selector}::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: url("${dataUrl}");
      background-repeat: repeat;
      mix-blend-mode: multiply;
      opacity: 0.06;
      pointer-events: none;
      z-index: 10;
    }
  `;
  document.head.appendChild(style);
}
