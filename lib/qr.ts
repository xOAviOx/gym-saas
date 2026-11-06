import QRCode from 'qrcode';

/** QR code as an SVG data URL, safe for <img src> under the app's CSP (img-src data:). */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#111111ff', light: '#ffffffff' },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/** Downloadable QR code with real PNG bytes, at a size that prints cleanly. */
export async function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 1024,
    color: { dark: '#111111ff', light: '#ffffffff' },
  });
}

/** Module grid for drawing the same QR code into a PDF. */
export function qrModules(text: string): {
  size: number;
  isDark: (row: number, col: number) => boolean;
} {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, isDark: (row, col) => Boolean(modules.get(row, col)) };
}
