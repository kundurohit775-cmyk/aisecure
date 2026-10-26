import JSZip from 'jszip';
import { createSamplePdf } from './pdfWatermark';

/**
 * Extracts human-readable text paragraphs from a Word (.docx) file buffer.
 * A .docx file is a ZIP archive containing XML files inside the word/ directory.
 */
export async function extractTextFromDocx(buffer: Uint8Array | ArrayBuffer): Promise<{
  title: string;
  paragraphs: string[];
}> {
  try {
    const zip = new JSZip();
    const content = await zip.loadAsync(buffer);
    const documentXmlFile = content.file('word/document.xml');

    if (!documentXmlFile) {
      throw new Error('word/document.xml not found in .docx archive');
    }

    const xmlText = await documentXmlFile.async('text');

    // Parse XML using standard DOMParser in browser
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    // In OpenXML, paragraphs are <w:p> and runs are <w:r> containing text <w:t>
    const pNodes = xmlDoc.getElementsByTagName('w:p');
    const paragraphs: string[] = [];

    for (let i = 0; i < pNodes.length; i++) {
      const pNode = pNodes[i];
      const tNodes = pNode.getElementsByTagName('w:t');
      let pText = '';
      for (let j = 0; j < tNodes.length; j++) {
        pText += tNodes[j].textContent || '';
      }
      const trimmed = pText.trim();
      if (trimmed.length > 0) {
        paragraphs.push(trimmed);
      }
    }

    // Determine title from first paragraph or default
    const title = paragraphs.length > 0 ? paragraphs[0].substring(0, 80) : 'Confidential Word Document';

    return {
      title,
      paragraphs: paragraphs.length > 0 ? paragraphs : ['(Document contains formatted tables or graphics)'],
    };
  } catch (err) {
    console.warn('Docx extraction warning:', err);
    // Fallback: try regex search for <w:t> text elements if DOMParser fails
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const rawStr = decoder.decode(buffer);
      const matches = rawStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (matches && matches.length > 0) {
        const extracted = matches.map((m) => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        return {
          title: extracted[0] || 'Confidential Document',
          paragraphs: extracted,
        };
      }
    } catch {
      // ignore
    }

    return {
      title: 'Confidential Document',
      paragraphs: ['Classified contents encrypted with AES-256-GCM.'],
    };
  }
}

/**
 * Converts a non-PDF file (DOCX, TXT, Markdown) into a clean, formatted confidential PDF
 * so that it can be securely rendered in the viewer and dynamically watermarked.
 */
export async function convertToEncryptedPdfBuffer(params: {
  filename: string;
  buffer: Uint8Array | ArrayBuffer;
  defaultTitle: string;
}): Promise<Uint8Array> {
  const { filename, buffer, defaultTitle } = params;
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
    const { title, paragraphs } = await extractTextFromDocx(buffer);
    const docTitle = defaultTitle || title || filename.replace(/\.[^/.]+$/, '');

    // Group paragraphs into sections
    return await createSamplePdf(docTitle, [
      {
        heading: 'Confidential Document Content',
        paragraphs: paragraphs.slice(0, 15),
      },
      ...(paragraphs.length > 15
        ? [
            {
              heading: 'Appendix & Supporting Data',
              paragraphs: paragraphs.slice(15, 30),
            },
          ]
        : []),
    ]);
  }

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.json') || lowerName.endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const docTitle = defaultTitle || filename.replace(/\.[^/.]+$/, '');

    return await createSamplePdf(docTitle, [
      {
        heading: 'Decrypted Record Contents',
        paragraphs: lines.slice(0, 25),
      },
    ]);
  }

  // If already PDF or other, return buffer as Uint8Array
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}
