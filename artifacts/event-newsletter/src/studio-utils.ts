import type { Category, EventRecord } from './studio-types';

const tokenSimilarity = (first: string, second: string) => {
  const words = (text: string) => new Set(text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]{3,}/gu) || []);
  const a = words(first);
  const b = words(second);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(word => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
};

export function possiblySameEvent(first: EventRecord, second: EventRecord): boolean {
  const nameScore = tokenSimilarity(first.name, second.name);
  const descriptionScore = tokenSimilarity(first.description, second.description);
  const sameDate = Boolean(first.date && second.date && first.date.toLowerCase().trim() === second.date.toLowerCase().trim());
  return (nameScore >= 0.8 && (!first.date || !second.date || sameDate || descriptionScore >= 0.62)) ||
    (sameDate && nameScore >= 0.45 && descriptionScore >= 0.5);
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
