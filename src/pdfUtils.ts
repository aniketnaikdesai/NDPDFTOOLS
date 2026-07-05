import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import PDFWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';
import { PDFDocument, degrees, PDFName, rgb, StandardFonts } from 'pdf-lib';
import { PDFPageItem, SourceFile, CompressionSettings, CropArea } from './types';

// Set up the PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorker();
} catch (e) {
  console.error('Failed to initialize PDF.js workerPort, falling back', e);
}

/**
 * Loads a PDF file and extracts its basic page information and renders thumbnails.
 * Progress callback is used to update loading status for larger PDFs.
 */
export async function loadPdfPages(
  file: File,
  sourceFileId: string,
  onProgress?: (progress: number) => void
): Promise<{ sourceFile: SourceFile; pages: PDFPageItem[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const sourceFile: SourceFile = {
    id: sourceFileId,
    name: file.name,
    size: file.size,
    arrayBuffer,
  };

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
  
  // Track loading progress if provided
  loadingTask.onProgress = (progressData) => {
    if (onProgress && progressData.total > 0) {
      onProgress(Math.round((progressData.loaded / progressData.total) * 100));
    }
  };

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pages: PDFPageItem[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });

    // Generate a unique ID for each page to preserve React state during reordering
    const pageId = `${sourceFileId}-p-${i}-${Math.random().toString(36).substring(2, 9)}`;

    pages.push({
      id: pageId,
      sourceFileId,
      originalIndex: i - 1, // 0-based page index
      rotation: 0, // initially 0 rotation
      thumbnailUrl: null, // will render asynchronously
      width: viewport.width,
      height: viewport.height,
    });
  }

  return { sourceFile, pages };
}

/**
 * Renders a specific page to a thumbnail data URL.
 */
export async function renderPageThumbnail(
  sourceFile: SourceFile,
  originalIndex: number,
  targetWidth = 180,
  crop?: CropArea
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: sourceFile.arrayBuffer.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(originalIndex + 1);
  
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = targetWidth / viewport.width;
  const thumbViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = thumbViewport.width;
  canvas.height = thumbViewport.height;
  
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create 2D canvas context');
  }

  // Draw white background (especially useful for transparent pages)
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (crop) {
    const cropX = crop.x * canvas.width;
    const cropY = crop.y * canvas.height;
    const cropW = crop.width * canvas.width;
    const cropH = crop.height * canvas.height;
    context.beginPath();
    context.rect(cropX, cropY, cropW, cropH);
    context.clip();
  }

  await page.render({
    canvasContext: context,
    viewport: thumbViewport,
    canvas: canvas,
  } as any).promise;

  const url = canvas.toDataURL('image/jpeg', 0.8);
  
  // Clean up PDF.js structures
  await (pdfDoc as any).destroy?.();
  
  return url;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
    const g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
    const b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
    return { r, g, b };
  } else if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    return { r, g, b };
  }
  return null;
}

/**
 * Draws page borders, custom lines, and text annotations on a PDF page.
 */
async function drawDecorations(page: any, destPdf: any, pageItem: PDFPageItem) {
  const width = page.getWidth();
  const height = page.getHeight();

  // 1. Draw page border if enabled
  if (pageItem.border && pageItem.border.enabled) {
    const border = pageItem.border;
    const bColor = hexToRgb(border.color) || { r: 0, g: 0, b: 0 };
    const pdfColor = rgb(bColor.r, bColor.g, bColor.b);
    const thickness = border.thickness || 2;
    const style = border.style || 'continuous';
    const margin = 10;

    const drawLineStyle = (startX: number, startY: number, endX: number, endY: number) => {
      if (style === 'continuous') {
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: pdfColor,
        });
      } else if (style === 'dash') {
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: pdfColor,
          dashArray: [8, 4],
        });
      } else if (style === 'dotted') {
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: pdfColor,
          dashArray: [2, 4],
        });
      } else if (style === 'wavy') {
        const amplitude = thickness * 1.5;
        const frequency = 6;
        const step = 2;
        let prevX = startX;
        let prevY = startY;

        if (startY === endY) {
          // Horizontal line
          for (let x = startX + step; x <= endX; x += step) {
            const waveY = startY + amplitude * Math.sin((x - startX) / frequency);
            page.drawLine({
              start: { x: prevX, y: prevY },
              end: { x, y: waveY },
              thickness,
              color: pdfColor,
            });
            prevX = x;
            prevY = waveY;
          }
        } else {
          // Vertical line
          for (let y = startY + step; y <= endY; y += step) {
            const waveX = startX + amplitude * Math.sin((y - startY) / frequency);
            page.drawLine({
              start: { x: prevX, y: prevY },
              end: { x: waveX, y },
              thickness,
              color: pdfColor,
            });
            prevX = waveX;
            prevY = y;
          }
        }
      }
    };

    // Draw top edge
    drawLineStyle(margin, height - margin, width - margin, height - margin);
    // Draw bottom edge
    drawLineStyle(margin, margin, width - margin, margin);
    // Draw left edge
    drawLineStyle(margin, margin, margin, height - margin);
    // Draw right edge
    drawLineStyle(width - margin, margin, width - margin, height - margin);
  }

  // 2. Draw lines if enabled
  if (pageItem.lines && pageItem.lines.length > 0) {
    for (const line of pageItem.lines) {
      const lColor = hexToRgb(line.color) || { r: 0, g: 0, b: 0 };
      const pdfColor = rgb(lColor.r, lColor.g, lColor.b);
      const thickness = line.thickness || 2;
      const style = line.style || 'continuous';

      let startX = 0;
      let startY = 0;
      let endX = 0;
      let endY = 0;

      if (line.orientation === 'horizontal') {
        const pdfY = (1 - line.position) * height;
        startX = (line.start !== undefined ? line.start : 0) * width;
        startY = pdfY;
        endX = (line.end !== undefined ? line.end : 1) * width;
        endY = pdfY;
      } else {
        const pdfX = line.position * width;
        startX = pdfX;
        startY = (1 - (line.end !== undefined ? line.end : 1)) * height;
        endX = pdfX;
        endY = (1 - (line.start !== undefined ? line.start : 0)) * height;
      }

      if (style === 'continuous') {
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: pdfColor,
        });
      } else if (style === 'dash') {
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: pdfColor,
          dashArray: [8, 4],
        });
      } else if (style === 'dotted') {
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness,
          color: pdfColor,
          dashArray: [2, 4],
        });
      } else if (style === 'wavy') {
        const amplitude = thickness * 1.5;
        const frequency = 6;
        const step = 2;
        let prevX = startX;
        let prevY = startY;

        if (line.orientation === 'horizontal') {
          for (let x = startX + step; x <= endX; x += step) {
            const waveY = startY + amplitude * Math.sin((x - startX) / frequency);
            page.drawLine({
              start: { x: prevX, y: prevY },
              end: { x, y: waveY },
              thickness,
              color: pdfColor,
            });
            prevX = x;
            prevY = waveY;
          }
        } else {
          for (let y = startY + step; y <= endY; y += step) {
            const waveX = startX + amplitude * Math.sin((y - startY) / frequency);
            page.drawLine({
              start: { x: prevX, y: prevY },
              end: { x: waveX, y },
              thickness,
              color: pdfColor,
            });
            prevX = waveX;
            prevY = y;
          }
        }
      }
    }
  }

  // 3. Draw text annotations
  await drawAnnotations(page, destPdf, pageItem.textAnnotations);
}

/**
 * Draws text annotations on a given PDFPage.
 */
async function drawAnnotations(page: any, destPdf: any, annotations?: any[]) {
  if (!annotations || annotations.length === 0) return;
  const helveticaFont = await destPdf.embedFont(StandardFonts.Helvetica);
  const width = page.getWidth();
  const height = page.getHeight();
  
  for (const ann of annotations) {
    // Coordinate conversion:
    // Screen top-left (0,0) relative ratio to PDF bottom-left (0,0)
    let pdfX = ann.x * width;
    const pdfY = (1 - ann.y) * height;
    
    // Calculate text width for alignment
    const textWidth = helveticaFont.widthOfTextAtSize(ann.text || '', ann.fontSize);
    const align = ann.alignment || 'center'; // Default to center for existing/new ones if not specified
    
    if (align === 'center') {
      pdfX = pdfX - (textWidth / 2);
    } else if (align === 'right') {
      pdfX = pdfX - textWidth;
    }
    
    const padX = ann.fontSize * 0.25;
    const padY = ann.fontSize * 0.15;
    
    // Draw background rectangle if not transparent
    if (ann.backgroundColor && ann.backgroundColor !== 'transparent') {
      const bgRgb = hexToRgb(ann.backgroundColor) || { r: 1, g: 1, b: 1 };
      page.drawRectangle({
        x: pdfX - padX,
        y: pdfY - (ann.fontSize * 0.5) - padY,
        width: textWidth + (padX * 2),
        height: ann.fontSize + (padY * 2),
        color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
      });
    }
    
    // Draw text with a custom or black color
    const textRgb = ann.color ? (hexToRgb(ann.color) || { r: 0, g: 0, b: 0 }) : { r: 0, g: 0, b: 0 };
    page.drawText(ann.text || '', {
      x: pdfX,
      y: pdfY - (ann.fontSize * 0.4), // Adjust baseline alignment to vertical center of text bounding box
      size: ann.fontSize,
      font: helveticaFont,
      color: rgb(textRgb.r, textRgb.g, textRgb.b),
    });
  }
}

/**
 * Generates the compiled PDF file.
 */
export async function compilePdf(
  sourceFiles: Record<string, SourceFile>,
  pages: PDFPageItem[],
  settings: CompressionSettings,
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  // Create output document
  const destPdf = await PDFDocument.create();
  
  if (settings.stripMetadata) {
    destPdf.setProducer('PDF Compressor & Editor App');
    destPdf.setCreator('PDF Compressor & Editor App');
    destPdf.setTitle('Edited Document');
    destPdf.setAuthor('');
    destPdf.setSubject('');
    destPdf.setKeywords([]);
  }

  const totalPages = pages.length;

  for (let i = 0; i < totalPages; i++) {
    const pageItem = pages[i];
    
    if (pageItem.sourceFileId === 'blank') {
      if (onProgress) {
        onProgress(i + 1, totalPages);
      }
      const originalWidth = pageItem.width || 612;
      const originalHeight = pageItem.height || 792;
      const newPage = destPdf.addPage([originalWidth, originalHeight]);
      if (pageItem.rotation !== 0) {
        newPage.setRotation(degrees(pageItem.rotation));
      }
      await drawDecorations(newPage, destPdf, pageItem);
      continue;
    }

    const sourceFile = sourceFiles[pageItem.sourceFileId];
    if (!sourceFile) continue;

    if (onProgress) {
      onProgress(i + 1, totalPages);
    }

    if (settings.compressImages) {
      // Flattening Compression Mode:
      // Render page to a canvas at a high resolution (DPI-scaled) and compress as JPEG
      const loadingTask = pdfjsLib.getDocument({ data: sourceFile.arrayBuffer.slice(0) });
      const pdfDoc = await loadingTask.promise;
      const page = await pdfDoc.getPage(pageItem.originalIndex + 1);

      // 72 standard points per inch in PDF.js
      const scale = settings.dpi / 72;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (pageItem.crop) {
          const cropX = pageItem.crop.x * canvas.width;
          const cropY = pageItem.crop.y * canvas.height;
          const cropW = pageItem.crop.width * canvas.width;
          const cropH = pageItem.crop.height * canvas.height;
          context.beginPath();
          context.rect(cropX, cropY, cropW, cropH);
          context.clip();
        }

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        } as any).promise;

        const jpegDataUrl = canvas.toDataURL('image/jpeg', settings.imageQuality);
        const base64Data = jpegDataUrl.split(',')[1];
        const imgBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

        const img = await destPdf.embedJpg(imgBytes);

        // Calculate original width/height depending on page orientation
        // PDFJS pre-rotates the viewport, but we can stick to original width/height values
        const originalWidth = pageItem.width;
        const originalHeight = pageItem.height;

        const newPage = destPdf.addPage([originalWidth, originalHeight]);
        
        // Draw the image onto the page, fitting perfectly
        newPage.drawImage(img, {
          x: 0,
          y: 0,
          width: originalWidth,
          height: originalHeight,
        });

        // Apply manual rotation if any
        if (pageItem.rotation !== 0) {
          newPage.setRotation(degrees(pageItem.rotation));
        }
        await drawDecorations(newPage, destPdf, pageItem);
      }
      await (pdfDoc as any).destroy?.();
    } else {
      // Vector Mode / Fast Reorganization Mode (no re-compression of image contents):
      // Copy the original page structures directly to preserve vector paths and selectable text
      const srcPdfDoc = await PDFDocument.load(sourceFile.arrayBuffer);
      const [copiedPage] = await destPdf.copyPages(srcPdfDoc, [pageItem.originalIndex]);
      
      // Remove hyperlinks/annotations if selected
      if (settings.removeHyperlinks) {
        try {
          const pageNode = copiedPage.node as any;
          if (typeof pageNode.delete === 'function') {
            pageNode.delete(PDFName.of('Annots'));
          } else if (typeof pageNode.remove === 'function') {
            pageNode.remove(PDFName.of('Annots'));
          }
        } catch (e) {
          console.error('Failed to remove hyperlinks/annotations:', e);
        }
      }

      if (pageItem.crop) {
        const originalWidth = pageItem.width;
        const originalHeight = pageItem.height;
        
        const pdfX = pageItem.crop.x * originalWidth;
        const pdfY = (1 - (pageItem.crop.y + pageItem.crop.height)) * originalHeight;
        const pdfW = pageItem.crop.width * originalWidth;
        const pdfH = pageItem.crop.height * originalHeight;
        
        copiedPage.setCropBox(pdfX, pdfY, pdfW, pdfH);
        
        const embeddedPage = await destPdf.embedPage(copiedPage);
        const newPage = destPdf.addPage([originalWidth, originalHeight]);
        
        newPage.drawPage(embeddedPage, {
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH,
        });
        
        if (pageItem.rotation !== 0) {
          const currentRotation = copiedPage.getRotation().angle;
          newPage.setRotation(degrees((currentRotation + pageItem.rotation) % 360));
        }
        await drawDecorations(newPage, destPdf, pageItem);
      } else {
        destPdf.addPage(copiedPage);

        // Apply cumulative rotation (original + manual changes)
        if (pageItem.rotation !== 0) {
          // pdf-lib's setRotation takes degrees.
          const currentRotation = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees((currentRotation + pageItem.rotation) % 360));
        }
        await drawDecorations(copiedPage, destPdf, pageItem);
      }
    }
  }

  // Save the PDF bytes
  return await destPdf.save({
    useObjectStreams: true,
  });
}

/**
 * Renders an individual PDF page or blank canvas to a high-quality PNG or JPEG image.
 * Applies any manual rotation and draws user-added text annotations.
 */
export async function exportPageToImage(
  sourceFile: SourceFile | null,
  pageItem: PDFPageItem,
  scale = 2.0,
  format: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<string> {
  const rotation = pageItem.rotation % 360;
  const isSwapped = rotation === 90 || rotation === 270;
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create 2D canvas context');
  }

  let viewportWidth = pageItem.width;
  let viewportHeight = pageItem.height;

  // Render the PDF page content first (if there's a source file)
  if (pageItem.sourceFileId !== 'blank' && sourceFile) {
    const loadingTask = pdfjsLib.getDocument({ data: sourceFile.arrayBuffer.slice(0) });
    const pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(pageItem.originalIndex + 1);
    
    const viewport = page.getViewport({ scale });
    viewportWidth = viewport.width;
    viewportHeight = viewport.height;

    // Determine rotated canvas size
    canvas.width = isSwapped ? viewport.height : viewport.width;
    canvas.height = isSwapped ? viewport.width : viewport.height;

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    // Rotate canvas context
    if (rotation === 90) {
      context.translate(canvas.width, 0);
    } else if (rotation === 180) {
      context.translate(canvas.width, canvas.height);
    } else if (rotation === 270) {
      context.translate(0, canvas.height);
    }
    context.rotate((rotation * Math.PI) / 180);

    if (pageItem.crop) {
      const cropX = pageItem.crop.x * viewport.width;
      const cropY = pageItem.crop.y * viewport.height;
      const cropW = pageItem.crop.width * viewport.width;
      const cropH = pageItem.crop.height * viewport.height;
      context.beginPath();
      context.rect(cropX, cropY, cropW, cropH);
      context.clip();
    }

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    } as any).promise;
    
    context.restore();
    await (pdfDoc as any).destroy?.();
  } else {
    // Blank page
    const scaledWidth = pageItem.width * scale;
    const scaledHeight = pageItem.height * scale;
    viewportWidth = scaledWidth;
    viewportHeight = scaledHeight;

    canvas.width = isSwapped ? scaledHeight : scaledWidth;
    canvas.height = isSwapped ? scaledWidth : scaledHeight;

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw annotations on top
  context.save();
  if (rotation === 90) {
    context.translate(canvas.width, 0);
  } else if (rotation === 180) {
    context.translate(canvas.width, canvas.height);
  } else if (rotation === 270) {
    context.translate(0, canvas.height);
  }
  context.rotate((rotation * Math.PI) / 180);

  if (pageItem.crop) {
    const cropX = pageItem.crop.x * viewportWidth;
    const cropY = pageItem.crop.y * viewportHeight;
    const cropW = pageItem.crop.width * viewportWidth;
    const cropH = pageItem.crop.height * viewportHeight;
    context.beginPath();
    context.rect(cropX, cropY, cropW, cropH);
    context.clip();
  }

  // Draw page border if enabled on HTML Canvas
  if (pageItem.border && pageItem.border.enabled) {
    const border = pageItem.border;
    const thickness = (border.thickness || 2) * (viewportWidth / pageItem.width);
    context.strokeStyle = border.color || '#000000';
    context.lineWidth = thickness;
    
    if (border.style === 'dash') {
      context.setLineDash([8, 4]);
    } else if (border.style === 'dotted') {
      context.setLineDash([2, 4]);
    } else {
      context.setLineDash([]);
    }
    
    const margin = 10 * (viewportWidth / pageItem.width);
    
    if (border.style === 'wavy') {
      const drawWavyLine = (x1: number, y1: number, x2: number, y2: number) => {
        const amplitude = thickness * 1.5;
        const frequency = 6 * (viewportWidth / pageItem.width);
        context.beginPath();
        context.moveTo(x1, y1);
        
        if (y1 === y2) {
          for (let x = x1; x <= x2; x += 2) {
            const waveY = y1 + amplitude * Math.sin((x - x1) / frequency);
            context.lineTo(x, waveY);
          }
        } else {
          for (let y = y1; y <= y2; y += 2) {
            const waveX = x1 + amplitude * Math.sin((y - y1) / frequency);
            context.lineTo(waveX, y);
          }
        }
        context.stroke();
      };
      
      drawWavyLine(margin, margin, viewportWidth - margin, margin);
      drawWavyLine(margin, viewportHeight - margin, viewportWidth - margin, viewportHeight - margin);
      drawWavyLine(margin, margin, margin, viewportHeight - margin);
      drawWavyLine(viewportWidth - margin, margin, viewportWidth - margin, viewportHeight - margin);
    } else {
      context.beginPath();
      context.rect(margin, margin, viewportWidth - margin * 2, viewportHeight - margin * 2);
      context.stroke();
    }
    context.setLineDash([]);
  }

  // Draw lines if enabled on HTML Canvas
  if (pageItem.lines && pageItem.lines.length > 0) {
    for (const line of pageItem.lines) {
      const thickness = (line.thickness || 2) * (viewportWidth / pageItem.width);
      context.strokeStyle = line.color || '#000000';
      context.lineWidth = thickness;
      
      if (line.style === 'dash') {
        context.setLineDash([8, 4]);
      } else if (line.style === 'dotted') {
        context.setLineDash([2, 4]);
      } else {
        context.setLineDash([]);
      }
      
      const pos = line.position;
      
      if (line.orientation === 'horizontal') {
        const y = pos * viewportHeight;
        if (line.style === 'wavy') {
          const amplitude = thickness * 1.5;
          const frequency = 6 * (viewportWidth / pageItem.width);
          context.beginPath();
          context.moveTo(0, y);
          for (let x = 0; x <= viewportWidth; x += 2) {
            const waveY = y + amplitude * Math.sin(x / frequency);
            context.lineTo(x, waveY);
          }
          context.stroke();
        } else {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(viewportWidth, y);
          context.stroke();
        }
      } else {
        const x = pos * viewportWidth;
        if (line.style === 'wavy') {
          const amplitude = thickness * 1.5;
          const frequency = 6 * (viewportWidth / pageItem.width);
          context.beginPath();
          context.moveTo(x, 0);
          for (let y = 0; y <= viewportHeight; y += 2) {
            const waveX = x + amplitude * Math.sin(y / frequency);
            context.lineTo(waveX, y);
          }
          context.stroke();
        } else {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, viewportHeight);
          context.stroke();
        }
      }
    }
    context.setLineDash([]);
  }

  if (pageItem.textAnnotations && pageItem.textAnnotations.length > 0) {
    context.textBaseline = 'middle';
    
    for (const ann of pageItem.textAnnotations) {
      const fontScale = viewportWidth / pageItem.width;
      const scaledFontSize = ann.fontSize * fontScale;
      
      context.font = `bold ${scaledFontSize}px sans-serif`;
      
      const canvasX = ann.x * viewportWidth;
      const canvasY = ann.y * viewportHeight;
      
      const align = ann.alignment || 'center';
      context.textAlign = align;
      
      const textWidth = context.measureText(ann.text || '').width;
      const padX = scaledFontSize * 0.25;
      const padY = scaledFontSize * 0.15;
      
      let bgX = canvasX;
      if (align === 'center') {
        bgX = canvasX - (textWidth / 2) - padX;
      } else if (align === 'right') {
        bgX = canvasX - textWidth - padX;
      } else {
        bgX = canvasX - padX;
      }
      
      const bgY = canvasY - (scaledFontSize / 2) - padY;
      const bgW = textWidth + (padX * 2);
      const bgH = scaledFontSize + (padY * 2);
      
      if (ann.backgroundColor && ann.backgroundColor !== 'transparent') {
        context.fillStyle = ann.backgroundColor;
        context.fillRect(bgX, bgY, bgW, bgH);
      }
      
      context.fillStyle = ann.color || '#000000';
      context.fillText(ann.text || '', canvasX, canvasY);
    }
  }
  context.restore();

  return canvas.toDataURL(format, format === 'image/jpeg' ? 0.92 : undefined);
}

