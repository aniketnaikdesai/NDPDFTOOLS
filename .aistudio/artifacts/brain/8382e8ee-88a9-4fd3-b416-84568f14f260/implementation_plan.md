# Batch Rename for Selected PDF Pages

A dedicated batch renaming workflow in the selection toolbar that enables users to bulk-assign export filenames and page labels to selected pages using configurable prefixes, sequential starting numbers, and padding presets with real-time preview.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during Phase 1 clarification:
> - **Renaming Pattern**: Pattern-based configuration with custom prefix, starting number, and padding presets (e.g., `01`, `001`, `none`).
> - **Label Visibility & Scope**: Applied both on page thumbnail cards as recognizable export labels and directly used when exporting images (individual or ZIP).
> - **Interface Style**: Dedicated interactive modal dialog featuring live per-page filename preview cards and quick pattern presets before applying.

---

## 1. Overview & Core Concept

- **What It Does**: When one or more pages are selected in the document organizer, a "Batch Rename" action appears in the bulk actions toolbar. Clicking it opens a focused modal where users can specify a prefix (e.g. `Doc-`, `Invoice_`, `Report_P`), a starting index (e.g. `1`), and digit padding (`01`, `001`, or unpadded). A live preview shows the exact resulting file labels for every selected page in real time. Upon applying, page cards reflect these custom labels, and any exported PNG/JPEG files or ZIP packages adopt the formatted names.
- **Target Persona**: Professionals, archivists, legal teams, and students who organize merged or scanned PDFs and need consistent, standardized file naming for downstream archiving or file sharing.
- **Key Value**: Eliminates tedious manual renaming of dozens of exported pages while preserving original source traceability and visual order in the workspace.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Selection & Action Trigger**:
   - User checks one or more pages (or clicks "Select All").
   - The selection toolbar reveals the new **Batch Rename** button alongside Rotate, Duplicate, and Delete.
   - The button shows the active selection count (e.g., `Rename (3)`).
2. **Interactive Modal Configuration**:
   - Opens an accessible modal with three primary controls:
     - **Prefix Input**: Text field with quick-preset chips (`Doc-`, `Page-`, `Invoice_`, `Scan_`, `Slide_`).
     - **Start Number**: Numeric input (default `1`, with `+` / `-` steppers).
     - **Number Padding**: Segmented switch between `1` (No padding), `01` (2 digits), and `001` (3 digits).
     - **Separator Style**: Dash (`-`), Underscore (`_`), or Space (` `).
   - **Live Preview List**: A scrollable preview grid/table showing:
     - Page thumbnail thumbnail & original page index
     - Generated file name (e.g., `Doc-001.png` / `Doc-001.jpg`)
     - Status indicator confirming uniqueness
   - **Actions**: "Apply to N Pages" (primary button) and "Cancel". Also includes a "Clear Custom Labels" action to reset back to defaults.
3. **Workspace Card Display**:
   - On each page card, if a custom export label exists, a clean typographic tag (`font-mono text-[10px] text-blue-600 bg-blue-50/80 border border-blue-200/80 rounded px-1.5 py-0.5`) appears below the thumbnail.
4. **Export Integration**:
   - When exporting pages as PNG/JPEG images or in a ZIP archive, the system uses each page's custom label as the exported filename instead of the default generic string.

### Visual Identity & Theme (SaaS & Utility Dashboard)

- **Aesthetic Direction**: Functional, clean, utility-grade interface adhering strictly to anti-slop rules, zero-pill metadata discipline, and high-density layouts.
- **Color Palette & Distribution**:
  - *Dominant Canvas (60%)*: Slate-900 modal backdrop overlay (`bg-slate-950/80 backdrop-blur-xs`), clean crisp white modal container (`bg-white border border-slate-200 shadow-2xl`).
  - *Structural Surfaces (30%)*: Slate-50 preview container, subtle hairline dividers (`border-slate-200`), neutral slate labels (`text-slate-500`, `text-slate-700`).
  - *Accent Budget (10%)*: High-intent blue action points (`bg-blue-600 hover:bg-blue-700 text-white`, focused rings `ring-blue-500/20`).
- **Typography & Hierarchy**:
  - Headings: Display bold sans (`font-display font-bold text-slate-900 tracking-tight`).
  - Inputs & Labels: Tight uppercase micro-headers (`text-[10px] font-bold text-slate-500 uppercase tracking-wider`).
  - Filenames & Numbers: Strict monospace tabular numerals (`font-mono text-xs tabular-nums text-slate-800`).
- **Spatial Discipline**:
  - Modal max-width 640px (`max-w-2xl`), balanced padding (`p-6`), no nested cards within cards. Preview rows use compact $40\text{px}$ high rows with clear grid layout.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Store `customLabel` in `PDFPageItem` State**:
  - *Approach*: Extend the `PDFPageItem` type with an optional `customLabel?: string` field.
  - *Why*: Allows undo/redo history to naturally capture renaming actions, guarantees that reordering or duplicating pages preserves their assigned labels, and decouples preview rendering from export logic.
  - *Alternatives Considered*: Storing a detached mapping `Record<string, string>` in separate state. Rejected because page deletion, duplication, and reordering would fall out of sync with detached IDs.

- **Decision 2: Sequential Ordering by Selection vs Document Order**:
  - *Approach*: Renumber selected pages based on their natural document appearance order (from top-left to bottom-right in the workspace grid).
  - *Why*: Intuitive for users who want multi-page documents to export in chronological reading sequence regardless of which order they clicked the checkboxes.

- **Decision 3: Clear Label Option**:
  - *Approach*: Provide an explicit "Reset to Default Names" option inside the modal and on individual card tooltips.
  - *Why*: Allows users to easily revert without having to recreate the workspace or manually clear labels one by one.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Selection Toolbar UI                            │
│  [✓ Select All] [3 of 12 selected] [Rotate] [Duplicate] [Batch Rename] │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ onClick
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      BatchRenameModal Component                        │
│  ┌───────────────────────┐ ┌──────────────┐ ┌───────────────────────┐  │
│  │ Prefix Input ("Doc-") │ │ Start At (1) │ │ Padding (01 / 001)    │  │
│  └───────────────────────┘ └──────────────┘ └───────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Live Filename Preview Table                                      │  │
│  │ • Page 1 ──> Doc-001.png                                         │  │
│  │ • Page 2 ──> Doc-002.png                                         │  │
│  │ • Page 3 ──> Doc-003.png                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  [Cancel]                                    [Apply to 3 Pages]        │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ onApply(patternConfig)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   App State Update & Propagation                       │
│  • saveToHistory(pages)                                                │
│  • setPages(prev => updated with page.customLabel)                     │
│  • Page Cards render visual label tag badge                            │
│  • exportPageToImage / zip packaging adopts file.customLabel           │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Updates

1. **`src/types.ts`**:
   ```typescript
   export interface PDFPageItem {
     // ... existing fields ...
     customLabel?: string; // Optional user-assigned export filename / card label
   }
   ```
2. **`src/App.tsx` State**:
   - `isBatchRenameOpen: boolean`: Controls modal visibility.
   - `batchPrefix: string`: Default `"Doc-"`.
   - `batchStartNum: number`: Default `1`.
   - `batchPadding: number`: `1` (none), `2` (`01`), `3` (`001`).
3. **Export Generator (`exportPageToImage` / ZIP builder)**:
   - When computing `file.name`, check if `page.customLabel` exists:
     ```typescript
     const baseName = page.customLabel || `${cleanName}_page_${pageNum}`;
     const name = `${baseName}.${ext}`;
     ```

### Verification Checklist

- [ ] Selection toolbar displays "Batch Rename" when $\ge 1$ page is selected.
- [ ] Modal opens with interactive prefix, start number, padding, and live preview table.
- [ ] Applying updates `pages` state and pushes current state to undo/redo history.
- [ ] Page cards show custom export label badge when set.
- [ ] Exporting single image or ZIP uses custom labels as file names.
- [ ] Applet compiles cleanly with zero TypeScript / lint errors.
