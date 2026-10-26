import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

/**
 * In-Memory PDF Dynamic Watermarking Engine
 * Stamps every page diagonally with viewer identity, timestamp, and DL-xxxx ID.
 * Decryption and watermarking happen strictly in memory buffers without touching disk.
 */

export interface WatermarkOptions {
  recipientName: string;
  recipientEmail: string;
  trackingId: string;
  timestampUtc?: string;
  customNote?: string;
  opacity?: number;
}

/**
 * Stamps diagonal watermarks and tracking headers onto every page of an input PDF buffer.
 * Returns the modified PDF as a Uint8Array.
 */
export async function stampWatermarkedPdf(
  pdfBytes: Uint8Array,
  options: WatermarkOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  const timestamp = options.timestampUtc || new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const primaryLine = `CONFIDENTIAL • ISSUED TO: ${options.recipientName.toUpperCase()} (${options.recipientEmail})`;
  const trackingLine = `TRACKING ID: ${options.trackingId} • TIME: ${timestamp} • DO NOT DISTRIBUTE`;

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // 1. Diagonal repeating watermarks in the center (45 degree rotation)
    const watermarkText = `${options.recipientEmail} • ${options.trackingId}`;
    const fontSize = 16;
    const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);

    // Draw a 3x3 staggered diagonal grid across the page
    const rowStep = height / 4;
    const colStep = width / 3;

    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 2; c++) {
        const x = (c - 0.5) * colStep - textWidth / 2;
        const y = (r - 0.5) * rowStep;

        page.drawText(watermarkText, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.85, 0.25, 0.25), // Subtle red/crimson
          opacity: options.opacity ?? 0.16,
          rotate: degrees(45),
        });
      }
    }

    // 2. Center dominant diagonal watermark
    page.drawText(primaryLine, {
      x: width / 2 - font.widthOfTextAtSize(primaryLine, 14) / 2,
      y: height / 2 + 10,
      size: 14,
      font,
      color: rgb(0.2, 0.25, 0.35),
      opacity: (options.opacity ?? 0.16) + 0.08,
      rotate: degrees(45),
    });

    page.drawText(trackingLine, {
      x: width / 2 - regularFont.widthOfTextAtSize(trackingLine, 11) / 2,
      y: height / 2 - 12,
      size: 11,
      font: regularFont,
      color: rgb(0.8, 0.2, 0.2),
      opacity: (options.opacity ?? 0.16) + 0.08,
      rotate: degrees(45),
    });

    // 3. Top Security Header Bar
    page.drawRectangle({
      x: 0,
      y: height - 24,
      width,
      height: 24,
      color: rgb(0.96, 0.94, 0.94),
      opacity: 0.9,
    });

    page.drawText(`SECURE VAULT WATERMARK • TRACKING ID: ${options.trackingId} • RESTRICTED DISTRIBUTION`, {
      x: 20,
      y: height - 16,
      size: 8,
      font,
      color: rgb(0.65, 0.1, 0.1),
    });

    page.drawText(`LICENSED TO: ${options.recipientEmail}`, {
      x: width - regularFont.widthOfTextAtSize(`LICENSED TO: ${options.recipientEmail}`, 8) - 20,
      y: height - 16,
      size: 8,
      font: regularFont,
      color: rgb(0.3, 0.35, 0.4),
    });

    // 4. Bottom Security Footer Bar
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: 20,
      color: rgb(0.96, 0.94, 0.94),
      opacity: 0.9,
    });

    page.drawText(`DISPATCHED: ${timestamp} • UNLAWFUL DISSEMINATION TRACEABLE TO SENDER & RECIPIENT`, {
      x: 20,
      y: 7,
      size: 7.5,
      font: regularFont,
      color: rgb(0.5, 0.1, 0.1),
    });
  });

  return await pdfDoc.save();
}

/**
 * Generates high quality multi-page synthetic confidential PDF document bytes for seeding.
 */
export async function createSamplePdf(
  title: string,
  sections: { heading: string; paragraphs: string[] }[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4 standard
  const { width, height } = page.getSize();

  let y = height - 60;

  // Header banner
  page.drawRectangle({
    x: 40,
    y: y - 28,
    width: width - 80,
    height: 38,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText('STRICTLY CONFIDENTIAL • HAVEN VAULT PROTECTED', {
    x: 55,
    y: y - 10,
    size: 10,
    font: titleFont,
    color: rgb(0.95, 0.3, 0.3),
  });

  page.drawText(`CLASSIFICATION: RESTRICTED LEVEL 4`, {
    x: width - 265,
    y: y - 10,
    size: 9,
    font: monoFont,
    color: rgb(0.7, 0.75, 0.85),
  });

  y -= 60;

  // Document Title
  page.drawText(title, {
    x: 40,
    y: y,
    size: 18,
    font: titleFont,
    color: rgb(0.1, 0.15, 0.25),
  });

  y -= 30;

  // Thin separator rule
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: rgb(0.85, 0.88, 0.92),
  });

  y -= 25;

  // Sections
  for (const section of sections) {
    if (y < 120) break;

    // Heading
    page.drawText(section.heading.toUpperCase(), {
      x: 40,
      y,
      size: 11,
      font: titleFont,
      color: rgb(0.2, 0.25, 0.35),
    });

    y -= 18;

    for (const paragraph of section.paragraphs) {
      if (y < 80) break;

      // Word wrapping approximation
      const words = paragraph.split(' ');
      let currentLine = '';
      const maxLineWidth = width - 80;

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = bodyFont.widthOfTextAtSize(testLine, 9.5);

        if (testWidth > maxLineWidth) {
          page.drawText(currentLine, {
            x: 40,
            y,
            size: 9.5,
            font: bodyFont,
            color: rgb(0.3, 0.35, 0.45),
          });
          y -= 14;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        page.drawText(currentLine, {
          x: 40,
          y,
          size: 9.5,
          font: bodyFont,
          color: rgb(0.3, 0.35, 0.45),
        });
        y -= 18;
      }
    }

    y -= 12;
  }

  // Footer metadata
  page.drawText(`Document Security ID: HV-${Math.floor(100000 + Math.random() * 900000)} • Generated via AES-256 Memory Stream`, {
    x: 40,
    y: 30,
    size: 8,
    font: monoFont,
    color: rgb(0.6, 0.65, 0.7),
  });

  return await pdfDoc.save();
}
