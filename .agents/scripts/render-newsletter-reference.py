from pathlib import Path
import pymupdf

source = Path("attached_assets/Newsletter_Volume-4,_Issue-1_1791639559295.pdf")
output = Path(".agents/outputs/newsletter-reference")
output.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
for index in (0, 1, 2, 5, 6, 9, 10, 13, 19, 22, 23):
    page = document[index]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), alpha=False)
    pixmap.save(output / f"page-{index + 1:02d}-detail.png")

print(f"Rendered {len(document)} pages and saved selected high-resolution pages to {output}")
