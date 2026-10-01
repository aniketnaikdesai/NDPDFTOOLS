import React, { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import logoUrl from './assets/images/nd_pdf_tools_logo_1783142408735.jpg';
import { 
  Upload, 
  FileUp, 
  FileText, 
  Trash2, 
  RotateCw, 
  Download, 
  Maximize2, 
  Plus, 
  RefreshCw, 
  Sliders, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  Layers, 
  MoveLeft, 
  MoveRight, 
  Undo2,
  Copy,
  ChevronDown,
  Sparkles,
  GripVertical,
  Edit,
  Minus,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Crop,
  Palette,
  Paintbrush,
  Check,
  ZoomIn,
  ZoomOut,
  Scissors,
  Columns2,
  Rows2,
  Tag,
  FilePenLine,
  Hash,
  ListOrdered
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PDFPageItem, SourceFile, CompressionSettings, CompressionPreset, CropArea } from './types';
import { loadPdfPages, renderPageThumbnail, compilePdf, exportPageToImage } from './pdfUtils';
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default function App() {
  // State management
  const [sourceFiles, setSourceFiles] = useState<Record<string, SourceFile>>({});
  const [pages, setPages] = useState<PDFPageItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [highResPreviews, setHighResPreviews] = useState<Record<string, string>>({});
  const renderingHighResRef = useRef<Set<string>>(new Set());
  const getThumbKey = (page: PDFPageItem) => {
    if (!page) return '';
    return `${page.id}_${page.rotation}_${page.crop ? `${page.crop.x.toFixed(3)}_${page.crop.y.toFixed(3)}_${page.crop.width.toFixed(3)}_${page.crop.height.toFixed(3)}_${page.crop.placement || 'orig'}` : 'nocrop'}`;
  };
  const [history, setHistory] = useState<PDFPageItem[][]>([]);
  
  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilingProgress, setCompilingProgress] = useState({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Settings
  const [settings, setSettings] = useState<CompressionSettings>({
    preset: 'medium',
    dpi: 150,
    imageQuality: 0.7,
    compressImages: true,
    stripMetadata: true,
    removeUnusedFonts: false,
    removeHyperlinks: false
  });

  // Exported file state
  const [compiledPdf, setCompiledPdf] = useState<{
    bytes: Uint8Array;
    size: number;
    name: string;
  } | null>(null);

  // Preview Modal
  const [previewPage, setPreviewPage] = useState<PDFPageItem | null>(null);

  // Editor Modal State
  const [editorPage, setEditorPage] = useState<PDFPageItem | null>(null);
  const [editorInitialPages, setEditorInitialPages] = useState<PDFPageItem[] | null>(null);
  const [editorHistory, setEditorHistory] = useState<PDFPageItem[][]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isAddingText, setIsAddingText] = useState(false);
  const [editorMode, setEditorMode] = useState<'text' | 'crop' | 'split'>('text');
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [tempCrop, setTempCrop] = useState<CropArea | null>(null);
  const [activeColorPicker, setActiveColorPicker] = useState<'text' | 'bg' | null>(null);
  const [showEditorTooltip, setShowEditorTooltip] = useState(true);
  const [showCropTooltip, setShowCropTooltip] = useState(true);

  // Split Page Feature States
  const [splitOrientation, setSplitOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [splitPosition, setSplitPosition] = useState<number>(0.5);
  const [isDraggingSplitLine, setIsDraggingSplitLine] = useState<boolean>(false);
  const [splitPlacement, setSplitPlacement] = useState<'fit' | 'align-top' | 'original'>('fit');
  const [keepOriginalOnSplit, setKeepOriginalOnSplit] = useState<boolean>(false);
  const [splitSuccessToast, setSplitSuccessToast] = useState<string | null>(null);

  // Zoom, Custom Lines, and Borders State
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [activeLineColorPicker, setActiveLineColorPicker] = useState<boolean>(false);
  const [activeBorderColorPicker, setActiveBorderColorPicker] = useState<boolean>(false);

  // Reset active color picker when selected annotation changes
  useEffect(() => {
    setActiveColorPicker(null);
  }, [selectedAnnotationId]);

  // Reset states when editorPage changes
  useEffect(() => {
    if (!editorPage) {
      setZoomScale(1.0);
      setSelectedLineId(null);
      setActiveLineColorPicker(false);
      setActiveBorderColorPicker(false);
      setIsDraggingSplitLine(false);
    }
  }, [editorPage]);

  // Derive the active editor page from pages to maintain state consistency in real time
  const activeEditorPage = useMemo(() => {
    if (!editorPage) return null;
    return pages.find(p => p.id === editorPage.id) || null;
  }, [pages, editorPage]);

  // Synchronize tempCrop and split state when opening a page in editor
  useEffect(() => {
    if (editorPage) {
      setTempCrop(editorPage.crop || null);
      setShowCropTooltip(true);
      setSplitPosition(0.5);
      setIsDraggingSplitLine(false);
    } else {
      setTempCrop(null);
      setIsDraggingSplitLine(false);
    }
  }, [editorPage?.id]);

  // Auto-dismiss split success toast
  useEffect(() => {
    if (splitSuccessToast) {
      const timer = setTimeout(() => setSplitSuccessToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [splitSuccessToast]);

  // Selected page IDs for bulk operations
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  // Batch Rename Feature States
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [batchPrefix, setBatchPrefix] = useState('Doc-');
  const [batchStartNum, setBatchStartNum] = useState(1);
  const [batchPadding, setBatchPadding] = useState<number>(3); // 1 = none (1), 2 = 01, 3 = 001
  const [batchSuffix, setBatchSuffix] = useState('');
  const [batchRenameToast, setBatchRenameToast] = useState<string | null>(null);

  // Auto-dismiss batch rename toast
  useEffect(() => {
    if (batchRenameToast) {
      const timer = setTimeout(() => setBatchRenameToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [batchRenameToast]);

  // Merge only selected pages option
  const [mergeOnlySelected, setMergeOnlySelected] = useState(false);

  // Image and Format Export States
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png' | 'jpeg'>('pdf');
  const [exportMethod, setExportMethod] = useState<'zip' | 'individual'>('zip');
  const [exportScale, setExportScale] = useState<number>(2.0);
  const [compiledImages, setCompiledImages] = useState<{
    blob?: Blob;
    files?: Array<{ dataUrl: string; name: string }>;
    size: number;
    name: string;
  } | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showBlankPageDropdown, setShowBlankPageDropdown] = useState(false);

  // Sync selected page IDs with active pages list
  useEffect(() => {
    const activePageIds = new Set(pages.map(p => p.id));
    setSelectedPageIds(prev => prev.filter(id => activePageIds.has(id)));
  }, [pages]);

  // Clear compiled files when inputs, settings, selection or format changes
  useEffect(() => {
    setCompiledPdf(null);
    setCompiledImages(null);
  }, [pages, sourceFiles, selectedPageIds, exportFormat, exportMethod, exportScale, settings, mergeOnlySelected]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const renderingPagesRef = useRef<Set<string>>(new Set());

  // Sync settings when preset changes
  useEffect(() => {
    if (settings.preset === 'low') {
      setSettings(prev => ({
        ...prev,
        dpi: 200,
        imageQuality: 0.9,
        compressImages: false,
        stripMetadata: true,
        removeUnusedFonts: false,
        removeHyperlinks: false
      }));
    } else if (settings.preset === 'medium') {
      setSettings(prev => ({
        ...prev,
        dpi: 150,
        imageQuality: 0.7,
        compressImages: true,
        stripMetadata: true,
        removeUnusedFonts: false,
        removeHyperlinks: false
      }));
    } else if (settings.preset === 'high') {
      setSettings(prev => ({
        ...prev,
        dpi: 100,
        imageQuality: 0.5,
        compressImages: true,
        stripMetadata: true,
        removeUnusedFonts: false,
        removeHyperlinks: false
      }));
    }
  }, [settings.preset]);

  // History Undo mechanism
  const saveToHistory = (currentPages: PDFPageItem[]) => {
    setHistory(prev => [...prev.slice(-10), JSON.parse(JSON.stringify(currentPages))]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setPages(previous);
    setHistory(prev => prev.slice(0, -1));
    setCompiledPdf(null);
  };

  // Asynchronously render thumbnails for pages that don't have them yet
  useEffect(() => {
    let active = true;
    
    const renderMissingThumbnails = async () => {
      for (const page of pages) {
        if (!active) break;
        const key = getThumbKey(page);
        if (thumbnails[key] || renderingPagesRef.current.has(key)) continue;

        const sourceFile = sourceFiles[page.sourceFileId];
        if (sourceFile) {
          renderingPagesRef.current.add(key);
          try {
            const url = await renderPageThumbnail(sourceFile, page.originalIndex, 240, page.crop);
            if (active) {
              setThumbnails(prev => ({ ...prev, [key]: url }));
            }
            renderingPagesRef.current.delete(key);
          } catch (err) {
            console.error('Failed to render thumbnail for page', page.id, err);
            renderingPagesRef.current.delete(key);
          }
        }
      }
    };

    renderMissingThumbnails();

    return () => {
      active = false;
      renderingPagesRef.current.clear();
    };
  }, [pages, sourceFiles, thumbnails]);

  // Asynchronously render high-resolution previews for active/preview pages
  useEffect(() => {
    let active = true;
    const targetPage = activeEditorPage || previewPage;
    if (!targetPage) return;

    const key = getThumbKey(targetPage);
    if (highResPreviews[key] || renderingHighResRef.current.has(key)) return;

    const sourceFile = sourceFiles[targetPage.sourceFileId];
    if (sourceFile) {
      renderingHighResRef.current.add(key);
      // Render at a much higher resolution (targetWidth = 1200) to keep text sharp and clear
      renderPageThumbnail(sourceFile, targetPage.originalIndex, 1200, targetPage.crop)
        .then(url => {
          if (active) {
            setHighResPreviews(prev => ({ ...prev, [key]: url }));
          }
          renderingHighResRef.current.delete(key);
        })
        .catch(err => {
          console.error('Failed to render high-res preview for page', targetPage.id, err);
          renderingHighResRef.current.delete(key);
        });
    }

    return () => {
      active = false;
    };
  }, [activeEditorPage, previewPage, sourceFiles, highResPreviews]);

  // Handle main PDF file drop/upload
  const handleFileUpload = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setErrorMsg('Invalid file type. Please upload a PDF file.');
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setErrorMsg(null);
    setCompiledPdf(null);

    try {
      const sourceFileId = `file-${Date.now()}`;
      const { sourceFile, pages: newPages } = await loadPdfPages(
        file,
        sourceFileId,
        (progress) => setLoadingProgress(progress)
      );

      setSourceFiles({ [sourceFileId]: sourceFile });
      setPages(newPages);
      setHistory([]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to read PDF file. The file may be password protected or corrupted.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle appending another PDF (Merge)
  const handleAddPdfUpload = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setErrorMsg('Please select a valid PDF file to merge.');
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setErrorMsg(null);
    setCompiledPdf(null);
    saveToHistory(pages);

    try {
      const sourceFileId = `file-${Date.now()}`;
      const { sourceFile, pages: newPages } = await loadPdfPages(
        file,
        sourceFileId,
        (progress) => setLoadingProgress(progress)
      );

      setSourceFiles(prev => ({ ...prev, [sourceFileId]: sourceFile }));
      setPages(prev => [...prev, ...newPages]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to merge PDF. The file may be invalid or encrypted.');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate an in-app colorful Sample PDF for immediate testing
  const handleUseSample = async () => {
    setIsLoading(true);
    setLoadingProgress(30);
    setErrorMsg(null);
    setCompiledPdf(null);

    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Page 1: Beautiful Welcome Page
      const page1 = pdfDoc.addPage([600, 750]);
      page1.drawRectangle({
        x: 0,
        y: 0,
        width: 600,
        height: 750,
        color: rgb(0.09, 0.12, 0.18),
      });
      page1.drawText('SAMPLE DOCUMENT', {
        x: 60,
        y: 580,
        size: 38,
        font,
        color: rgb(0.9, 0.95, 1.0),
      });
      page1.drawText('Created dynamically for the PDF Editor testing flow.', {
        x: 60,
        y: 530,
        size: 16,
        font: regularFont,
        color: rgb(0.6, 0.7, 0.8),
      });
      page1.drawRectangle({
        x: 60,
        y: 450,
        width: 140,
        height: 8,
        color: rgb(0.24, 0.6, 1.0),
      });
      page1.drawText('FEATURES OF THIS APP:', {
        x: 60,
        y: 380,
        size: 14,
        font,
        color: rgb(0.7, 0.8, 0.9),
      });
      const bulletPoints = [
        '✔ High-fidelity PDF compression options',
        '✔ Fast vector optimizations & metadata stripping',
        '✔ Mobile-friendly drag, swap, & deletion controls',
        '✔ Interactive multi-file merging system',
        '✔ Real-time file size savings predictor',
      ];
      bulletPoints.forEach((bp, index) => {
        page1.drawText(bp, {
          x: 60,
          y: 340 - index * 30,
          size: 14,
          font: regularFont,
          color: rgb(0.8, 0.85, 0.9),
        });
      });

      // Page 2: Vector Graphics / Visual Assets Page
      const page2 = pdfDoc.addPage([600, 750]);
      page2.drawRectangle({
        x: 0,
        y: 0,
        width: 600,
        height: 750,
        color: rgb(0.96, 0.97, 0.99),
      });
      page2.drawText('Page 2: Vector Shapes & Objects', {
        x: 50,
        y: 680,
        size: 22,
        font,
        color: rgb(0.1, 0.15, 0.25),
      });
      page2.drawText('These shapes show compression artifacts in "Flatten & Compress" mode.', {
        x: 50,
        y: 650,
        size: 13,
        font: regularFont,
        color: rgb(0.4, 0.5, 0.6),
      });
      
      // Draw grid chart
      for (let grid = 0; grid < 5; grid++) {
        page2.drawRectangle({
          x: 80 + grid * 80,
          y: 250,
          width: 50,
          height: 100 + grid * 60,
          color: rgb(0.1 + grid * 0.15, 0.4, 0.8 - grid * 0.1),
        });
        page2.drawText(`Metric ${String.fromCharCode(65 + grid)}`, {
          x: 80 + grid * 80,
          y: 225,
          size: 11,
          font,
          color: rgb(0.3, 0.4, 0.5),
        });
      }

      // Page 3: Rich Text Content
      const page3 = pdfDoc.addPage([600, 750]);
      page3.drawRectangle({
        x: 0,
        y: 0,
        width: 600,
        height: 750,
        color: rgb(1, 1, 1),
      });
      page3.drawText('Page 3: Document Summary', {
        x: 50,
        y: 680,
        size: 22,
        font,
        color: rgb(0.11, 0.15, 0.2),
      });
      page3.drawText('Feel free to reorder or delete this page!', {
        x: 50,
        y: 640,
        size: 14,
        font: regularFont,
        color: rgb(0.4, 0.6, 0.4),
      });

      const bodyText = [
        'This PDF editor provides high performance, full client-side operations.',
        'When you select standard optimization, pages are kept in full resolution.',
        'When selecting "Flatten & Compress", pages are re-rendered to dynamic JPEGs.',
        'This allows scanning algorithms to output much smaller file footprints.',
        'Use the controls on the sidebar to fine-tune the output as needed.'
      ];
      bodyText.forEach((paragraph, idx) => {
        page3.drawText(paragraph, {
          x: 50,
          y: 560 - idx * 40,
          size: 12,
          font: regularFont,
          color: rgb(0.2, 0.2, 0.2),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const file = new File([pdfBytes], 'sample_document.pdf', { type: 'application/pdf' });
      
      const sourceFileId = `file-${Date.now()}`;
      const { sourceFile, pages: newPages } = await loadPdfPages(file, sourceFileId);

      setSourceFiles({ [sourceFileId]: sourceFile });
      setPages(newPages);
      setHistory([]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to generate sample PDF.');
    } finally {
      setIsLoading(false);
    }
  };

  // File drag & drop support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // Reorganizing operations
  const deletePage = (id: string) => {
    saveToHistory(pages);
    setPages(prev => prev.filter(p => p.id !== id));
    setCompiledPdf(null);
  };

  const duplicatePage = (pageItem: PDFPageItem) => {
    saveToHistory(pages);
    const newPageItem: PDFPageItem = {
      ...pageItem,
      id: `${pageItem.sourceFileId}-dup-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
    };
    
    const index = pages.findIndex(p => p.id === pageItem.id);
    if (index !== -1) {
      const updated = [...pages];
      updated.splice(index + 1, 0, newPageItem);
      setPages(updated);
    }
    setCompiledPdf(null);
  };

  const rotatePage = (id: string) => {
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, rotation: (p.rotation + 90) % 360 };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const movePage = (index: number, direction: 'left' | 'right') => {
    if (direction === 'left' && index === 0) return;
    if (direction === 'right' && index === pages.length - 1) return;

    saveToHistory(pages);
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    const updated = [...pages];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setPages(updated);
    setCompiledPdf(null);
  };

  const addBlankPage = (size: 'letter' | 'a4' = 'letter', orientation: 'portrait' | 'landscape' = 'portrait') => {
    saveToHistory(pages);
    
    // Letter: 8.5" x 11" = 612 x 792 points
    // A4: 210mm x 297mm = 595.276 x 841.89 points
    const width = size === 'letter' 
      ? (orientation === 'portrait' ? 612 : 792) 
      : (orientation === 'portrait' ? 595 : 842);
      
    const height = size === 'letter'
      ? (orientation === 'portrait' ? 792 : 612)
      : (orientation === 'portrait' ? 842 : 595);

    const blankPageId = `blank-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    
    const newPage: PDFPageItem = {
      id: blankPageId,
      sourceFileId: 'blank',
      originalIndex: -1,
      rotation: 0,
      thumbnailUrl: null,
      width,
      height
    };

    setPages(prev => [...prev, newPage]);
    setCompiledPdf(null);
  };

  // Push current pages onto the editor history stack for granular undo/revert
  const pushEditorSnapshot = () => {
    setEditorHistory(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(pages))]);
  };

  // Open the page editor with a clean snapshot of the document pages
  const openEditor = (page: PDFPageItem, mode: 'text' | 'crop' | 'split' = 'text') => {
    setEditorInitialPages(JSON.parse(JSON.stringify(pages)));
    setEditorHistory([]);
    setEditorPage(page);
    setEditorMode(mode);
    setSelectedAnnotationId(null);
    setSelectedLineId(null);
    setIsAddingText(false);
    setShowEditorTooltip(mode === 'text');
    if (page.crop) {
      setTempCrop(page.crop);
    } else {
      setTempCrop(null);
    }
  };

  // Revert the last change made in the editor session (Undo)
  const handleEditorRevertLastChange = () => {
    if (editorHistory.length === 0) return;
    const previousSnapshot = editorHistory[editorHistory.length - 1];
    setEditorHistory(prev => prev.slice(0, -1));
    setPages(previousSnapshot);
    setCompiledPdf(null);
    setCompiledImages(null);
    
    // Synchronize active crop or lines if needed
    if (editorPage) {
      const restored = previousSnapshot.find(p => p.id === editorPage.id);
      if (restored) {
        setTempCrop(restored.crop || null);
      }
    }
  };

  // Cancel all changes made in this editor session and reject/discard modifications
  const handleEditorCancel = () => {
    if (editorInitialPages) {
      setPages(editorInitialPages);
      setCompiledPdf(null);
      setCompiledImages(null);
    }
    setEditorPage(null);
    setEditorInitialPages(null);
    setEditorHistory([]);
    setSelectedAnnotationId(null);
    setSelectedLineId(null);
    setIsAddingText(false);
    setTempCrop(null);
  };

  // Apply changes made in this editor session and close
  const handleEditorApply = () => {
    if (editorInitialPages && editorHistory.length > 0) {
      // Save original snapshot to main app history for global undo support
      saveToHistory(editorInitialPages);
    }
    setEditorPage(null);
    setEditorInitialPages(null);
    setEditorHistory([]);
    setSelectedAnnotationId(null);
    setSelectedLineId(null);
    setIsAddingText(false);
    setTempCrop(null);
  };

  // Keyboard shortcuts inside Page Editor (Esc to Cancel, Ctrl+Z to Revert Last Change)
  useEffect(() => {
    if (!editorPage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleEditorCancel();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (targetTag !== 'input' && targetTag !== 'textarea') {
          e.preventDefault();
          handleEditorRevertLastChange();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorPage, editorHistory, editorInitialPages]);

  const handleAddTextAnnotation = (xRatio: number, yRatio: number) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    
    const newAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      text: 'Click to type text...',
      x: xRatio,
      y: yRatio,
      fontSize: 16,
      color: '#000000',
      backgroundColor: '#FFFFFF'
    };
    
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: [...existing, newAnnotation]
        };
      }
      return p;
    }));
    
    setCompiledPdf(null);
    setSelectedAnnotationId(newAnnotation.id);
    setIsAddingText(false);
  };

  const handleSaveCrop = (crop: CropArea | null) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        return {
          ...p,
          crop: crop || undefined
        };
      }
      return p;
    }));
    setTempCrop(crop);
    setCompiledPdf(null);
  };

  const handleExecuteSplitPage = () => {
    if (!activeEditorPage) return;

    saveToHistory(pages);

    const origW = activeEditorPage.width;
    const origH = activeEditorPage.height;
    const isHoriz = splitOrientation === 'horizontal';

    // Calculate crop areas based on existing crop (if page was already cropped) or full page
    const baseCrop = activeEditorPage.crop || { x: 0, y: 0, width: 1.0, height: 1.0 };

    // Page 1 (Top or Left half)
    const page1Id = `page_${Date.now()}_split_1`;
    const page1Crop: CropArea = isHoriz
      ? {
          x: baseCrop.x,
          y: baseCrop.y,
          width: baseCrop.width,
          height: baseCrop.height * splitPosition,
          placement: splitPlacement,
        }
      : {
          x: baseCrop.x,
          y: baseCrop.y,
          width: baseCrop.width * splitPosition,
          height: baseCrop.height,
          placement: splitPlacement,
        };

    // Remap annotations for Page 1
    const page1Annotations = (activeEditorPage.textAnnotations || [])
      .filter(ann => (isHoriz ? ann.y <= splitPosition : ann.x <= splitPosition))
      .map(ann => {
        if (splitPlacement === 'fit') {
          return {
            ...ann,
            id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            x: isHoriz ? ann.x : ann.x / splitPosition,
            y: isHoriz ? ann.y / splitPosition : ann.y,
          };
        }
        return {
          ...ann,
          id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        };
      });

    const page1: PDFPageItem = {
      ...activeEditorPage,
      id: page1Id,
      width: origW,
      height: origH,
      crop: page1Crop,
      textAnnotations: page1Annotations,
      lines: (activeEditorPage.lines || []).filter(l =>
        isHoriz
          ? (l.orientation === 'horizontal' ? l.position <= splitPosition : true)
          : (l.orientation === 'vertical' ? l.position <= splitPosition : true)
      ),
    };

    // Page 2 (Bottom or Right half)
    const page2Id = `page_${Date.now() + 1}_split_2`;
    const page2Crop: CropArea = isHoriz
      ? {
          x: baseCrop.x,
          y: baseCrop.y + baseCrop.height * splitPosition,
          width: baseCrop.width,
          height: baseCrop.height * (1.0 - splitPosition),
          placement: splitPlacement,
        }
      : {
          x: baseCrop.x + baseCrop.width * splitPosition,
          y: baseCrop.y,
          width: baseCrop.width * (1.0 - splitPosition),
          height: baseCrop.height,
          placement: splitPlacement,
        };

    // Remap annotations for Page 2
    const page2Annotations = (activeEditorPage.textAnnotations || [])
      .filter(ann => (isHoriz ? ann.y > splitPosition : ann.x > splitPosition))
      .map(ann => {
        if (splitPlacement === 'fit') {
          return {
            ...ann,
            id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            x: isHoriz ? ann.x : (ann.x - splitPosition) / (1.0 - splitPosition),
            y: isHoriz ? (ann.y - splitPosition) / (1.0 - splitPosition) : ann.y,
          };
        } else if (splitPlacement === 'align-top') {
          return {
            ...ann,
            id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            x: isHoriz ? ann.x : ann.x - splitPosition,
            y: isHoriz ? ann.y - splitPosition : ann.y,
          };
        }
        return {
          ...ann,
          id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        };
      });

    const page2: PDFPageItem = {
      ...activeEditorPage,
      id: page2Id,
      width: origW,
      height: origH,
      crop: page2Crop,
      textAnnotations: page2Annotations,
      lines: (activeEditorPage.lines || []).filter(l =>
        isHoriz
          ? (l.orientation === 'horizontal' ? l.position > splitPosition : true)
          : (l.orientation === 'vertical' ? l.position > splitPosition : true)
      ),
    };

    setPages(prev => {
      const next: PDFPageItem[] = [];
      for (const p of prev) {
        if (p.id === activeEditorPage.id) {
          if (keepOriginalOnSplit) {
            next.push(p);
          }
          next.push(page1, page2);
        } else {
          next.push(p);
        }
      }
      return next;
    });

    setEditorPage(null);
    setSelectedAnnotationId(null);
    setIsAddingText(false);
    setCompiledPdf(null);
    setCompiledImages(null);
    setSplitSuccessToast(
      `Successfully split into 2 separate pages (${Math.round(origW)} × ${Math.round(origH)} pt each)!`
    );
  };

  const handleRemoveTextAnnotation = () => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        return {
          ...p,
          textAnnotations: []
        };
      }
      return p;
    }));
    
    setCompiledPdf(null);
    setSelectedAnnotationId(null);
  };

  const updateAnnotationText = (annId: string, newText: string) => {
    if (!editorPage) return;
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: existing.map(ann => ann.id === annId ? { ...ann, text: newText } : ann)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const changeFontSize = (annId: string, change: number) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: existing.map(ann => {
            if (ann.id === annId) {
              const newSize = Math.max(8, Math.min(72, ann.fontSize + change));
              return { ...ann, fontSize: newSize };
            }
            return ann;
          })
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const updateAnnotationAlignment = (annId: string, alignment: 'left' | 'center' | 'right') => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: existing.map(ann => ann.id === annId ? { ...ann, alignment } : ann)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const handleAddLine = (orientation: 'horizontal' | 'vertical') => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    
    const newLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      orientation,
      position: 0.5,
      style: 'continuous' as const,
      thickness: 3,
      color: '#2563EB',
      start: 0,
      end: 1
    };
    
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.lines || [];
        return {
          ...p,
          lines: [...existing, newLine]
        };
      }
      return p;
    }));
    
    setCompiledPdf(null);
    setSelectedLineId(newLine.id);
  };

  const handleAddLineToAllPages = (orientation: 'horizontal' | 'vertical') => {
    pushEditorSnapshot();
    saveToHistory(pages);
    
    setPages(prev => prev.map(p => {
      const existing = p.lines || [];
      const newLine = {
        id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        orientation,
        position: 0.5,
        style: 'continuous' as const,
        thickness: 3,
        color: '#2563EB',
        start: 0,
        end: 1
      };
      return {
        ...p,
        lines: [...existing, newLine]
      };
    }));
    
    setCompiledPdf(null);
  };

  const handleApplyLineToAllPages = (sourceLine: any) => {
    pushEditorSnapshot();
    saveToHistory(pages);
    
    setPages(prev => prev.map(p => {
      const existing = p.lines || [];
      const hasSameId = existing.some(l => l.id === sourceLine.id);
      
      if (hasSameId) {
        return {
          ...p,
          lines: existing.map(l => l.id === sourceLine.id ? { ...l, ...sourceLine } : l)
        };
      }
      
      const alreadyHasExact = existing.some(l => 
        l.orientation === sourceLine.orientation &&
        Math.abs(l.position - sourceLine.position) < 0.001 &&
        Math.abs((l.start ?? 0) - (sourceLine.start ?? 0)) < 0.001 &&
        Math.abs((l.end ?? 1) - (sourceLine.end ?? 1)) < 0.001 &&
        l.color === sourceLine.color &&
        l.thickness === sourceLine.thickness &&
        l.style === sourceLine.style
      );
      
      if (alreadyHasExact) return p;
      
      const copyOfLine = {
        ...sourceLine,
        id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
      };
      
      return {
        ...p,
        lines: [...existing, copyOfLine]
      };
    }));
    
    setCompiledPdf(null);
  };

  const handleUpdateLine = (lineId: string, updates: Partial<any>) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.lines || [];
        return {
          ...p,
          lines: existing.map(l => l.id === lineId ? { ...l, ...updates } : l)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const handleDeleteLine = (lineId: string) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.lines || [];
        return {
          ...p,
          lines: existing.filter(l => l.id !== lineId)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
    if (selectedLineId === lineId) {
      setSelectedLineId(null);
    }
  };

  const handleUpdateBorder = (updates: Partial<any>) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existingBorder = p.border || {
          enabled: false,
          style: 'continuous',
          thickness: 3,
          color: '#000000'
        };
        return {
          ...p,
          border: { ...existingBorder, ...updates }
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const handleApplyBorderToAllPages = (borderSettings: any) => {
    pushEditorSnapshot();
    saveToHistory(pages);
    setPages(prev => prev.map(p => ({
      ...p,
      border: { ...borderSettings }
    })));
    setCompiledPdf(null);
  };

  const updateAnnotationColor = (annId: string, color: string) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: existing.map(ann => ann.id === annId ? { ...ann, color } : ann)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const updateAnnotationBgColor = (annId: string, backgroundColor: string) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: existing.map(ann => ann.id === annId ? { ...ann, backgroundColor } : ann)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const deleteSingleAnnotation = (annId: string) => {
    if (!editorPage) return;
    pushEditorSnapshot();
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === editorPage.id) {
        const existing = p.textAnnotations || [];
        return {
          ...p,
          textAnnotations: existing.filter(ann => ann.id !== annId)
        };
      }
      return p;
    }));
    setCompiledPdf(null);
    if (selectedAnnotationId === annId) {
      setSelectedAnnotationId(null);
    }
  };

  const reversePages = () => {
    saveToHistory(pages);
    setPages(prev => [...prev].reverse());
    setCompiledPdf(null);
  };

  const rotateAllPages = () => {
    saveToHistory(pages);
    setPages(prev => prev.map(p => ({
      ...p,
      rotation: (p.rotation + 90) % 360
    })));
    setCompiledPdf(null);
  };

  const togglePageSelection = (id: string) => {
    setSelectedPageIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPageIds.length === pages.length) {
      setSelectedPageIds([]);
    } else {
      setSelectedPageIds(pages.map(p => p.id));
    }
  };

  const deleteSelectedPages = () => {
    if (selectedPageIds.length === 0) return;
    saveToHistory(pages);
    setPages(prev => prev.filter(p => !selectedPageIds.includes(p.id)));
    setSelectedPageIds([]);
    setCompiledPdf(null);
  };

  const rotateSelectedPages = () => {
    if (selectedPageIds.length === 0) return;
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (selectedPageIds.includes(p.id)) {
        return { ...p, rotation: (p.rotation + 90) % 360 };
      }
      return p;
    }));
    setCompiledPdf(null);
  };

  const duplicateSelectedPages = () => {
    if (selectedPageIds.length === 0) return;
    saveToHistory(pages);

    const updated: PDFPageItem[] = [];
    pages.forEach(p => {
      updated.push(p);
      if (selectedPageIds.includes(p.id)) {
        const dupId = `${p.sourceFileId}-dup-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
        const dupPage: PDFPageItem = {
          ...p,
          id: dupId,
        };
        updated.push(dupPage);
      }
    });

    setPages(updated);
    setSelectedPageIds([]);
    setCompiledPdf(null);
  };

  // Selected pages in current workspace/document order
  const selectedPagesInOrder = useMemo(() => {
    return pages.filter(p => selectedPageIds.includes(p.id));
  }, [pages, selectedPageIds]);

  const formatBatchNumber = (num: number, padding: number) => {
    if (padding <= 1) return String(num);
    return String(num).padStart(padding, '0');
  };

  const computeBatchLabel = (indexInSelection: number) => {
    const num = batchStartNum + indexInSelection;
    return `${batchPrefix}${formatBatchNumber(num, batchPadding)}${batchSuffix}`.trim();
  };

  const handleApplyBatchRename = () => {
    if (selectedPagesInOrder.length === 0) return;
    saveToHistory(pages);

    const idToLabelMap = new Map<string, string>();
    selectedPagesInOrder.forEach((page, idx) => {
      idToLabelMap.set(page.id, computeBatchLabel(idx));
    });

    setPages(prev => prev.map(p => {
      if (idToLabelMap.has(p.id)) {
        return {
          ...p,
          customLabel: idToLabelMap.get(p.id),
        };
      }
      return p;
    }));

    setCompiledPdf(null);
    setCompiledImages(null);
    setIsBatchRenameOpen(false);

    const firstLabel = idToLabelMap.get(selectedPagesInOrder[0].id);
    const lastLabel = idToLabelMap.get(selectedPagesInOrder[selectedPagesInOrder.length - 1].id);
    setBatchRenameToast(
      selectedPagesInOrder.length === 1
        ? `Renamed 1 page to "${firstLabel}"`
        : `Renamed ${selectedPagesInOrder.length} pages (${firstLabel} ... ${lastLabel})`
    );
  };

  const handleClearBatchRename = () => {
    if (selectedPagesInOrder.length === 0) return;
    saveToHistory(pages);

    setPages(prev => prev.map(p => {
      if (selectedPageIds.includes(p.id)) {
        const { customLabel, ...rest } = p;
        return rest;
      }
      return p;
    }));

    setCompiledPdf(null);
    setCompiledImages(null);
    setIsBatchRenameOpen(false);
    setBatchRenameToast(`Reset labels for ${selectedPagesInOrder.length} selected pages`);
  };

  const handleClearSingleLabel = (pageId: string) => {
    saveToHistory(pages);
    setPages(prev => prev.map(p => {
      if (p.id === pageId) {
        const { customLabel, ...rest } = p;
        return rest;
      }
      return p;
    }));
    setCompiledPdf(null);
    setCompiledImages(null);
  };

  const clearAll = () => {
    saveToHistory(pages);
    setPages([]);
    setSourceFiles({});
    renderingPagesRef.current = new Set();
    setCompiledPdf(null);
  };

  const handlePageDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    saveToHistory(pages);
    const updatedPages = [...pages];
    const [draggedPage] = updatedPages.splice(draggedIndex, 1);
    updatedPages.splice(targetIndex, 0, draggedPage);
    setPages(updatedPages);
    setCompiledPdf(null);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Compile / Process the document
  const processDocument = async () => {
    if (exportFormat === 'pdf') {
      if (activeCompilePages.length === 0) return;
      setIsCompiling(true);
      setCompiledPdf(null);
      setProcessingStatus('Initializing PDF builder...');

      try {
        const bytes = await compilePdf(
          sourceFiles,
          activeCompilePages,
          settings,
          (current, total) => {
            setCompilingProgress({ current, total });
            setProcessingStatus(`Processing page ${current} of ${total}...`);
          }
        );

        // Pick a suitable file name
        const primaryFileName = (Object.values(sourceFiles) as SourceFile[])[0]?.name || 'document';
        const cleanName = primaryFileName.replace(/\.[^/.]+$/, '');
        const compiledName = `${cleanName}_compressed.pdf`;

        setCompiledPdf({
          bytes,
          size: bytes.byteLength,
          name: compiledName,
        });
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to process and build the PDF. Ensure your settings are correct.');
      } finally {
        setIsCompiling(false);
      }
    } else {
      // Export as PNG or JPEG images
      const targetPages = pages.filter(p => selectedPageIds.includes(p.id));
      if (targetPages.length === 0) return;

      setIsCompiling(true);
      setCompiledImages(null);
      setProcessingStatus('Starting image export...');

      try {
        const primaryFileName = (Object.values(sourceFiles) as SourceFile[])[0]?.name || 'document';
        const cleanName = primaryFileName.replace(/\.[^/.]+$/, '');
        
        const filesToExport: Array<{ dataUrl: string; name: string }> = [];
        
        for (let i = 0; i < targetPages.length; i++) {
          const page = targetPages[i];
          setCompilingProgress({ current: i + 1, total: targetPages.length });
          setProcessingStatus(`Rendering page ${i + 1} of ${targetPages.length}...`);
          
          const sourceFile = sourceFiles[page.sourceFileId] || null;
          const formatType = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
          
          const dataUrl = await exportPageToImage(sourceFile, page, exportScale, formatType);
          
          // Generate file name (prefer user's custom batch label if set)
          const pageNum = page.originalIndex + 1;
          const ext = exportFormat === 'png' ? 'png' : 'jpg';
          const baseName = page.customLabel ? page.customLabel : `${cleanName}_page_${pageNum}`;
          const name = `${baseName}.${ext}`;
          
          filesToExport.push({ dataUrl, name });
        }

        if (exportMethod === 'zip') {
          setProcessingStatus('Creating ZIP archive...');
          const zip = new JSZip();
          for (const file of filesToExport) {
            const base64Data = file.dataUrl.split(',')[1];
            zip.file(file.name, base64Data, { base64: true });
          }
          
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          setCompiledImages({
            blob: zipBlob,
            size: zipBlob.size,
            name: `${cleanName}_images.zip`
          });
        } else {
          // Individual files
          const totalSize = filesToExport.reduce((sum, f) => {
            return sum + Math.round(f.dataUrl.length * 0.75);
          }, 0);
          
          setCompiledImages({
            files: filesToExport,
            size: totalSize,
            name: `${cleanName}_images`
          });
        }
      } catch (err) {
        console.error(err);
        setErrorMsg('Failed to export pages as images. Try reducing the resolution scale.');
      } finally {
        setIsCompiling(false);
      }
    }
  };

  // Auto trigger download
  const triggerDownload = () => {
    if (exportFormat === 'pdf') {
      if (!compiledPdf) return;
      const blob = new Blob([compiledPdf.bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = compiledPdf.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      if (!compiledImages) return;
      if (exportMethod === 'zip' && compiledImages.blob) {
        const url = URL.createObjectURL(compiledImages.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = compiledImages.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (exportMethod === 'individual' && compiledImages.files) {
        // Download each file with a tiny delay to ensure browsers don't block them
        compiledImages.files.forEach((file, index) => {
          setTimeout(() => {
            const link = document.createElement('a');
            link.href = file.dataUrl;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }, index * 200);
        });
      }
    }
  };

  // Reset/Restart the app
  const resetApp = () => {
    setSourceFiles({});
    setPages([]);
    setThumbnails({});
    setHighResPreviews({});
    renderingPagesRef.current = new Set();
    renderingHighResRef.current = new Set();
    setHistory([]);
    setCompiledPdf(null);
    setErrorMsg(null);
  };

  // Size calculations helper
  const originalTotalSize = useMemo(() => {
    return (Object.values(sourceFiles) as SourceFile[]).reduce((sum, f) => sum + f.size, 0);
  }, [sourceFiles]);

  const isMergingOnlySelected = useMemo(() => {
    return mergeOnlySelected && selectedPageIds.length > 0;
  }, [mergeOnlySelected, selectedPageIds]);

  const activeCompilePages = useMemo(() => {
    if (isMergingOnlySelected) {
      return pages.filter(p => selectedPageIds.includes(p.id));
    }
    return pages;
  }, [pages, isMergingOnlySelected, selectedPageIds]);

  const sourceFileTotalPages = useMemo(() => {
    const counts: Record<string, number> = {};
    pages.forEach(page => {
      counts[page.sourceFileId] = Math.max(counts[page.sourceFileId] || 0, page.originalIndex + 1);
    });
    return counts;
  }, [pages]);

  const originalCompileSize = useMemo(() => {
    if (activeCompilePages.length === 0) return 0;
    return activeCompilePages.reduce((sum, page) => {
      if (page.sourceFileId === 'blank') {
        return sum + 2 * 1024;
      }
      const total = sourceFileTotalPages[page.sourceFileId] || 1;
      const file = sourceFiles[page.sourceFileId] as SourceFile | undefined;
      return sum + (file ? file.size / total : 50 * 1024);
    }, 0);
  }, [activeCompilePages, sourceFiles, sourceFileTotalPages]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const compressionSavingsPercent = useMemo(() => {
    if (!compiledPdf || originalCompileSize === 0) return 0;
    const savings = originalCompileSize - compiledPdf.size;
    return Math.round((savings / originalCompileSize) * 100);
  }, [compiledPdf, originalCompileSize]);

  const optionalSavings = useMemo(() => {
    const filesCount = Object.keys(sourceFiles).length;
    const pagesCount = activeCompilePages.length;

    if (pagesCount === 0) {
      return { metadata: 0, fonts: 0, hyperlinks: 0, totalChecked: 0 };
    }

    const metadata = Math.round(filesCount * 14.5 * 1024 + 4200);
    const fonts = Math.round(pagesCount * 11.2 * 1024 + filesCount * 48000);
    const hyperlinks = Math.round(pagesCount * 1900);

    let totalChecked = 0;
    if (settings.stripMetadata) totalChecked += metadata;
    if (settings.removeUnusedFonts) totalChecked += fonts;
    if (settings.removeHyperlinks) totalChecked += hyperlinks;

    return { metadata, fonts, hyperlinks, totalChecked };
  }, [sourceFiles, activeCompilePages, settings.stripMetadata, settings.removeUnusedFonts, settings.removeHyperlinks]);

  const expectedFinalSize = useMemo(() => {
    if (activeCompilePages.length === 0) return 0;

    let baseSize = 0;
    if (settings.compressImages) {
      // Flattening mode
      baseSize = activeCompilePages.reduce((sum, page) => {
        if (page.sourceFileId === 'blank') {
          return sum + 2 * 1024;
        }
        // Base estimated JPEG size + page overhead
        const compressedPageEstimate = Math.max(12 * 1024, Math.round(93.5 * settings.dpi * settings.dpi * (settings.imageQuality * 0.15 + 0.05))) + 4096;
        return sum + compressedPageEstimate;
      }, 0);
    } else {
      // Vector mode (use proportional original size)
      baseSize = activeCompilePages.reduce((sum, page) => {
        if (page.sourceFileId === 'blank') {
          return sum + 2 * 1024;
        }
        const total = sourceFileTotalPages[page.sourceFileId] || 1;
        const file = sourceFiles[page.sourceFileId] as SourceFile | undefined;
        return sum + (file ? file.size / total : 50 * 1024); // fallback 50KB if no file
      }, 0);
    }

    // Subtract savings if selected
    let savings = 0;
    if (settings.stripMetadata) {
      savings += optionalSavings.metadata;
    }
    if (settings.removeUnusedFonts) {
      savings += optionalSavings.fonts;
    }
    if (settings.removeHyperlinks) {
      savings += optionalSavings.hyperlinks;
    }

    // Ensure we don't go below a sensible minimum for a PDF (e.g. 3KB per page)
    const minSize = Math.max(3 * 1024, activeCompilePages.length * 3 * 1024);
    return Math.max(minSize, Math.round(baseSize - savings));
  }, [activeCompilePages, sourceFiles, settings, sourceFileTotalPages, optionalSavings]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-800 antialiased flex flex-col justify-between">
      {/* Top Header */}
      <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-40 px-6 sm:px-8 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shadow-md border border-slate-100">
            <img 
              src={logoUrl} 
              alt="ND PDF Tools Logo" 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-display font-extrabold tracking-tight text-slate-800 uppercase">
              ND PDF <span className="text-blue-600">Tools</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {pages.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="text-slate-400">Document:</span>
              <span className="text-slate-800 font-mono truncate max-w-[200px]" title={(Object.values(sourceFiles) as SourceFile[])[0]?.name}>
                {(Object.values(sourceFiles) as SourceFile[])[0]?.name || 'Imported PDF'}
              </span>
            </div>
          )}

          {pages.length > 0 && <div className="h-6 w-[1px] bg-slate-200 hidden lg:block"></div>}

          <div className="flex items-center gap-2">
            {pages.length > 0 && (
              <button
                onClick={resetApp}
                className="text-slate-500 hover:text-slate-800 hover:bg-slate-50 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors border border-transparent hover:border-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Start Over</span>
              </button>
            )}
            
            {history.length > 0 && (
              <button
                onClick={undo}
                className="text-slate-500 hover:text-slate-800 hover:bg-slate-50 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors border border-transparent hover:border-slate-200 flex items-center gap-1 cursor-pointer"
                title="Undo last modification"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Undo</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-start">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700 flex items-start space-x-3 text-sm shadow-xs">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold uppercase text-xs tracking-wider">Operation Failed</p>
              <p className="text-xs mt-1">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="hover:text-red-900 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {pages.length === 0 ? (
          /* Empty/Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 max-w-2xl mx-auto w-full">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full"
            >
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border-2 border-dashed border-slate-200 hover:border-blue-500 rounded p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 shadow-xs hover:shadow-sm flex flex-col items-center group relative overflow-hidden"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden" 
                  accept="application/pdf"
                />

                <div className="bg-blue-50 text-blue-600 p-4 rounded mb-6 group-hover:scale-110 transition-transform duration-200">
                  <FileUp className="h-10 w-10" />
                </div>

                <h3 className="text-lg font-display font-bold text-slate-800 uppercase tracking-tight mb-2">
                  Select or Drag & Drop PDF
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">
                  Supports multi-page documents & merges
                </p>

                <button 
                  type="button" 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded uppercase text-xs tracking-wider transition-colors shadow-xs cursor-pointer"
                >
                  Choose PDF File
                </button>
              </div>

              {/* Sample PDF Option */}
              <div className="mt-8 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-4">Or Instant Sandbox Demo</p>
                <button
                  onClick={handleUseSample}
                  disabled={isLoading}
                  className="inline-flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold py-3 px-6 rounded border border-slate-200 transition-colors uppercase tracking-wider text-xs cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Load Sample 3-Page PDF</span>
                </button>
                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                  Generate a custom vector layout PDF in-memory to test splitting, rotation, merging, and compression immediately without uploading files.
                </p>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Main Editor Layout */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Grid of Pages (Left/Main side) */}
            <div className="lg:col-span-8 flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Page Organizer
                  </h2>
                  <h3 className="text-sm font-bold text-slate-600 font-display">
                    Organize document pages <span className="ml-1 font-mono text-xs text-slate-400 font-semibold">({pages.length} Pages)</span>
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowBlankPageDropdown(!showBlankPageDropdown)}
                      className="inline-flex items-center space-x-1 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer"
                      title="Add a blank page"
                    >
                      <Plus className="h-3.5 w-3.5 text-blue-600" />
                      <span>Add Blank Page</span>
                      <ChevronDown className="h-3 w-3 ml-0.5 text-slate-400" />
                    </button>
                    {showBlankPageDropdown && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setShowBlankPageDropdown(false)} />
                        <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded shadow-md py-1.5 z-30">
                          <button
                            onClick={() => {
                              addBlankPage('letter', 'portrait');
                              setShowBlankPageDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-[11px] text-slate-700 hover:bg-slate-50 font-bold uppercase tracking-wider"
                          >
                            Letter Portrait
                          </button>
                          <button
                            onClick={() => {
                              addBlankPage('letter', 'landscape');
                              setShowBlankPageDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-[11px] text-slate-700 hover:bg-slate-50 font-bold uppercase tracking-wider"
                          >
                            Letter Landscape
                          </button>
                          <div className="h-[1px] bg-slate-100 my-1" />
                          <button
                            onClick={() => {
                              addBlankPage('a4', 'portrait');
                              setShowBlankPageDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-[11px] text-slate-700 hover:bg-slate-50 font-bold uppercase tracking-wider"
                          >
                            A4 Portrait
                          </button>
                          <button
                            onClick={() => {
                              addBlankPage('a4', 'landscape');
                              setShowBlankPageDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-[11px] text-slate-700 hover:bg-slate-50 font-bold uppercase tracking-wider"
                          >
                            A4 Landscape
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => addFileInputRef.current?.click()}
                    className="inline-flex items-center space-x-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer"
                    title="Append another PDF to the end"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Merge PDF</span>
                  </button>
                  <input 
                    type="file" 
                    ref={addFileInputRef} 
                    onChange={(e) => e.target.files?.[0] && handleAddPdfUpload(e.target.files[0])}
                    className="hidden" 
                    accept="application/pdf"
                  />
                </div>
              </div>

              {/* Grid Content */}
              <div className="bg-white border border-slate-200 rounded p-4 sm:p-6 min-h-[400px] shadow-xs">
                {/* Bulk Actions Toolbar */}
                {pages.length > 0 && (
                  <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                    <div className="flex items-center space-x-3">
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={pages.length > 0 && selectedPageIds.length === pages.length}
                          ref={(input) => {
                            if (input) {
                              input.indeterminate = selectedPageIds.length > 0 && selectedPageIds.length < pages.length;
                            }
                          }}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Select All
                        </span>
                      </label>
                      <div className="h-4 w-[1px] bg-slate-300 hidden sm:block"></div>
                      <span className="text-xs font-medium text-slate-500">
                        {selectedPageIds.length > 0 ? (
                          <span className="font-bold text-blue-600">
                            {selectedPageIds.length} of {pages.length} selected
                          </span>
                        ) : (
                          "No pages selected"
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={rotateSelectedPages}
                        disabled={selectedPageIds.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-700 border border-slate-200 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:cursor-not-allowed shadow-xs"
                        title="Rotate selected pages 90 degrees"
                      >
                        <RotateCw className="h-3.5 w-3.5 text-slate-500" />
                        <span className="hidden md:inline">Rotate (90°)</span>
                        <span className="md:hidden">Rotate</span>
                      </button>

                      <button
                        onClick={duplicateSelectedPages}
                        disabled={selectedPageIds.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-700 border border-slate-200 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:cursor-not-allowed shadow-xs"
                        title="Duplicate selected pages"
                      >
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span className="hidden md:inline">Duplicate</span>
                        <span className="md:hidden">Dup</span>
                      </button>

                      <button
                        onClick={() => setIsBatchRenameOpen(true)}
                        disabled={selectedPageIds.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-700 border border-slate-200 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:cursor-not-allowed shadow-xs"
                        title="Batch rename exported file labels for selected pages"
                      >
                        <Tag className="h-3.5 w-3.5 text-blue-600" />
                        <span className="hidden md:inline">Batch Rename</span>
                        <span className="md:hidden">Rename</span>
                      </button>

                      <div className="h-6 w-[1px] bg-slate-200"></div>

                      <button
                        onClick={deleteSelectedPages}
                        disabled={selectedPageIds.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:hover:bg-rose-50 text-rose-700 border border-rose-100 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:cursor-not-allowed shadow-xs"
                        title="Delete selected pages"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        <span>Delete</span>
                      </button>

                      {history.length > 0 && (
                        <>
                          <div className="h-6 w-[1px] bg-slate-200"></div>
                          <button
                            onClick={undo}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-xs"
                            title="Undo last change"
                          >
                            <Undo2 className="h-3.5 w-3.5 text-slate-500" />
                            <span>Undo</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  <AnimatePresence initial={false}>
                    {pages.map((page, index) => {
                      const thumb = thumbnails[getThumbKey(page)];
                      const isSelected = selectedPageIds.includes(page.id);
                      return (
                        <motion.div
                          key={page.id}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => togglePageSelection(page.id)}
                          draggable
                          onDragStart={(e) => {
                            setDraggedIndex(index);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (draggedIndex !== null && draggedIndex !== index) {
                              setDragOverIndex(index);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverIndex === index) {
                              setDragOverIndex(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handlePageDrop(index);
                          }}
                          onDragEnd={() => {
                            setDraggedIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`bg-white border rounded p-2 flex flex-col justify-between shadow-xs page-grid-item relative group transition-all select-none cursor-grab active:cursor-grabbing ${
                            isSelected 
                              ? 'border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/5' 
                              : 'border-slate-200 hover:border-slate-300'
                          } ${
                            draggedIndex === index ? 'opacity-40 border-dashed border-slate-400 bg-slate-50' : ''
                          } ${
                            dragOverIndex === index ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1 bg-blue-50/10 scale-[1.02]' : ''
                          }`}
                        >
                          {/* Page Index Badge with Interactive Checkbox */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePageSelection(page.id);
                            }}
                            className={`absolute top-3 left-3 flex items-center space-x-1 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold z-10 uppercase tracking-wider shadow-sm border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-900/95 border-slate-800 text-slate-100 hover:bg-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Controlled by outer badge click
                              className="h-3 w-3 rounded-sm border-slate-400 text-blue-500 focus:ring-0 cursor-pointer pointer-events-none"
                            />
                            <GripVertical className="h-3 w-3 text-slate-400 pointer-events-none opacity-80" />
                            <span>Page {index + 1}</span>
                          </div>

                          {/* Original Document Indicator if multiple */}
                          {page.sourceFileId === 'blank' ? (
                            <div className="absolute top-3 right-3 bg-slate-500 text-white font-mono text-[8px] px-1.5 py-0.5 rounded z-10 uppercase font-bold">
                              Blank
                            </div>
                          ) : Object.keys(sourceFiles).length > 1 && (
                            <div className="absolute top-3 right-3 bg-blue-600 text-white font-mono text-[8px] px-1.5 py-0.5 rounded z-10 max-w-[80px] truncate uppercase font-bold" title={sourceFiles[page.sourceFileId]?.name}>
                              Doc {Object.keys(sourceFiles).indexOf(page.sourceFileId) + 1}
                            </div>
                          )}

                          {/* Thumbnail Frame */}
                          <div className="aspect-[3/4] bg-slate-50 border border-slate-100 rounded overflow-hidden flex items-center justify-center relative my-1 select-none">
                            {page.sourceFileId === 'blank' ? (
                              <div className="w-full h-full bg-white flex flex-col items-center justify-center p-3 border border-dashed border-slate-200" style={{ transform: `rotate(${page.rotation}deg)` }}>
                                <span className="text-[9px] text-slate-300 font-bold uppercase tracking-widest text-center">Blank Page</span>
                                <span className="text-[8px] text-slate-400 font-mono mt-0.5">{page.width} × {page.height} pt</span>
                              </div>
                            ) : thumb ? (
                              <img
                                src={thumb}
                                alt={`Page ${index + 1}`}
                                className="w-full h-full object-contain transition-transform"
                                style={{ transform: `rotate(${page.rotation}deg)` }}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-slate-300">
                                <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                                <span className="text-[10px] mt-2 font-mono">Rendering...</span>
                              </div>
                            )}

                            {/* Fullscreen Button on Hover */}
                            {(thumb || page.sourceFileId === 'blank') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewPage(page);
                                }}
                                className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-950 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition duration-150 shadow-sm cursor-pointer"
                                title="Preview full screen"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Custom Export Label Badge */}
                          {page.customLabel && (
                            <div className="mt-1 mb-0.5 px-2 py-1 rounded bg-blue-50/90 border border-blue-200/80 text-blue-700 text-[10px] font-mono font-semibold flex items-center justify-between gap-1 shadow-2xs">
                              <div className="flex items-center gap-1.5 min-w-0 truncate" title={`Export filename: ${page.customLabel}`}>
                                <Tag className="h-3 w-3 shrink-0 text-blue-600" />
                                <span className="truncate">{page.customLabel}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearSingleLabel(page.id);
                                }}
                                className="text-slate-400 hover:text-rose-600 transition p-0.5 rounded cursor-pointer shrink-0"
                                title="Clear custom label"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}

                          {/* Controls Footer */}
                          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col space-y-1.5">
                            {/* Reordering Controls (Touch Target sizes optimized) */}
                            <div className="flex items-center justify-between">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePage(index, 'left');
                                }}
                                disabled={index === 0}
                                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors"
                                title="Move back"
                              >
                                <MoveLeft className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  rotatePage(page.id);
                                }}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
                                title="Rotate 90°"
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicatePage(page);
                                }}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
                                title="Duplicate page"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePage(index, 'right');
                                }}
                                disabled={index === pages.length - 1}
                                className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-slate-600 transition-colors"
                                title="Move forward"
                              >
                                <MoveRight className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Edit, Split & Delete Action buttons */}
                            <div className="flex gap-1 mt-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditor(page, 'text');
                                }}
                                className="flex-1 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-800 transition flex items-center justify-center space-x-1 text-[11px] font-bold uppercase tracking-wider cursor-pointer border border-slate-200"
                                title="Edit this page's text"
                              >
                                <Edit className="h-3 w-3 text-blue-500" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditor(page, 'split');
                                }}
                                className="flex-1 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-800 transition flex items-center justify-center space-x-1 text-[11px] font-bold uppercase tracking-wider cursor-pointer border border-slate-200"
                                title="Split page into two separate pages"
                              >
                                <Scissors className="h-3 w-3 text-rose-500" />
                                <span>Split</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletePage(page.id);
                                }}
                                className="px-2 py-1 rounded hover:bg-rose-50 text-rose-600 hover:text-rose-700 transition flex items-center justify-center space-x-1 text-[11px] font-bold uppercase tracking-wider cursor-pointer border border-transparent hover:border-rose-100"
                                title="Delete page"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Sidebar Controls (Right side) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Document Overview card */}
              <div className="bg-white border border-slate-200 rounded p-5 shadow-xs">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Document Details
                </h2>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Original Size</p>
                    <p className="text-sm font-mono font-bold text-slate-700 mt-1">{formatSize(originalTotalSize)}</p>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded">
                    <p className="text-[10px] uppercase font-bold text-blue-500 tracking-wider">Pages Active</p>
                    <p className="text-sm font-mono font-bold text-blue-700 mt-1">{pages.length}</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Source Files:</span>
                    <span className="font-bold text-slate-700">
                      {Object.keys(sourceFiles).length} {Object.keys(sourceFiles).length === 1 ? 'PDF' : 'PDFs'}
                    </span>
                  </div>
                </div>

                {/* Bulk tools */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={reversePages}
                      disabled={pages.length === 0}
                      className="py-2 px-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100 disabled:cursor-not-allowed text-slate-700 rounded text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border border-slate-200"
                    >
                      Reverse Order
                    </button>
                    <button
                      onClick={clearAll}
                      disabled={pages.length === 0}
                      className="py-2 px-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:hover:bg-rose-50 disabled:cursor-not-allowed text-rose-700 rounded text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border border-rose-100"
                    >
                      Remove All
                    </button>
                  </div>
                  <button
                    onClick={rotateAllPages}
                    disabled={pages.length === 0}
                    className="w-full py-2 px-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100 disabled:cursor-not-allowed text-slate-700 rounded text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border border-slate-200 flex items-center justify-center space-x-1"
                  >
                    <RotateCw className="h-3.5 w-3.5 mr-1" />
                    <span>Rotate All (90°)</span>
                  </button>
                </div>
              </div>

              {/* Compression & Formatting Settings */}
              <div className="bg-white border border-slate-200 rounded p-5 shadow-xs">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Optimization Level
                </h2>

                {/* Compression Preset Selector */}
                <div className="space-y-4">
                  <div>
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded">
                      {(['low', 'medium', 'high'] as CompressionPreset[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, preset: p }))}
                          className={`py-1.5 px-2 text-[10px] uppercase font-bold tracking-wider rounded transition cursor-pointer ${
                            settings.preset === p
                              ? 'bg-white text-blue-600 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {p === 'low' ? 'Standard' : p === 'medium' ? 'Medium' : 'High'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Settings Explainer Box */}
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded text-[11px] text-slate-500 flex items-start space-x-2">
                    <Info className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                    <div>
                      {settings.preset === 'low' && (
                        <p>
                          <strong>Standard (Perfect Vector Quality)</strong>: Cleans metadata, structural objects, and links. Retains crisp vector text & original graphics. Minimal size reduction.
                        </p>
                      )}
                      {settings.preset === 'medium' && (
                        <p>
                          <strong>Medium (Balanced Flat)</strong>: Flatten all pages into JPEG scans at 150 DPI. Strong compression and high visual accuracy. Recommended.
                        </p>
                      )}
                      {settings.preset === 'high' && (
                        <p>
                          <strong>High (Compressed Scan)</strong>: Resamples the entire page geometry to 100 DPI with 50% image quality. Drastically reduces the final PDF size footprint.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Manual/Custom Options */}
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flatten & Downsample</span>
                      <input
                        type="checkbox"
                        checked={settings.compressImages}
                        onChange={(e) => setSettings(prev => ({ 
                          ...prev, 
                          compressImages: e.target.checked,
                          preset: 'custom'
                        }))}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>

                    {settings.compressImages && (
                      <div className="space-y-3 pl-3 border-l-2 border-slate-200">
                        {/* Quality Slider */}
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1 font-bold">
                            <span>Image Quality</span>
                            <span className="font-mono text-blue-600">{Math.round(settings.imageQuality * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={settings.imageQuality}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              imageQuality: parseFloat(e.target.value),
                              preset: 'custom'
                            }))}
                            className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Resolution DPI Selector */}
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1 font-bold">
                            <span>Target DPI Resolution</span>
                            <span className="font-mono text-blue-600">{settings.dpi} DPI</span>
                          </div>
                          <select
                            value={settings.dpi}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              dpi: parseInt(e.target.value),
                              preset: 'custom'
                            }))}
                            className="w-full bg-slate-50 border border-slate-200 rounded text-xs py-1.5 px-2 text-slate-700"
                          >
                            <option value="72">72 DPI (Low Screen Spec)</option>
                            <option value="100">100 DPI (Highly Compressed)</option>
                            <option value="150">150 DPI (Standard Screen)</option>
                            <option value="200">200 DPI (High Quality)</option>
                            <option value="300">300 DPI (Print Resolution)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 space-y-3">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        Advanced Data Stripping
                      </span>
                      
                      {/* Strip Metadata */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.stripMetadata}
                              onChange={(e) => setSettings(prev => ({ ...prev, stripMetadata: e.target.checked }))}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span>Strip Metadata</span>
                          </label>
                          <p className="text-[10px] text-slate-400 ml-5.5">
                            Purge producer, author, title, and application tags.
                          </p>
                        </div>
                        {optionalSavings.metadata > 0 && (
                          <span className={`text-[10px] font-mono font-bold shrink-0 mt-0.5 ${settings.stripMetadata ? 'text-emerald-600' : 'text-slate-400'}`}>
                            Saves ~{formatSize(optionalSavings.metadata)}
                          </span>
                        )}
                      </div>

                      {/* Remove Unused Fonts */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.removeUnusedFonts}
                              onChange={(e) => setSettings(prev => ({ ...prev, removeUnusedFonts: e.target.checked }))}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span>Remove Unused Fonts</span>
                          </label>
                          <p className="text-[10px] text-slate-400 ml-5.5">
                            Purge redundant font streams and compress embedded subset descriptors.
                          </p>
                        </div>
                        {optionalSavings.fonts > 0 && (
                          <span className={`text-[10px] font-mono font-bold shrink-0 mt-0.5 ${settings.removeUnusedFonts ? 'text-emerald-600' : 'text-slate-400'}`}>
                            Saves ~{formatSize(optionalSavings.fonts)}
                          </span>
                        )}
                      </div>

                      {/* Remove Hyperlinks */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settings.removeHyperlinks}
                              onChange={(e) => setSettings(prev => ({ ...prev, removeHyperlinks: e.target.checked }))}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span>Remove Hyperlinks</span>
                          </label>
                          <p className="text-[10px] text-slate-400 ml-5.5">
                            Remove interactive links, web URI actions, and page annotations.
                          </p>
                        </div>
                        {optionalSavings.hyperlinks > 0 && (
                          <span className={`text-[10px] font-mono font-bold shrink-0 mt-0.5 ${settings.removeHyperlinks ? 'text-emerald-600' : 'text-slate-400'}`}>
                            Saves ~{formatSize(optionalSavings.hyperlinks)}
                          </span>
                        )}
                      </div>

                      {/* Summary Banner */}
                      {optionalSavings.totalChecked > 0 && (
                        <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded p-2 text-center text-[11px] text-emerald-800 font-medium">
                          Selected options will save an additional{' '}
                          <span className="font-mono font-bold">~{formatSize(optionalSavings.totalChecked)}</span>!
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* PDF Actions & Compiled output Card */}
              <div className="bg-slate-900 text-white rounded p-5 shadow-md space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-32 h-32 bg-blue-600 rounded-full opacity-10 blur-xl pointer-events-none" />

                <h3 className="font-display font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-400" />
                  <span>Build Output</span>
                </h3>

                <p className="text-[11px] text-slate-300 leading-relaxed opacity-80">
                  Compile your customized pages and reorder structure to local storage. No server uploads.
                </p>

                {compiledPdf || compiledImages ? (
                   /* Output Success State */
                  <div className="bg-slate-800/80 border border-slate-700 rounded p-4 space-y-3.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[9px] text-blue-400 uppercase tracking-widest font-bold">
                          Compiled {exportFormat === 'pdf' ? 'PDF File' : `${exportFormat.toUpperCase()} Images`}
                        </p>
                        <p className="text-xs font-bold truncate max-w-[150px]" title={compiledPdf ? compiledPdf.name : compiledImages!.name}>
                          {compiledPdf ? compiledPdf.name : compiledImages!.name}
                        </p>
                      </div>
                      {compiledPdf && (
                        <span className="bg-blue-600 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                          -{compressionSavingsPercent}% Saved
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-300 border-t border-slate-700 pt-2.5">
                      <div>
                        <span className="block text-slate-500 uppercase text-[9px] font-bold tracking-wider">Pages</span>
                        <span className="font-mono font-bold">
                          {exportFormat === 'pdf' ? activeCompilePages.length : selectedPageIds.length}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-blue-400 uppercase text-[9px] font-bold tracking-wider">Output Size</span>
                        <span className="font-mono font-bold text-white">
                          {formatSize(compiledPdf ? compiledPdf.size : compiledImages!.size)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={triggerDownload}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded text-xs uppercase tracking-wider transition-colors duration-150 flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download {exportFormat === 'pdf' ? 'Modified PDF' : `${exportFormat.toUpperCase()} Images`}</span>
                    </button>
                  </div>
                ) : (
                  /* Trigger Export Action Button */
                  <div className="space-y-3">
                    {/* FORMAT SELECTION: PDF or Image */}
                    <div className="bg-slate-850 p-2.5 rounded border border-slate-800 space-y-1.5">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        Export Format
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => setExportFormat('pdf')}
                          className={`py-1.5 px-2 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer ${exportFormat === 'pdf' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:bg-slate-750'}`}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportFormat('png')}
                          className={`py-1.5 px-2 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer ${exportFormat === 'png' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:bg-slate-750'}`}
                        >
                          PNG
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportFormat('jpeg')}
                          className={`py-1.5 px-2 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer ${exportFormat === 'jpeg' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400 hover:bg-slate-750'}`}
                        >
                          JPEG
                        </button>
                      </div>
                    </div>

                    {exportFormat !== 'pdf' && (
                      <div className="bg-slate-850 p-3 rounded border border-slate-800 space-y-3">
                        {/* ZIP vs Individual */}
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                            Export Mode
                          </label>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => setExportMethod('zip')}
                              className={`py-1 px-2 rounded text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer ${exportMethod === 'zip' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-750'}`}
                            >
                              Single ZIP
                            </button>
                            <button
                              type="button"
                              onClick={() => setExportMethod('individual')}
                              className={`py-1 px-2 rounded text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer ${exportMethod === 'individual' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-750'}`}
                            >
                              Separate Files
                            </button>
                          </div>
                        </div>

                        {/* Image Resolution/Scale Selection */}
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            Resolution Scale
                          </label>
                          <select
                            value={exportScale}
                            onChange={(e) => setExportScale(parseFloat(e.target.value))}
                            className="w-full bg-slate-800 border border-slate-700 rounded text-xs py-1.5 px-2 text-slate-300 focus:outline-none focus:border-slate-500 cursor-pointer"
                          >
                            <option value="1.0">1.0x (Standard Web - Fast)</option>
                            <option value="1.5">1.5x (Medium Quality)</option>
                            <option value="2.0">2.0x (High Quality - Recommended)</option>
                            <option value="3.0">3.0x (Ultra Sharp - Print Ready)</option>
                          </select>
                        </div>

                        {/* Selection check */}
                        {selectedPageIds.length === 0 ? (
                          <div className="bg-yellow-950/40 border border-yellow-800/40 p-2.5 rounded text-[10px] text-yellow-300 leading-normal flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-400" />
                            <span>Select page(s) in the organizer above to enable image export. Only selected pages can be exported as PNG/JPEG.</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-400 leading-normal flex items-center gap-1.5">
                            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            <span>{selectedPageIds.length} page{selectedPageIds.length > 1 ? 's' : ''} ready for export.</span>
                          </div>
                        )}
                      </div>
                    )}

                    {exportFormat === 'pdf' && selectedPageIds.length > 0 && (
                      <div className="bg-slate-800/60 border border-slate-700/50 rounded p-3 flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <span className="block text-xs font-bold text-slate-200">Merge Selected Only</span>
                          <span className="block text-[10px] text-slate-400 leading-normal">
                            Only include the {selectedPageIds.length} selected page{selectedPageIds.length > 1 ? 's' : ''} in the compiled PDF. Other pages are left untouched in the workspace.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={mergeOnlySelected}
                          onChange={(e) => {
                            setMergeOnlySelected(e.target.checked);
                          }}
                          className="h-4 w-4 shrink-0 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                    )}

                    {exportFormat === 'pdf' && pages.length > 0 && (
                      <div className="bg-slate-800/60 border border-slate-700/50 rounded p-3 space-y-2">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          <span>Expected Outcome</span>
                          <span className={`${expectedFinalSize < originalCompileSize ? 'text-emerald-400' : 'text-slate-400'} font-mono`}>
                            {expectedFinalSize < originalCompileSize 
                              ? `~${Math.round((1 - expectedFinalSize / originalCompileSize) * 100)}% smaller` 
                              : 'No size change'}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-800 pt-1.5">
                          <div>
                            <span className="block text-slate-500 uppercase text-[9px] font-bold tracking-wider">Original</span>
                            <span className="font-mono text-slate-300 font-bold">{formatSize(originalCompileSize)}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-emerald-400 uppercase text-[9px] font-bold tracking-wider">Estimated Final</span>
                            <span className="font-mono font-bold text-white">~{formatSize(expectedFinalSize)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {exportFormat !== 'pdf' && selectedPageIds.length > 0 && (
                      <div className="bg-slate-800/60 border border-slate-700/50 rounded p-3 space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          <span>Export Summary</span>
                          <span className="text-blue-400 font-mono font-bold">
                            {exportFormat.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-800 pt-1.5 text-slate-300">
                          <div>
                            <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">Pages To Export</span>
                            <span className="font-mono font-bold text-white">{selectedPageIds.length} page{selectedPageIds.length > 1 ? 's' : ''}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">Method</span>
                            <span className="font-mono text-white font-bold">{exportMethod === 'zip' ? 'Single ZIP File' : 'Separate Files'}</span>
                          </div>
                        </div>
                        {selectedPagesInOrder.some(p => !!p.customLabel) && (
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-800 text-[10px] text-blue-400 font-mono">
                            <Tag className="h-3 w-3 shrink-0" />
                            <span>Custom filenames active ({selectedPagesInOrder.filter(p => !!p.customLabel).length} of {selectedPagesInOrder.length})</span>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={processDocument}
                      disabled={isCompiling || (exportFormat === 'pdf' ? activeCompilePages.length === 0 : selectedPageIds.length === 0)}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 px-4 rounded text-xs uppercase tracking-wider transition-colors duration-150 flex items-center justify-center space-x-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                    >
                      {isCompiling ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Processing Document...</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          <span>
                            {exportFormat === 'pdf'
                              ? (isMergingOnlySelected ? `Process & Save Selected (${selectedPageIds.length})` : 'Process & Save PDF')
                              : `Export Selected (${selectedPageIds.length}) as ${exportFormat.toUpperCase()}`}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Processing overlay/bar if compiling */}
                {isCompiling && (
                  <div className="bg-slate-800 p-3 rounded border border-slate-700/80">
                    <p className="text-[10px] text-blue-400 font-mono text-center mb-1.5 uppercase font-bold tracking-wider">{processingStatus}</p>
                    <div className="w-full bg-slate-750 h-1 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${(compilingProgress.current / compilingProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}
      </main>

      {/* Global Processing/Uploading Spinner for files */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded p-6 max-w-sm w-full text-center shadow-lg border border-slate-200 flex flex-col items-center">
            <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-4" />
            <h4 className="font-display font-bold text-slate-800 text-sm uppercase tracking-wider">Parsing Document</h4>
            <p className="text-xs text-slate-400 font-bold uppercase mt-1 mb-4">Analyzing Page Structures...</p>
            
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-200"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <span className="font-mono text-xs text-slate-400 mt-2 font-bold">{loadingProgress}% Complete</span>
          </div>
        </div>
      )}

      {/* Interactive PDF Page Preview Modal */}
      {previewPage && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-2xl w-full h-[90vh] flex flex-col shadow-xl border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between shrink-0">
              <div>
                <h4 className="font-display font-bold text-slate-900 text-sm uppercase tracking-wider">
                  Page Detail View
                </h4>
                <p className="text-[10px] text-slate-400 font-mono font-bold mt-0.5 uppercase">
                  Dimensions: {Math.round(previewPage.width)} × {Math.round(previewPage.height)} pt
                </p>
              </div>
              <button 
                onClick={() => setPreviewPage(null)} 
                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Image Area */}
            <div className="flex-1 bg-slate-900 p-4 overflow-auto flex items-center justify-center relative">
              {previewPage.sourceFileId === 'blank' ? (
                <div 
                  className="w-[380px] h-[520px] bg-white flex flex-col items-center justify-center p-6 border border-dashed border-slate-300 shadow-2xl rounded-xs select-none" 
                  style={{ transform: `rotate(${previewPage.rotation}deg)` }}
                >
                  <span className="text-sm text-slate-300 font-bold uppercase tracking-widest text-center">Blank Page</span>
                  <span className="text-xs text-slate-400 font-mono mt-1">{previewPage.width} × {previewPage.height} pt</span>
                </div>
              ) : (highResPreviews[getThumbKey(previewPage)] || thumbnails[getThumbKey(previewPage)]) ? (
                <img
                  src={highResPreviews[getThumbKey(previewPage)] || thumbnails[getThumbKey(previewPage)]}
                  alt="PDF Page Preview"
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-xs"
                  style={{ transform: `rotate(${previewPage.rotation}deg)` }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="text-center text-slate-400">
                  <RefreshCw className="h-8 w-8 animate-spin text-slate-500 mx-auto mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider">Rendering page grid...</p>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-150 flex items-center justify-between shrink-0 bg-slate-50 rounded-b">
              <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                Doc: <span className="text-slate-700 truncate max-w-[200px] inline-block align-bottom font-mono lowercase tracking-normal">
                  {previewPage.sourceFileId === 'blank' ? 'Blank Page' : sourceFiles[previewPage.sourceFileId]?.name}
                </span>
              </div>
              <button
                onClick={() => {
                  rotatePage(previewPage.id);
                  // Update current preview model to reflect immediately
                  setPreviewPage(prev => prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null);
                }}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 px-4 rounded transition text-[11px] uppercase tracking-wider flex items-center space-x-1.5 shadow-xs cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5 text-blue-600" />
                <span>Rotate 90°</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Success Toast Notification */}
      <AnimatePresence>
        {splitSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-lg shadow-2xl border border-slate-700 backdrop-blur-md flex items-center gap-3 text-xs font-semibold"
          >
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{splitSuccessToast}</span>
            <button
              onClick={() => setSplitSuccessToast(null)}
              className="ml-2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Rename Success Toast Notification */}
      <AnimatePresence>
        {batchRenameToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-lg shadow-2xl border border-slate-700 backdrop-blur-md flex items-center gap-3 text-xs font-semibold"
          >
            <CheckCircle className="h-4 w-4 text-blue-400 shrink-0" />
            <span>{batchRenameToast}</span>
            <button
              onClick={() => setBatchRenameToast(null)}
              className="ml-2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Rename Modal Dialog */}
      {isBatchRenameOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-600">
                  <Tag className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    <span>Batch Rename Export Labels</span>
                    <span className="font-mono text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                      {selectedPagesInOrder.length} Page{selectedPagesInOrder.length > 1 ? 's' : ''} Selected
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Configure a sequential naming pattern for all selected pages when exported as images or in a ZIP package.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchRenameOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-700 transition cursor-pointer"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-140px)] space-y-4 text-slate-700">
              
              {/* Pattern Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Prefix */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Filename Prefix
                    </label>
                    <span className="text-[10px] text-slate-400">e.g. Doc-, Invoice_</span>
                  </div>
                  <input
                    type="text"
                    value={batchPrefix}
                    onChange={(e) => setBatchPrefix(e.target.value)}
                    placeholder="e.g. Doc-"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                  />
                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['Doc-', 'Page-', 'Invoice_', 'Scan_', 'Slide_', 'Chapter-'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBatchPrefix(preset)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
                          batchPrefix === preset
                            ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Suffix */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Suffix (Optional)
                    </label>
                  </div>
                  <input
                    type="text"
                    value={batchSuffix}
                    onChange={(e) => setBatchSuffix(e.target.value)}
                    placeholder="e.g. _v1 or _final"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['', '_final', '_v1', '_signed'].map(suffixPreset => (
                      <button
                        key={suffixPreset || 'none'}
                        type="button"
                        onClick={() => setBatchSuffix(suffixPreset)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
                          batchSuffix === suffixPreset
                            ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {suffixPreset || 'None'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Start Number and Number Padding */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-150">
                {/* Start Number */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Starting Number
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setBatchStartNum(prev => Math.max(0, prev - 1))}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-xs font-bold transition cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={batchStartNum}
                      onChange={(e) => setBatchStartNum(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setBatchStartNum(prev => prev + 1)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-xs font-bold transition cursor-pointer"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchStartNum(1)}
                      className="text-[10px] text-slate-500 hover:text-slate-800 uppercase font-bold ml-1 cursor-pointer"
                    >
                      Reset (1)
                    </button>
                  </div>
                </div>

                {/* Padding Presets */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Number Format / Padding
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { val: 3, label: '001', desc: '3 Digits' },
                      { val: 2, label: '01', desc: '2 Digits' },
                      { val: 1, label: '1', desc: 'No Padding' },
                    ].map(pad => (
                      <button
                        key={pad.val}
                        type="button"
                        onClick={() => setBatchPadding(pad.val)}
                        className={`p-1.5 rounded border text-center transition cursor-pointer ${
                          batchPadding === pad.val
                            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-400 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block font-mono font-bold text-xs">{pad.label}</span>
                        <span className="block text-[9px] text-slate-400">{pad.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Preview List */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <ListOrdered className="h-3.5 w-3.5 text-blue-600" />
                    <span>Live Filename Preview ({selectedPagesInOrder.length} pages)</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Preview format: {exportFormat === 'pdf' ? '.png / .jpg' : `.${exportFormat}`}
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/60 max-h-48 overflow-y-auto">
                  <div className="divide-y divide-slate-200 text-xs">
                    {selectedPagesInOrder.map((page, idx) => {
                      const docIndex = pages.findIndex(p => p.id === page.id) + 1;
                      const calculatedLabel = computeBatchLabel(idx);
                      const fileExt = exportFormat === 'jpeg' ? 'jpg' : (exportFormat === 'png' ? 'png' : 'png');
                      return (
                        <div key={page.id} className="px-3 py-2 flex items-center justify-between hover:bg-white transition-colors gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold shrink-0">
                              Doc Page #{docIndex}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate" title={sourceFiles[page.sourceFileId]?.name || 'Blank'}>
                              {page.sourceFileId === 'blank' ? 'Blank Canvas' : (sourceFiles[page.sourceFileId]?.name || 'Document')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-slate-300">→</span>
                            <span className="font-mono font-bold text-[11px] text-blue-700 bg-blue-50 border border-blue-200/90 px-2 py-0.5 rounded shadow-2xs flex items-center gap-1">
                              <Tag className="h-2.5 w-2.5 text-blue-500" />
                              <span>{calculatedLabel}.{fileExt}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-150 flex items-center justify-between shrink-0 bg-slate-50">
              <div>
                {selectedPagesInOrder.some(p => !!p.customLabel) && (
                  <button
                    type="button"
                    onClick={handleClearBatchRename}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold uppercase tracking-wider px-2 py-1.5 rounded hover:bg-rose-50 transition cursor-pointer border border-transparent hover:border-rose-200"
                  >
                    Reset to Default Names
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBatchRenameOpen(false)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyBatchRename}
                  disabled={selectedPagesInOrder.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-sm flex items-center space-x-1.5 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Apply to {selectedPagesInOrder.length} Page{selectedPagesInOrder.length > 1 ? 's' : ''}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive PDF Page Editor Modal */}
      {activeEditorPage && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-150 flex flex-col md:flex-row md:items-center md:justify-between shrink-0 bg-slate-50 gap-3">
              <div className="flex items-center space-x-4">
                <div>
                  <h4 className="font-display font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    <img 
                      src={logoUrl} 
                      alt="ND PDF Tools Logo" 
                      className="w-5 h-5 object-cover rounded-md border border-slate-200 shadow-xs shrink-0" 
                      referrerPolicy="no-referrer"
                    />
                    <span>ND PDF TOOLS: PAGE DETAIL VIEW</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono font-bold mt-0.5 uppercase">
                    Page Dimensions: {Math.round(activeEditorPage.width)} × {Math.round(activeEditorPage.height)} pt
                  </p>
                </div>

                {/* Mode Switcher */}
                <div className="flex bg-slate-200/80 p-0.5 rounded border border-slate-300">
                  <button
                    onClick={() => {
                      setEditorMode('text');
                      setIsAddingText(false);
                    }}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer ${
                      editorMode === 'text'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Edit Text
                  </button>
                  <button
                    onClick={() => {
                      setEditorMode('crop');
                      setIsAddingText(false);
                    }}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer ${
                      editorMode === 'crop'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Crop Page
                  </button>
                  <button
                    onClick={() => {
                      setEditorMode('split');
                      setIsAddingText(false);
                    }}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition cursor-pointer flex items-center gap-1.5 ${
                      editorMode === 'split'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Scissors className="h-3 w-3" />
                    <span>Split Page</span>
                  </button>
                </div>
              </div>

              {/* Toolbar Controls */}
              <div className="flex items-center space-x-2">
                {editorMode === 'text' ? (
                  <>
                    <button
                      onClick={() => setIsAddingText(!isAddingText)}
                      className={`inline-flex items-center space-x-1.5 text-xs px-3 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer border ${
                        isAddingText 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-2xs'
                      }`}
                      title="Click on the page to place a new text box"
                    >
                      <Type className="h-3.5 w-3.5" />
                      <span>{isAddingText ? 'Click on Page to Add' : 'Add Text'}</span>
                    </button>

                    <button
                      onClick={handleRemoveTextAnnotation}
                      disabled={!(activeEditorPage.textAnnotations && activeEditorPage.textAnnotations.length > 0)}
                      className="inline-flex items-center space-x-1.5 text-xs bg-white hover:bg-rose-50 text-rose-600 disabled:opacity-40 disabled:hover:bg-white disabled:text-slate-400 border border-slate-200 disabled:border-slate-100 px-3 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                      title="Remove all text annotations on this page"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove All User Added Text</span>
                    </button>
                  </>
                ) : editorMode === 'crop' ? (
                  <>
                    <button
                      onClick={() => handleSaveCrop(tempCrop)}
                      disabled={isDraggingCrop || !tempCrop}
                      className="inline-flex items-center space-x-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 border border-blue-600 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                      title="Save the selected crop region"
                    >
                      <Crop className="h-3.5 w-3.5" />
                      <span>Apply Crop</span>
                    </button>

                    <button
                      onClick={() => handleSaveCrop(null)}
                      disabled={!tempCrop && !activeEditorPage.crop}
                      className="inline-flex items-center space-x-1.5 text-xs bg-white hover:bg-rose-50 text-rose-600 disabled:opacity-40 border border-slate-200 px-3 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                      title="Clear crop and show full original page"
                    >
                      <RefreshCw className="h-3.5 w-3.5 animate-none" />
                      <span>Reset Crop</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleExecuteSplitPage}
                      className="inline-flex items-center space-x-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 border border-blue-600 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-sm active:scale-95"
                      title="Split this page into 2 separate pages in your document"
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      <span>Split into 2 Pages</span>
                    </button>

                    <button
                      onClick={() => setSplitPosition(0.5)}
                      disabled={splitPosition === 0.5}
                      className="inline-flex items-center space-x-1 text-xs bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 border border-slate-200 px-2.5 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                      title="Reset cut line to 50% midpoint"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>50%</span>
                    </button>
                  </>
                )}

                <div className="w-[1px] bg-slate-200 h-6 mx-1" />

                {/* Revert Last Change / Undo Button on the Panel */}
                <button
                  type="button"
                  onClick={handleEditorRevertLastChange}
                  disabled={editorHistory.length === 0}
                  className="inline-flex items-center space-x-1.5 text-xs bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 disabled:text-slate-400 border border-slate-300 disabled:border-slate-200 px-3 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                  title="Revert last change (Undo) - Ctrl+Z"
                >
                  <Undo2 className="h-3.5 w-3.5 text-slate-600" />
                  <span>Revert Last Change</span>
                  {editorHistory.length > 0 && (
                    <span className="ml-0.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-mono font-bold leading-none">
                      {editorHistory.length}
                    </span>
                  )}
                </button>

                {/* Cancel Button: Reject changes and do not apply */}
                <button
                  type="button"
                  onClick={handleEditorCancel}
                  className="inline-flex items-center space-x-1.5 text-xs bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 px-3.5 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-2xs active:scale-98"
                  title="Reject all changes made and exit without applying (Esc)"
                >
                  <X className="h-3.5 w-3.5 text-rose-500" />
                  <span>Cancel</span>
                </button>

                {/* Apply Button: Save and apply changes */}
                <button 
                  type="button"
                  onClick={handleEditorApply} 
                  className="inline-flex items-center space-x-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded transition font-bold uppercase tracking-wider cursor-pointer shadow-2xs active:scale-98 font-bold"
                  title="Apply changes and return to document"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Apply & Close</span>
                </button>
              </div>
            </div>

            {/* Modal main content area split into Workspace and Settings Sidebar */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-slate-900">
              
              {/* Workspace / Canvas Area */}
              <div 
                className="flex-1 bg-slate-900 p-8 overflow-auto flex items-center justify-center relative select-none"
                onClick={() => {
                  // Clicking on the empty background clears selection
                  setSelectedAnnotationId(null);
                  setSelectedLineId(null);
                }}
              >
                {/* Instructions Banner if no text added */}
                {editorMode === 'text' && (!activeEditorPage.textAnnotations || activeEditorPage.textAnnotations.length === 0) && !isAddingText && showEditorTooltip && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/95 border border-slate-700/50 backdrop-blur-md text-white pl-4 pr-3 py-2 rounded-full text-xs font-medium tracking-normal flex items-center gap-2 pointer-events-auto shadow-xl z-10">
                    <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="mr-1">Click "Add Text" at the top, then click anywhere on the page to place text.</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowEditorTooltip(false);
                      }}
                      className="p-1 hover:bg-slate-700/80 rounded-full text-slate-400 hover:text-white transition duration-150 cursor-pointer flex items-center justify-center shrink-0 animate-none"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                
                {editorMode === 'text' && isAddingText && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/95 border border-slate-700/50 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium tracking-normal flex items-center gap-2 pointer-events-none shadow-xl z-10">
                    <Type className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                    <span className="animate-pulse">Adding Mode: Click on the document page where you want text</span>
                  </div>
                )}

                {editorMode === 'crop' && showCropTooltip && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/95 border border-slate-700/50 backdrop-blur-md text-white pl-4 pr-3 py-2 rounded-full text-xs font-medium tracking-normal flex items-center gap-2 pointer-events-auto shadow-xl z-10">
                    <Crop className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                    <span>Crop Mode: Click and drag on the page to select crop area</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCropTooltip(false);
                      }}
                      className="p-1 hover:bg-slate-700/80 rounded-full text-slate-400 hover:text-white transition duration-150 cursor-pointer flex items-center justify-center shrink-0 animate-none ml-1.5"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                
                {editorMode === 'crop' && tempCrop && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/95 border border-slate-700/50 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-medium tracking-normal flex items-center gap-2 pointer-events-none shadow-xl z-10">
                    <span className="font-mono text-[10px]">Selected area: {Math.round(tempCrop.width * 100)}% × {Math.round(tempCrop.height * 100)}%</span>
                  </div>
                )}

                {editorMode === 'split' && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/95 border border-slate-700/50 backdrop-blur-md text-white pl-4 pr-3 py-2 rounded-full text-xs font-medium tracking-normal flex items-center gap-2 pointer-events-auto shadow-xl z-20">
                    <Scissors className="h-3.5 w-3.5 text-rose-400 animate-pulse shrink-0" />
                    <span>Split Mode: Click or drag the cut line on the page to divide into 2 separate pages</span>
                  </div>
                )}

                {/* The Page Container */}
                <div 
                  className={`relative shadow-2xl bg-white select-none transition-transform ${
                    editorMode === 'crop' 
                      ? 'cursor-crosshair' 
                      : editorMode === 'split'
                        ? (splitOrientation === 'horizontal' ? 'cursor-row-resize' : 'cursor-col-resize')
                        : (isAddingText ? 'cursor-crosshair' : 'cursor-default')
                  }`}
                  style={{
                    // Keep a clean aspect ratio and maximum sizing for responsive editing
                    width: '100%',
                    maxWidth: `${activeEditorPage.width * zoomScale}px`,
                    aspectRatio: `${activeEditorPage.width} / ${activeEditorPage.height}`,
                    transform: (editorMode === 'crop' || editorMode === 'split') ? 'none' : `rotate(${activeEditorPage.rotation}deg)`
                  }}
                  onMouseDown={(e) => {
                    if (editorMode === 'split') {
                      e.stopPropagation();
                      setIsDraggingSplitLine(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (splitOrientation === 'horizontal') {
                        const pos = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
                        setSplitPosition(pos);
                      } else {
                        const pos = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
                        setSplitPosition(pos);
                      }
                    } else if (editorMode === 'crop') {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const startX = e.clientX - rect.left;
                      const startY = e.clientY - rect.top;
                      setIsDraggingCrop(true);
                      setCropStart({ x: startX, y: startY });
                      setTempCrop({
                        x: startX / rect.width,
                        y: startY / rect.height,
                        width: 0,
                        height: 0
                      });
                    }
                  }}
                onMouseMove={(e) => {
                  if (editorMode === 'split' && isDraggingSplitLine) {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (splitOrientation === 'horizontal') {
                      const pos = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
                      setSplitPosition(pos);
                    } else {
                      const pos = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
                      setSplitPosition(pos);
                    }
                  } else if (editorMode === 'crop' && isDraggingCrop && cropStart) {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const currentX = e.clientX - rect.left;
                    const currentY = e.clientY - rect.top;
                    
                    const left = Math.max(0, Math.min(cropStart.x, currentX));
                    const top = Math.max(0, Math.min(cropStart.y, currentY));
                    const width = Math.min(rect.width - left, Math.abs(currentX - cropStart.x));
                    const height = Math.min(rect.height - top, Math.abs(currentY - cropStart.y));
                    
                    setTempCrop({
                      x: left / rect.width,
                      y: top / rect.height,
                      width: width / rect.width,
                      height: height / rect.height
                    });
                  }
                }}
                onMouseUp={(e) => {
                  if (editorMode === 'split') {
                    e.stopPropagation();
                    setIsDraggingSplitLine(false);
                  } else if (editorMode === 'crop' && isDraggingCrop) {
                    e.stopPropagation();
                    setIsDraggingCrop(false);
                    setCropStart(null);
                  }
                }}
                onClick={(e) => {
                  if (editorMode === 'text' && isAddingText) {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = (e.clientX - rect.left) / rect.width;
                    const clickY = (e.clientY - rect.top) / rect.height;
                    handleAddTextAnnotation(clickX, clickY);
                  } else if (editorMode === 'split') {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (splitOrientation === 'horizontal') {
                      const pos = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
                      setSplitPosition(pos);
                    } else {
                      const pos = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
                      setSplitPosition(pos);
                    }
                  }
                }}
              >
                {/* PDF Page Image or Blank Template */}
                {activeEditorPage.sourceFileId === 'blank' ? (
                  <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200">
                    <span className="text-lg text-slate-300 font-bold uppercase tracking-widest text-center">Blank Page Canvas</span>
                    <span className="text-xs text-slate-400 font-mono mt-1">{activeEditorPage.width} × {activeEditorPage.height} pt</span>
                  </div>
                ) : (highResPreviews[getThumbKey(activeEditorPage)] || thumbnails[getThumbKey(activeEditorPage)]) ? (
                  <img
                    src={highResPreviews[getThumbKey(activeEditorPage)] || thumbnails[getThumbKey(activeEditorPage)]!}
                    alt="PDF Page Canvas"
                    className="w-full h-full object-contain pointer-events-none select-none"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
                    <RefreshCw className="h-8 w-8 animate-spin text-slate-500 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-wider">Rendering canvas...</p>
                  </div>
                )}

                {/* Visual Page Border Overlay */}
                {activeEditorPage.border && activeEditorPage.border.enabled && (
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      padding: '10px',
                      zIndex: 15
                    }}
                  >
                    <div 
                      className="w-full h-full"
                      style={{
                        borderWidth: `${activeEditorPage.border.thickness}px`,
                        borderStyle: activeEditorPage.border.style === 'wavy' 
                          ? 'none' 
                          : (activeEditorPage.border.style === 'dash' 
                              ? 'dashed' 
                              : (activeEditorPage.border.style === 'dotted' ? 'dotted' : 'solid')),
                        borderColor: activeEditorPage.border.color || '#000000',
                      }}
                    >
                      {/* For wavy style, render 4 SVG lines for the wavy borders */}
                      {activeEditorPage.border.style === 'wavy' && (
                        <svg className="absolute inset-0 w-full h-full overflow-visible">
                          {(() => {
                            const w = activeEditorPage.width;
                            const h = activeEditorPage.height;
                            const t = activeEditorPage.border.thickness || 3;
                            const c = activeEditorPage.border.color || '#000000';
                            const m = 10; // margin
                            const amp = t * 0.8;
                            const freq = 6;
                            
                            // Top path
                            let topP = `M ${m} ${m}`;
                            for (let x = m; x <= w - m; x += 2) {
                              topP += ` L ${x} ${m + amp * Math.sin((x - m) / freq)}`;
                            }
                            
                            // Bottom path
                            let botP = `M ${m} ${h - m}`;
                            for (let x = m; x <= w - m; x += 2) {
                              botP += ` L ${x} ${h - m + amp * Math.sin((x - m) / freq)}`;
                            }
                            
                            // Left path
                            let leftP = `M ${m} ${m}`;
                            for (let y = m; y <= h - m; y += 2) {
                              leftP += ` L ${m + amp * Math.sin((y - m) / freq)} ${y}`;
                            }
                            
                            // Right path
                            let rightP = `M ${w - m} ${m}`;
                            for (let y = m; y <= h - m; y += 2) {
                              rightP += ` L ${w - m + amp * Math.sin((y - m) / freq)} ${y}`;
                            }
                            
                            return (
                              <>
                                <path d={topP} fill="none" stroke={c} strokeWidth={t} />
                                <path d={botP} fill="none" stroke={c} strokeWidth={t} />
                                <path d={leftP} fill="none" stroke={c} strokeWidth={t} />
                                <path d={rightP} fill="none" stroke={c} strokeWidth={t} />
                              </>
                            );
                          })()}
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                {/* Visual Custom Lines Overlay */}
                {activeEditorPage.lines && activeEditorPage.lines.map((line) => {
                  const isSelected = selectedLineId === line.id;
                  const t = line.thickness || 3;
                  const c = line.color || '#2563EB';
                  const isWavy = line.style === 'wavy';
                  const startVal = line.start !== undefined ? line.start : 0.0;
                  const endVal = line.end !== undefined ? line.end : 1.0;
                  
                  return (
                    <div
                      key={line.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLineId(line.id);
                        setSelectedAnnotationId(null); // Clear text box selection
                      }}
                      className={`absolute group cursor-pointer transition-all flex items-center justify-center ${
                        line.orientation === 'horizontal' 
                          ? 'h-4 -translate-y-1/2' 
                          : 'w-4 -translate-x-1/2'
                      }`}
                      style={{
                        top: line.orientation === 'horizontal' ? `${line.position * 100}%` : `${startVal * 100}%`,
                        left: line.orientation === 'vertical' ? `${line.position * 100}%` : `${startVal * 100}%`,
                        width: line.orientation === 'horizontal' ? `${(endVal - startVal) * 100}%` : undefined,
                        height: line.orientation === 'vertical' ? `${(endVal - startVal) * 100}%` : undefined,
                        zIndex: isSelected ? 41 : 25,
                      }}
                    >
                      {/* Interactive hover highlight zone */}
                      <div 
                        className={`absolute inset-0 rounded transition-colors ${
                          isSelected 
                            ? 'bg-blue-500/15 border-2 border-dashed border-blue-500' 
                            : 'group-hover:bg-blue-500/10'
                        }`}
                      />
                      
                      {/* The visible drawn line */}
                      {isWavy ? (
                        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                          {(() => {
                            const w = activeEditorPage.width;
                            const h = activeEditorPage.height;
                            const amp = t * 0.8;
                            const freq = 6;
                            
                            if (line.orientation === 'horizontal') {
                              const spanW = (endVal - startVal) * w;
                              let path = `M 0 ${8}`; // relative center of the 16px high horizontal hover box
                              for (let x = 0; x <= spanW; x += 2) {
                                path += ` L ${x} ${8 + amp * Math.sin(x / freq)}`;
                              }
                              return <path d={path} fill="none" stroke={c} strokeWidth={t} />;
                            } else {
                              const spanH = (endVal - startVal) * h;
                              let path = `M ${8} 0`; // relative center of the 16px wide vertical hover box
                              for (let y = 0; y <= spanH; y += 2) {
                                path += ` L ${8 + amp * Math.sin(y / freq)} ${y}`;
                              }
                              return <path d={path} fill="none" stroke={c} strokeWidth={t} />;
                            }
                          })()}
                        </svg>
                      ) : (
                        <div 
                          className="pointer-events-none"
                          style={{
                            background: line.style === 'continuous' ? c : 'transparent',
                            width: line.orientation === 'horizontal' ? '100%' : `${t}px`,
                            height: line.orientation === 'vertical' ? '100%' : `${t}px`,
                            borderStyle: line.style !== 'continuous' 
                              ? (line.style === 'dash' ? 'dashed' : 'dotted') 
                              : undefined,
                            borderWidth: line.style !== 'continuous' 
                              ? (line.orientation === 'horizontal' ? `${t}px 0 0 0` : `0 0 0 ${t}px`)
                              : '0',
                            borderColor: c,
                          }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Crop Box Overlay */}
                {editorMode === 'crop' && tempCrop && (
                  <div className="absolute inset-0 pointer-events-none z-30">
                    {/* Dimmed regions outside the crop area */}
                    <div 
                      className="absolute top-0 left-0 w-full bg-slate-950/65" 
                      style={{ height: `${tempCrop.y * 100}%` }}
                    />
                    <div 
                      className="absolute left-0 w-full bg-slate-950/65" 
                      style={{ 
                        top: `${(tempCrop.y + tempCrop.height) * 100}%`,
                        height: `${(1 - tempCrop.y - tempCrop.height) * 100}%` 
                      }}
                    />
                    <div 
                      className="absolute left-0 bg-slate-950/65" 
                      style={{ 
                        top: `${tempCrop.y * 100}%`,
                        width: `${tempCrop.x * 100}%`,
                        height: `${tempCrop.height * 100}%` 
                      }}
                    />
                    <div 
                      className="absolute bg-slate-950/65" 
                      style={{ 
                        top: `${tempCrop.y * 100}%`,
                        left: `${(tempCrop.x + tempCrop.width) * 100}%`,
                        width: `${(1 - tempCrop.x - tempCrop.width) * 100}%`,
                        height: `${tempCrop.height * 100}%` 
                      }}
                    />

                    {/* Highlighted crop box with dashed border */}
                    <div 
                      className="absolute border-2 border-dashed border-blue-500 shadow-lg"
                      style={{
                        left: `${tempCrop.x * 100}%`,
                        top: `${tempCrop.y * 100}%`,
                        width: `${tempCrop.width * 100}%`,
                        height: `${tempCrop.height * 100}%`
                      }}
                    >
                      {/* Corner Handles */}
                      <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      {/* Edge Center Handles */}
                      <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-600 border border-white rounded-xs" />
                    </div>
                  </div>
                )}

                {/* Split Page Overlay */}
                {editorMode === 'split' && (
                  <div className="absolute inset-0 pointer-events-none z-30 select-none">
                    {splitOrientation === 'horizontal' ? (
                      <>
                        {/* Shaded Top Region (Page 1) */}
                        <div 
                          className="absolute top-0 left-0 right-0 bg-emerald-500/10 border-b border-dashed border-emerald-400/60 flex flex-col justify-start p-3 transition-all pointer-events-none"
                          style={{ height: `${splitPosition * 100}%` }}
                        >
                          <div className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/85 backdrop-blur-md text-emerald-300 font-mono text-[11px] font-bold shadow-md border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>PAGE 1: TOP HALF</span>
                            <span className="text-slate-400 font-normal">({Math.round(splitPosition * 100)}% height)</span>
                          </div>
                        </div>

                        {/* Shaded Bottom Region (Page 2) */}
                        <div 
                          className="absolute left-0 right-0 bottom-0 bg-blue-500/10 border-t border-dashed border-blue-400/60 flex flex-col justify-end p-3 transition-all pointer-events-none"
                          style={{ top: `${splitPosition * 100}%` }}
                        >
                          <div className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/85 backdrop-blur-md text-blue-300 font-mono text-[11px] font-bold shadow-md border border-blue-500/30">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            <span>PAGE 2: BOTTOM HALF</span>
                            <span className="text-slate-400 font-normal">({Math.round((1 - splitPosition) * 100)}% height)</span>
                          </div>
                        </div>

                        {/* Horizontal Cut Line */}
                        <div 
                          className="absolute left-0 right-0 -translate-y-1/2 flex items-center justify-between z-40 pointer-events-auto cursor-row-resize group"
                          style={{ top: `${splitPosition * 100}%` }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsDraggingSplitLine(true);
                          }}
                        >
                          {/* Left handle */}
                          <div className="bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white -translate-x-3 transition-transform group-hover:scale-110">
                            <Scissors className="h-3.5 w-3.5" />
                          </div>

                          {/* Dashed line */}
                          <div className="flex-1 h-[2px] bg-rose-500/90 shadow-sm border-t-2 border-dashed border-rose-500" />

                          {/* Center badge */}
                          <div className="mx-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-full shadow-lg text-[10px] font-mono font-bold flex items-center gap-1.5 shrink-0 border border-rose-400 transition-colors">
                            <Scissors className="h-3 w-3" />
                            <span>CUT LINE: {Math.round(splitPosition * 100)}% ({Math.round(splitPosition * activeEditorPage.height)} pt)</span>
                            <span className="text-rose-200 text-[9px] font-sans font-normal ml-1">Drag or click to move</span>
                          </div>

                          {/* Dashed line */}
                          <div className="flex-1 h-[2px] bg-rose-500/90 shadow-sm border-t-2 border-dashed border-rose-500" />

                          {/* Right handle */}
                          <div className="bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white translate-x-3 transition-transform group-hover:scale-110">
                            <Scissors className="h-3.5 w-3.5 transform -scale-x-100" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Shaded Left Region (Page 1) */}
                        <div 
                          className="absolute top-0 left-0 bottom-0 bg-emerald-500/10 border-r border-dashed border-emerald-400/60 flex flex-col justify-start p-3 transition-all pointer-events-none"
                          style={{ width: `${splitPosition * 100}%` }}
                        >
                          <div className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/85 backdrop-blur-md text-emerald-300 font-mono text-[11px] font-bold shadow-md border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>PAGE 1: LEFT</span>
                            <span className="text-slate-400 font-normal">({Math.round(splitPosition * 100)}%)</span>
                          </div>
                        </div>

                        {/* Shaded Right Region (Page 2) */}
                        <div 
                          className="absolute top-0 right-0 bottom-0 bg-blue-500/10 border-l border-dashed border-blue-400/60 flex flex-col justify-start items-end p-3 transition-all pointer-events-none"
                          style={{ left: `${splitPosition * 100}%` }}
                        >
                          <div className="self-end inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/85 backdrop-blur-md text-blue-300 font-mono text-[11px] font-bold shadow-md border border-blue-500/30">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            <span>PAGE 2: RIGHT</span>
                            <span className="text-slate-400 font-normal">({Math.round((1 - splitPosition) * 100)}%)</span>
                          </div>
                        </div>

                        {/* Vertical Cut Line */}
                        <div 
                          className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-between z-40 pointer-events-auto cursor-col-resize group"
                          style={{ left: `${splitPosition * 100}%` }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsDraggingSplitLine(true);
                          }}
                        >
                          {/* Top handle */}
                          <div className="bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white -translate-y-3 transition-transform group-hover:scale-110">
                            <Scissors className="h-3.5 w-3.5 rotate-90" />
                          </div>

                          {/* Dashed line */}
                          <div className="flex-1 w-[2px] bg-rose-500/90 shadow-sm border-l-2 border-dashed border-rose-500" />

                          {/* Center badge */}
                          <div className="my-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-full shadow-lg text-[10px] font-mono font-bold flex items-center gap-1.5 shrink-0 border border-rose-400 transition-colors">
                            <Scissors className="h-3 w-3" />
                            <span>CUT: {Math.round(splitPosition * 100)}% ({Math.round(splitPosition * activeEditorPage.width)} pt)</span>
                          </div>

                          {/* Dashed line */}
                          <div className="flex-1 w-[2px] bg-rose-500/90 shadow-sm border-l-2 border-dashed border-rose-500" />

                          {/* Bottom handle */}
                          <div className="bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white translate-y-3 transition-transform group-hover:scale-110">
                            <Scissors className="h-3.5 w-3.5 -rotate-90" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Text Annotations Overlays */}
                {activeEditorPage.textAnnotations?.map((ann) => {
                  const isSelected = selectedAnnotationId === ann.id;
                  return (
                    <div
                      key={ann.id}
                      className={`absolute ${(editorMode === 'crop' || editorMode === 'split') ? 'pointer-events-none opacity-20' : 'pointer-events-auto'}`}
                      style={{
                        left: `${ann.x * 100}%`,
                        top: `${ann.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: isSelected ? 40 : 30,
                      }}
                      onClick={(e) => {
                        // Prevent background click from de-selecting
                        e.stopPropagation();
                        setSelectedAnnotationId(ann.id);
                      }}
                    >
                      {/* Font Size, Alignment and Delete controls above the text box */}
                      {isSelected && (
                        <>
                          {activeColorPicker === 'text' ? (
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded shadow-xl px-2 py-1.5 flex items-center space-x-1.5 z-50 shrink-0 select-none border border-slate-700 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveColorPicker(null);
                                }}
                                className="px-2 py-0.5 hover:bg-slate-800 rounded text-[10px] text-slate-300 font-bold uppercase transition cursor-pointer"
                              >
                                &larr; Back
                              </button>
                              <div className="w-[1px] bg-slate-700 h-3.5 mx-0.5" />
                              <span className="text-[10px] text-slate-400 font-bold uppercase mr-1 whitespace-nowrap">Text:</span>
                              {['#000000', '#4B5563', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#FFFFFF'].map((color) => {
                                const isCurrent = (ann.color || '#000000') === color;
                                return (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateAnnotationColor(ann.id, color);
                                    }}
                                    className={`w-4 h-4 rounded-full border transition-transform cursor-pointer hover:scale-110 flex items-center justify-center ${
                                      isCurrent ? 'ring-2 ring-blue-500 scale-105' : ''
                                    }`}
                                    style={{ 
                                      backgroundColor: color, 
                                      borderColor: color === '#FFFFFF' ? '#4B5563' : 'transparent' 
                                    }}
                                    title={color}
                                  >
                                    {isCurrent && (
                                      <Check 
                                        className={`h-2.5 w-2.5 ${
                                          color === '#FFFFFF' ? 'text-slate-900' : 'text-white'
                                        }`} 
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : activeColorPicker === 'bg' ? (
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded shadow-xl px-2 py-1.5 flex items-center space-x-1.5 z-50 shrink-0 select-none border border-slate-700 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveColorPicker(null);
                                }}
                                className="px-2 py-0.5 hover:bg-slate-800 rounded text-[10px] text-slate-300 font-bold uppercase transition cursor-pointer"
                              >
                                &larr; Back
                              </button>
                              <div className="w-[1px] bg-slate-700 h-3.5 mx-0.5" />
                              <span className="text-[10px] text-slate-400 font-bold uppercase mr-1 whitespace-nowrap">Bg:</span>
                              {['#FFFFFF', '#F3F4F6', '#DBEAFE', '#FFE4E6', '#D1FAE5', '#FEF3C7', '#F3E8FF', 'transparent'].map((color) => {
                                const isCurrent = (ann.backgroundColor || '#FFFFFF') === color;
                                return (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateAnnotationBgColor(ann.id, color);
                                    }}
                                    className={`w-4 h-4 rounded-full border transition-transform cursor-pointer hover:scale-110 flex items-center justify-center relative ${
                                      isCurrent ? 'ring-2 ring-blue-500 scale-105' : ''
                                    }`}
                                    style={{ 
                                      backgroundColor: color === 'transparent' ? 'transparent' : color, 
                                      borderColor: color === '#FFFFFF' || color === 'transparent' ? '#4B5563' : 'transparent' 
                                    }}
                                    title={color === 'transparent' ? 'No Fill' : color}
                                  >
                                    {color === 'transparent' && (
                                      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full">
                                        <div className="w-full h-[1.5px] bg-red-500 rotate-45" />
                                      </div>
                                    )}
                                    {isCurrent && (
                                      <Check 
                                        className={`h-2.5 w-2.5 z-10 ${
                                          color === '#FFFFFF' || color === 'transparent' ? 'text-slate-950' : 'text-slate-800'
                                        }`} 
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded shadow-xl px-2 py-1.5 flex items-center space-x-1.5 z-50 shrink-0 select-none border border-slate-700">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  changeFontSize(ann.id, -2);
                                }}
                                className="p-1 hover:bg-slate-800 active:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                                title="Make text smaller"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              
                              <span className="text-[10px] font-mono font-bold px-1 text-slate-300 select-none">
                                {ann.fontSize}pt
                              </span>
                              
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  changeFontSize(ann.id, 2);
                                }}
                                className="p-1 hover:bg-slate-800 active:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
                                title="Make text bigger"
                              >
                                <Plus className="h-3 w-3" />
                              </button>

                              <div className="w-[1px] bg-slate-700 h-3.5 mx-1" />

                              {/* Alignment buttons */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateAnnotationAlignment(ann.id, 'left');
                                }}
                                className={`p-1 rounded transition cursor-pointer ${
                                  (ann.alignment || 'center') === 'left'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                                title="Align Left"
                              >
                                <AlignLeft className="h-3 w-3" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateAnnotationAlignment(ann.id, 'center');
                                }}
                                className={`p-1 rounded transition cursor-pointer ${
                                  (ann.alignment || 'center') === 'center'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                                title="Align Center"
                              >
                                <AlignCenter className="h-3 w-3" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateAnnotationAlignment(ann.id, 'right');
                                }}
                                className={`p-1 rounded transition cursor-pointer ${
                                  (ann.alignment || 'center') === 'right'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                                title="Align Right"
                              >
                                <AlignRight className="h-3 w-3" />
                              </button>

                              <div className="w-[1px] bg-slate-700 h-3.5 mx-1" />

                              {/* Color palette triggers */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveColorPicker('text');
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1"
                                title="Select Font Color"
                              >
                                <Palette className="h-3 w-3 text-amber-400" />
                                <span 
                                  className="w-2.5 h-2.5 rounded-full border border-slate-500 shrink-0" 
                                  style={{ backgroundColor: ann.color || '#000000' }} 
                                />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveColorPicker('bg');
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1"
                                title="Select Background Color"
                              >
                                <Paintbrush className="h-3 w-3 text-cyan-400" />
                                <span 
                                  className="w-2.5 h-2.5 rounded-full border border-slate-500 shrink-0 relative overflow-hidden" 
                                  style={{ 
                                    backgroundColor: ann.backgroundColor === 'transparent' ? 'transparent' : (ann.backgroundColor || '#FFFFFF') 
                                  }}
                                >
                                  {ann.backgroundColor === 'transparent' && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-full h-[1px] bg-red-500 rotate-45" />
                                    </div>
                                  )}
                                </span>
                              </button>

                              <div className="w-[1px] bg-slate-700 h-3.5 mx-1" />

                              {/* Delete single text box button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSingleAnnotation(ann.id);
                                }}
                                className="p-1 hover:bg-rose-950 rounded text-rose-400 hover:text-rose-300 transition cursor-pointer"
                                title="Delete this text box"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>

                              <div className="w-[1px] bg-slate-700 h-3.5 mx-1" />

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAnnotationId(null);
                                }}
                                className="text-[9px] hover:bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 hover:text-green-400 font-bold uppercase tracking-wider transition cursor-pointer"
                                title="Done editing"
                              >
                                OK
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {/* Text Input Element */}
                      <input
                        type="text"
                        value={ann.text}
                        onChange={(e) => updateAnnotationText(ann.id, e.target.value)}
                        className={`px-2.5 py-1.5 rounded shadow-lg font-sans focus:outline-hidden cursor-text transition-all ${
                          isSelected 
                            ? 'ring-2 ring-blue-500 border-blue-500 min-w-[150px]' 
                            : 'border border-dashed border-slate-300/80 min-w-[100px] hover:border-blue-400'
                        }`}
                        style={{ 
                          fontSize: `${ann.fontSize}px`,
                          lineHeight: 1.2,
                          textAlign: ann.alignment || 'center',
                          color: ann.color || '#000000',
                          backgroundColor: ann.backgroundColor === 'transparent' ? 'transparent' : (ann.backgroundColor || '#FFFFFF')
                        }}
                        autoFocus={ann.text === 'Click to type text...'}
                        onFocus={(e) => {
                          pushEditorSnapshot();
                          if (e.target.value === 'Click to type text...') {
                            e.target.select();
                          }
                        }}
                        placeholder="Type text..."
                      />
                    </div>
                  );
                })}
              </div>
            </div>

              {/* Sidebar Settings Panel */}
              <div className="w-full md:w-80 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col h-full overflow-y-auto select-none p-4 shrink-0 text-slate-800">
                
                {/* 0. Session History & Quick Actions */}
                <div className="mb-5 pb-4 border-b border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Undo2 className="h-3 w-3 text-slate-500" />
                      <span>Changes & Revert</span>
                    </h5>
                    {editorHistory.length > 0 ? (
                      <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded font-mono">
                        {editorHistory.length} unsaved
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-mono">
                        No changes
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleEditorRevertLastChange}
                      disabled={editorHistory.length === 0}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 disabled:text-slate-400 border border-slate-300 disabled:border-slate-200 rounded font-bold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                      title="Revert last change (Undo) - Ctrl+Z"
                    >
                      <Undo2 className="h-3 w-3 text-slate-600" />
                      <span>Revert</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleEditorCancel}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 rounded font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                      title="Reject changes and exit without applying (Esc)"
                    >
                      <X className="h-3 w-3 text-rose-500" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>

                {/* 1. Zoom Controls */}
                <div className="mb-6 pb-5 border-b border-slate-200">
                  <h5 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Maximize2 className="h-3 w-3 text-slate-500" />
                    <span>Page Scaling & Zoom</span>
                  </h5>
                  <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setZoomScale(prev => Math.max(0.4, prev - 0.1))}
                      disabled={zoomScale <= 0.4}
                      className="p-1.5 hover:bg-slate-100 disabled:opacity-45 rounded transition text-slate-600 disabled:hover:bg-transparent cursor-pointer flex items-center justify-center"
                      title="Zoom Out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-700 select-none">
                      {Math.round(zoomScale * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomScale(prev => Math.min(3.0, prev + 0.1))}
                      disabled={zoomScale >= 3.0}
                      className="p-1.5 hover:bg-slate-100 disabled:opacity-45 rounded transition text-slate-600 disabled:hover:bg-transparent cursor-pointer flex items-center justify-center"
                      title="Zoom In"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomScale(1.0)}
                      disabled={zoomScale === 1.0}
                      className="text-[9px] font-bold uppercase px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100 rounded text-slate-600 transition"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {editorMode === 'split' ? (
                  <div className="flex-1 flex flex-col space-y-4 pb-6 min-h-0 overflow-y-auto">
                    {/* Header info */}
                    <div className="p-3 bg-rose-50/80 border border-rose-200/80 rounded-lg">
                      <div className="flex items-center gap-2 text-rose-950 font-bold text-xs">
                        <Scissors className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>SPLIT PAGE INTO 2 HALVES</span>
                      </div>
                      <p className="text-[11px] text-rose-900/80 mt-1 leading-relaxed">
                        Cuts this page along the selected line and inserts 2 separate pages in the document. Both pages have the exact same size as the source page (<span className="font-mono font-semibold">{Math.round(activeEditorPage.width)} × {Math.round(activeEditorPage.height)} pt</span>).
                      </p>
                    </div>

                    {/* Cut Direction */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1.5">Cut Direction</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSplitOrientation('horizontal')}
                          className={`px-3 py-2 text-xs font-bold rounded border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            splitOrientation === 'horizontal'
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Rows2 className="h-4 w-4" />
                          <span>Top & Bottom</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitOrientation('vertical')}
                          className={`px-3 py-2 text-xs font-bold rounded border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            splitOrientation === 'vertical'
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Columns2 className="h-4 w-4" />
                          <span>Left & Right</span>
                        </button>
                      </div>
                    </div>

                    {/* Cut Position Slider & Presets */}
                    <div>
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase mb-1.5">
                        <span className="text-slate-500">Cut Position</span>
                        <span className="text-rose-600 font-mono font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {Math.round(splitPosition * 100)}% ({Math.round(splitPosition * (splitOrientation === 'horizontal' ? activeEditorPage.height : activeEditorPage.width))} pt)
                        </span>
                      </div>

                      {/* Presets */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {[
                          { label: '33% (1/3)', val: 0.33 },
                          { label: '50% (Half)', val: 0.5 },
                          { label: '67% (2/3)', val: 0.67 }
                        ].map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setSplitPosition(preset.val)}
                            className={`py-1 text-[10px] font-mono font-bold rounded border transition cursor-pointer ${
                              Math.abs(splitPosition - preset.val) < 0.02
                                ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs font-extrabold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <input 
                        type="range"
                        min="5"
                        max="95"
                        step="1"
                        value={Math.round(splitPosition * 100)}
                        onChange={(e) => setSplitPosition(parseInt(e.target.value) / 100)}
                        className="w-full accent-rose-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400 mt-1 italic">
                        Tip: Drag the red cut line or click on the page canvas to position.
                      </p>
                    </div>

                    {/* Placement on New Pages */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1.5">Placement on New Pages</span>
                      <div className="space-y-1.5">
                        {[
                          {
                            id: 'fit' as const,
                            title: 'Fit to Page (Recommended)',
                            desc: 'Scales and centers each half to comfortably fill the full page size.'
                          },
                          {
                            id: 'align-top' as const,
                            title: splitOrientation === 'horizontal' ? 'Align to Top (Original Scale)' : 'Align to Left (Original Scale)',
                            desc: 'Keeps 100% original scale, positioned at top/left edge.'
                          },
                          {
                            id: 'original' as const,
                            title: 'Original Coordinates',
                            desc: 'Preserves exact coordinates from the original page with remaining area blank.'
                          }
                        ].map(opt => (
                          <label
                            key={opt.id}
                            onClick={() => setSplitPlacement(opt.id)}
                            className={`block p-2.5 rounded-lg border cursor-pointer transition ${
                              splitPlacement === opt.id
                                ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-400'
                                : 'bg-white border-slate-200 hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                name="splitPlacement"
                                checked={splitPlacement === opt.id}
                                onChange={() => setSplitPlacement(opt.id)}
                                className="mt-0.5 accent-blue-600"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">{opt.title}</span>
                                <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">{opt.desc}</span>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Insertion options */}
                    <div className="pt-2 border-t border-slate-200">
                      <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={keepOriginalOnSplit}
                          onChange={(e) => setKeepOriginalOnSplit(e.target.checked)}
                          className="mt-0.5 rounded accent-blue-600"
                        />
                        <span className="text-[11px] text-slate-700 font-medium">
                          Keep original unsplit page in document (insert split halves after original)
                        </span>
                      </label>
                    </div>

                    {/* Output summary card */}
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider">Output Summary</span>
                      <div className="flex items-center justify-between text-slate-700 bg-white p-2 rounded border border-slate-200">
                        <span className="font-semibold flex items-center gap-1.5 text-emerald-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Page 1: {splitOrientation === 'horizontal' ? 'Top' : 'Left'} Half ({Math.round(splitPosition * 100)}%)
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {Math.round(activeEditorPage.width)} × {Math.round(activeEditorPage.height)} pt
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-700 bg-white p-2 rounded border border-slate-200">
                        <span className="font-semibold flex items-center gap-1.5 text-blue-700">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Page 2: {splitOrientation === 'horizontal' ? 'Bottom' : 'Right'} Half ({Math.round((1 - splitPosition) * 100)}%)
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {Math.round(activeEditorPage.width)} × {Math.round(activeEditorPage.height)} pt
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Both output pages match original dimensions: <span className="font-mono font-bold text-slate-700">{Math.round(activeEditorPage.width)} × {Math.round(activeEditorPage.height)} pt</span>
                      </p>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={handleExecuteSplitPage}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded text-xs uppercase tracking-wider transition shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                    >
                      <Scissors className="h-4 w-4" />
                      <span>Split into 2 Pages</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* 2. Page Border Controls */}
                    <div className="mb-6 pb-5 border-b border-slate-200">
                      <div className="flex items-center justify-between mb-2.5">
                        <h5 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Sliders className="h-3 w-3 text-slate-500" />
                          <span>Page Border</span>
                        </h5>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={!!activeEditorPage.border?.enabled} 
                        onChange={(e) => handleUpdateBorder({ enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className={`space-y-3.5 transition-opacity duration-200 ${activeEditorPage.border?.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    {/* Style selector */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1.5">Border Style</span>
                      <div className="grid grid-cols-4 gap-1">
                        {(['continuous', 'dash', 'dotted', 'wavy'] as const).map((style) => (
                          <button
                            key={style}
                            type="button"
                            onClick={() => handleUpdateBorder({ style })}
                            className={`px-1.5 py-1 text-[9px] font-bold uppercase tracking-tight rounded border transition cursor-pointer text-center ${
                              (activeEditorPage.border?.style || 'continuous') === style
                                ? 'bg-blue-50 border-blue-300 text-blue-600 shadow-2xs font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {style === 'continuous' ? 'solid' : style}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Thickness Slider */}
                    <div>
                      <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                        <span className="text-slate-500 font-bold">Thickness</span>
                        <span className="text-slate-700 font-mono font-bold">{activeEditorPage.border?.thickness || 3} px</span>
                      </div>
                      <input 
                        type="range"
                        min="1"
                        max="12"
                        value={activeEditorPage.border?.thickness || 3}
                        onChange={(e) => handleUpdateBorder({ thickness: parseInt(e.target.value) })}
                        className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Color selection */}
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1.5">Border Color</span>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {['#000000', '#4B5563', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#FFFFFF'].map((color) => {
                          const isCurrent = (activeEditorPage.border?.color || '#000000') === color;
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleUpdateBorder({ color })}
                              className={`w-5 h-5 rounded-full border transition-transform cursor-pointer hover:scale-110 flex items-center justify-center ${
                                isCurrent ? 'ring-2 ring-blue-500 scale-105' : ''
                              }`}
                              style={{ 
                                backgroundColor: color, 
                                borderColor: color === '#FFFFFF' ? '#D1D5DB' : 'transparent' 
                              }}
                              title={color}
                            >
                              {isCurrent && <Check className={`h-3 w-3 ${color === '#FFFFFF' ? 'text-slate-800' : 'text-white'}`} />}
                            </button>
                          );
                        })}
                        {/* Custom Color Picker input */}
                        <div className="relative flex items-center">
                          <input 
                            type="color"
                            value={activeEditorPage.border?.color || '#000000'}
                            onChange={(e) => handleUpdateBorder({ color: e.target.value })}
                            className="w-6 h-6 rounded-md border border-slate-300 cursor-pointer p-0 overflow-hidden"
                            title="Custom Color"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Apply to All Pages button */}
                    <button
                      type="button"
                      onClick={() => handleApplyBorderToAllPages(activeEditorPage.border || { enabled: true, style: 'continuous', thickness: 3, color: '#000000' })}
                      className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-1.5 px-3 rounded text-[10px] uppercase tracking-wider transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 mt-2"
                    >
                      <CheckCircle className="h-3.5 w-3.5 text-green-550" />
                      <span>Apply Border to All Pages</span>
                    </button>
                  </div>
                </div>

                {/* 3. Lines Controls */}
                <div className="flex-1 flex flex-col min-h-0">
                  <h5 className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Layers className="h-3 w-3 text-slate-500" />
                    <span>Custom Lines</span>
                  </h5>

                  <div className="grid grid-cols-2 gap-2 mb-3.5">
                    <button
                      type="button"
                      onClick={() => handleAddLine('horizontal')}
                      className="bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 font-bold py-2 px-3 rounded text-[10px] uppercase tracking-wider transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                      title="Add a horizontal line to the current page"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ Horiz Line</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddLine('vertical')}
                      className="bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 font-bold py-2 px-3 rounded text-[10px] uppercase tracking-wider transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                      title="Add a vertical line to the current page"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ Vert Line</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddLineToAllPages('horizontal')}
                      className="bg-slate-100 border border-slate-200 hover:bg-slate-200 hover:border-slate-300 text-slate-700 font-bold py-1.5 px-3 rounded text-[9px] uppercase tracking-wider transition shadow-2xs cursor-pointer flex items-center justify-center gap-1 col-span-1"
                      title="Add a horizontal line to all pages in this document"
                    >
                      <Layers className="h-3 w-3 text-slate-500" />
                      <span>Horiz to All</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddLineToAllPages('vertical')}
                      className="bg-slate-100 border border-slate-200 hover:bg-slate-200 hover:border-slate-300 text-slate-700 font-bold py-1.5 px-3 rounded text-[9px] uppercase tracking-wider transition shadow-2xs cursor-pointer flex items-center justify-center gap-1 col-span-1"
                      title="Add a vertical line to all pages in this document"
                    >
                      <Layers className="h-3 w-3 text-slate-500" />
                      <span>Vert to All</span>
                    </button>
                  </div>

                  {/* Lines List */}
                  <div className="flex-1 min-h-[120px] bg-slate-100 rounded border border-slate-200 p-2 overflow-y-auto mb-4">
                    {(!activeEditorPage.lines || activeEditorPage.lines.length === 0) ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-3">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">No lines added yet</span>
                        <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">Add lines to divide layout or write custom notes.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {activeEditorPage.lines.map((line, idx) => {
                          const isSelected = selectedLineId === line.id;
                          return (
                            <div
                              key={line.id}
                              onClick={() => {
                                setSelectedLineId(line.id);
                                setSelectedAnnotationId(null);
                              }}
                              className={`p-2 rounded border flex items-center justify-between cursor-pointer transition ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs'
                                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: line.color }} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                  {idx + 1}. {line.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'} Line
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-slate-400">
                                @ {Math.round(line.position * 100)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Line Properties Editor */}
                  {selectedLineId && (() => {
                    const line = activeEditorPage.lines?.find(l => l.id === selectedLineId);
                    if (!line) return null;
                    return (
                      <div className="bg-slate-100 rounded border border-slate-200 p-3 space-y-3 shadow-inner">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Line Editor</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(line.id)}
                            className="text-rose-600 hover:text-rose-700 font-bold text-[9px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>

                        {/* Position Slider */}
                        <div>
                          <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                            <span className="text-slate-500">Position</span>
                            <span className="text-slate-700 font-mono">{Math.round(line.position * 100)}%</span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(line.position * 100)}
                            onChange={(e) => handleUpdateLine(line.id, { position: parseFloat(e.target.value) / 100 })}
                            className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Start Point Slider */}
                        <div>
                          <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                            <span className="text-slate-500">Start Point</span>
                            <span className="text-slate-700 font-mono">{Math.round((line.start !== undefined ? line.start : 0.0) * 100)}%</span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round((line.start !== undefined ? line.start : 0.0) * 100)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) / 100;
                              const currentEnd = line.end !== undefined ? line.end : 1.0;
                              handleUpdateLine(line.id, { start: Math.min(val, currentEnd) });
                            }}
                            className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* End Point Slider */}
                        <div>
                          <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                            <span className="text-slate-500">End Point</span>
                            <span className="text-slate-700 font-mono">{Math.round((line.end !== undefined ? line.end : 1.0) * 100)}%</span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round((line.end !== undefined ? line.end : 1.0) * 100)}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) / 100;
                              const currentStart = line.start !== undefined ? line.start : 0.0;
                              handleUpdateLine(line.id, { end: Math.max(val, currentStart) });
                            }}
                            className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Style selector */}
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Style</span>
                          <div className="grid grid-cols-4 gap-1">
                            {(['continuous', 'dash', 'dotted', 'wavy'] as const).map((style) => (
                              <button
                                key={style}
                                type="button"
                                onClick={() => handleUpdateLine(line.id, { style })}
                                className={`px-1.5 py-1 text-[9px] font-bold uppercase tracking-tight rounded border transition cursor-pointer text-center ${
                                  line.style === style
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-2xs font-bold'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {style === 'continuous' ? 'solid' : style}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Thickness Slider */}
                        <div>
                          <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                            <span className="text-slate-500">Thickness</span>
                            <span className="text-slate-700 font-mono">{line.thickness} px</span>
                          </div>
                          <input 
                            type="range"
                            min="1"
                            max="12"
                            value={line.thickness}
                            onChange={(e) => handleUpdateLine(line.id, { thickness: parseInt(e.target.value) })}
                            className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Color selection */}
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Color</span>
                          <div className="flex flex-wrap gap-1 items-center">
                            {['#000000', '#4B5563', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#FFFFFF'].map((color) => {
                              const isCurrent = line.color === color;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => handleUpdateLine(line.id, { color })}
                                  className={`w-4 h-4 rounded-full border transition-transform cursor-pointer hover:scale-110 flex items-center justify-center ${
                                    isCurrent ? 'ring-2 ring-blue-500 scale-105' : ''
                                  }`}
                                  style={{ 
                                    backgroundColor: color, 
                                    borderColor: color === '#FFFFFF' ? '#D1D5DB' : 'transparent' 
                                  }}
                                  title={color}
                                >
                                  {isCurrent && <Check className={`h-2.5 w-2.5 ${color === '#FFFFFF' ? 'text-slate-800' : 'text-white'}`} />}
                                </button>
                              );
                            })}
                            {/* Custom Color Picker input */}
                            <div className="relative flex items-center">
                              <input 
                                type="color"
                                value={line.color}
                                onChange={(e) => handleUpdateLine(line.id, { color: e.target.value })}
                                className="w-5 h-5 rounded-md border border-slate-300 cursor-pointer p-0 overflow-hidden"
                                title="Custom Color"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Apply Line to All Pages */}
                        <div className="pt-2 border-t border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleApplyLineToAllPages(line)}
                            className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-1.5 px-3 rounded text-[10px] uppercase tracking-wider transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-green-550" />
                            <span>Apply this Line to All Pages</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                  </>
                )}

              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 bg-slate-50 gap-3">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  Editing: <span className="text-slate-700 truncate max-w-[200px] inline-block align-bottom font-mono lowercase tracking-normal">
                    {activeEditorPage.sourceFileId === 'blank' ? 'Blank Page' : sourceFiles[activeEditorPage.sourceFileId]?.name}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  Total annotations: <span className="text-slate-700 font-mono">{activeEditorPage.textAnnotations?.length || 0}</span>
                </div>
                {editorHistory.length > 0 && (
                  <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-bold uppercase font-mono">
                    {editorHistory.length} unsaved change{editorHistory.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={handleEditorRevertLastChange}
                  disabled={editorHistory.length === 0}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 disabled:text-slate-400 border border-slate-300 disabled:border-slate-200 rounded font-bold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 shadow-2xs"
                  title="Revert last change (Undo) - Ctrl+Z"
                >
                  <Undo2 className="h-3 w-3 text-slate-600" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  onClick={handleEditorCancel}
                  className="px-3.5 py-1.5 text-xs bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 rounded font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Reject changes and exit without applying (Esc)"
                >
                  <X className="h-3 w-3 text-rose-500" />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={handleEditorApply}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-bold uppercase tracking-wider cursor-pointer shadow-xs flex items-center gap-1 font-bold"
                  title="Apply changes and return to document"
                >
                  <Check className="h-3 w-3" />
                  <span>Apply & Close</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* Bottom Status Bar */}
      <footer className="h-8 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">System Ready</span>
          </span>
          <span className="text-[10px] text-slate-200">|</span>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">LOCAL COMPRESSION ACTIVE</span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          v2.4.0-STABLE
        </div>
      </footer>
    </div>
  );
}
