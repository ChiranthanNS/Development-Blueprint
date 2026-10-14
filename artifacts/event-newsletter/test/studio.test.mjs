import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const extract = await loadTypeScript('../src/extract.ts');
const utils = await loadTypeScript('../src/studio-utils.ts');
const pdf = await loadTypeScript('../src/newsletter-pdf.ts');

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

test('duplicate review and category totals use the live event register', () => {
  const event = (id, name, category) => ({
    id, name, description: 'The robotics project was selected for the national showcase.',
    date: '12 December 2025', time: '', venue: '', organizer: '', department: '', club: '',
    participants: '', teamSize: '', category, images: [], confidence: 1, score: 5,
    classificationSource: 'Newsletter data form', needsReview: false, sourceFile: 'source.docx', order: 0,
  });
  const first = event('one', 'Robotics showcase', 'students');
  const similar = event('two', 'Robotics showcase', 'faculty');
  const unrelated = event('three', 'Campus open day', 'department');
  assert.equal(utils.possiblySameEvent(first, similar), true);
  assert.equal(utils.possiblySameEvent(first, unrelated), false);

  const distribution = utils.categoryDistribution([first, similar, unrelated], [
    { id: 'students', name: 'Students', keywords: [] },
    { id: 'faculty', name: 'Faculty', keywords: [] },
    { id: 'department', name: 'Department', keywords: [] },
    { id: 'other', name: 'Other', keywords: [] },
  ]);
  assert.deepEqual(distribution.map(item => item.count), [1, 1, 1, 0]);
});

test('PDF text normalization preserves labels while replacing unsupported glyphs and control characters', () => {
  const source = '💡 Theme: College Automation\n🌐 Domains: Artificial Intelligence & Web Development\n📅 Dates: March 27ᵗʰ & 28ᵗʰ, 2026\n🛠 BEGIN-SOURCE-MARKER';
  assert.equal(
    pdf.cleanPdfText(source),
    'Theme: College Automation\nDomains: Artificial Intelligence & Web Development\nDates: March 27th & 28th, 2026\nBEGIN-SOURCE-MARKER',
  );
  assert.equal(pdf.cleanPdfText('Date:\u001d\u0000March 27th'), 'Date: March 27th');
});
