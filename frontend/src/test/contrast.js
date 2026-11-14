// WCAG 2.x contrast maths shared by the design-token tests.

/** '#rrggbb' (or '#rgb'-style short hex padded with zeros) to [r, g, b]. */
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16));

/** Relative luminance of an [r, g, b] colour. */
export const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contrast ratio between two [r, g, b] colours (1 to 21). */
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** fg at the given alpha over bg, as [r, g, b]. */
export const blend = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
