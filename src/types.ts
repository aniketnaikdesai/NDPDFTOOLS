export interface SourceFile {
  id: string;
  name: string;
  size: number;
  arrayBuffer: ArrayBuffer;
  password?: string;
}

export interface TextAnnotation {
  id: string;
  text: string;
  x: number; // 0 to 1 relative horizontal coordinate
  y: number; // 0 to 1 relative vertical coordinate
  fontSize: number; // font size in points
  alignment?: 'left' | 'center' | 'right';
  color?: string; // Font color (e.g. hex)
  backgroundColor?: string; // Background color (e.g. hex or 'transparent')
}

export interface CropArea {
  x: number; // 0 to 1 relative left coordinate
  y: number; // 0 to 1 relative top coordinate
  width: number; // 0 to 1 relative width
  height: number; // 0 to 1 relative height
}

export interface PageBorderSettings {
  enabled: boolean;
  style: 'continuous' | 'dash' | 'dotted' | 'wavy';
  thickness: number; // 1 to 12
  color: string; // hex
}

export interface LineAnnotation {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // 0 to 1 relative coordinate
  style: 'continuous' | 'dash' | 'dotted' | 'wavy';
  thickness: number; // 1 to 12
  color: string; // hex
  start?: number; // 0 to 1 relative coordinate start (default 0)
  end?: number; // 0 to 1 relative coordinate end (default 1)
}

export interface PDFPageItem {
  id: string; // Unique ID to track instances across reordering
  sourceFileId: string; // ID of the SourceFile this page belongs to
  originalIndex: number; // 0-based page index in the source file
  rotation: number; // 0, 90, 180, 270 degrees
  thumbnailUrl: string | null; // Base64 data URL for grid preview
  width: number;
  height: number;
  textAnnotations?: TextAnnotation[];
  lines?: LineAnnotation[];
  border?: PageBorderSettings;
  crop?: CropArea;
}

export type CompressionPreset = 'low' | 'medium' | 'high' | 'custom';

export interface CompressionSettings {
  preset: CompressionPreset;
  dpi: number; // e.g. 72, 100, 150, 200, 300
  imageQuality: number; // 0.1 to 1.0
  compressImages: boolean;
  stripMetadata: boolean;
  removeUnusedFonts: boolean;
  removeHyperlinks: boolean;
}
