// Loads YouTube's IFrame Player API script once and resolves with the global YT object.
let ytApiPromise: Promise<any> | null = null;
export function loadYouTubeIframeApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      ytApiPromise = null;
      reject(new Error('YouTube API failed to load'));
    };
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export type VoidDownloadRecord = {
  id: string;
  title: string;
  artist: string;
  album: string;
  image?: string;
  coverBlob?: Blob;
  duration?: number;
  mimeType: string;
  source?: string;
  qualityBadge?: string;
  bitrate?: number;
  codec?: string;
  format?: string;
  qualityVerified?: boolean;
  exactYtBlob?: boolean;
  favorite?: boolean;
  blob: Blob;
  downloadedAt: number;
};

export const VOID_DOWNLOAD_DB = 'void-offline-downloads';

export function createYtContainerBlob(): Blob {
  const buffer = new ArrayBuffer(88);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 80, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, 44, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

export function openVoidDownloadDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Offline storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(VOID_DOWNLOAD_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('tracks')) {
        request.result.createObjectStore('tracks', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
  });
}

export async function putVoidDownload(record: VoidDownloadRecord): Promise<void> {
  const db = await openVoidDownloadDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      // Track IDs are the storage identity. Never remove a different download just
      // because its title/artist text matches; providers can return distinct tracks
      // with identical metadata.
      const request = store.put(record);
      request.onerror = () => {
        try {
          tx.abort();
        } catch {}
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not save download.'));
      tx.onabort = () => reject(tx.error || new Error('Download save was cancelled.'));
    });
  } finally {
    db.close();
  }
}

export async function getVoidDownloads(): Promise<VoidDownloadRecord[]> {
  const db = await openVoidDownloadDb();
  try {
    return await new Promise<VoidDownloadRecord[]>((resolve, reject) => {
      const request = db.transaction('tracks', 'readonly').objectStore('tracks').getAll();
      request.onsuccess = () => resolve(request.result as VoidDownloadRecord[]);
      request.onerror = () => reject(request.error || new Error('Could not read downloads.'));
    });
  } finally {
    db.close();
  }
}

export async function removeVoidDownload(id: string): Promise<void> {
  const db = await openVoidDownloadDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not remove download.'));
    });
  } finally {
    db.close();
  }
}
