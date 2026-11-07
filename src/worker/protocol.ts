// Messages between the app and the DWG worker. No libredwg types here: only our own.
import type { NormalizedSheet } from '../dwg/types';

export type ParseRequest = { id: number; name: string; bytes: ArrayBuffer };

export type ParseSummary = {
  name: string;
  insunits: number | undefined;
  entityCount: number;
  entityCounts: Record<string, number>;
  layerNames: string[];
  ms: number;
  sheet: NormalizedSheet;
};

export type ParseResponse =
  | { id: number; ok: true; summary: ParseSummary }
  | { id: number; ok: false; error: string };
