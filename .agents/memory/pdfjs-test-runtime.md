---
name: PDF.js test runtime
description: Node compatibility requirement when testing locally generated PDFs with PDF.js 6.
---

Tests that parse generated PDFs with PDF.js 6 need a conditional `Promise.withResolvers` shim under Node 20; that Node version does not provide the API PDF.js calls.

**Why:** The workspace runs Node 20, while the installed PDF.js 6 parser expects `Promise.withResolvers` and otherwise fails before reading the PDF.

**How to apply:** Keep the compatibility shim confined to the test process. Do not add it to browser application code; the browser PDF path is separate.
