import { importFileKind, type ImportFile, type ImportFileKind } from '@tickrs/shared';
import type { PickedFile } from '@tickrs/ui';

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function shrink(blob: Blob, maxLongEdge: number): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  } catch {
    return null;
  }
}

export interface PreparedFile {
  kind: ImportFileKind;
  file: ImportFile;
}

export async function prepareFile(picked: PickedFile, maxLongEdge: number): Promise<PreparedFile | null> {
  const kind = importFileKind(picked.name, picked.mediaType);
  if (!kind) return null;
  if (kind === 'image') {
    const small = await shrink(picked.blob, maxLongEdge);
    if (small) {
      const data = toBase64(new Uint8Array(await small.arrayBuffer()));
      return { kind, file: { name: picked.name, mediaType: 'image/jpeg', data } };
    }
  }
  const data = toBase64(new Uint8Array(await picked.blob.arrayBuffer()));
  return { kind, file: { name: picked.name, mediaType: picked.mediaType, data } };
}
