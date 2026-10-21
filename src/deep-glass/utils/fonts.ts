import { type Track, resolveAudioMimeType } from '@/lib/library';

export const AUTO_IMPORT_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'm4b',
  'aac',
  'wav',
  'flac',
  'ogg',
  'oga',
  'opus',
  'aif',
  'aiff',
]);

export type StoredFont = {
  id: string;
  name: string;
  fileName: string;
  format: string;
  size: number;
  addedAt: number;
  data: Blob;
};

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
export const FONT_MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};
export const FONT_MAX_BYTES = 12 * 1024 * 1024;
export const FONT_ROW_PREFIX = 'font:';
export const SAVAGE_FAMILY = 'Savage Roses';
export const BUILTIN_FONTS = [
  { id: 'dm-serif-display', name: 'DM Serif Display Italic', family: 'DM Serif Display', tag: 'Built in' },
  { id: 'delamoore', name: 'Delamoore', family: 'Delamoore', tag: 'Built in' },
  { id: 'savage-roses', name: SAVAGE_FAMILY, family: SAVAGE_FAMILY, tag: 'Built in' },
  { id: 'wasted-vindey', name: 'Wasted Vindey', family: 'Wasted Vindey', tag: 'Built in' },
] as const;
export const FONT_PREVIEW = 'A quiet place for your music';
export const fontFamilyFor = (id: string) => `VOID Font ${id.slice(0, 8)}`;
export const cleanFontName = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Custom font';

export async function materializeAudioFile(
  track: Track
): Promise<{ file: File; mimeType: string }> {
  const mimeType = resolveAudioMimeType(track.fileName, track.mimeType || track.file.type);
  const buffer = await track.file.arrayBuffer();
  const file = new File([buffer], track.fileName, {
    type: mimeType,
    lastModified: Number.isFinite(track.importedAt) ? track.importedAt : Date.now(),
  });
  return { file, mimeType };
}

function fontStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available.'));
      return;
    }
    const open = indexedDB.open('void-local-library');
    open.onupgradeneeded = () => open.transaction?.abort();
    open.onerror = () => reject(open.error ?? new Error('Could not open library storage.'));
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('preferences')) {
        db.close();
        reject(new Error('Library storage is not ready.'));
        return;
      }
      let result: T | undefined;
      const transaction = db.transaction('preferences', mode);
      const request = action(transaction.objectStore('preferences'));
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result as T);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error('Font storage was interrupted.'));
      };
    };
  });
}

export const listStoredFonts = async () => {
  const rows = await fontStore<{ id: string; value?: StoredFont }[]>(
    'readonly',
    store => store.getAll()
  );
  return rows
    .filter(row => typeof row.id === 'string' && row.id.startsWith(FONT_ROW_PREFIX) && row.value?.data)
    .map(row => row.value as StoredFont)
    .sort((a, b) => a.addedAt - b.addedAt);
};

export const putStoredFont = (font: StoredFont) =>
  fontStore<IDBValidKey>('readwrite', store =>
    store.put({ id: FONT_ROW_PREFIX + font.id, value: font })
  );

export const deleteStoredFont = (id: string) =>
  fontStore<undefined>('readwrite', store => store.delete(FONT_ROW_PREFIX + id));

export async function loadFontFace(id: string, data: ArrayBuffer) {
  const face = new FontFace(fontFamilyFor(id), data);
  await face.load();
  document.fonts.add(face);
  return face;
}

export async function readFontName(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const view = new DataView(buffer);
    const signature = view.getUint32(0);
    let table: DataView | null = null;
    if (signature === 0x774f4646) {
      const count = view.getUint16(12);
      for (let i = 0; i < count; i += 1) {
        const entry = 44 + i * 20;
        if (view.getUint32(entry) !== 0x6e616d65) continue;
        const offset = view.getUint32(entry + 4),
          packed = view.getUint32(entry + 8),
          original = view.getUint32(entry + 12);
        const raw = buffer.slice(offset, offset + packed);
        if (packed === original) table = new DataView(raw);
        else if ('DecompressionStream' in window) {
          const stream = new Blob([raw])
            .stream()
            .pipeThrough(new (window as any).DecompressionStream('deflate'));
          table = new DataView(await new Response(stream).arrayBuffer());
        }
        break;
      }
    } else if (signature === 0x00010000 || signature === 0x4f54544f || signature === 0x74727565) {
      const count = view.getUint16(4);
      for (let i = 0; i < count; i += 1) {
        const entry = 12 + i * 16;
        if (view.getUint32(entry) !== 0x6e616d65) continue;
        table = new DataView(buffer, view.getUint32(entry + 8), view.getUint32(entry + 12));
        break;
      }
    }
    if (!table) return null;
    const records = table.getUint16(2),
      strings = table.getUint16(4);
    let family: string | null = null,
      legacy: string | null = null;
    for (let i = 0; i < records; i += 1) {
      const record = 6 + i * 12;
      const platform = table.getUint16(record),
        nameId = table.getUint16(record + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const length = table.getUint16(record + 8),
        offset = strings + table.getUint16(record + 10);
      const bytes = new Uint8Array(table.buffer, table.byteOffset + offset, length);
      const text = new TextDecoder(
        platform === 3 || platform === 0 ? 'utf-16be' : 'windows-1252'
      )
        .decode(bytes)
        .trim();
      if (!text) continue;
      if (nameId === 16 && !family) family = text;
      else if (nameId === 1 && !legacy) legacy = text;
    }
    return family ?? legacy;
  } catch {
    return null;
  }
}
