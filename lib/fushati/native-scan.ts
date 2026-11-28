// Pure helpers for scanning a product barcode with the phone's own scanner inside the Android / iOS app.
// Nothing here touches the camera; app/native/scan.ts does that and uses these to read what came back.

/** The barcode kinds a shop product carries. The scanner ignores everything else (QR posters, ID cards, ...). */
export const SCAN_FORMATS = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF'] as const;

export type NativeScanOutcome =
  | {kind: 'code'; code: string}
  | {kind: 'cancelled'}
  | {kind: 'denied'}
  | {kind: 'preparing'}
  | {kind: 'unavailable'}
  | {kind: 'failed'};

type Found = {rawValue?: unknown; displayValue?: unknown};

/** The first barcode text in a scanner answer, or '' when it holds none. */
export function firstBarcode(answer: unknown): string {
  const list = (answer as {barcodes?: unknown} | null | undefined)?.barcodes;
  if (!Array.isArray(list)) return '';
  for (const entry of list as Found[]) {
    for (const value of [entry?.rawValue, entry?.displayValue]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

/** What a scanner error means for the person: they backed out, said no to the camera, the phone has no scanner, or it broke. */
export function classifyScanError(error: unknown): 'cancelled' | 'denied' | 'unavailable' | 'failed' {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as {message?: unknown} | null)?.message ?? '');
  if (/cancel/i.test(text)) return 'cancelled';
  if (/permission|denied|not authori[sz]ed/i.test(text)) return 'denied';
  if (/not implemented|unimplemented|not available|not supported|unsupported/i.test(text)) return 'unavailable';
  return 'failed';
}
