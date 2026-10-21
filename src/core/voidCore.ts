/**
 * VOID shared core contract.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Playlist, Preferences, Track } from '@/lib/library';

export type DesignId = 'deep' | 'paper';
export const DESIGN_STORAGE_KEY = 'void-design';
export const DESIGN_OPTIONS: ReadonlyArray<{ id: DesignId; label: string }> = [
  { id: 'deep', label: 'Deep Glass' },
  { id: 'paper', label: 'Paper Glass' },
];

export const readDesign = (): DesignId => {
  try { return localStorage.getItem(DESIGN_STORAGE_KEY) === 'paper' ? 'paper' : 'deep'; } catch { return 'deep'; }
};
export const writeDesign = (design: DesignId) => {
  try { localStorage.setItem(DESIGN_STORAGE_KEY, design); } catch { /* storage unavailable */ }
};

export type Page = 'home' | 'songs' | 'trending' | 'albums' | 'artists' | 'playlists' | 'favorites' | 'recent' | 'queue' | 'settings' | 'downloads';
export type Detail = { kind: 'album' | 'artist' | 'playlist'; name: string } | null;
export type Hue4 = readonly [number, number, number, number];
export type Setter<T> = Dispatch<SetStateAction<T>>;
type InputRef = { current: HTMLInputElement | null };

export type RowActions = {
  play: (track: Track, list: string[]) => void;
  openAlbum: (name: string) => void;
  move: (track: Track, index: number, step: number) => void;
  removeFromList: (id: string) => void;
  favorite: (track: Track) => void;
  menu: (track: Track) => void;
  download?: (track: any) => void;
  canDownload?: (track: any) => boolean;
  isDownloading?: (track: any) => boolean;
  isDownloadSuccess?: (track: any) => boolean;
};

export type FontChoice = { id: string; name: string; tag: string; family: string; note: string; font: any };

export interface VoidCore {
  design: DesignId;
  setDesign: (design: DesignId) => void;

  tracks: Track[];
  playlists: Playlist[];
  queue: string[];
  queueTracks: Track[];
  filteredTracks: Track[];
  albumNames: string[];
  artistNames: string[];
  jumpBack: Track[];
  recentlyAdded: Track[];
  hasPlayed: boolean;
  isReady: boolean;
  storageError: string;
  setStorageError: Setter<string>;
  reload: () => Promise<void>;
  importing: boolean;

  activeId: string | null;
  activeTrack: any;
  isPlaying: boolean;
  position: number;
  duration: number;
  prefs: Preferences;
  updatePrefs: (next: Preferences) => Promise<void> | void;
  playTrack: (track: any, list?: string[]) => Promise<void> | void;
  togglePlay: () => Promise<void> | void;
  playRelative: (direction: number) => void;
  playList: (list: Track[]) => void;
  playSomething: () => void;
  seekTo: (next: number) => void;
  changeVolume: (value: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;

  page: Page;
  detail: Detail;
  setDetail: Setter<Detail>;
  query: string;
  setQuery: Setter<string>;
  title: string;
  pageDescription: Record<Page, string>;
  setPageAndRoute: (page: Page) => void;
  openCollection: (kind: 'album' | 'artist', name: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Setter<boolean>;

  greeting: string;
  moodLabel: string;
  moodLine: string;

  atmos: Hue4 | null;
  canvasVideoId: string | null;
  canvasEnabled: boolean;
  setCanvasEnabled: Setter<boolean>;
  canvasReady: boolean;
  setCanvasReady: Setter<boolean>;

  rowActions: RowActions;
  toggleFavorite: (track: any) => Promise<void> | void;
  deleteTrack: (track: Track) => Promise<void> | void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  clearQueue: () => void;
  splitArtists: (raw: string) => string[];
  selectedSongIds: string[];
  toggleSelectSong: (id: string) => void;
  toggleSelectAllSongs: (items: Track[]) => void;
  deleteSelectedSongs: () => Promise<void> | void;

  createPlaylist: () => Promise<void> | void;
  renamePlaylist: () => Promise<void> | void;
  deletePlaylistById: (playlist: Playlist) => Promise<void> | void;
  addTrackToPlaylist: (playlist: Playlist, track: Track) => Promise<void> | void;

  openImport: () => void;
  importFiles: (files: FileList | File[], note?: string) => Promise<void>;
  autoImport: (files: FileList) => Promise<void>;
  rescanLibrary: () => Promise<void> | void;
  clearLibrary: () => Promise<void> | void;
  fileInput: InputRef;
  folderInput: InputRef;
  fontInput: InputRef;

  fontId: string;
  setFontId: Setter<string>;
  fontOptions: FontChoice[];
  fontBusy: boolean;
  importFont: (file: File) => Promise<void>;
  deleteFont: (font: any) => Promise<void>;

  paletteOpen: boolean;
  setPaletteOpen: Setter<boolean>;
  paletteQuery: string;
  setPaletteQuery: Setter<string>;
  allSearchResults: Track[];
  musicResults: any[];
  musicSearching: boolean;
  albumSearchResults: string[];
  artistSearchResults: string[];
  playlistSearchResults: Playlist[];
  importMenu: boolean;
  setImportMenu: Setter<boolean>;
  modal: 'playlist' | 'rename' | 'add-to-playlist' | 'properties' | null;
  setModal: Setter<'playlist' | 'rename' | 'add-to-playlist' | 'properties' | null>;
  modalValue: string;
  setModalValue: Setter<string>;
  contextTrack: Track | null;
  setContextTrack: Setter<Track | null>;
  expanded: boolean;
  closing: boolean;
  openExpanded: () => void;
  closeExpanded: () => void;
  toast: string;
  notify: (message: string) => void;

  fetchArtistPhoto: (artistName: string) => Promise<string | null>;
  downloadedTracks?: any[];
  downloadSearchTrack?: (track: any) => Promise<void>;
  downloadTrack?: (track: any) => Promise<void>;

  trendingLanguages?: any[];
  activeTrendingLang?: any | null;
  openTrendingLanguage?: (langId: string | null) => void;
  trendingTracks?: any[];
  trendingLoading?: boolean;
  trendingQuery?: string;
  setTrendingQuery?: Setter<string>;

  artistTopTracks?: any[];
  artistTopLoading?: boolean;
  artistViewTab?: 'top100' | 'library';
  setArtistViewTab?: Setter<'top100' | 'library'>;
}
