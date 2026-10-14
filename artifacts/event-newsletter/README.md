# Event Newsletter Studio

A session-only React/Vite web app for importing newsletter data forms, reviewing event records, and creating a downloadable magazine-style PDF.

## Workflow

- Select DOCX, PDF, JPG, JPEG, or PNG files (up to 30 MB each), then choose **Analyze and Organize**.
- Extract PDF text and page images, read DOCX tables and embedded images, and attempt English OCR in the browser.
- Keep each recognized newsletter-table row paired with its own images. Unassociated photos stay separate for manual assignment.
- Review suggested categories, edit or remove event records, drag cards between categories, or use each card's category selector.
- Preview the generated A4 newsletter PDF, then download it. PDF is the only export format offered.
- Start a new file from any step; the app asks before clearing a session that contains work.

## Run locally

Run these commands from the repository root:

```bash
pnpm install
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run dev
```

To create a production build:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run build
```

The Vite artifact requires `PORT` and `BASE_PATH`. The Replit web workflow supplies these values.

## Deploy

The artifact is configured to build and serve the static site in `dist/public`. In Replit, open **Publish** and publish this web artifact as a static deployment. See [Replit publishing](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments).

## Use the app

1. Choose one or more source files. The app shows each filename, type, and size before processing.
2. Choose **Analyze and Organize**. Check extracted records and any warnings.
3. Review suggested categories. Drag an event to a different group or choose its category from the event card. Edit any uncertain details.
4. Choose **Continue to Preview**. The PDF is generated from the latest event and category state.
5. Download the PDF or return to review. Choose **Start over** to clear the current project and begin again.

For records with photos that cannot be matched confidently to a table row, the upload list keeps those photos separate and provides an event selector for manual assignment. Import diagnostics distinguish records added, photos extracted and matched, records needing review, duplicate candidates, unassigned photos, and unsupported images.

## Classification

Classification is local and keyword-based. Matching phrases contribute their configured weights; the leading score and gap to the next category inform the confidence estimate. **Other** is used when no configured term matches. Ambiguous, low-confidence, or incomplete records are flagged for manual review. Verify extracted facts before publication.

## Privacy and configuration

Uploaded files, extracted text, event records, images, edits, and generated PDFs are kept in browser memory for the current session. The application does not upload or save document content. Reloading the page or starting a new project clears the in-memory work. OCR may download Tesseract worker and English-language assets to the browser; document content is processed locally and is not sent to an application server or remote AI service. Browser memory, downloads, hosting, and other infrastructure are outside the app's control.

No API configuration is required. `.env.example` is included as a note that this app has no required environment secrets. Dependencies are managed by the artifact's `package.json` and the repository's pnpm workspace; this TypeScript app does not use `requirements.txt`.

## Known limitations

- Event detection and field extraction use document text and heuristics, not a trained model. Treat suggestions as candidates and review them against the source.
- OCR currently uses English. Scanned pages with complex layouts, low resolution, or non-English text may need manual correction.
- PDF pages containing imagery are rendered as page snapshots. For the provided newsletter DOCX table, photos are assigned by their source row; unsupported image formats are reported in the import status.
- Logos and the cover photograph are optional uploads held only in the current browser session.
- The app is client-side and temporary by design. A page reload clears the current project.

## Project files

- `src/App.tsx` — workflow, event register, category configuration, dashboard, and PDF generation.
- `src/extract.ts` — file validation, PDF/DOCX extraction, OCR, event parsing, and weighted classification.
- `src/studio-types.ts` — event, category, report, and source-file types.
- `src/studio-utils.ts` — duplicate matching and live category totals.
- `src/studio.css` — application layout and responsive styles.
- `src/index.css` — shared theme and base styles.

## Verify

- `pnpm --filter @workspace/event-newsletter run test` — parser, duplicate matching, and category-count tests.
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run typecheck` — TypeScript validation.
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/event-newsletter run build` — production frontend build.
