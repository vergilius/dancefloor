// Our own view of the converted DWG entities: only the fields normalize() reads.
// Mirrors libredwg-web's converter output structurally, so no GPL types leak out of src/worker/.
// Raw units are drawing units (mm, INSUNITS=4). Angles are radians.

export type P2 = { x: number; y: number };
export type P3 = { x: number; y: number; z: number };

/** `ownerBlockRecordSoftId` = handle of the owning block record (*Model_Space, *Paper_Space, or a block). */
export type RawEntity = { type: string; layer: string; ownerBlockRecordSoftId?: string };

export type LineIn = RawEntity & { type: 'LINE'; startPoint: P3; endPoint: P3 };

/** ARC/CIRCLE/LWPOLYLINE are in OCS: extrusion (0,0,−1) mirrors x. */
export type ArcIn = RawEntity & {
  type: 'ARC';
  center: P3;
  radius: number;
  startAngle: number;
  endAngle: number;
  extrusionDirection?: P3;
};

export type CircleIn = RawEntity & { type: 'CIRCLE'; center: P3; radius: number; extrusionDirection?: P3 };

/** WCS (not OCS). Major axis end is relative to the centre; angles are ellipse parameters (radians). */
export type EllipseIn = RawEntity & {
  type: 'ELLIPSE';
  center: P3;
  majorAxisEndPoint: P3;
  axisRatio: number;
  startAngle: number;
  endAngle: number;
  extrusionDirection?: P3;
};

export type LwPolylineIn = RawEntity & {
  type: 'LWPOLYLINE';
  /** Bit 0x200 = closed (DWG flag, not the DXF group 70 bit). */
  flag: number;
  vertices: (P2 & { bulge: number })[];
  extrusionDirection?: P3;
};

export type SplineIn = RawEntity & {
  type: 'SPLINE';
  degree: number;
  knots: number[];
  weights?: number[];
  controlPoints: P3[];
  fitPoints: P3[];
};

/** Block reference. Rotation in radians; scale may be negative (mirrored). rowCount/columnCount > 1 = MINSERT. */
export type InsertIn = RawEntity & {
  type: 'INSERT';
  name: string;
  insertionPoint: P3;
  xScale: number;
  yScale: number;
  rotation: number;
  rowCount: number;
  columnCount: number;
  rowSpacing: number;
  columnSpacing: number;
  extrusionDirection?: P3;
};

/** MTEXT: insertion point in WCS; `direction` is the text's x-axis. attachmentPoint 1–9 (1 = top left … 9 = bottom right). */
export type MTextIn = RawEntity & {
  type: 'MTEXT';
  insertionPoint: P3;
  textHeight: number;
  attachmentPoint: number;
  text: string;
  rotation: number;
  direction?: P3;
};

/** TEXT: anchored at startPoint (alignment variants aren't used in the real files, so they aren't handled). */
export type TextIn = RawEntity & { type: 'TEXT'; startPoint: P2; textHeight: number; rotation: number; text: string };

/** A label in sheet metres. Rotation in radians (CCW from +x); attach as in MTEXT (1–9). */
export type NormalizedText = {
  text: string;
  layer: string;
  x: number;
  y: number;
  height: number;
  rotation: number;
  attach: number;
};

export type BlockIn = { basePoint: P3; entities: readonly RawEntity[] };

/** Sheet geometry in metres, sheet-local 2D (x east, y north on plans). */
export type NormalizedSheet = {
  /** Per layer: segments as [x1, y1, x2, y2, …]. Float64 so large site coordinates keep mm precision. */
  layers: { name: string; segments: Float64Array }[];
  extents: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Entities turned into segments, by type (block contents included; INSERT = references expanded). */
  drawn: Record<string, number>;
  /**
   * Entities not drawn (yet), by type. Top-level entities not owned by *Model_Space count as `(paper space)`; INSERT problems as
   * `INSERT (missing block)`, `INSERT (cycle)` and `INSERT (depth > 16)`.
   */
  skipped: Record<string, number>;
  segmentCount: number;
  texts: NormalizedText[];
  /** Texts that still contain unknown `\\` codes after stripping. */
  textLeftovers: number;
};
