import type { Category, EventRecord } from './studio-types';

const id = () => crypto.randomUUID();
const accepted = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
export const allowedFile = (file: File) => accepted.includes(file.type) || /\.(pdf|docx|jpe?g|png)$/i.test(file.name);

export type ExtractedPage = { text: string; image?: string };
export type LocalFileResult = { text: string; warning?: string; photos?: string[]; pages?: ExtractedPage[] };

const fileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Unable to read image'));
  reader.readAsDataURL(file);
});

async function renderPage(page: any): Promise<string> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1.55, 1100 / base.width) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const image = canvas.toDataURL('image/jpeg', 0.76);
  canvas.width = 0;
  canvas.height = 0;
  return image;
}

function textFromPdfItems(items: any[]): string {
  const lines: string[] = [];
  let currentY: number | null = null;
  let currentLine = '';
  for (const item of items) {
    const value = String(item.str || '').trim();
    if (!value) continue;
    const y = Number(item.transform?.[5]);
    if (currentY !== null && Number.isFinite(y) && Math.abs(y - currentY) > 2.5) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = value;
    } else {
      currentLine += `${currentLine ? ' ' : ''}${value}`;
    }
    if (Number.isFinite(y)) currentY = y;
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines.join('\n');
}

export async function readLocalFile(file: File): Promise<LocalFileResult> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pages: ExtractedPage[] = [];
    let worker: any = null;
    let ocrFailed = false;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let pageText = textFromPdfItems(content.items as any[]);
      const operators = await page.getOperatorList();
      const hasImages = operators.fnArray.some((fn: number) =>
        [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(fn),
      );
      let image: string | undefined;
      if (hasImages || pageText.trim().length < 40) {
        try {
          image = await renderPage(page);
          if (pageText.trim().length < 40) {
            try {
              const tesseract = await import('tesseract.js');
              worker ??= await tesseract.createWorker('eng');
              const result = await worker.recognize(image);
              if (result.data.text.trim()) pageText = result.data.text.trim();
              else ocrFailed = true;
            } catch {
              ocrFailed = true;
            }
          }
        } catch {
          if (pageText.trim().length < 40) ocrFailed = true;
        }
      }
      pages.push({ text: pageText, image });
    }
    if (worker) await worker.terminate().catch(() => undefined);
    const text = pages.map(page => page.text).filter(Boolean).join('\n\n');
    const warning = !text.trim()
      ? 'Text could not be completely extracted from this file. Please review the detected event information manually.'
      : ocrFailed
        ? 'Some scanned pages could not be read completely. Please review the detected event information manually.'
        : undefined;
    return { text, pages, warning };
  }
  if (ext === 'docx') {
    const mammoth: any = await import('mammoth/mammoth.browser');
    const arrayBuffer = await file.arrayBuffer();
    const [result, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer }),
      mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.inline(async (image: any) => ({
            src: `data:${image.contentType};base64,${await image.read('base64')}`,
          })),
        },
      ),
    ]);
    const photos = Array.from(html.value.matchAll(/<img[^>]+src=["'](data:image\/(?:png|jpe?g);base64,[^"']+)["']/gi), (match: RegExpMatchArray) => match[1]).filter((value): value is string => Boolean(value));
    return result.value.trim()
      ? { text: result.value, photos }
      : { text: '', photos, warning: 'The document contains no readable text.' };
  }
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    try {
      const tesseract = await import('tesseract.js');
      const photo = await fileAsDataUrl(file);
      const result = await tesseract.recognize(photo, 'eng', { logger: () => undefined });
      const text = result.data.text.trim();
      return text
        ? { text, photos: [photo], warning: result.data.confidence < 55 ? 'OCR confidence is low; verify extracted details.' : undefined }
        : { text: '', photos: [photo], warning: 'OCR found no readable text in this image.' };
    } catch {
      try {
        return { text: '', photos: [await fileAsDataUrl(file)], warning: 'Image text recognition could not run in this browser.' };
      } catch {
        return { text: '', warning: 'This image could not be read in this browser.' };
      }
    }
  }
  return { text: '', warning: 'This file type has no available local text extractor.' };
}

function valueAfter(text: string, labels: string[]): string {
  const escaped = labels.join('|');
  const match = text.match(new RegExp(`(?:${escaped})\\s*[:\\-–]\\s*([^\\n|;]{2,90})`, 'i'));
  return match?.[1]?.trim().replace(/\s{2,}/g, ' ') || '';
}
function findDate(text: string): string {
  const match = text.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+\d{4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b/i);
  return match?.[0] || '';
}
function titleLine(block: string): string {
  const lines = block.split(/\n/).map(x => x.trim()).filter(Boolean);
  return (lines.find(x => x.length > 6 && x.length < 120 && !/^(date|time|venue|location|organizer|department|contact)\s*:/i.test(x)) || '').replace(/^[•*\-#\s]+/, '');
}

export function eventsFromText(text: string, sourceFile: string, categories: Category[], startOrder: number, reviewThreshold = 0.62): EventRecord[] {
  // Preserve source wording. Event-like headings collect their following paragraphs
  // so a title and its details remain a single candidate.
  const paragraphs = text.replace(/\r/g, '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const eventTerms = /\b(event|workshop|seminar|lecture|conference|symposium|exhibition|competition|contest|challenge|webinar|orientation|fest|summit|inaugurat\w*|celebrat\w*|training|meet|visit|programme|program|hackathon|codathon|outreach|FDP|technical session|technical talk|coding contest|keynote)\b/i;
  const fieldLine = /^(event name|date|time|venue|location|organizer|organiser|department|contact|participants|team size|description|summary|abstract)\s*[:\-]/i;
  const headline = (part: string) => part.length < 140 && !/[.!?]\s*$/.test(part) && !fieldLine.test(part) && eventTerms.test(part);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (headline(paragraph)) {
      if (current) chunks.push(current);
      current = paragraph;
    } else if (current) {
      current += `\n${paragraph}`;
    } else if (eventTerms.test(paragraph) && paragraph.length >= 24) {
      chunks.push(paragraph);
    }
  }
  if (current) chunks.push(current);
  const candidates = chunks.filter(block => block.length >= 18 && eventTerms.test(block));
  const unique: string[] = [];
  candidates.forEach(x => { if (!unique.some(y => y.toLowerCase() === x.toLowerCase())) unique.push(x); });
  return unique.map((block, idx) => {
    const name = titleLine(block);
    const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[-–—]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const normalized = ` ${normalize(block)} `;
    const phraseMatches = (phrase: string) => {
      const words = normalize(phrase).split(' ').filter(Boolean);
      if (!words.length) return false;
      const forms = words.map(word => {
        const singular = word.endsWith('ies') && word.length > 4 ? `${word.slice(0, -3)}y` : word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word;
        const plural = singular.endsWith('y') ? `${singular.slice(0, -1)}ies` : `${singular}s`;
        return `(?:${singular}|${plural})`;
      });
      return new RegExp(`(?:^| )${forms.join(' ')}(?: |$)`).test(normalized);
    };
    const ranked = categories.map(cat => ({ cat, score: cat.keywords.reduce((sum, key) => sum + (phraseMatches(key.term) ? key.weight : 0), 0) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1]?.score || 0;
    const confidence = best?.score
      ? Math.min(.99, .45 + (best.score / (best.score + second)) * .42 + Math.min(best.score, 3) * .035)
      : .25;
    const date = findDate(block);
    const description = block.replace(name, '').trim().slice(0, 900);
    const dateVal = valueAfter(block, ['date']) || date;
    const hasPotential = Boolean(name);
    return {
      id: id(), name, description, date: dateVal, time: valueAfter(block, ['time']),
      venue: valueAfter(block, ['venue', 'location']), organizer: valueAfter(block, ['organizer', 'host', 'coordinator']),
      department: valueAfter(block, ['department', 'school']), club: valueAfter(block, ['club', 'society']),
      participants: valueAfter(block, ['participants', 'attendees']), teamSize: valueAfter(block, ['team size']),
      category: best?.score ? best.cat.id : categories.find(category => category.name.toLowerCase() === 'other')?.id || categories[0]?.id || '',
      images: [], confidence, score: best?.score || 0,
      classificationSource: best?.score ? 'Keyword match' : 'Unclassified',
      needsReview: !hasPotential || !best?.score || confidence < reviewThreshold || !dateVal,
      sourceFile, order: startOrder + idx,
    };
  });
}
