import { PDFDocument, rgb, degrees } from 'pdf-lib';

/**
 * Dynamically stamps a diagonal repeating watermark on every page of a PDF document
 * in volatile memory (RAM only). Never touches disk.
 */
export async function stampWatermarkedPdf(
  pdfBuffer: Buffer,
  options: {
    recipientEmail: string;
    trackingId: string;
    timestamp?: string;
  }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();

  const timeStr = options.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const watermarkText = `CONFIDENTIAL • ${options.recipientEmail} • ${timeStr} • ${options.trackingId}`;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const fontSize = 11;

    // Tile across the page diagonally
    const stepX = 260;
    const stepY = 160;

    for (let x = -width; x < width * 2; x += stepX) {
      for (let y = -height; y < height * 2; y += stepY) {
        page.drawText(watermarkText, {
          x,
          y,
          size: fontSize,
          color: rgb(0.85, 0.2, 0.2), // Faint crimson/rose
          opacity: 0.16,
          rotate: degrees(35),
        });
      }
    }

    // Top banner stamp
    page.drawText(`[RESTRICTED COPY: ${options.recipientEmail} | TRACKING: ${options.trackingId}]`, {
      x: 30,
      y: height - 20,
      size: 8,
      color: rgb(0.3, 0.3, 0.4),
      opacity: 0.6,
    });
  }

  const modifiedBytes = await pdfDoc.save();
  return Buffer.from(modifiedBytes);
}

/**
 * Dynamically stamps text/markdown documents in volatile memory
 */
export function stampWatermarkedText(
  textBuffer: Buffer,
  options: {
    recipientEmail: string;
    trackingId: string;
    timestamp?: string;
  }
): Buffer {
  const content = textBuffer.toString('utf8');
  const timeStr = options.timestamp || new Date().toISOString();

  const header = [
    '================================================================================',
    `CONFIDENTIAL DOCUMENT - AUTHORIZED RECIPIENT: ${options.recipientEmail}`,
    `ISSUED: ${timeStr} | TRACKING ID: ${options.trackingId}`,
    'UNAUTHORIZED REDISTRIBUTION, COPYING, OR REPRODUCTION IS STRICTLY MONITORED',
    '================================================================================\n\n',
  ].join('\n');

  const footer = [
    '\n\n================================================================================',
    `END OF PROTECTED DOCUMENT - DL RECORD: ${options.trackingId}`,
    '================================================================================',
  ].join('\n');

  return Buffer.from(header + content + footer, 'utf8');
}
