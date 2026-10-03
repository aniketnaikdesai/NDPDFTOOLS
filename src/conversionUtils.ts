import * as XLSX from 'xlsx';
// @ts-ignore
import mammoth from 'mammoth';
import html2canvas from 'html2canvas';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  ExcelSheetInfo,
  ExcelConvertOptions,
  DocxConvertOptions,
  ImageConvertOptions,
  BlankPdfOptions,
} from './types';

// Page size constants in points (72 points = 1 inch)
const PAGE_DIMENSIONS = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

/**
 * Parses an Excel or CSV file and extracts sheet metadata and sample preview rows.
 */
export async function parseExcelWorkbook(
  file: File
): Promise<{ workbook: XLSX.WorkBook; sheets: ExcelSheetInfo[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const sheets: ExcelSheetInfo[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    // Convert to 2D array of rows
    const rawData = (XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as (string | number)[][]) || [];

    const rowCount = rawData.length;
    let maxCols = 0;
    for (const row of rawData) {
      if (Array.isArray(row) && row.length > maxCols) {
        maxCols = row.length;
      }
    }

    // Take top 5 rows for quick live preview
    const previewRows = rawData.slice(0, 5).map((row) =>
      row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : ''))
    );

    return {
      name: sheetName,
      rowCount,
      colCount: maxCols,
      previewRows,
    };
  });

  return { workbook, sheets };
}

/**
 * Converts selected sheets of an Excel workbook to a compiled PDF document Uint8Array.
 */
export async function convertExcelToPdf(
  file: File,
  options: ExcelConvertOptions,
  onProgress?: (progressText: string, percent: number) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const pdfDoc = await PDFDocument.create();

  const baseDims = PAGE_DIMENSIONS[options.pageSize || 'letter'];
  const isLandscape = options.orientation === 'landscape';
  const pageWidth = isLandscape ? baseDims.height : baseDims.width;
  const pageHeight = isLandscape ? baseDims.width : baseDims.height;

  const selectedSheetNames = options.selectedSheets.length > 0
    ? options.selectedSheets
    : workbook.SheetNames.slice(0, 1);

  // Hidden container for HTML rendering
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = isLandscape ? '1100px' : '820px';
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#0F172A';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.padding = '0';
  container.style.margin = '0';
  document.body.appendChild(container);

  try {
    let sheetIndex = 0;
    for (const sheetName of selectedSheetNames) {
      sheetIndex++;
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const rawData = (XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as (string | number)[][]) || [];

      if (rawData.length === 0) {
        // Empty sheet, add a blank page with title
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawText(`${file.name} - ${sheetName} (Empty Sheet)`, {
          x: 40,
          y: pageHeight - 50,
          size: 14,
          color: rgb(0.2, 0.2, 0.2),
        });
        continue;
      }

      // Determine header row and content rows
      const headerRow = rawData[0] || [];
      const contentRows = rawData.slice(1);

      // Rows per page based on orientation
      const rowsPerPage = isLandscape ? 22 : 32;
      const totalPagesForSheet = Math.max(1, Math.ceil(contentRows.length / rowsPerPage));

      for (let p = 0; p < totalPagesForSheet; p++) {
        const pagePercent = Math.round(((sheetIndex - 1 + (p + 1) / totalPagesForSheet) / selectedSheetNames.length) * 100);
        onProgress?.(`Rendering ${sheetName} (Page ${p + 1} of ${totalPagesForSheet})...`, pagePercent);

        const currentChunkRows = contentRows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);

        // Build HTML table for this chunk
        container.innerHTML = `
          <div style="padding: 32px 36px; box-sizing: border-box; background: #ffffff; min-height: ${isLandscape ? '700px' : '1020px'}; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px;">
                <div>
                  <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">${escapeHtml(sheetName)}</h1>
                  <span style="font-size: 11px; color: #64748b; margin-top: 2px; display: block;">Source: ${escapeHtml(file.name)}</span>
                </div>
                <div style="font-size: 11px; font-weight: 600; color: #64748b; font-variant-numeric: tabular-nums;">
                  Page ${p + 1} of ${totalPagesForSheet}
                </div>
              </div>

              <div style="overflow-x: auto; width: 100%;">
                <table style="width: 100%; border-collapse: collapse; font-size: ${options.fontSize || 10}px; text-align: left;">
                  <thead>
                    <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #cbd5e1;">
                      <th style="padding: 6px 8px; width: 34px; color: #64748b; font-weight: 600; border: 1px solid #e2e8f0; text-align: center;">#</th>
                      ${headerRow
                        .map(
                          (col) =>
                            `<th style="padding: 6px 10px; font-weight: 600; color: #1e293b; border: 1px solid #e2e8f0; white-space: nowrap;">${escapeHtml(
                              String(col)
                            )}</th>`
                        )
                        .join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${currentChunkRows
                      .map((row, rIdx) => {
                        const actualRowIndex = p * rowsPerPage + rIdx + 2;
                        const bg = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
                        return `
                        <tr style="background-color: ${bg};">
                          <td style="padding: 5px 8px; color: #94a3b8; font-weight: 500; border: 1px solid #e2e8f0; text-align: center; font-variant-numeric: tabular-nums;">${actualRowIndex}</td>
                          ${headerRow
                            .map((_, cIdx) => {
                              const cellValue = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : '';
                              const isNumeric = cellValue.trim() !== '' && !isNaN(Number(cellValue.replace(/[$,%]/g, '')));
                              return `<td style="padding: 5px 10px; border: 1px solid #e2e8f0; color: #334155; ${
                                isNumeric ? 'text-align: right; font-variant-numeric: tabular-nums;' : ''
                              }">${escapeHtml(cellValue)}</td>`;
                            })
                            .join('')}
                        </tr>
                      `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;">
              <span>Generated with ND PDF Studio</span>
              <span>${sheetName} · Rows ${p * rowsPerPage + 1}-${Math.min(contentRows.length, (p + 1) * rowsPerPage)} of ${contentRows.length}</span>
            </div>
          </div>
        `;

        // Render HTML chunk to high-res canvas (scale: 2 for sharp text)
        const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#FFFFFF',
          logging: false,
        });

        const imgDataUrl = canvas.toDataURL('image/png');
        const imgBytes = await fetch(imgDataUrl).then((res) => res.arrayBuffer());
        const embeddedImage = await pdfDoc.embedPng(imgBytes);

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });
      }
    }

    onProgress?.('Finalizing PDF...', 100);
    return await pdfDoc.save();
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Converts a Word document (.docx) to a compiled PDF document Uint8Array.
 */
export async function convertDocxToPdf(
  file: File,
  options?: DocxConvertOptions,
  onProgress?: (progressText: string, percent: number) => void
): Promise<Uint8Array> {
  onProgress?.('Extracting document contents from Word...', 20);
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const rawHtml = result.value;

  const pdfDoc = await PDFDocument.create();
  const baseDims = PAGE_DIMENSIONS[options?.pageSize || 'letter'];
  const isLandscape = options?.orientation === 'landscape';
  const pageWidth = isLandscape ? baseDims.height : baseDims.width;
  const pageHeight = isLandscape ? baseDims.width : baseDims.height;

  // Render container in offscreen DOM
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = isLandscape ? '1050px' : '800px';
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#1e293b';
  container.style.fontFamily = 'Georgia, Cambria, "Times New Roman", Times, serif';
  container.style.padding = '0';
  container.style.margin = '0';
  document.body.appendChild(container);

  try {
    onProgress?.('Styling document pages...', 40);

    // Create a temporary parser to chunk long articles into discrete page heights
    const docWrapper = document.createElement('div');
    docWrapper.style.padding = '44px 50px';
    docWrapper.style.boxSizing = 'border-box';
    docWrapper.style.lineHeight = '1.65';
    docWrapper.style.fontSize = '14px';
    docWrapper.style.color = '#1e293b';
    docWrapper.innerHTML = `
      <style>
        h1 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
        h2 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 18px; font-weight: 600; color: #1e293b; margin-top: 18px; margin-bottom: 8px; }
        h3 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 15px; font-weight: 600; color: #334155; margin-top: 14px; margin-bottom: 6px; }
        p { margin-top: 0; margin-bottom: 12px; text-align: justify; }
        ul, ol { margin-top: 0; margin-bottom: 12px; padding-left: 24px; }
        li { margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; font-family: sans-serif; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 10px; }
        th { background-color: #f1f5f9; font-weight: 600; text-align: left; }
        blockquote { border-left: 3px solid #3b82f6; margin: 12px 0; padding-left: 14px; color: #475569; font-style: italic; }
      </style>
      <div id="docx-inner-content">${rawHtml || '<p><em>(Empty document)</em></p>'}</div>
    `;

    container.appendChild(docWrapper);

    // Paginate by height: approximate page height in pixels
    const maxPagePixelHeight = isLandscape ? 720 : 1000;
    const contentNode = docWrapper.querySelector('#docx-inner-content') as HTMLElement;
    const children = Array.from(contentNode.children) as HTMLElement[];

    const pageBuckets: HTMLElement[][] = [[]];
    let currentBucketHeight = 0;

    for (const child of children) {
      const childHeight = child.offsetHeight || 30;
      if (currentBucketHeight + childHeight > maxPagePixelHeight && pageBuckets[pageBuckets.length - 1].length > 0) {
        pageBuckets.push([child]);
        currentBucketHeight = childHeight;
      } else {
        pageBuckets[pageBuckets.length - 1].push(child);
        currentBucketHeight += childHeight;
      }
    }

    const totalPages = Math.max(1, pageBuckets.length);

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const percent = Math.round(40 + ((pIdx + 1) / totalPages) * 55);
      onProgress?.(`Rendering Word document page ${pIdx + 1} of ${totalPages}...`, percent);

      const pageBucket = pageBuckets[pIdx];
      const pageWrapper = document.createElement('div');
      pageWrapper.style.width = isLandscape ? '1050px' : '800px';
      pageWrapper.style.height = isLandscape ? '740px' : '1035px';
      pageWrapper.style.boxSizing = 'border-box';
      pageWrapper.style.padding = '44px 50px 30px 50px';
      pageWrapper.style.backgroundColor = '#FFFFFF';
      pageWrapper.style.display = 'flex';
      pageWrapper.style.flexDirection = 'column';
      pageWrapper.style.justifyContent = 'space-between';

      const contentHolder = document.createElement('div');
      contentHolder.style.flex = '1';
      contentHolder.style.lineHeight = '1.65';
      contentHolder.style.fontSize = '14px';

      // Insert styles and elements
      contentHolder.innerHTML = `
        <style>
          h1 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
          h2 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 18px; font-weight: 600; color: #1e293b; margin-top: 18px; margin-bottom: 8px; }
          h3 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 15px; font-weight: 600; color: #334155; margin-top: 14px; margin-bottom: 6px; }
          p { margin-top: 0; margin-bottom: 12px; text-align: justify; }
          ul, ol { margin-top: 0; margin-bottom: 12px; padding-left: 24px; }
          li { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; font-family: sans-serif; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 10px; }
          th { background-color: #f1f5f9; font-weight: 600; text-align: left; }
          blockquote { border-left: 3px solid #3b82f6; margin: 12px 0; padding-left: 14px; color: #475569; font-style: italic; }
        </style>
      `;

      if (pageBucket && pageBucket.length > 0) {
        for (const el of pageBucket) {
          contentHolder.appendChild(el.cloneNode(true));
        }
      } else {
        contentHolder.innerHTML += '<p><em>(Empty page)</em></p>';
      }

      const footer = document.createElement('div');
      footer.style.borderTop = '1px solid #e2e8f0';
      footer.style.paddingTop = '8px';
      footer.style.marginTop = '16px';
      footer.style.display = 'flex';
      footer.style.justifyContent = 'space-between';
      footer.style.fontSize = '10px';
      footer.style.color = '#94a3b8';
      footer.style.fontFamily = 'sans-serif';
      footer.innerHTML = `
        <span>${escapeHtml(file.name.replace(/\.docx?$/i, ''))}</span>
        <span style="font-variant-numeric: tabular-nums;">Page ${pIdx + 1} of ${totalPages}</span>
      `;

      pageWrapper.appendChild(contentHolder);
      pageWrapper.appendChild(footer);

      container.innerHTML = '';
      container.appendChild(pageWrapper);

      const canvas = await html2canvas(pageWrapper, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false,
      });

      const imgDataUrl = canvas.toDataURL('image/png');
      const imgBytes = await fetch(imgDataUrl).then((res) => res.arrayBuffer());
      const embeddedImage = await pdfDoc.embedPng(imgBytes);

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    }

    onProgress?.('Finalizing PDF...', 100);
    return await pdfDoc.save();
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Converts one or more image files (PNG, JPG, WEBP, SVG) into a compiled PDF.
 */
export async function convertImagesToPdf(
  files: File[],
  options?: ImageConvertOptions,
  onProgress?: (progressText: string, percent: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const baseDims = PAGE_DIMENSIONS[options?.pageSize || 'letter'];

  let index = 0;
  for (const file of files) {
    index++;
    const percent = Math.round((index / files.length) * 100);
    onProgress?.(`Processing image ${index} of ${files.length} (${file.name})...`, percent);

    // Read image using an Image element to get natural dimensions and handle all formats
    const dataUrl = await readFileAsDataUrl(file);
    const imgObj = await loadImage(dataUrl);

    const naturalWidth = imgObj.naturalWidth || 800;
    const naturalHeight = imgObj.naturalHeight || 600;
    const isImageLandscape = naturalWidth > naturalHeight;

    let useLandscape = false;
    if (options?.orientation === 'landscape') {
      useLandscape = true;
    } else if (options?.orientation === 'auto') {
      useLandscape = isImageLandscape;
    }

    const pageWidth = useLandscape ? baseDims.height : baseDims.width;
    const pageHeight = useLandscape ? baseDims.width : baseDims.height;

    // Convert image to PNG bytes via canvas to ensure full compatibility
    const canvas = document.createElement('canvas');
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.drawImage(imgObj, 0, 0);
    const pngDataUrl = canvas.toDataURL('image/png');
    const pngBytes = await fetch(pngDataUrl).then((r) => r.arrayBuffer());
    const embeddedImage = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Calculate dimensions based on placement
    const margin = options?.placement === 'fill' ? 0 : 36; // 0.5 inch margin for 'fit'
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;

    if (options?.placement === 'fill') {
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } else {
      // 'fit' preserving aspect ratio
      const scaleX = availableWidth / naturalWidth;
      const scaleY = availableHeight / naturalHeight;
      const scale = Math.min(scaleX, scaleY);

      const renderWidth = naturalWidth * scale;
      const renderHeight = naturalHeight * scale;

      const posX = margin + (availableWidth - renderWidth) / 2;
      const posY = margin + (availableHeight - renderHeight) / 2;

      page.drawImage(embeddedImage, {
        x: posX,
        y: posY,
        width: renderWidth,
        height: renderHeight,
      });
    }
  }

  onProgress?.('Finalizing PDF...', 100);
  return await pdfDoc.save();
}

/**
 * Creates a blank PDF with configurable page counts, orientation, and subtle note templates.
 */
export async function createBlankPdf(options: BlankPdfOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const baseDims = PAGE_DIMENSIONS[options.pageSize || 'letter'];
  const isLandscape = options.orientation === 'landscape';
  const pageWidth = isLandscape ? baseDims.height : baseDims.width;
  const pageHeight = isLandscape ? baseDims.width : baseDims.height;

  const count = Math.max(1, Math.min(50, options.pageCount || 1));

  for (let i = 0; i < count; i++) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Draw background guide templates if selected
    if (options.template === 'ruled') {
      const lineSpacing = 28;
      const topMargin = 72;
      const bottomMargin = 50;
      const leftMargin = 50;
      const rightMargin = 50;

      for (let y = bottomMargin; y < pageHeight - topMargin; y += lineSpacing) {
        page.drawLine({
          start: { x: leftMargin, y },
          end: { x: pageWidth - rightMargin, y },
          thickness: 0.5,
          color: rgb(0.85, 0.88, 0.92),
        });
      }

      // Margin line on the left
      page.drawLine({
        start: { x: leftMargin + 30, y: bottomMargin },
        end: { x: leftMargin + 30, y: pageHeight - topMargin + 10 },
        thickness: 0.8,
        color: rgb(0.95, 0.75, 0.75),
      });
    } else if (options.template === 'grid') {
      const gridSize = 20;
      const margin = 40;

      for (let x = margin; x <= pageWidth - margin; x += gridSize) {
        page.drawLine({
          start: { x, y: margin },
          end: { x, y: pageHeight - margin },
          thickness: 0.3,
          color: rgb(0.88, 0.9, 0.94),
        });
      }

      for (let y = margin; y <= pageHeight - margin; y += gridSize) {
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.3,
          color: rgb(0.88, 0.9, 0.94),
        });
      }
    } else if (options.template === 'dots') {
      const dotSpacing = 22;
      const margin = 44;

      for (let x = margin; x <= pageWidth - margin; x += dotSpacing) {
        for (let y = margin; y <= pageHeight - margin; y += dotSpacing) {
          page.drawCircle({
            x,
            y,
            size: 0.75,
            color: rgb(0.75, 0.8, 0.88),
          });
        }
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper to read a File as Data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Helper to load an HTML Image
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
