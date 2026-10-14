import type { Category, EventRecord } from './studio-types';

const normalizeText = (value: string) => value.toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const genericDescriptionWords = new Set([
  'a', 'about', 'after', 'also', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by',
  'college', 'conducted', 'department', 'during', 'enhance', 'enhanced', 'event', 'for',
  'from', 'held', 'in', 'into', 'is', 'it', 'knowledge', 'of', 'on', 'organized',
  'organised', 'our', 'participated', 'participants', 'programme', 'program', 'students',
  'student', 'successfully', 'technical', 'the', 'their', 'this', 'to', 'was', 'were',
  'with', 'enthusiastically',
]);

const subjectWords = (value: string) => new Set(
  normalizeText(value).split(' ').filter(word => word.length >= 2 && !genericDescriptionWords.has(word)),
);

function descriptionEvidence(first: string, second: string) {
  const a = subjectWords(first);
  const b = subjectWords(second);
  const shared = [...a].filter(word => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return {
    shared,
    score: union ? shared / union : 0,
    clearlyDifferent: a.size >= 3 && b.size >= 3 && shared < 2,
    strong: shared >= 2 && union > 0 && shared / union >= 0.55,
  };
}

const monthNames = new Map([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7],
  ['july', 7], ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10], ['nov', 11], ['november', 11], ['dec', 12], ['december', 12],
]);

type ParsedDate = { year: number; month: number; day?: number };

function parseDate(value: string): ParsedDate | null {
  const text = normalizeText(value).replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, '$1');
  let match = text.match(/\b(20\d{2}) (\d{1,2}) (\d{1,2})\b/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };

  match = text.match(/\b(\d{1,2}) ([a-z]+) (20\d{2})\b/);
  if (match && monthNames.has(match[2])) {
    return { year: Number(match[3]), month: monthNames.get(match[2])!, day: Number(match[1]) };
  }
  match = text.match(/\b([a-z]+) (\d{1,2}) (20\d{2})\b/);
  if (match && monthNames.has(match[1])) {
    return { year: Number(match[3]), month: monthNames.get(match[1])!, day: Number(match[2]) };
  }
  match = text.match(/\b([a-z]+) (20\d{2})\b/);
  if (match && monthNames.has(match[1])) {
    return { year: Number(match[2]), month: monthNames.get(match[1])! };
  }
  match = text.match(/\b(20\d{2}) (\d{1,2})\b/);
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }

  const numeric = text.match(/\b(\d{1,4}) (\d{1,2}) (\d{1,4})\b/);
  if (!numeric) return null;
  const parts = numeric.slice(1).map(Number);
  if (parts[0] >= 1000 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31) {
    return { year: parts[0], month: parts[1], day: parts[2] };
  }
  if (parts[2] >= 1000 && parts[1] >= 1 && parts[1] <= 12 && parts[0] >= 1 && parts[0] <= 31) {
    if (parts[0] > 12) return { year: parts[2], month: parts[1], day: parts[0] };
    if (parts[1] > 12) return { year: parts[2], month: parts[0], day: parts[1] };
  }
  return null;
}

function datesConflict(first: string, second: string) {
  if (!first.trim() || !second.trim()) return false;
  const a = parseDate(first);
  const b = parseDate(second);
  if (a && b) {
    return a.year !== b.year || a.month !== b.month || Boolean(a.day && b.day && a.day !== b.day);
  }
  const normalizedFirst = normalizeText(first);
  const normalizedSecond = normalizeText(second);
  if (normalizedFirst === normalizedSecond) return false;
  // Ambiguous numeric dates (such as 03/04/2025) are not reinterpreted by locale.
  if (/\b\d{1,2} \d{1,2} \d{4}\b/.test(normalizedFirst) || /\b\d{1,2} \d{1,2} \d{4}\b/.test(normalizedSecond)) return false;
  return true;
}

export function possiblySameEvent(first: EventRecord, second: EventRecord): boolean {
  const firstTitle = normalizeText(first.name || first.sourceEventName || '');
  const secondTitle = normalizeText(second.name || second.sourceEventName || '');
  if (!firstTitle || firstTitle !== secondTitle) return false;
  if (datesConflict(first.date, second.date)) return false;

  const descriptions = descriptionEvidence(first.description, second.description);
  if (descriptions.clearlyDifferent) return false;

  const bothHaveDates = Boolean(first.date.trim() && second.date.trim());
  if (bothHaveDates && (parseDate(first.date) && parseDate(second.date) ||
      normalizeText(first.date) === normalizeText(second.date))) return true;

  // With a missing or ambiguous date, the shared title alone is not enough.
  return descriptions.strong;
}

export function resolveDuplicateCandidate(
  events: EventRecord[],
  candidate: EventRecord,
  keepBoth: boolean,
): EventRecord[] {
  return keepBoth ? [...events, { ...candidate, order: events.length }] : events;
}

export function categoryDistribution(events: EventRecord[], categories: Category[]) {
  return categories.map(category => ({
    ...category,
    count: events.reduce((total, event) => total + Number(event.category === category.id), 0),
  }));
}

export function moveEventToCategory(
  events: EventRecord[],
  eventId: string,
  categoryId: string,
  beforeId?: string,
): EventRecord[] {
  const moved = events.find(event => event.id === eventId);
  if (!moved) return events;

  const target = events
    .filter(event => event.category === categoryId && event.id !== eventId)
    .sort((a, b) => a.order - b.order);
  const index = beforeId ? target.findIndex(event => event.id === beforeId) : target.length;
  target.splice(index < 0 ? target.length : index, 0, {
    ...moved,
    category: categoryId,
    classificationSource: 'Manually assigned',
    needsReview: false,
    confidence: 1,
  });

  const others = events.filter(event => event.category !== categoryId && event.id !== eventId);
  return [...others, ...target.map((event, order) => ({ ...event, category: categoryId, order }))];
}
