export type Keyword = { term: string; weight: number };
export type Category = { id: string; name: string; keywords: Keyword[] };
export type EventRecord = {
  id: string; name: string; description: string; date: string; time: string; venue: string;
  organizer: string; department: string; club: string; participants: string; teamSize: string;
  category: string; images: string[]; confidence: number; score: number;
  classificationSource: string; needsReview: boolean; sourceFile: string; order: number;
};
export type SourceFile = { id: string; file: File; status: 'ready' | 'working' | 'done' | 'warning' | 'error'; message?: string };
export type ReportInfo = { institution: string; department: string; title: string; academicYear: string; period: string; subtitle: string; logo: string };
