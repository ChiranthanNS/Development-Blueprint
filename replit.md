# Event Newsletter Studio

Browser-based event review and newsletter PDF builder. The app is intentionally local-first and keeps each working session in browser memory.

## Run and verify

- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run dev` — local development server
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run typecheck` — typecheck the app
- `pnpm --filter @workspace/event-newsletter run test` — importer and transformation tests
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run build` — production frontend build
- The Replit preview workflow is `artifacts/event-newsletter: web`.

## Project map

- `artifacts/event-newsletter/src/extract.ts` — local PDF/DOCX/image reading, newsletter-table parsing, and event suggestions.
- `artifacts/event-newsletter/src/App.tsx` — upload/review flow, duplicate decisions, category management, and PDF generation.
- `artifacts/event-newsletter/src/newsletter-pdf.ts` — paginated newsletter output.
- `artifacts/event-newsletter/src/studio-types.ts` — shared event, report, and import-diagnostic types.
- `artifacts/event-newsletter/test/` — parser and transformation regression tests.

## Data boundary

Do not add server storage, a database, or login for event data. Source files, extracted text, event records, photos, and generated PDFs must stay temporary in the browser session. Do not commit extracted event records or publication output as app defaults.

## Import and output

- Prefer the provided data-format DOCX when row-to-photo relationships matter.
- A recognized table must not fall back to generic text parsing just because it yields zero event rows.
- Do not guess which event an unassociated photo belongs to; leave it unattached until the user chooses an event.
- Generated previews must always correspond to the latest report, category, and event state. Long front-matter panels must continue onto another page rather than disappear.
