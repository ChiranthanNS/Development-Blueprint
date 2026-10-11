import type { Category, EventRecord, ReportInfo } from './studio-types';

type RGB = [number, number, number];
const ink: RGB = [24, 24, 23];
const gray: RGB = [78, 78, 75];
const rule: RGB = [44, 43, 39];
const gold: RGB = [166, 138, 69];
const pageWidth = 210;
const pageHeight = 297;
const margin = 14;
const contentWidth = pageWidth - margin * 2;

const cleanPdfText = (value: string) => value
  .replace(/₹/g, 'INR ')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/\u00a0/g, ' ')
  .trim();

function bodyWithoutRepeatedTitle(name: string, description: string) {
  const body = description.trim();
  if (!name || !body.toLowerCase().startsWith(name.trim().toLowerCase())) return body;
  return body.slice(name.trim().length).replace(/^[\s,:;.!?–—-]+/, '');
}

export async function buildNewsletterPdf(report: ReportInfo, events: EventRecord[], categories: Category[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({
    title: `${report.title || 'Department Newsletter'} ${report.period || ''}`.trim(),
    author: report.institution || '',
    subject: report.academicYear || '',
  });

  const wrap = (text: string, font: 'times' | 'helvetica', style: 'normal' | 'bold' | 'italic', size: number, width: number) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(cleanPdfText(text), width) as string[];
    return lines.length ? lines : [''];
  };
  const drawImageContained = (data: string, x: number, y: number, maxWidth: number, maxHeight: number) => {
    try {
      const props = doc.getImageProperties(data);
      const scale = Math.min(maxWidth / props.width, maxHeight / props.height);
      const width = props.width * scale;
      const height = props.height * scale;
      const format = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(data, format, x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height, undefined, 'FAST');
      return true;
    } catch {
      return false;
    }
  };
  const drawMasthead = (section: string) => {
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.55);
    doc.line(margin, 9, pageWidth - margin, 9);
    doc.line(margin, 11, pageWidth - margin, 11);
    if (report.logo) drawImageContained(report.logo, margin + 2, 14, 18, 18);
    if (report.departmentLogo) drawImageContained(report.departmentLogo, pageWidth - margin - 20, 14, 18, 18);
    const titleLines = wrap(section.toUpperCase(), 'times', 'bold', 13.5, contentWidth - 48);
    const headerY = titleLines.length > 1 ? 21 : 27;
    titleLines.forEach((line, index) => doc.text(line, pageWidth / 2, headerY + index * 5.2, { align: 'center' }));
    doc.setLineWidth(0.5);
    doc.line(margin, 35, pageWidth - margin, 35);
  };
  const addContentPage = (section: string) => {
    doc.addPage();
    drawMasthead(section);
  };
  const drawPanel = (heading: string, text: string, y: number, options: { fontSize?: number; lineHeight?: number; maxY?: number } = {}) => {
    if (!text.trim()) return y;
    const fontSize = options.fontSize ?? 8.6;
    const lineHeight = options.lineHeight ?? 4.1;
    const panelX = margin + 2;
    const panelWidth = contentWidth - 4;
    const padding = 5;
    const bodyLines = wrap(text, 'times', 'normal', fontSize, panelWidth - padding * 2);
    const panelHeight = padding + 4.2 + bodyLines.length * lineHeight + padding;
    if (y + panelHeight > (options.maxY ?? pageHeight - 15)) return null;
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.48);
    doc.roundedRect(panelX, y, panelWidth, panelHeight, 1.8, 1.8, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...gold);
    doc.text(heading.toUpperCase(), panelX + padding, y + padding + 2.3);
    doc.setFont('times', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...ink);
    bodyLines.forEach((line, index) => doc.text(line, panelX + padding, y + padding + 8 + index * lineHeight));
    return y + panelHeight + 4;
  };
  const drawFooter = (page: number, total: number) => {
    doc.setDrawColor(150, 147, 137);
    doc.setLineWidth(0.35);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...gray);
    doc.text(`${report.title || 'Department Newsletter'}  |  ${report.academicYear || ''}`.trim(), margin, pageHeight - 6);
    doc.text(`${page} / ${total}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  };

  // Cover page follows the reference's institutional masthead, campus photograph,
  // issue line, editorial statement, and college profile.
  doc.setDrawColor(...rule);
  doc.setLineWidth(0.55);
  doc.line(margin, 9, pageWidth - margin, 9);
  doc.line(margin, 11, pageWidth - margin, 11);
  if (report.logo) drawImageContained(report.logo, margin + 1, 14, 22, 22);
  if (report.departmentLogo) drawImageContained(report.departmentLogo, pageWidth - margin - 23, 14, 22, 22);
  const institutionLines = wrap(report.institution || 'Department Newsletter', 'times', 'bold', 13.5, contentWidth - 58);
  institutionLines.forEach((line, index) => doc.text(line.toUpperCase(), pageWidth / 2, 19 + index * 5.5, { align: 'center' }));
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  const departmentLines = wrap(report.department || '', 'times', 'bold', 10.5, contentWidth - 40);
  departmentLines.forEach((line, index) => doc.text(line, pageWidth / 2, 39 + index * 5, { align: 'center' }));

  let coverY = 46 + departmentLines.length * 5;
  if (report.coverImage) {
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.8);
    doc.rect(margin + 1, coverY, contentWidth - 2, 68);
    drawImageContained(report.coverImage, margin + 2, coverY + 1, contentWidth - 4, 66);
    coverY += 73;
  } else {
    doc.setDrawColor(210, 205, 192);
    doc.setLineWidth(0.4);
    doc.line(margin + 35, coverY + 11, pageWidth - margin - 35, coverY + 11);
    coverY += 22;
  }
  doc.setTextColor(...gray);
  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  doc.text('Presents', pageWidth / 2, coverY, { align: 'center' });
  coverY += 5;
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(report.subtitle || 'Department Newsletter', pageWidth / 2, coverY, { align: 'center' });
  coverY += 11;
  doc.setFont('times', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(...ink);
  const newsletterTitleLines = wrap(report.title || 'Department Newsletter', 'times', 'bold', 23, contentWidth - 24);
  newsletterTitleLines.slice(0, 2).forEach((line, index) => doc.text(line, pageWidth / 2, coverY + index * 8.2, { align: 'center' }));
  coverY += newsletterTitleLines.length * 8.2 + 2;
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  const issueLines = [report.period, report.academicYear ? `AY: ${report.academicYear}` : ''].filter(Boolean);
  if (issueLines.length) doc.text(issueLines.join('  |  '), pageWidth / 2, coverY, { align: 'center' });
  coverY += 7;
  if (report.tagline.trim()) {
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.5);
    doc.line(margin + 5, coverY, pageWidth - margin - 5, coverY);
    doc.setFont('times', 'bold');
    doc.setFontSize(12.5);
    const tagline = wrap(report.tagline, 'times', 'bold', 12.5, contentWidth - 18);
    tagline.slice(0, 2).forEach((line, index) => doc.text(line.toUpperCase(), pageWidth / 2, coverY + 6 + index * 5, { align: 'center' }));
    coverY += 10 + Math.max(0, tagline.length - 1) * 5;
    doc.setLineWidth(0.5);
    doc.line(margin + 5, coverY, pageWidth - margin - 5, coverY);
    coverY += 4;
  }
  if (report.collegeProfile.trim()) {
    const profileY = drawPanel('College Profile', report.collegeProfile, coverY, { fontSize: 7.7, lineHeight: 3.55, maxY: pageHeight - 13 });
    if (profileY === null) {
      addContentPage('College Profile');
      drawPanel('College Profile', report.collegeProfile, 42, { fontSize: 8.2, lineHeight: 4, maxY: pageHeight - 15 });
    }
  }

  // Department profile, vision, mission, HOD message, and editorial credits.
  const hasDepartmentFrontMatter = [report.departmentTagline, report.vision, report.mission, report.hodMessage, report.hodName, report.hodRole, report.editorialTeam].some(value => value.trim());
  if (hasDepartmentFrontMatter) {
    addContentPage('About Department');
    let aboutY = 43;
    if (report.departmentTagline.trim()) {
      doc.setFont('times', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(...gray);
      const departmentTagline = wrap(report.departmentTagline, 'times', 'italic', 11, contentWidth - 8);
      departmentTagline.slice(0, 2).forEach((line, index) => doc.text(line, pageWidth / 2, aboutY + index * 5.2, { align: 'center' }));
      aboutY += 8 + departmentTagline.length * 5;
    }
    let nextY = drawPanel('Vision of the Department', report.vision, aboutY);
    if (nextY === null) { addContentPage('About Department - Continued'); aboutY = 42; nextY = drawPanel('Vision of the Department', report.vision, aboutY); }
    aboutY = nextY ?? aboutY;
    nextY = drawPanel('Mission of the Department', report.mission, aboutY);
    if (nextY === null) { addContentPage('About Department - Continued'); aboutY = 42; nextY = drawPanel('Mission of the Department', report.mission, aboutY); }
    aboutY = nextY ?? aboutY;
    nextY = drawPanel('A Message from the Head of Department', report.hodMessage, aboutY, { fontSize: 8.4, lineHeight: 4 });
    if (nextY === null) { addContentPage('About Department - Continued'); aboutY = 42; nextY = drawPanel('A Message from the Head of Department', report.hodMessage, aboutY, { fontSize: 8.4, lineHeight: 4 }); }
    aboutY = nextY ?? aboutY;
    const signature = [report.hodName, report.hodRole].filter(Boolean).join('\n');
    if (signature) {
      const signatureLines = signature.split('\n');
      signatureLines.forEach((line, index) => {
        doc.setFont('times', index ? 'italic' : 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(...ink);
        doc.text(cleanPdfText(line), pageWidth - margin - 3, aboutY + index * 4, { align: 'right' });
      });
      aboutY += signatureLines.length * 4 + 3;
    }
    nextY = drawPanel('Editorial Team', report.editorialTeam, aboutY, { fontSize: 8, lineHeight: 3.7 });
    if (nextY === null && report.editorialTeam) {
      addContentPage('Editorial Team');
      drawPanel('Editorial Team', report.editorialTeam, 42, { fontSize: 8, lineHeight: 3.7 });
    }
  }

  const selectedCategories = categories.filter(category => events.some(event => event.category === category.id));
  for (const category of selectedCategories) {
    const selected = events.filter(event => event.category === category.id).sort((a, b) => a.order - b.order);
    addContentPage(category.name);
    let y = 42;

    if (category.id === 'students' || category.id === 'faculty') {
      const columns = 3;
      const gap = 3;
      const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
      let index = 0;
      while (index < selected.length) {
        const rowMetrics = selected.slice(index, index + columns).map(event => {
          const titleLines = wrap(event.name || 'Achievement', 'times', 'bold', 7.2, cardWidth - 8);
          const dateLines = event.date ? wrap(event.date, 'helvetica', 'normal', 6.3, cardWidth - 8) : [];
          const body = bodyWithoutRepeatedTitle(event.name, event.description);
          const bodyLines = body ? wrap(body, 'times', 'normal', 6.8, cardWidth - 8) : [];
          const imageColumns = event.images.length <= 1 ? 1 : 2;
          const imageRows = Math.ceil(event.images.length / imageColumns);
          const imageHeight = event.images.length ? (imageColumns === 1 ? 17 : 13) : 0;
          const imageBlockHeight = event.images.length ? imageRows * imageHeight + Math.max(0, imageRows - 1) * 1.5 : 0;
          const height = 5 + titleLines.length * 3.2 + (dateLines.length ? 1.5 + dateLines.length * 2.8 : 0) +
            (bodyLines.length ? 1.5 + bodyLines.length * 3.1 : 0) + (event.images.length ? 2.5 + imageBlockHeight : 0) + 5;
          return { event, titleLines, dateLines, bodyLines, imageColumns, imageRows, imageHeight, height };
        });
        const cardHeight = Math.max(55, ...rowMetrics.map(item => item.height));
        if (y + cardHeight > pageHeight - 16) {
          addContentPage(`${category.name} - Continued`);
          y = 42;
        }
        rowMetrics.forEach((item, column) => {
          const x = margin + column * (cardWidth + gap);
          const padding = 4;
          doc.setDrawColor(...rule);
          doc.setLineWidth(0.42);
          doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'S');
          let textY = y + 5.5;
          doc.setFont('times', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(...ink);
          item.titleLines.forEach(line => { doc.text(line, x + padding, textY); textY += 3.2; });
          if (item.dateLines.length) {
            textY += 0.7;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.3);
            doc.setTextColor(...gold);
            item.dateLines.forEach(line => { doc.text(line, x + padding, textY); textY += 2.8; });
          }
          if (item.bodyLines.length) {
            textY += 1;
            doc.setFont('times', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(...gray);
            item.bodyLines.forEach(line => { doc.text(line, x + padding, textY); textY += 3.1; });
          }
          if (item.event.images.length) {
            textY += 1;
            for (let imageIndex = 0; imageIndex < item.event.images.length; imageIndex += 1) {
              const rowIndex = Math.floor(imageIndex / item.imageColumns);
              const columnIndex = imageIndex % item.imageColumns;
              const imagesInRow = Math.min(item.imageColumns, item.event.images.length - rowIndex * item.imageColumns);
              const imageGap = 1.5;
              const imageWidth = (cardWidth - padding * 2 - imageGap * (imagesInRow - 1)) / imagesInRow;
              const rowStart = x + padding + (cardWidth - padding * 2 - (imageWidth * imagesInRow + imageGap * (imagesInRow - 1))) / 2;
              drawImageContained(item.event.images[imageIndex], rowStart + columnIndex * (imageWidth + imageGap), textY + rowIndex * (item.imageHeight + 1.5), imageWidth, item.imageHeight);
            }
          }
        });
        y += cardHeight + gap;
        index += columns;
      }
      continue;
    }

    if (category.id === 'placements' || /placement/i.test(category.name)) {
      const columns = 3;
      const gap = 4;
      const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
      let index = 0;
      while (index < selected.length) {
        const rowEvents = selected.slice(index, index + columns);
        const rowMetrics = rowEvents.map(event => {
          const detail = bodyWithoutRepeatedTitle(event.name, event.description);
          const titleLines = wrap(event.name || 'Placement', 'times', 'bold', 7.2, cardWidth - 8);
          const detailLines = wrap(detail, 'times', 'normal', 6.8, cardWidth - 8);
          return { event, titleLines, detailLines, detail };
        });
        const maxDetailLines = Math.max(0, ...rowMetrics.map(item => item.detailLines.length));
        const cardHeight = Math.max(57, 42 + maxDetailLines * 3.2);
        if (y + cardHeight > pageHeight - 16) {
          addContentPage(`${category.name} - Continued`);
          y = 42;
        }
        rowMetrics.forEach((item, column) => {
          const x = margin + column * (cardWidth + gap);
          doc.setDrawColor(...rule);
          doc.setLineWidth(0.45);
          doc.roundedRect(x, y, cardWidth, cardHeight, 2.8, 2.8, 'S');
          if (item.event.images[0]) drawImageContained(item.event.images[0], x + (cardWidth - 29) / 2, y + 4, 29, 31);
          const titleY = y + 39;
          doc.setFont('times', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(...ink);
          item.titleLines.forEach((line, lineIndex) => doc.text(line, x + cardWidth / 2, titleY + lineIndex * 3.2, { align: 'center' }));
          doc.setFont('times', 'normal');
          doc.setFontSize(6.8);
          doc.setTextColor(...gray);
          const detailY = titleY + item.titleLines.length * 3.2 + 1;
          item.detailLines.forEach((line, lineIndex) => doc.text(line, x + cardWidth / 2, detailY + lineIndex * 3.2, { align: 'center' }));
        });
        y += cardHeight + gap;
        index += columns;
      }
      continue;
    }

    for (const event of selected) {
      const cardX = margin + 1;
      const cardWidth = contentWidth - 2;
      const padding = 4.5;
      const innerWidth = cardWidth - padding * 2;
      const titleLines = wrap(event.name || 'Untitled event', 'times', 'bold', 9.2, innerWidth);
      const details = [event.date, event.time, event.venue, event.organizer].filter(Boolean).join('  |  ');
      const detailLines = details ? wrap(details, 'helvetica', 'normal', 6.8, innerWidth) : [];
      const body = bodyWithoutRepeatedTitle(event.name, event.description);
      const bodyLines = body ? wrap(body, 'times', 'normal', 7.8, innerWidth) : [];
      const imageColumns = event.images.length <= 1 ? 1 : event.images.length <= 4 ? 2 : 3;
      const imageRows = Math.ceil(event.images.length / imageColumns);
      const imageHeight = event.images.length ? (imageColumns === 1 ? 30 : imageColumns === 2 ? 25 : 19) : 0;
      const imageGaps = Math.max(0, imageRows - 1) * 2.5;
      const cardHeight = padding + titleLines.length * 4 + (detailLines.length ? 2.5 + detailLines.length * 2.9 : 0) +
        (bodyLines.length ? 2.5 + bodyLines.length * 3.35 : 0) + (event.images.length ? 3.5 + imageRows * imageHeight + imageGaps : 0) + padding;
      if (y + cardHeight > pageHeight - 15) {
        addContentPage(`${category.name} - Continued`);
        y = 42;
      }
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.48);
      doc.roundedRect(cardX, y, cardWidth, cardHeight, 2.2, 2.2, 'S');
      let textY = y + padding + 2;
      doc.setFont('times', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...ink);
      titleLines.forEach(line => { doc.text(line, cardX + padding, textY); textY += 4; });
      if (detailLines.length) {
        textY += 1;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...gold);
        detailLines.forEach(line => { doc.text(line, cardX + padding, textY); textY += 2.9; });
      }
      if (bodyLines.length) {
        textY += 1;
        doc.setFont('times', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(...gray);
        bodyLines.forEach(line => { doc.text(line, cardX + padding, textY); textY += 3.35; });
      }
      if (event.images.length) {
        textY += 2;
        const gap = 3;
        const visibleColumns = Math.min(imageColumns, event.images.length);
        const cellWidth = (innerWidth - gap * (visibleColumns - 1)) / visibleColumns;
        for (let imageIndex = 0; imageIndex < event.images.length; imageIndex += 1) {
          const rowIndex = Math.floor(imageIndex / imageColumns);
          const columnIndex = imageIndex % imageColumns;
          const imagesInRow = Math.min(imageColumns, event.images.length - rowIndex * imageColumns);
          const rowCellWidth = (innerWidth - gap * (imagesInRow - 1)) / imagesInRow;
          const rowStartX = cardX + padding + (innerWidth - (imagesInRow * rowCellWidth + (imagesInRow - 1) * gap)) / 2;
          const imageX = rowStartX + columnIndex * (rowCellWidth + gap);
          const maxImageWidth = Math.min(cellWidth, rowCellWidth);
          const imageY = textY + rowIndex * (imageHeight + 2.5);
          drawImageContained(event.images[imageIndex], imageX, imageY, maxImageWidth, imageHeight);
        }
      }
      y += cardHeight + 3.5;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawFooter(page, pageCount);
  }
  return doc.output('blob');
}
