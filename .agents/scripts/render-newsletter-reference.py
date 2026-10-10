from pathlib import Path
import pymupdf

source = Path("attached_assets/Newsletter_Volume-4,_Issue-1_1791639559295.pdf")
output = Path(".agents/outputs/newsletter-reference")
output.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
thumb_width = 180
margin = 14
columns = 4
rows = (len(document) + columns - 1) // columns
thumbs = []

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(0.42, 0.42), alpha=False)
    image = pymupdf.Pixmap(pixmap, 0) if pixmap.n >= 4 else pixmap
    image.save(output / f"page-{index + 1:02d}-thumb.png")
    thumbs.append(image)

canvas = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, columns * (thumb_width + margin) + margin, rows * (260 + margin) + margin), alpha=False)
canvas.clear_with(255)
for index, image in enumerate(thumbs):
    x = margin + (index % columns) * (thumb_width + margin)
    y = margin + (index // columns) * (260 + margin)
    scale = min(thumb_width / image.width, 230 / image.height)
    width, height = int(image.width * scale), int(image.height * scale)
    resized = pymupdf.Pixmap(image, width=width, height=height)
    canvas.copy(resized, pymupdf.IRect(x, y + 20, x + width, y + 20 + height))
    # Page numbers are also printed in the extraction report below.
canvas.save(output / "contact-sheet.png")

for index in (0, 1, 2, 5, 6, 9, 10, 13, 19, 22, 23):
    page = document[index]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), alpha=False)
    pixmap.save(output / f"page-{index + 1:02d}-detail.png")

print(f"Rendered {len(document)} pages to {output}")
