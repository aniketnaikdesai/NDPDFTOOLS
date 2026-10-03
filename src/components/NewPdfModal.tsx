import React, { useState } from 'react';
import {
  FileText,
  X,
  FilePlus,
  Grid,
  AlignJustify,
  Maximize2,
  FileCode,
} from 'lucide-react';
import { BlankPdfOptions } from '../types';
import { createBlankPdf } from '../conversionUtils';

interface NewPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNewPdfCreated: (pdfBytes: Uint8Array, fileName: string) => Promise<void>;
  onOpenDocumentConverter?: () => void;
}

export const NewPdfModal: React.FC<NewPdfModalProps> = ({
  isOpen,
  onClose,
  onNewPdfCreated,
  onOpenDocumentConverter,
}) => {
  const [pageCount, setPageCount] = useState<number>(3);
  const [pageSize, setPageSize] = useState<'letter' | 'a4'>('letter');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [template, setTemplate] = useState<'blank' | 'ruled' | 'grid' | 'dots'>('blank');
  const [documentName, setDocumentName] = useState<string>('New Document');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const options: BlankPdfOptions = {
        pageCount,
        pageSize,
        orientation,
        template,
      };
      const pdfBytes = await createBlankPdf(options);
      const safeName = (documentName.trim() || 'New Document').replace(/\.pdf$/i, '') + '.pdf';
      await onNewPdfCreated(pdfBytes, safeName);
      onClose();
    } catch (e) {
      console.error('Failed to create blank PDF:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const templates: Array<{
    id: 'blank' | 'ruled' | 'grid' | 'dots';
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'blank',
      label: 'Blank Canvas',
      description: 'Pristine white pages for freeform annotations and shapes',
      icon: <FileText className="w-5 h-5 text-blue-400" />,
    },
    {
      id: 'ruled',
      label: 'Ruled Notebook',
      description: 'Lined paper with margin guide for note-taking',
      icon: <AlignJustify className="w-5 h-5 text-emerald-400" />,
    },
    {
      id: 'grid',
      label: 'Technical Grid',
      description: 'Clean metric grid for diagrams, forms, and tables',
      icon: <Grid className="w-5 h-5 text-purple-400" />,
    },
    {
      id: 'dots',
      label: 'Dot Matrix',
      description: 'Subtle dot pattern for bullet journaling and sketches',
      icon: <FileCode className="w-5 h-5 text-amber-400" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Create New PDF</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Start with blank canvas pages or convert external Word/Excel documents
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Quick Option Banner to Import Documents instead */}
          {onOpenDocumentConverter && (
            <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-blue-200 block">
                  Have Word, Excel, or Image files?
                </span>
                <span className="text-xs text-blue-300/80">
                  Convert Office files directly into PDF pages
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDocumentConverter();
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors whitespace-nowrap cursor-pointer shadow-sm"
              >
                Import & Convert
              </button>
            </div>
          )}

          {/* Document Name */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Document Title</label>
            <input
              type="text"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="e.g. Project Proposal, Annual Report"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Template Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">Page Template Style</label>
            <div className="grid grid-cols-2 gap-2.5">
              {templates.map((t) => {
                const isSelected = template === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-slate-800/90 border-blue-500 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {t.icon}
                      <span className="text-sm font-semibold text-slate-200">{t.label}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 line-clamp-2 leading-tight">
                      {t.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Page Count, Size & Orientation */}
          <div className="grid grid-cols-3 gap-3">
            {/* Page Count */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Page Count</label>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPageCount((prev) => Math.max(1, prev - 1))}
                  className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-bold"
                >
                  -
                </button>
                <span className="flex-1 text-center text-xs font-mono font-semibold text-slate-200 tabular-nums">
                  {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPageCount((prev) => Math.min(30, prev + 1))}
                  className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Standard Page Size */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Page Size</label>
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPageSize('letter')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    pageSize === 'letter' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Letter
                </button>
                <button
                  type="button"
                  onClick={() => setPageSize('a4')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    pageSize === 'a4' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  A4
                </button>
              </div>
            </div>

            {/* Orientation */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Orientation</label>
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    orientation === 'portrait' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Portrait
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    orientation === 'landscape' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Landscape
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <FilePlus className="w-4 h-4" />
            {isCreating ? 'Creating Pages...' : `Create ${pageCount} Blank Page${pageCount > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};
