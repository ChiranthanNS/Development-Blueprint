import fitz
from pathlib import Path
src = Path('attached_assets/Newsletter_Volume-4,_Issue-1_1791812324780.pdf')
out = Path('.agents/outputs/reference-pages')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(src)
print('pages', doc.page_count, 'size', doc[0].rect)
for index in range(min(doc.page_count, 24)):
    page = doc[index]
    pix = page.get_pixmap(matrix=fitz.Matrix(0.55, 0.55), alpha=False)
    pix.save(out / f'page-{index+1:02}.png')
print('rendered', min(doc.page_count,24), 'pages to', out)
