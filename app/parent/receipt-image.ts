// A transfer receipt from a phone: usually a screenshot (small), sometimes a photo of a bank slip (6 to 12 MB). The server
// refuses files over 4 MB, so a big picture is shrunk here first (longest side 1800 px, JPEG) instead of failing after a slow
// upload on mobile data. A PDF is never touched. Nothing is sent from this file; it only prepares what the parent picked.

export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const SHRINK_ABOVE_BYTES = 1_500_000;
export const MAX_SIDE = 1800;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const RECEIPT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

export type ReceiptPlan = {action: 'keep'} | {action: 'shrink'; scale: number} | {action: 'refuse'; reason: 'type' | 'size'};

/** What to do with a picked file. `type` may be empty on some Android pickers; the server checks the real bytes anyway. */
export function planReceipt(file: {type: string; size: number}, dimensions?: {width: number; height: number}): ReceiptPlan {
  if (file.type && !RECEIPT_TYPES.includes(file.type)) return {action: 'refuse', reason: 'type'};
  if (file.type === 'application/pdf') return file.size <= MAX_RECEIPT_BYTES ? {action: 'keep'} : {action: 'refuse', reason: 'size'};
  // Under 1.5 MB it is sent exactly as it is: a screenshot's small text must stay sharp for whoever checks the reference.
  if (file.size <= SHRINK_ABOVE_BYTES) return {action: 'keep'};
  if (!dimensions) return file.size <= MAX_RECEIPT_BYTES ? {action: 'keep'} : {action: 'refuse', reason: 'size'};
  const longest = Math.max(dimensions.width, dimensions.height);
  return {action: 'shrink', scale: Math.min(1, MAX_SIDE / longest)};
}

export type Prepared = {ok: true; file: File; shrunk: boolean} | {ok: false; reason: 'type' | 'size'};

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Browser only. Returns the file to upload (possibly smaller) or the reason it cannot be used. */
export async function prepareReceipt(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap | null = null;
  if (file.type !== 'application/pdf') {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      bitmap = null;
    }
  }
  const plan = planReceipt(file, bitmap ? {width: bitmap.width, height: bitmap.height} : undefined);
  if (plan.action === 'refuse') {
    bitmap?.close();
    return {ok: false, reason: plan.reason};
  }
  if (plan.action === 'keep' || !bitmap) {
    bitmap?.close();
    return file.size <= MAX_RECEIPT_BYTES ? {ok: true, file, shrunk: false} : {ok: false, reason: 'size'};
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * plan.scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * plan.scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file.size <= MAX_RECEIPT_BYTES ? {ok: true, file, shrunk: false} : {ok: false, reason: 'size'};
  }
  context.fillStyle = '#ffffff'; // a screenshot with transparency must not turn black as a JPEG
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob = await encode(canvas, 0.85);
  if (blob && blob.size > MAX_RECEIPT_BYTES) blob = await encode(canvas, 0.7);
  if (!blob || blob.size > MAX_RECEIPT_BYTES) return file.size <= MAX_RECEIPT_BYTES ? {ok: true, file, shrunk: false} : {ok: false, reason: 'size'};
  if (blob.size >= file.size && file.size <= MAX_RECEIPT_BYTES) return {ok: true, file, shrunk: false};
  return {ok: true, file: new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'receipt'}.jpg`, {type: 'image/jpeg'}), shrunk: true};
}

/** "1.4 MB" / "820 KB". */
export function sizeLabel(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
