# Document Conversion Pipeline (Word, Excel, Images to PDF)

Client-side conversion pipeline and blank document studio allowing users to import Word documents (`.docx`), Excel spreadsheets (`.xlsx`, `.xls`, `.csv`), and images into an existing PDF or assemble a brand-new PDF from scratch—with privacy-preserving in-browser rendering, an interactive Excel sheet selector with live pagination preview, and full integration into the page workspace.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and user experience decisions were confirmed through Phase 1 clarification:

- **Confirmed Decision: Client-Side Privacy-First Engine**: Word, Excel, and images will be converted entirely client-side in the browser using client libraries (`mammoth`, `xlsx`, `html2canvas`, `pdf-lib`). No sensitive spreadsheets, financial tables, or documents leave the user's machine.
- **Confirmed Decision: Excel Sheet Selector & Pagination Preview**: For multi-sheet Excel workbooks, a dedicated sheet selection modal will display active worksheets, row/column counts, page orientation controls (Portrait vs. Landscape), and a live visual preview before committing pages to the document.
- **Confirmed Decision: Dedicated Action Access**: The workspace header and empty state will feature a primary **"Add Documents"** modal (accepting Word, Excel, and images) alongside a **"New Blank PDF"** starter button to create clean documents from scratch without needing an existing PDF upload.

---

## 1. Overview & Core Concept

### What It Does
1. **Multi-Format Ingestion**: Accepts Word documents (`.docx`), Excel workbooks (`.xlsx`, `.xls`, `.csv`), and image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`).
2. **Dynamic Conversion to PDF**: Converts each document type into standard PDF pages (Letter/A4 format) with crisp font rendering, auto-balanced table cell distribution, and resolution-matched images.
3. **Dual Pipeline Modes**:
   - **Append / Insert to Existing PDF**: Adds converted pages directly to the current page workspace, allowing drag-and-drop reordering, text annotation, line drawing, and cropping alongside existing PDF pages.
   - **Create New PDF from Scratch**: Provides a one-click starter to initiate an empty canvas or populate it immediately with converted Office files and images.

### Target Persona & Key Value
- **Professionals & Students**: Merging reports, invoices, spreadsheet tables, and scanned photos into a single unified PDF presentation without paying for cloud subscriptions or exposing private financial data to third-party conversion servers.

---

## 2. User Experience & Visual Design

### Key User Flows

#### Flow A: Appending Word, Excel, or Images to an Existing PDF
1. **Trigger**: User clicks the prominent **"Add Documents"** button in the main workspace toolbar (distinct icon grouping: Word, Excel, Image badges).
2. **File Selection**: User drops or browses `.docx`, `.xlsx`, `.csv`, `.png`, `.jpg`, `.webp` files.
3. **Interactive Configuration (Excel / Options)**:
   - For `.xlsx`/`.csv`: The Sheet Selector dialog opens, listing all workbook tabs with row/column counts. The user checks desired sheets, toggles Portrait or Landscape auto-fit, and inspects the live preview.
   - For `.docx`: Rapid parsing shows estimated page count and progress bar.
   - For Images: Instant preview with option to fit full page or maintain native aspect ratio.
4. **Integration**: Converted pages are generated as a virtual `SourceFile` and appended seamlessly to the workspace page grid. Each page can be reordered, annotated, split, cropped, or exported.

#### Flow B: Creating a Brand-New PDF
1. **Trigger**: User clicks **"New PDF"** from the empty state hero or header.
2. **Template / Starter Choice**:
   - *Blank Page Starter*: Choose page count (e.g. 1–5 pages), page size (Letter / A4), and background style (Clean White, Ruled Lines, Dot Grid).
   - *Document Assembler*: Jump directly into importing Word/Excel/Image files to form the initial PDF.
3. **Editing & Export**: The created document immediately unlocks all workspace tools (text annotations, custom lines, borders, batch renaming, page rotation, and compression).

### Visual Identity & Theme
- **Theme & Palette**: Dark slate canvas (`#0F172A`) with refined neutral card surfaces (`#1E293B` / `#334155`) and crisp hairline borders (`border-slate-700/60`).
- **Accent Budget (10%)**: High-intent Indigo/Blue (`#3B82F6` / `#6366F1`) for primary actions, Emerald (`#10B981`) for Excel sheet indicators, and Amber (`#F59E0B`) for document status cues.
- **Top Bar Contract**:
  - Left: Application wordmark (`PDF Studio`).
  - Center: Clean text status (`Document Workspace`, `Total Pages: N`).
  - Right: Action buttons (`New PDF`, `Add Documents`, `Export & Download`).
- **Zero-Pill Metadata**: File sizes, row counts, and page indicators use quiet unboxed typography with typographic dots (`·`), strictly avoiding AI-slop badge sandwiches.
- **Tabular Numerals**: Spreadsheets and page indices strictly use `font-mono tabular-nums`.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Client-Side Conversion Engine
- **Chosen Approach**: Combine `mammoth` (DOCX to HTML), `xlsx` (SheetJS for Excel parsing and table generation), `html2canvas` (crisp 2x DPI canvas rendering), and `pdf-lib` (direct PDF page generation and native image embedding).
- **Why**: Zero external server latency, full offline capability, zero third-party data tracking, and compliance with high privacy standards.
- **Trade-Off**: Extremely large Excel sheets (>10,000 rows) are batched or paginated client-side to prevent UI thread lockups. Web workers or chunked frame rendering will keep the UI responsive.

### Decision 2: Multi-Sheet Excel Pagination & Sheet Selector
- **Chosen Approach**: Interactive Sheet Selection modal showing workbook tabs, row ranges, auto-fit table layout, and orientation toggle before rendering to PDF.
- **Why**: Excel sheets vary wildly in aspect ratio. Auto-fitting 50 columns onto a portrait page causes unreadable text; allowing the user to select sheets and toggle landscape prevents unreadable output.

### Decision 3: Document Architecture Integration
- **Chosen Approach**: Synthesize converted documents into standard `SourceFile` objects containing a compiled `arrayBuffer` (created via `pdf-lib`).
- **Why**: Seamless backward compatibility. Converted pages immediately inherit the existing annotation engine, split/crop tool, thumbnail rendering, drag-and-drop reordering, and multi-file export pipeline without needing separate code paths.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Pipeline Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Document Ingestion                         │
│       ┌───────────────┐   ┌────────────────┐   ┌───────────────┐       │
│       │  Word (.docx) │   │ Excel (.xlsx)  │   │ Images (.png) │       │
│       └───────┬───────┘   └────────┬───────┘   └───────┬───────┘       │
└───────────────┼────────────────────┼───────────────────┼───────────────┘
                ▼                    ▼                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Client-Side Conversion Pipeline                      │
│                                                                        │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────┐ │
│   │ Mammoth DOCX Engine │  │ SheetJS XLSX Parser │  │ Image Scaler & │ │
│   │ HTML Pagination     │  │ Sheet Selector & Fit│  │ Aspect Fitter  │ │
│   └──────────┬──────────┘  └──────────┬──────────┘  └───────┬────────┘ │
│              │                        │                     │          │
│              ▼                        ▼                     │          │
│   ┌──────────────────────────────────────────────┐          │          │
│   │   High-Res Off-Screen HTML Canvas Renderer   │          │          │
│   └──────────────────────┬───────────────────────┘          │          │
│                          │                                  │          │
│                          ▼                                  ▼          │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │             PDF Document Synthesis (pdf-lib Engine)              │ │
│   │       Creates PDF pages with embedded high-DPI bitmaps/PNG       │ │
│   └──────────────────────────────┬───────────────────────────────────┘ │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Workspace Data Integration                       │
│                                                                        │
│       ┌─────────────────────────────────────────────────────────┐      │
│       │ Synthesized SourceFile (arrayBuffer, unique sourceFileId│      │
│       └────────────────────────────┬────────────────────────────┘      │
│                                    ▼                                   │
│       ┌─────────────────────────────────────────────────────────┐      │
│       │ PDFPageItem[] appended to pages state:                  │      │
│       │  - Thumbnail rendered via PDF.js worker                 │      │
│       │  - Text annotations, line drawings, border & crop ready │      │
│       │  - Drag-and-drop reordering & page deletion ready       │      │
│       └─────────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Mapping

1. **`DocumentConverterModal`**:
   - Multi-format file dropzone (Word, Excel, Images).
   - Format badge & file size check.
   - Excel Sheet Previewer (tab checklist, landscape/portrait switch, font size slider).
   - Live conversion progress bar with cancellation support.
2. **`NewPdfModal`**:
   - Preset selector (Blank Letter/A4, Grid Note, Lined Note, or Import Starter).
   - Page count counter (1 to 20 initial pages).
   - Instant blank PDF creation via `PDFDocument.create()`.
3. **`conversionUtils.ts`**:
   - `convertDocxToPdf(file: File): Promise<Uint8Array>`
   - `convertExcelToPdf(file: File, options: ExcelConvertOptions): Promise<Uint8Array>`
   - `convertImagesToPdf(files: File[], options: ImageConvertOptions): Promise<Uint8Array>`
   - `createBlankPdf(options: BlankPdfOptions): Promise<Uint8Array>`
4. **Workspace Toolbar Integration (`App.tsx`)**:
   - Secondary toolbar buttons: `"Add Documents"` (`FilePlus` icon) and `"New PDF"` (`FileText` icon).
   - Empty state hero banner with quick start action cards.

---

## 5. Execution Steps Plan

1. **Package Installation**: Install client conversion libraries: `mammoth` (Word docx), `xlsx` (SheetJS spreadsheet parser), and `html2canvas` (offscreen canvas renderer).
2. **Utility Layer (`src/conversionUtils.ts`)**:
   - Implement Word-to-PDF rendering with document styling and pagination.
   - Implement Excel-to-PDF rendering with sheet inspection, table grid layout, and landscape auto-scaling.
   - Implement Image-to-PDF builder with multi-file ordering and margin controls.
   - Implement Blank PDF generator with Letter/A4 presets and optional note grids.
3. **UI Components**:
   - Build `DocumentConverterModal` with live preview and sheet configuration.
   - Build `NewPdfModal` for blank document creation.
   - Add primary trigger controls to the workspace header and empty state hero.
4. **Validation & Verification**:
   - Test DOCX, XLSX, and multi-image conversion client-side.
   - Verify converted pages integrate into reordering, text annotation, line drawing, and final export.
   - Build and lint verification (`compile_applet`).
