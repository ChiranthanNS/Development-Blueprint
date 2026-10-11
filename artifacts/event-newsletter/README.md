# Event Newsletter Studio

A session-only React/Vite web app for importing newsletter data forms, reviewing event records, and creating a downloadable magazine-style PDF.

## Features

- Upload multiple PDF, DOCX, JPG, JPEG, and PNG files (up to 30 MB per file).
- Extract PDF text and page images, read DOCX text and embedded images, and run English OCR on scans and image files in the browser.
- Import the five-column newsletter DOCX table as structured event records, keeping each row's embedded images with that record.
- Group newsletter-form records into the reference's publication sections; also suggest records from other PDFs, DOCX files, and images.
- Review event records with category assignments, duplicate checks, and missing-field indicators.
- Edit, add, remove, reclassify, and reorder events; add, replace, or remove event photos.
- Search and filter the event register; review live category counts and a pie chart.
- Edit the AIML-Gazette issue details, college profile, department front matter, logos, and cover photograph.
- Preview and download an A4 magazine-style PDF with a cover, department page, framed event cards, and a placement gallery.
- Start a new project or clear the current upload session.

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

1. Upload the newsletter data-format DOCX for best results. The app reads its table in the browser and keeps event photos paired with their rows.
2. Open **Review & arrange**. Verify event details and categories; drag cards to reclassify or reorder them.
3. Open **Categories & keywords** to add, rename, remove, or tune categories and weighted terms. Changes apply to future analyses and report labels.
4. Open **Report & PDF** to edit the issue information and front matter. Add the institution and department logos and a cover photograph to match the reference more closely.
5. Download the PDF when it reflects the corrected event register. Any edits to events or report details invalidate the previous preview.

## Classification

Classification is local and keyword-based. Matching phrases contribute their configured weights; the leading score and the gap to the next category inform the confidence estimate. **Other** is used when no configured term matches. Ambiguous, low-confidence, or incomplete records are flagged for manual review. Adjust the confidence threshold in **Categories & keywords**. Verify all extracted facts before publication.

## Privacy and configuration

There is no login, database, API key, or AI service. Source files, extracted text, photos, and generated PDFs stay in browser memory for the current session; reloading or starting a new project clears them. OCR may download Tesseract worker and English-language assets for the browser, but the uploaded documents are not sent to an application server.

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
- `src/studio.css` — application layout and responsive styles.
- `src/index.css` — shared theme and base styles.
