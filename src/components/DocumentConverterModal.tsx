import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  UploadCloud,
  X,
  Check,
  Table,
  Layers,
  CheckSquare,
  Square,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { ExcelSheetInfo } from '../types';
import {
  parseExcelWorkbook,
  convertExcelToPdf,
  convertDocxToPdf,
  convertImagesToPdf,
} from '../conversionUtils';

interface DocumentConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasExistingPages: boolean;
  onConvertedPdfReady: (pdfBytes: Uint8Array, fileName: string, asNewDocument: boolean) => Promise<void>;
}

type FileCategory = 'excel' | 'word' | 'images' | null;

export const DocumentConverterModal: React.FC<DocumentConverterModalProps> = ({
  isOpen,
  onClose,
  hasExistingPages,
  onConvertedPdfReady,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [excelSheets, setExcelSheets] = useState<ExcelSheetInfo[]>([]);
  const [selectedSheetNames, setSelectedSheetNames] = useState<string[]>([]);
  const [previewSheetName, setPreviewSheetName] = useState<string>('');

  // Conversion options
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageSize, setPageSize] = useState<'letter' | 'a4'>('letter');
  const [imagePlacement, setImagePlacement] = useState<'fit' | 'fill'>('fit');
  const [excelFontSize, setExcelFontSize] = useState<number>(10);

  // Status & Progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedCategory(null);
    setFiles([]);
    setExcelSheets([]);
    setSelectedSheetNames([]);
    setPreviewSheetName('');
    setErrorMessage(null);
    setIsProcessing(false);
    setProgressPercent(0);
    setProgressText('');
  };

  const handleClose = () => {
    if (isProcessing) return;
    resetState();
    onClose();
  };

  const handleFilesSelected = async (incomingFiles: FileList | File[]) => {
    const fileList = Array.from(incomingFiles);
    if (fileList.length === 0) return;

    setErrorMessage(null);

    // Identify file type
    const firstFile = fileList[0];
    const fileName = firstFile.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      setSelectedCategory('excel');
      setFiles([firstFile]);
      setOrientation('landscape'); // Default landscape for spreadsheets

      try {
        setIsProcessing(true);
        setProgressText('Parsing spreadsheet worksheets...');
        const { sheets } = await parseExcelWorkbook(firstFile);
        setExcelSheets(sheets);
        setSelectedSheetNames(sheets.map((s) => s.name));
        if (sheets.length > 0) {
          setPreviewSheetName(sheets[0].name);
        }
      } catch (err: any) {
        setErrorMessage(`Failed to read spreadsheet: ${err.message || 'Corrupt or unsupported format'}`);
      } finally {
        setIsProcessing(false);
      }
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      if (fileName.endsWith('.doc')) {
        setErrorMessage('Legacy binary .doc files are not supported. Please save as modern .docx or export as PDF.');
        return;
      }
      setSelectedCategory('word');
      setFiles([firstFile]);
      setOrientation('portrait');
    } else if (fileList.every((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/i.test(f.name))) {
      setSelectedCategory('images');
      setFiles(fileList);
      setOrientation('portrait');
    } else {
      setErrorMessage('Please select Word (.docx), Excel (.xlsx, .xls, .csv), or image files (PNG, JPG, WEBP).');
    }
  };

  const toggleSheetSelection = (sheetName: string) => {
    setSelectedSheetNames((prev) =>
      prev.includes(sheetName) ? prev.filter((s) => s !== sheetName) : [...prev, sheetName]
    );
  };

  const selectAllSheets = () => {
    setSelectedSheetNames(excelSheets.map((s) => s.name));
  };

  const deselectAllSheets = () => {
    setSelectedSheetNames([]);
  };

  const handleExecuteConversion = async (asNewDocument: boolean) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let compiledPdfBytes: Uint8Array;
      const baseName = files[0].name.replace(/\.[^.]+$/, '');

      if (selectedCategory === 'excel') {
        if (selectedSheetNames.length === 0) {
          throw new Error('Please select at least one sheet to convert.');
        }
        compiledPdfBytes = await convertExcelToPdf(
          files[0],
          {
            selectedSheets: selectedSheetNames,
            orientation,
            pageSize,
            fontSize: excelFontSize,
          },
          (text, percent) => {
            setProgressText(text);
            setProgressPercent(percent);
          }
        );
      } else if (selectedCategory === 'word') {
        compiledPdfBytes = await convertDocxToPdf(
          files[0],
          {
            pageSize,
            orientation,
          },
          (text, percent) => {
            setProgressText(text);
            setProgressPercent(percent);
          }
        );
      } else if (selectedCategory === 'images') {
        compiledPdfBytes = await convertImagesToPdf(
          files,
          {
            placement: imagePlacement,
            pageSize,
            orientation: orientation === 'portrait' ? 'auto' : orientation,
          },
          (text, percent) => {
            setProgressText(text);
            setProgressPercent(percent);
          }
        );
      } else {
        throw new Error('Unsupported conversion type.');
      }

      const generatedFileName = `${baseName}_converted.pdf`;
      await onConvertedPdfReady(compiledPdfBytes, generatedFileName, asNewDocument);
      handleClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Conversion failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activePreviewSheet = excelSheets.find((s) => s.name === previewSheetName) || excelSheets[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Convert & Add Documents</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Client-side conversion for Word (.docx), Excel (.xlsx, .csv), and images into high-resolution PDF pages
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-lg text-sm text-red-200">
              {errorMessage}
            </div>
          )}

          {/* Zero State: File Upload Area */}
          {files.length === 0 ? (
            <div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-800/30 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".docx,.xlsx,.xls,.csv,image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFilesSelected(e.target.files);
                  }}
                />
                <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-slate-200 text-center mb-1">
                  Drag and drop documents here or browse
                </h3>
                <p className="text-xs text-slate-400 text-center max-w-md mb-4">
                  Accepts Word documents (.docx), Excel spreadsheets (.xlsx, .xls, .csv), and images (PNG, JPG, WEBP)
                </p>

                {/* Format Badges */}
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 rounded border border-slate-700">
                    <FileText className="w-3.5 h-3.5 text-blue-400" /> Word (.docx)
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 rounded border border-slate-700">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Excel (.xlsx)
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 rounded border border-slate-700">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Images
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected File Summary Bar */}
              <div className="flex items-center justify-between p-3.5 bg-slate-800/60 border border-slate-700/80 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-slate-700/80 text-blue-400">
                    {selectedCategory === 'excel' && <FileSpreadsheet className="w-5 h-5 text-emerald-400" />}
                    {selectedCategory === 'word' && <FileText className="w-5 h-5 text-blue-400" />}
                    {selectedCategory === 'images' && <ImageIcon className="w-5 h-5 text-amber-400" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      {files.length === 1 ? files[0].name : `${files.length} images selected`}
                    </h4>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {(files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB
                      {selectedCategory === 'excel' && ` · ${excelSheets.length} worksheets found`}
                    </span>
                  </div>
                </div>

                <button
                  onClick={resetState}
                  disabled={isProcessing}
                  className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                >
                  Choose Different File
                </button>
              </div>

              {/* EXCEL SHEET SELECTOR & PREVIEW */}
              {selectedCategory === 'excel' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-slate-200">Worksheet Selection</h4>
                      <p className="text-xs text-slate-400">
                        Check the worksheets you want converted into PDF pages
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllSheets}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-slate-600">·</span>
                      <button
                        type="button"
                        onClick={deselectAllSheets}
                        className="text-xs text-slate-400 hover:text-slate-300 font-medium"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Sheet Checkbox List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {excelSheets.map((sheet) => {
                      const isSelected = selectedSheetNames.includes(sheet.name);
                      const isInspecting = previewSheetName === sheet.name;
                      return (
                        <div
                          key={sheet.name}
                          className={`p-3 rounded-lg border transition-all flex items-start justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-slate-800/80 border-blue-500/60'
                              : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                          }`}
                          onClick={() => toggleSheetSelection(sheet.name)}
                        >
                          <div className="flex items-start gap-2.5 overflow-hidden">
                            <span className="mt-0.5 text-blue-400">
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-500" />}
                            </span>
                            <div className="truncate">
                              <span className="text-sm font-semibold text-slate-200 block truncate">{sheet.name}</span>
                              <span className="text-xs text-slate-400 font-mono tabular-nums block">
                                {sheet.rowCount} rows · {sheet.colCount} cols
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewSheetName(sheet.name);
                            }}
                            className={`text-xs px-2 py-0.5 rounded transition-colors whitespace-nowrap ml-1 ${
                              isInspecting
                                ? 'bg-blue-600 text-white font-medium'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                            }`}
                          >
                            Preview
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Table Preview */}
                  {activePreviewSheet && (
                    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60">
                      <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Table className="w-3.5 h-3.5 text-emerald-400" />
                          Previewing: {activePreviewSheet.name} (First 5 Rows)
                        </span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          Total {activePreviewSheet.rowCount} rows
                        </span>
                      </div>

                      <div className="overflow-x-auto max-h-48 p-2">
                        {activePreviewSheet.previewRows.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">Sheet is empty</div>
                        ) : (
                          <table className="w-full text-xs border-collapse">
                            <tbody>
                              {activePreviewSheet.previewRows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className={rIdx === 0 ? 'bg-slate-800/60 font-medium text-slate-200' : 'border-t border-slate-800/50 text-slate-400'}
                                >
                                  <td className="p-1.5 text-center text-slate-500 font-mono tabular-nums w-8">
                                    {rIdx + 1}
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="p-1.5 whitespace-nowrap font-mono tabular-nums border-l border-slate-800/40">
                                      {cell || '—'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* IMAGES REORDER / PREVIEW */}
              {selectedCategory === 'images' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-200">Image Pages ({files.length})</h4>
                    <span className="text-xs text-slate-400">Each image will become a standalone PDF page</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {files.map((file, idx) => (
                      <div
                        key={idx}
                        className="group relative border border-slate-800 rounded-lg overflow-hidden bg-slate-950 p-1 flex flex-col items-center"
                      >
                        <div className="w-full h-24 bg-slate-900 rounded flex items-center justify-center overflow-hidden">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <span className="text-[11px] text-slate-400 truncate w-full mt-1 px-1">
                          {idx + 1}. {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PAGE LAYOUT & CONVERSION OPTIONS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
                {/* Orientation */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Page Orientation</label>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setOrientation('portrait')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                        orientation === 'portrait'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Portrait
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation('landscape')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                        orientation === 'landscape'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Landscape
                    </button>
                  </div>
                </div>

                {/* Page Size */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Standard Page Size</label>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPageSize('letter')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                        pageSize === 'letter'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      US Letter
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageSize('a4')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                        pageSize === 'a4'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ISO A4
                    </button>
                  </div>
                </div>

                {/* Category specific control */}
                {selectedCategory === 'excel' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">Table Font Size</label>
                      <span className="text-xs font-mono text-slate-400 tabular-nums">{excelFontSize}pt</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={14}
                      step={1}
                      value={excelFontSize}
                      onChange={(e) => setExcelFontSize(Number(e.target.value))}
                      className="w-full accent-blue-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>
                )}

                {selectedCategory === 'images' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">Image Fit Mode</label>
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setImagePlacement('fit')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                          imagePlacement === 'fit'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Fit (Margins)
                      </button>
                      <button
                        type="button"
                        onClick={() => setImagePlacement('fill')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                          imagePlacement === 'fill'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Full Bleed
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Indicator */}
              {isProcessing && (
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      {progressText || 'Converting documents...'}
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-200"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {files.length > 0 && (
            <div className="flex items-center gap-3">
              {hasExistingPages && (
                <button
                  type="button"
                  onClick={() => handleExecuteConversion(false)}
                  disabled={isProcessing || (selectedCategory === 'excel' && selectedSheetNames.length === 0)}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Append to Existing PDF
                </button>
              )}

              <button
                type="button"
                onClick={() => handleExecuteConversion(true)}
                disabled={isProcessing || (selectedCategory === 'excel' && selectedSheetNames.length === 0)}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  hasExistingPages
                    ? 'text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700'
                    : 'text-white bg-blue-600 hover:bg-blue-500 shadow-sm'
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                {hasExistingPages ? 'Create as New PDF' : 'Convert & Open in PDF Studio'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
