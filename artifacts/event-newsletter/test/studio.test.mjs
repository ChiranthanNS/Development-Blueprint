import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import ts from 'typescript';

if (!Promise.withResolvers) {
  Promise.withResolvers = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };
}

async function loadTypeScript(relativePath) {
  let source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  if (relativePath === '../src/newsletter-pdf.ts') {
    source = source.replace("import('jspdf')", `import(${JSON.stringify(import.meta.resolve('jspdf'))})`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const extract = await loadTypeScript('../src/extract.ts');
const utils = await loadTypeScript('../src/studio-utils.ts');
const pdf = await loadTypeScript('../src/newsletter-pdf.ts');
const categories = [
  { id: 'talks', name: 'Technical Talks', keywords: [] },
  { id: 'workshops', name: 'Workshops', keywords: [] },
  { id: 'other', name: 'Other', keywords: [] },
];
const event = (overrides = {}) => ({
  id: 'event',
  name: 'Robotics showcase',
  description: 'The robotics team presented an autonomous rover at the annual showcase.',
  date: '12 December 2025',
  time: '',
  venue: 'Engineering Hall',
  organizer: 'Robotics Club',
  department: 'Engineering',
  club: 'Robotics Club',
  participants: 'Asha Rao, Dev Shah',
  teamSize: '2',
  category: 'talks',
  images: [],
  confidence: 1,
  score: 5,
  classificationSource: 'Newsletter data form',
  needsReview: false,
  sourceFile: 'source.docx',
  order: 0,
  sourceId: 'source-one',
  sourceEventType: 'Technical Talk',
  sourceEventName: 'Robotics showcase',
  sourceMonth: 'December 2025',
  sourceDescription: 'The robotics team presented an autonomous rover at the annual showcase.',
  ...overrides,
});
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
};
const onePixelPng = () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const scanline = Buffer.from([0, 42, 118, 82, 255]);
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanline)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`;
};

test('recognizes the structured table, carries month/type context, and keeps a photo-only row unassigned', () => {
  const html = `
    <table>
      <tr><th>Event Month</th><th>Event Type</th><th>Event Name</th><th>Event Images</th><th colspan="2">Event Description</th></tr>
      <tr><td colspan="5">DECEMBER 2025</td></tr>
      <tr><td></td><td>Technical Talk</td><td></td><td><img src="data:image/png;base64,AA=="></td><td colspan="2"><p>Agentic AI and its applications were discussed on 12 December 2025.</p></td></tr>
      <tr><td></td><td></td><td></td><td></td><td colspan="2">A follow-up talk used its own source wording.</td></tr>
      <tr><td></td><td></td><td></td><td><img src="data:image/jpeg;base64,BB=="></td><td colspan="2"></td></tr>
      <tr><td></td><td></td><td></td><td><img src="data:image/gif;base64,CC=="></td><td colspan="2"></td></tr>
    </table>`;
  const result = extract.parseNewsletterTableHtml(html);
  assert.equal(result.recognized, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].month, 'DECEMBER 2025');
  assert.equal(result.rows[1].month, 'DECEMBER 2025');
  assert.equal(result.rows[0].eventType, 'Technical Talk');
  assert.equal(result.rows[1].eventType, 'Technical Talk');
  assert.match(result.rows[0].description, /12 December 2025/);
  assert.equal(result.rows[0].images.length, 1);
  assert.equal(result.unassociatedImages.length, 1);
  assert.equal(result.unsupportedImages, 1);

  const categories = [{ id: 'talks', name: 'Technical Talks', keywords: [] }, { id: 'other', name: 'Other', keywords: [] }];
  const events = extract.eventsFromNewsletterRows(result.rows, 'source.docx', categories, 4);
  assert.equal(events.length, 2);
  assert.equal(events[0].category, 'talks');
  assert.equal(events[0].sourceEventName, '');
  assert.equal(events[0].sourceDescription, result.rows[0].description);
  assert.equal(events[0].needsReview, true);
  assert.equal(events[0].order, 4);
  assert.equal(events[1].order, 5);
});

test('does not treat unrelated tables as newsletter data tables', () => {
  const result = extract.parseNewsletterTableHtml('<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>B</td></tr></table>');
  assert.equal(result.recognized, false);
  assert.deepEqual(result.rows, []);
});

test('exact event title, matching date, and details identify a possible duplicate across source files', () => {
  const existing = event({ id: 'existing', category: 'talks', sourceFile: 'december.docx' });
  const imported = event({ id: 'imported', category: 'workshops', sourceFile: 'newsletter.pdf', sourceId: 'source-two' });
  assert.equal(utils.possiblySameEvent(existing, imported), true);
});

test('normalizes harmless title punctuation, capitalization, whitespace, and safe date formats', () => {
  const first = event({ name: '  ROBOTICS   Showcase! ', date: '12 December 2025' });
  const second = event({ name: 'Robotics showcase', date: 'December 12, 2025' });
  assert.equal(utils.possiblySameEvent(first, second), true);
});

test('same title with clearly conflicting dates is not a duplicate candidate', () => {
  assert.equal(utils.possiblySameEvent(event(), event({ date: '13 December 2025' })), false);
});

test('different event titles on the same date remain separate', () => {
  assert.equal(utils.possiblySameEvent(event(), event({ name: 'Campus open day' })), false);
});

test('generic descriptions do not make different events duplicates', () => {
  const generic = 'Students participated enthusiastically and the event enhanced technical knowledge.';
  assert.equal(utils.possiblySameEvent(
    event({ name: 'Robotics showcase', description: generic }),
    event({ id: 'other', name: 'Water quality seminar', description: generic }),
  ), false);
});

test('same title and date with clearly different event subjects remains separate', () => {
  assert.equal(utils.possiblySameEvent(
    event({ description: 'A robotics team demonstrated an autonomous rover and navigation system.' }),
    event({ id: 'other', description: 'A biomedical group presented a new clinical imaging platform.' }),
  ), false);
});

test('participant overlap never identifies distinct events as duplicates', () => {
  const first = event({ name: 'Robotics showcase', participants: 'Asha Rao, Dev Shah' });
  const second = event({ id: 'other', name: 'Solar car challenge', participants: 'Asha Rao, Dev Shah' });
  assert.equal(utils.possiblySameEvent(first, second), false);
});

test('the same participant can appear in multiple events without a duplicate match', () => {
  const first = event({ name: 'Robotics showcase', participants: 'Asha Rao' });
  const second = event({ id: 'other', name: 'Campus open day', participants: 'Asha Rao' });
  assert.equal(utils.possiblySameEvent(first, second), false);
});

test('missing dates need strong distinctive description evidence', () => {
  const first = event({ date: '', description: 'Students built an autonomous rover using computer vision.' });
  const second = event({ id: 'other', date: '', description: 'The autonomous rover used computer vision after students built it.' });
  const weak = event({ id: 'weak', date: '', description: 'Students participated enthusiastically.' });
  assert.equal(utils.possiblySameEvent(first, second), true);
  assert.equal(utils.possiblySameEvent(first, weak), false);
});

test('a title and date match is only a candidate and remains subject to manual review', () => {
  const first = event({ description: 'Students participated enthusiastically.' });
  const second = event({ id: 'other', description: 'The event enhanced technical knowledge.' });
  assert.equal(utils.possiblySameEvent(first, second), true);
});

test('Keep Both preserves the complete candidate and its images and source metadata', () => {
  const existing = event({ id: 'existing', images: ['data:image/png;base64,existing-photo'] });
  const imported = event({
    id: 'candidate',
    images: ['data:image/png;base64,candidate-photo'],
    sourceFile: 'second-source.docx',
    sourceId: 'second-source',
    sourceEventName: 'Robotics showcase',
    sourceDescription: 'Source wording from the second file.',
    participants: 'Asha Rao, Dev Shah',
  });
  const kept = utils.resolveDuplicateCandidate([existing], imported, true);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept[0], existing);
  assert.equal(kept[1].id, imported.id);
  assert.deepEqual(kept[1].images, imported.images);
  assert.equal(kept[1].sourceFile, imported.sourceFile);
  assert.equal(kept[1].sourceId, imported.sourceId);
  assert.equal(kept[1].sourceEventName, imported.sourceEventName);
  assert.equal(kept[1].sourceDescription, imported.sourceDescription);
  assert.equal(kept[1].participants, imported.participants);
  assert.equal(kept[1].order, 1);
});

test('discarding a candidate leaves the existing register and unrelated records unchanged', () => {
  const existing = event({ id: 'existing' });
  const unrelated = event({ id: 'unrelated', name: 'Campus open day' });
  const candidate = event({ id: 'candidate', images: ['data:image/png;base64,candidate-photo'] });
  const before = [existing, unrelated];
  const after = utils.resolveDuplicateCandidate(before, candidate, false);
  assert.equal(after, before);
  assert.deepEqual(after, [existing, unrelated]);
  assert.equal(after.some(item => item.id === candidate.id), false);
  assert.deepEqual(after[0].images, existing.images);
  assert.equal(after[0].sourceFile, existing.sourceFile);
});

test('category totals count the live register without removing possible duplicate candidates', () => {
  const first = event({ id: 'one', category: 'talks' });
  const similar = event({ id: 'two', category: 'workshops' });
  const unrelated = event({ id: 'three', name: 'Campus open day', category: 'other' });
  const distribution = utils.categoryDistribution([first, similar, unrelated], categories);
  assert.deepEqual(distribution.map(item => item.count), [1, 1, 1]);
});

test('moving an event updates only its category and preserves its record and image', () => {
  const first = {
    id: 'first', name: 'Campus workshop', description: 'A detailed source description.',
    date: '12 December 2025', time: '', venue: '', organizer: '', department: '',
    club: '', participants: '', teamSize: '', category: 'workshops',
    images: ['data:image/png;base64,local-photo'], confidence: 0.4, score: 1,
    classificationSource: 'Automatic keyword match', needsReview: true,
    sourceFile: 'events.docx', order: 2,
  };
  const second = { ...first, id: 'second', name: 'Guest lecture', category: 'talks', order: 0 };
  const unchanged = { ...first, id: 'unchanged', name: 'Club meetup', category: 'workshops', order: 0 };

  const result = utils.moveEventToCategory([first, second, unchanged], 'first', 'talks');
  const moved = result.find(item => item.id === 'first');
  assert.equal(moved.category, 'talks');
  assert.equal(moved.name, first.name);
  assert.deepEqual(moved.images, first.images);
  assert.equal(moved.classificationSource, 'Manually assigned');
  assert.equal(moved.needsReview, false);
  assert.equal(moved.confidence, 1);
  assert.equal(result.find(item => item.id === 'unchanged').category, 'workshops');
  assert.equal(result.findIndex(item => item.id === 'first') > result.findIndex(item => item.id === 'second'), true);
});

test('PDF text normalization preserves labels while replacing unsupported glyphs and control characters', () => {
  const source = '💡 Theme: College Automation\n🌐 Domains: Artificial Intelligence & Web Development\n📅 Dates: March 27ᵗʰ & 28ᵗʰ, 2026\n🛠 BEGIN-SOURCE-MARKER';
  assert.equal(
    pdf.cleanPdfText(source),
    'Theme: College Automation\nDomains: Artificial Intelligence & Web Development\nDates: March 27th & 28th, 2026\nBEGIN-SOURCE-MARKER',
  );
  assert.equal(pdf.cleanPdfText('Date:\u001d\u0000March 27th'), 'Date: March 27th');
});

test('generated PDF contains both reviewed events in category order with associated event photos', async () => {
  const report = {
    institution: 'Test Institute',
    department: 'Computer Science',
    title: 'Event Register Verification',
    volume: '1',
    issue: '1',
    academicYear: '2025-26',
    period: 'December 2025',
    subtitle: 'Local PDF test',
    coverLead: '',
    logo: '',
    departmentLogo: '',
    coverImage: '',
    tagline: '',
    collegeProfile: '',
    departmentTagline: '',
    vision: '',
    mission: '',
    hodMessage: '',
    hodName: '',
    hodRole: '',
    editorialTeam: '',
  };
  const events = [
    event({ id: 'robotics', name: 'Robotics showcase', category: 'talks', images: [onePixelPng()] }),
    event({
      id: 'solar',
      name: 'Solar car challenge',
      description: 'The engineering team tested a solar-powered vehicle on campus.',
      category: 'workshops',
      participants: 'Asha Rao, Dev Shah',
      order: 1,
    }),
  ];
  const blob = await pdf.buildNewsletterPdf(report, events, categories);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(blob.type, 'application/pdf');
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');

  const pdfjs = await import(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
    page.cleanup();
  }
  await loadingTask.destroy();
  const text = pages.join('\n');
  assert.match(text, /Robotics showcase/);
  assert.match(text, /Solar car challenge/);
  assert.ok(text.toLowerCase().indexOf('technical talks') < text.toLowerCase().indexOf('workshops'));
  assert.ok(pageCount >= 3);
});
