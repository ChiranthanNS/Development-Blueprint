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
