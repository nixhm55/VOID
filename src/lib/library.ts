export type Track = {
  id: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  mimeType: string;
  fileSize: number;
  importedAt: number;
  favorite: boolean;
  file: Blob;
  artwork?: Blob;
  lyrics?: string;
  lastPlayedAt?: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  trackIds: string[];
};

export type Preferences = {
  theme: 'system' | 'light' | 'dark';
  autoplay: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
};

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  m4p: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  alac: 'audio/alac',
};

export function resolveAudioMimeType(fileName: string, declaredType = '') {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const canonicalType = AUDIO_MIME_BY_EXTENSION[extension];
  if (canonicalType) return canonicalType;
  const normalizedType = declaredType.split(';', 1)[0].trim().toLowerCase();
  return normalizedType.startsWith('audio/') ? normalizedType : 'application/octet-stream';
}

function normalizeAudioFile(file: File) {
  const mimeType = resolveAudioMimeType(file.name, file.type);
  if (file.type === mimeType) return file;
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
}

const DB_NAME = 'void-local-library';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | undefined;

function database() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tracks')) {
          const tracks = db.createObjectStore('tracks', { keyPath: 'id' });
          tracks.createIndex('importedAt', 'importedAt');
        }
        if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local library storage.'));
    });
  }
  return dbPromise;
}

async function operation<T>(store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local library operation failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local library transaction was interrupted.'));
  });
}

export const getTracks = () => operation<Track[]>('tracks', 'readonly', store => store.getAll());
export const saveTrack = (track: Track) => operation<IDBValidKey>('tracks', 'readwrite', store => store.put(track));
export const removeTrack = (id: string) => operation<undefined>('tracks', 'readwrite', store => store.delete(id));
export const getPlaylists = () => operation<Playlist[]>('playlists', 'readonly', store => store.getAll());
export const savePlaylist = (playlist: Playlist) => operation<IDBValidKey>('playlists', 'readwrite', store => store.put(playlist));
export const removePlaylist = (id: string) => operation<undefined>('playlists', 'readwrite', store => store.delete(id));
export const getPreferences = async (): Promise<Preferences | undefined> => {
  const row = await operation<{ id: string; value: Preferences } | undefined>('preferences', 'readonly', store => store.get('app'));
  return row?.value;
};
export const savePreferences = (value: Preferences) =>
  operation<IDBValidKey>('preferences', 'readwrite', store => store.put({ id: 'app', value }));

function decodeId3Text(frame: Uint8Array) {
  const encoding = frame[0];
  const bytes = frame.slice(1);
  try {
    if (encoding === 1) return new TextDecoder('utf-16').decode(bytes).replace(/\0+$/g, '').trim();
    if (encoding === 2) return new TextDecoder('utf-16be').decode(bytes).replace(/\0+$/g, '').trim();
    if (encoding === 0) return new TextDecoder('windows-1252').decode(bytes).replace(/\0+$/g, '').trim();
    return new TextDecoder().decode(bytes).replace(/\0+$/g, '').trim();
  } catch { return ''; }
}

async function readMp3Tags(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'mp3' || file.size < 10) return {};
  try {
    const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 3 * 1024 * 1024)).arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3') return {};
    const version = bytes[3];
    const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    let offset = 10;
    const tags: { title?: string; artist?: string; album?: string; artwork?: Blob } = {};
    const frameEnd = Math.min(bytes.length, 10 + tagSize);
    while (offset + 10 < frameEnd) {
      const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = version === 4
        ? ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14) | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f)
        : bytes[offset + 4] * 0x1000000 + bytes[offset + 5] * 0x10000 + bytes[offset + 6] * 0x100 + bytes[offset + 7];
      offset += 10;
      if (!size || offset + size > frameEnd) break;
      const frame = bytes.slice(offset, offset + size);
      if (id === 'TIT2') tags.title = decodeId3Text(frame);
      if (id === 'TPE1') tags.artist = decodeId3Text(frame);
      if (id === 'TALB') tags.album = decodeId3Text(frame);
      if (id === 'APIC' && !tags.artwork) {
        const encoding = frame[0];
        let cursor = 1;
        while (cursor < frame.length && frame[cursor] !== 0) cursor += 1;
        const mime = new TextDecoder().decode(frame.slice(1, cursor)) || 'image/jpeg';
        cursor += 1; // MIME terminator
        cursor += 1; // picture type
        const wide = encoding === 1 || encoding === 2;
        while (cursor < frame.length) {
          const first = frame[cursor];
          const second = wide ? frame[cursor + 1] : 0;
          if (first === 0 && second === 0) { cursor += wide ? 2 : 1; break; }
          cursor += wide ? 2 : 1;
        }
        if (cursor < frame.length) tags.artwork = new Blob([frame.slice(cursor).buffer as ArrayBuffer], { type: mime });
      }
      offset += size;
    }
    return tags;
  } catch { return {}; }
}

async function readAudioDuration(file: File): Promise<number> {
  const probe = new Audio();
  probe.preload = 'metadata';
  if (file.type.startsWith('audio/') && !probe.canPlayType(file.type)) return 0;

  const url = URL.createObjectURL(file);
  return new Promise(resolve => {
    let settled = false;
    const timeout = window.setTimeout(() => finish(0), 2500);
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      probe.removeEventListener('loadedmetadata', onLoaded);
      probe.removeEventListener('error', onError);
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const onLoaded = () => finish(probe.duration);
    const onError = () => finish(0);
    probe.addEventListener('loadedmetadata', onLoaded, { once: true });
    probe.addEventListener('error', onError, { once: true });
    probe.src = url;
  });
}

export async function trackFromFile(file: File): Promise<Track> {
  const raw = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const bits = raw.split(/\s[-–—]\s/);
  const artist = bits.length > 1 ? bits.shift()!.trim() : '';
  const title = bits.join(' - ').trim() || raw || 'Untitled audio';
  const tags = await readMp3Tags(file);
  const audioFile = normalizeAudioFile(file);
  return {
    id: `${Date.now().toString(36)}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    fileName: file.name,
    title: tags.title || title,
    artist: tags.artist || artist || 'Unknown artist',
    album: tags.album || 'Unknown album',
    duration: await readAudioDuration(audioFile),
    mimeType: audioFile.type || 'application/octet-stream',
    fileSize: audioFile.size,
    importedAt: Date.now(),
    favorite: false,
    file: audioFile,
    artwork: tags.artwork,
  };
}
