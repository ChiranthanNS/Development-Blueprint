# Event Newsletter Studio

Client-side event organizer: upload local source files, review categorized events, preview the generated newsletter, and download a PDF. Keep the current React/Vite monorepo structure.

## Run and verify

- Install dependencies at the repository root with `pnpm install`.
- The Replit preview is served by the managed artifact workflow `artifacts/event-newsletter: web`.
- For local development: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run dev`.
- Typecheck: `pnpm --filter @workspace/event-newsletter run typecheck`.
- Tests: `pnpm --filter @workspace/event-newsletter run test`.
- Production build: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run build`.

## Project map

- `artifacts/event-newsletter/src/extract.ts` — browser-local PDF/DOCX/image extraction, newsletter-table parsing, and event suggestions.
- `artifacts/event-newsletter/src/App.tsx` — upload, review, category movement, and PDF workflow.
- `artifacts/event-newsletter/src/studio-utils.ts` — record similarity, category totals, and event movement.
- `artifacts/event-newsletter/src/newsletter-pdf.ts` — paginated newsletter PDF generation.
- `artifacts/event-newsletter/test/` — parser, category movement, and PDF text regression tests.

## Data boundary

Uploaded documents, extracted text, event records, images, edits, and previews must remain in browser memory only. Do not add server storage, a database, login, telemetry, content logging, persistent browser storage, or remote document/AI processing. OCR may load generic worker and language assets into the browser; do not send document content off-device. Do not commit extracted records or publication output as app defaults.

## Import and output

- Prefer the provided data-format DOCX when row-to-photo relationships matter.
- A recognized table must not fall back to generic text parsing just because it yields zero event rows.
- Do not guess which event an unassociated photo belongs to; leave it unattached until the user chooses an event.
- Invalidate the preview when event/category/issue details change. Generate the PDF from the latest reviewed state.
- Revoke generated PDF object URLs when they are replaced or the app is closed.
