"""Render a reference PDF into a contact sheet and selected full-size pages."""

from __future__ import annotations

import sys
from pathlib import Path

import fitz


source_path = Path(sys.argv[1])
output_dir = Path(sys.argv[2])
output_dir.mkdir(parents=True, exist_ok=True)
source = fitz.open(source_path)
print(f"Pages: {source.page_count}; page size: {source[0].rect}")

columns = 4
cell_width, cell_height, label_height = 156, 220, 18
rows = (source.page_count + columns - 1) // columns
sheet = fitz.open()
page = sheet.new_page(width=columns * cell_width, height=rows * (cell_height + label_height))

for index, original in enumerate(source):
    column = index % columns
    row = index // columns
    x = column * cell_width
    y = row * (cell_height + label_height)
    page.show_pdf_page(
        fitz.Rect(x, y, x + cell_width, y + cell_height),
        source,
        index,
        keep_proportion=True,
    )
    page.insert_text((x + 5, y + cell_height + 13), f"Page {index + 1}", fontsize=9)

sheet_path = output_dir / "contact-sheet.pdf"
sheet.save(sheet_path, garbage=4, deflate=True)
sheet.close()
fitz.open(sheet_path)[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(
    output_dir / "contact-sheet.png"
)

for page_number in (1, 2, 3, 4, 8, 12, 16, 20, 24):
    if page_number <= source.page_count:
        page = source[page_number - 1]
        page.get_pixmap(matrix=fitz.Matrix(1.35, 1.35), alpha=False).save(
            output_dir / f"page-{page_number:02}.png"
        )

source.close()
