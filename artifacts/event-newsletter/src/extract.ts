import type { Category, EventRecord } from './studio-types';

const id = () => crypto.randomUUID();
const accepted = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
export const allowedFile = (file: File) => accepted.includes(file.type) || /\.(pdf|docx|jpe?g|png)$/i.test(file.name);

export type ExtractedPage = { text: string; image?: string };
export type NewsletterSourceRow = { month: string; eventType: string; eventName: string; description: string; images: string[] };
export type LocalFileResult = { text: string; warning?: string; photos?: string[]; pages?: ExtractedPage[]; newsletterRows?: NewsletterSourceRow[] };

const decodeHtmlEntities = (value: string) => value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
    lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', hellip: '…',
  };
  if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
  const numeric = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
  try { return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity; } catch { return entity; }
});

const htmlFragmentText = (fragment: string) => decodeHtmlEntities(fragment
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
  .replace(/<(?:p|div|li|h[1-6])\b[^>]*>/gi, '')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{2,}/g, '\n')
  .trim();

function cellsInHtmlRow(rowHtml: string) {
  return Array.from(rowHtml.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi), match => ({
    attributes: match[2],
    html: match[3],
    text: htmlFragmentText(match[3]),
    colSpan: Number(match[2].match(/\bcolspan\s*=\s*["']?(\d+)/i)?.[1] || 1),
  }));
}

export function parseNewsletterTableHtml(html: string): { rows: NewsletterSourceRow[]; unsupportedImages: number } {
  const tables = Array.from(html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi), match => match[1]);
  const tableRows = tables.map(table => Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi), match => match[1]));
  const tableIndex = tableRows.findIndex(rows => {
    const headers = cellsInHtmlRow(rows[0] || '').map(cell => cell.text.toLowerCase().replace(/[^a-z]+/g, ' ').trim());
    return headers.includes('event month') && headers.includes('event type') && headers.includes('event description');
  });
  if (tableIndex < 0) return { rows: [], unsupportedImages: 0 };

  const rows: NewsletterSourceRow[] = [];
  let currentMonth = '';
  let currentType = '';
  let unsupportedImages = 0;
  const monthHeading = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|etember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b.*\b20\d{2}\b/i;

  for (const rowHtml of tableRows[tableIndex].slice(1)) {
    const cells = cellsInHtmlRow(rowHtml);
    const values = cells.map(cell => cell.text);
    const allText = values.join(' ').trim();
    if (cells.length <= 2 && !/<img\b/i.test(rowHtml) && monthHeading.test(allText)) {
      currentMonth = allText.replace(/sepetember/i, 'September');
      currentType = '';
      continue;
    }
    if (cells.length < 4 || cells.length > 5) continue;
    const compactRow = cells.length === 4;
    if (compactRow) {
      if (values[0]) currentType = values[0];
    } else {
      if (values[0]) currentMonth = values[0];
      if (values[1]) currentType = values[1];
    }
    const imageTags = Array.from(rowHtml.matchAll(/<img\b[^>]*>/gi), match => match[0]);
    const images = imageTags.flatMap(image => {
      const srcMatch = image.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const src = srcMatch?.[1] || srcMatch?.[2] || srcMatch?.[3] || '';
      if (/^data:image\/(?:png|jpe?g);base64,/i.test(src)) return [src];
      unsupportedImages += 1;
      return [];
    });
    const description = cells[compactRow ? 3 : 4].text;
    const eventName = values[compactRow ? 1 : 2];
    if (!description.trim() && !eventName.trim() && !images.length) continue;
    if (description.trim().length < 18 && !images.length) continue;
    rows.push({ month: currentMonth, eventType: currentType, eventName, description, images });
  }
  return { rows, unsupportedImages };
}

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
    const structured = parseNewsletterTableHtml(html.value);
    const photos = Array.from(html.value.matchAll(/<img[^>]+src=["'](data:image\/(?:png|jpe?g);base64,[^"']+)["']/gi), (match: RegExpMatchArray) => match[1]).filter((value): value is string => Boolean(value));
    const warning = structured.unsupportedImages
      ? `${structured.unsupportedImages} embedded image${structured.unsupportedImages === 1 ? ' was' : 's were'} not in a supported JPG or PNG format.`
      : undefined;
    return {
      text: result.value.trim(),
      photos,
      newsletterRows: structured.rows.length ? structured.rows : undefined,
      warning: warning || (!result.value.trim() ? 'The document contains no readable text.' : undefined),
    };
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

function newsletterCategory(row: NewsletterSourceRow, categories: Category[]): string {
  const type = row.eventType.toLowerCase();
  const combined = `${row.eventType} ${row.eventName} ${row.description}`.toLowerCase();
  const categoryIds = {
    workshops: 'workshops', talks: 'talks', codathons: 'codathons', hackathons: 'hackathons',
    alumni: 'alumni', clubs: 'clubs', outreach: 'outreach', department: 'department',
    students: 'students', faculty: 'faculty', placements: 'placements',
  };
  const categoryById = (id: string) => categories.find(category => category.id === id)?.id;
  const fallback = categories.find(category => category.id === 'other')?.id || categories[0]?.id || '';
  if (/placement|placed\s*@|offer letter|salary package/.test(combined)) return categoryById(categoryIds.placements) || fallback;
  if (/faculty/.test(type) && /achiv|achiev/.test(type)) return categoryById(categoryIds.faculty) || fallback;
  if (/(?:student|stdent)/.test(type) && /achiv|achiev|activit/.test(type)) return categoryById(categoryIds.students) || fallback;
  if (/alumni/.test(combined)) return categoryById(categoryIds.alumni) || fallback;
  if (/club/.test(type) || /club activity/.test(row.eventName.toLowerCase())) return categoryById(categoryIds.clubs) || fallback;
  if (/outreach/.test(combined)) return categoryById(categoryIds.outreach) || fallback;
  if (/hack.?athon|hack.?ai.?thon|ideathon|buildathon/.test(combined)) return categoryById(categoryIds.hackathons) || fallback;
  if (/code.?athon|codathon|coding contest|programming contest/.test(combined)) return categoryById(categoryIds.codathons) || fallback;
  if (/technical talk|technical session|guest lecture|seminar/.test(combined)) return categoryById(categoryIds.talks) || fallback;
  if (/workshop|skill enhancement/.test(combined) && !/faculty/.test(type)) return categoryById(categoryIds.workshops) || fallback;
  if (/department/.test(type)) return categoryById(categoryIds.department) || fallback;
  if (/(?:student|stdent)/.test(type)) return categoryById(categoryIds.students) || fallback;
  if (/faculty/.test(type)) return categoryById(categoryIds.faculty) || fallback;
  return fallback;
}

function newsletterTitle(row: NewsletterSourceRow): string {
  const inputName = row.eventName.trim();
  const genericName = /^(?:department activity|faculty achievements?|student activities?|student achievements?|workshop|technical talk|codeathon|codathon|hackathon|outreach|club activity|alumni interaction|fdp organized)$/i;
  const dateLike = /^(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4})$/i;
  if (inputName && !genericName.test(inputName) && !dateLike.test(inputName.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim())) return inputName;
  const placementName = row.description.match(/\b((?:(?:Mr|Ms|Mrs|Miss|Dr)\.?\s+)?[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})\s+(?:has\s+been\s+)?(?:placed|selected)\b/i)?.[1];
  if (placementName && /placement|placed|offer letter/i.test(`${row.eventType} ${row.description}`)) return placementName.trim();
  const quoted = row.description.match(/[“"‘']([^”"’']{6,100})[”"’']/);
  if (quoted?.[1]) return quoted[1].trim();
  const firstSentence = row.description.trim().split(/(?<=[.!?])\s+/)[0] || '';
  if (firstSentence.length <= 92) return firstSentence;
  return `${firstSentence.slice(0, 88).replace(/\s+\S*$/, '')}…`;
}

export function eventsFromNewsletterRows(rows: NewsletterSourceRow[], sourceFile: string, categories: Category[], startOrder: number): EventRecord[] {
  return rows.map((row, index) => {
    const name = newsletterTitle(row);
    const date = findDate(row.description) || row.month;
    const category = newsletterCategory(row, categories);
    const unknownType = !row.eventType.trim();
    return {
      id: id(), name, description: row.description.trim(), date, time: valueAfter(row.description, ['time']),
      venue: valueAfter(row.description, ['venue', 'location']), organizer: valueAfter(row.description, ['organizer', 'host', 'coordinator']),
      department: '', club: '', participants: '', teamSize: '', category, images: row.images,
      confidence: unknownType ? 0.62 : 0.96, score: unknownType ? 0 : 5,
      classificationSource: 'Newsletter data form', needsReview: !name || !row.description.trim() || !row.month || unknownType,
      sourceFile, order: startOrder + index,
    };
  });
}
