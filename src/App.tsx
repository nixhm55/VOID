import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, AudioLines, ChevronDown, Clock3, Disc3, Heart, Home,
  ListMusic, ListPlus, Mic2, MoreHorizontal, Music2, Pause, Play, Plus, Search,
  Repeat, Repeat1, Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Trash2, Volume2, VolumeX, X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import {
  type Playlist, type Preferences, type Track, getPlaylists, getPreferences, getTracks,
  removePlaylist, removeTrack, resolveAudioMimeType, savePlaylist, savePreferences, saveTrack, trackFromFile,
} from '@/lib/library';

type Page = 'home' | 'songs' | 'albums' | 'artists' | 'playlists' | 'favorites' | 'recent' | 'queue' | 'settings';
const defaults: Preferences = { theme: 'system', autoplay: false, volume: 0.72, muted: false, shuffle: false, repeat: 'off' };
const greetings = [
  'Still awake?',
  'The night is quiet.',
  'Before the world wakes.',
  'Good morning.',
  'A good morning starts here.',
  'Good to have you here.',
  'Good afternoon.',
  'Settle into the afternoon.',
  'A little room to listen.',
  'Evening, take your time.',
  'Let the day soften.',
  'The evening is yours.',
];
const navItems: { id: Page; label: string; icon: typeof Home; group: 'listen' | 'collection' }[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'listen' },
  { id: 'recent', label: 'Recently played', icon: Clock3, group: 'listen' },
  { id: 'songs', label: 'Songs', icon: Music2, group: 'collection' },
  { id: 'albums', label: 'Albums', icon: Disc3, group: 'collection' },
  { id: 'artists', label: 'Artists', icon: Mic2, group: 'collection' },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, group: 'collection' },
  { id: 'favorites', label: 'Favorites', icon: Heart, group: 'collection' },
  { id: 'queue', label: 'Queue', icon: AudioLines, group: 'collection' },
];
const pathFor = (page: Page) => page === 'home' ? '/' : `/${page}`;
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—:—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};
const compactBytes = (bytes: number) => bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

function Cover({ track, large = false }: { track?: Track; large?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!track?.artwork) { setSrc(null); return; }
    const url = URL.createObjectURL(track.artwork); setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [track?.artwork]);
  return <div className={large ? 'cover-large' : 'cover-mini'} data-testid={large ? 'cover-artwork' : 'cover-thumbnail'}>
    {src ? <img src={src} alt={`${track?.album ?? 'Album'} artwork`} /> : <Disc3 aria-hidden="true" />}
  </div>;
}

function App() {
  const [location, setLocation] = useLocation();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('void-queue') || '[]') as string[]; } catch { return []; }
  });
  const [page, setPage] = useState<Page>('home');
  const [greetingHour, setGreetingHour] = useState(() => new Date().getHours());
  const [query, setQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [modal, setModal] = useState<'playlist' | 'rename' | 'add-to-playlist' | 'properties' | null>(null);
  const [modalValue, setModalValue] = useState('');
  const [contextTrack, setContextTrack] = useState<Track | null>(null);
  const [detail, setDetail] = useState<{ kind: 'album' | 'artist' | 'playlist'; name: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState('');
  const [importing, setImporting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const activeTrack = tracks.find(track => track.id === activeId) ?? null;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3400);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [storedTracks, storedPlaylists, storedPrefs] = await Promise.all([getTracks(), getPlaylists(), getPreferences()]);
      setTracks(storedTracks.sort((a, b) => b.importedAt - a.importedAt));
      setPlaylists(storedPlaylists.sort((a, b) => a.createdAt - b.createdAt));
      if (storedPrefs) {
        setPrefs({ ...defaults, ...storedPrefs });
        try { localStorage.setItem('void-theme', storedPrefs.theme); } catch { /* Theme still applies from IndexedDB. */ }
      }
      setIsReady(true);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Local library storage could not be opened.');
      setIsReady(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const pageFromPath = location === '/' ? 'home' : location.slice(1).split('/')[0] as Page;
    if (['home', 'songs', 'albums', 'artists', 'playlists', 'favorites', 'recent', 'queue', 'settings'].includes(pageFromPath)) setPage(pageFromPath);
  }, [location]);
  useEffect(() => {
    const root = document.documentElement;
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    root.dataset.theme = dark ? 'dark' : 'light';
  }, [prefs.theme]);
  useEffect(() => {
    let timer = 0;
    const refreshGreeting = () => {
      const now = new Date();
      setGreetingHour(now.getHours());
      const nextChange = new Date(now);
      nextChange.setHours(now.getHours() + (now.getHours() % 2 ? 1 : 2), 0, 0, 120);
      timer = window.setTimeout(refreshGreeting, Math.max(1000, nextChange.getTime() - now.getTime()));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        refreshGreeting();
      }
    };
    refreshGreeting();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem('void-queue', JSON.stringify(queue));
  }, [queue]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      if (prefs.theme === 'system') document.documentElement.classList.toggle('dark', media.matches);
    };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [prefs.theme]);
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = prefs.volume;
      audio.current.muted = prefs.muted;
    }
  }, [prefs.volume, prefs.muted]);

  const updatePrefs = useCallback(async (next: Preferences) => {
    setPrefs(next);
    try { localStorage.setItem('void-theme', next.theme); } catch { /* IndexedDB remains the primary preference store. */ }
    try { await savePreferences(next); } catch { notify('Could not save preferences on this device.'); }
  }, [notify]);

  const playTrack = useCallback(async (track: Track, list?: string[]) => {
    if (!audio.current) return;
    if (list) setQueue(list);
    const mimeType = resolveAudioMimeType(track.fileName, track.file.type || track.mimeType);
    const file = track.file.type === mimeType ? track.file : track.file.slice(0, track.file.size, mimeType);
    const playableTrack = { ...track, file, mimeType };
    if (track.file.type !== mimeType || track.mimeType !== mimeType) {
      setTracks(items => items.map(item => item.id === track.id ? playableTrack : item));
    }
    setActiveId(track.id);
    setPosition(0);
    setDuration(track.duration || 0);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    audio.current.src = url;
    audio.current.volume = prefs.volume;
    audio.current.muted = prefs.muted;
    try {
      await audio.current.play();
      setIsPlaying(true);
      const actualDuration = audio.current.duration;
      void saveTrack({
        ...playableTrack,
        duration: Number.isFinite(actualDuration) && actualDuration > 0 ? actualDuration : playableTrack.duration,
        lastPlayedAt: Date.now(),
      }).then(reload).catch(() => undefined);
    } catch {
      setIsPlaying(false);
      notify(`This browser could not play “${track.fileName}”. The codec may not be supported.`);
    }
  }, [notify, prefs.muted, prefs.volume, reload]);

  const togglePlay = useCallback(async () => {
    const el = audio.current;
    if (!el) return;
    if (!activeTrack) {
      const next = tracks.find(item => queue.includes(item.id)) ?? tracks[0];
      if (next) await playTrack(next, queue.length ? queue : tracks.map(item => item.id));
      else notify('Import audio files to begin your library.');
      return;
    }
    if (el.paused) {
      try { await el.play(); setIsPlaying(true); }
      catch { notify(`This browser could not play “${activeTrack.fileName}”. Check its format and try another file.`); }
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [activeTrack, notify, playTrack, queue, tracks]);

  const playRelative = useCallback((direction: number) => {
    if (!tracks.length) return;
    const pool = queue.map(id => tracks.find(track => track.id === id)).filter((track): track is Track => !!track);
    const source = pool.length ? pool : tracks;
    if (!activeId) { void playTrack(source[0], source.map(track => track.id)); return; }
    let index = source.findIndex(track => track.id === activeId);
    if (prefs.shuffle && direction > 0 && source.length > 1) {
      let next = index;
      while (next === index) next = Math.floor(Math.random() * source.length);
      index = next;
    } else index += direction;
    if (index < 0) index = prefs.repeat === 'all' ? source.length - 1 : 0;
    if (index >= source.length) {
      if (prefs.repeat === 'off' && !prefs.autoplay) { setIsPlaying(false); return; }
      index = 0;
    }
    void playTrack(source[index], source.map(track => track.id));
  }, [activeId, playTrack, prefs.autoplay, prefs.repeat, prefs.shuffle, queue, tracks]);

  const importFiles = async (files: FileList | File[]) => {
    const chosen = Array.from(files).filter(file => file.size > 0);
    if (!chosen.length) return;
    setImporting(true);
    let added = 0;
    try {
      for (const file of chosen) {
        try { await saveTrack(await trackFromFile(file)); added += 1; }
        catch (error) {
          const message = error instanceof DOMException && error.name === 'QuotaExceededError'
            ? 'Device storage is full. Remove files or free space, then try again.'
            : `Could not add ${file.name}. Check browser storage permissions.`;
          notify(message);
        }
      }
      await reload();
      if (added) notify(`${added} ${added === 1 ? 'file' : 'files'} added to your library.`);
    } finally { setImporting(false); }
  };

  const toggleFavorite = async (track: Track) => {
    const updated = { ...track, favorite: !track.favorite };
    setTracks(items => items.map(item => item.id === track.id ? updated : item));
    try { await saveTrack(updated); } catch { notify('Could not save favorite.'); }
  };
  const deleteTrack = async (track: Track) => {
    if (!window.confirm(`Remove “${track.title}” from VOID? The original file on your Mac will not be deleted.`)) return;
    try {
      await removeTrack(track.id);
      setTracks(items => items.filter(item => item.id !== track.id));
      setQueue(items => items.filter(id => id !== track.id));
      const changedPlaylists = playlists
        .filter(playlist => playlist.trackIds.includes(track.id))
        .map(playlist => ({ ...playlist, trackIds: playlist.trackIds.filter(id => id !== track.id) }));
      await Promise.all(changedPlaylists.map(savePlaylist));
      setPlaylists(items => items.map(playlist => changedPlaylists.find(updated => updated.id === playlist.id) ?? playlist));
      if (activeId === track.id) {
        audio.current?.pause();
        setActiveId(null); setIsPlaying(false);
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      }
      notify('Audio file removed from this library.');
    } catch { notify('Could not remove this file from local storage.'); }
  };
  const addToQueue = (track: Track) => {
    setQueue(items => items.includes(track.id) ? items : [...items, track.id]);
    notify(`Added “${track.title}” to the queue.`);
  };
  const playNext = (track: Track) => {
    if (activeId === track.id) { notify('That song is already playing.'); return; }
    setQueue(items => {
      const remaining = items.filter(id => id !== track.id);
      const activeIndex = activeId ? remaining.indexOf(activeId) : -1;
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : 0;
      return [...remaining.slice(0, insertAt), track.id, ...remaining.slice(insertAt)];
    });
    notify(`“${track.title}” will play next.`);
  };
  const createPlaylist = async () => {
    const name = modalValue.trim();
    if (!name) return;
    const playlist: Playlist = { id: crypto.randomUUID(), name, description: '', createdAt: Date.now(), trackIds: [] };
    try { await savePlaylist(playlist); await reload(); setModal(null); setModalValue(''); notify('Playlist created.'); }
    catch { notify('Could not save this playlist.'); }
  };
  const renamePlaylist = async () => {
    const target = playlists.find(item => item.name === detail?.name);
    if (!target || !modalValue.trim()) return;
    try {
      await savePlaylist({ ...target, name: modalValue.trim() });
      setDetail({ ...detail!, name: modalValue.trim() }); setModal(null); setModalValue(''); await reload();
    } catch { notify('Could not rename this playlist.'); }
  };
  const deletePlaylistById = async (playlist: Playlist) => {
    if (!window.confirm(`Delete the playlist “${playlist.name}”? Your audio files will stay in your library.`)) return;
    try { await removePlaylist(playlist.id); setDetail(null); await reload(); notify('Playlist deleted.'); }
    catch { notify('Could not delete this playlist.'); }
  };
  const addTrackToPlaylist = async (playlist: Playlist, track: Track) => {
    if (playlist.trackIds.includes(track.id)) { notify('That song is already in this playlist.'); return; }
    try { await savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, track.id] }); await reload(); setModal(null); setContextTrack(null); notify('Added to playlist.'); }
    catch { notify('Could not update this playlist.'); }
  };
  const rescanLibrary = async () => {
    try {
      for (const track of tracks) {
        const file = new File([track.file], track.fileName, { type: track.mimeType });
        const scanned = await trackFromFile(file);
        await saveTrack({
          ...track,
          title: scanned.title,
          artist: scanned.artist,
          album: scanned.album,
          duration: scanned.duration || track.duration,
          artwork: scanned.artwork ?? track.artwork,
        });
      }
      await reload();
      notify('Library scan complete.');
    } catch { notify('Could not finish scanning this library.'); }
  };
  const clearLibrary = async () => {
    if (!window.confirm('Clear the local VOID library and playlists? The original files on your Mac will not be deleted.')) return;
    try {
      await Promise.all([
        ...tracks.map(track => removeTrack(track.id)),
        ...playlists.map(playlist => removePlaylist(playlist.id)),
      ]);
      audio.current?.pause();
      setActiveId(null); setIsPlaying(false); setPosition(0); setDuration(0);
      if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
      setTracks([]); setPlaylists([]); setQueue([]);
      notify('Local library and playlists cleared.');
    } catch { notify('Could not clear the local library.'); }
  };
  const openCollection = (kind: 'album' | 'artist', name: string) => {
    const target: Page = kind === 'album' ? 'albums' : 'artists';
    setDetail({ kind, name });
    setQuery('');
    setPage(target);
    setLocation(pathFor(target));
    setContextTrack(null);
  };

  useEffect(() => {
    const onKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setPaletteOpen(value => !value); setPaletteQuery(''); return;
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false); setModal(null); setContextTrack(null); setExpanded(false); return;
      }
      if (editing || paletteOpen || modal || contextTrack) return;
      if (event.code === 'Space') { event.preventDefault(); void togglePlay(); }
      else if (event.key === 'ArrowRight') { if (audio.current && activeTrack) audio.current.currentTime = Math.min(audio.current.duration || 0, audio.current.currentTime + 5); }
      else if (event.key === 'ArrowLeft') { if (audio.current && activeTrack) audio.current.currentTime = Math.max(0, audio.current.currentTime - 5); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); void updatePrefs({ ...prefs, volume: Math.min(1, prefs.volume + .05), muted: false }); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); void updatePrefs({ ...prefs, volume: Math.max(0, prefs.volume - .05) }); }
      else if (event.key.toLowerCase() === 'm') void updatePrefs({ ...prefs, muted: !prefs.muted });
    };
    window.addEventListener('keydown', onKeys);
    return () => window.removeEventListener('keydown', onKeys);
  }, [activeTrack, contextTrack, modal, paletteOpen, prefs, togglePlay, updatePrefs]);
  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    window.clearTimeout(toastTimer.current);
  }, []);

  const setPageAndRoute = (target: Page) => { setDetail(null); setPage(target); setLocation(pathFor(target)); };
  const filteredTracks = useMemo(() => {
    let list = tracks;
    if (page === 'favorites') list = list.filter(track => track.favorite);
    if (page === 'recent') list = list.filter(track => track.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
    if (detail?.kind === 'album') list = list.filter(track => track.album === detail.name);
    if (detail?.kind === 'artist') list = list.filter(track => track.artist === detail.name);
    if (detail?.kind === 'playlist') {
      const playlist = playlists.find(item => item.name === detail.name);
      list = (playlist?.trackIds ?? []).map(id => tracks.find(track => track.id === id)).filter((track): track is Track => !!track);
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(track => `${track.title} ${track.artist} ${track.album} ${track.fileName}`.toLowerCase().includes(q));
    return list;
  }, [detail, page, playlists, query, tracks]);
  const queueTracks = queue.map(id => tracks.find(track => track.id === id)).filter((track): track is Track => !!track);
  const albumNames = useMemo(() => [...new Set(tracks.map(track => track.album))], [tracks]);
  const artistNames = useMemo(() => [...new Set(tracks.map(track => track.artist))], [tracks]);
  const title = detail?.name ?? ({ home: 'Home', songs: 'Songs', albums: 'Albums', artists: 'Artists', playlists: 'Playlists', favorites: 'Favorites', recent: 'Recently played', queue: 'Queue', settings: 'Settings' } as Record<Page, string>)[page];
  const allSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    if (!q) return [];
    return tracks.filter(track => `${track.title} ${track.artist} ${track.album} ${track.fileName}`.toLowerCase().includes(q)).slice(0, 7);
  }, [paletteQuery, tracks]);
  const albumSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    return q ? albumNames.filter(name => name.toLowerCase().includes(q)).slice(0, 3) : [];
  }, [albumNames, paletteQuery]);
  const artistSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    return q ? artistNames.filter(name => name.toLowerCase().includes(q)).slice(0, 3) : [];
  }, [artistNames, paletteQuery]);
  const playlistSearchResults = useMemo(() => {
    const q = paletteQuery.toLowerCase().trim();
    return q ? playlists.filter(playlist => `${playlist.name} ${playlist.description}`.toLowerCase().includes(q)).slice(0, 3) : [];
  }, [paletteQuery, playlists]);

  const playList = (list: Track[]) => {
    if (list.length) void playTrack(list[0], list.map(track => track.id));
  };
  function TrackRows({ items, showIndex = false, reorder = false }: { items: Track[]; showIndex?: boolean; reorder?: boolean }) {
    return <div className="table-wrap">
      <table className="track-table">
        <thead><tr><th>{showIndex ? ' ' : 'Title'}</th><th>Album</th><th>Date added</th><th>Time</th><th aria-label="Actions" /></tr></thead>
        <tbody>{items.map((track, index) => <tr key={track.id} className={activeId === track.id ? 'current' : ''} data-testid={`row-track-${track.id}`}>
          <td><div className="track-main">
            {showIndex ? <span style={{ width: 16, color: 'hsl(var(--muted-foreground))' }}>{index + 1}</span> : null}
            <Cover track={track} />
            <button className="track-main" style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => void playTrack(track, items.map(item => item.id))} aria-label={`Play ${track.title}`} data-testid={`button-play-${track.id}`}>
              <span><span className="track-title">{track.title}</span><span className="track-sub">{track.artist}</span></span>
            </button>
          </div></td>
          <td><button className="crumb" style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }} onClick={() => { setDetail({ kind: 'album', name: track.album }); setQuery(''); }} data-testid={`link-album-${track.id}`}>{track.album}</button></td>
          <td>{new Date(track.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td>{formatTime(track.duration)}</td>
          <td><div className="row-actions">
            {reorder && <><button className="icon-button" aria-label={`Move ${track.title} up`} onClick={() => moveItem(track, index, -1)} data-testid={`button-order-up-${track.id}`}><ArrowUp /></button><button className="icon-button" aria-label={`Move ${track.title} down`} onClick={() => moveItem(track, index, 1)} data-testid={`button-order-down-${track.id}`}><ArrowDown /></button><button className="icon-button" aria-label={`Remove ${track.title} from ${page === 'queue' ? 'queue' : 'playlist'}`} onClick={() => page === 'queue' ? removeFromQueue(track.id) : void removeFromPlaylist(track.id)} data-testid={`button-remove-from-list-${track.id}`}><X /></button></>}
            <button className="icon-button" aria-label={track.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => void toggleFavorite(track)} data-testid={`button-favorite-${track.id}`}><Heart fill={track.favorite ? 'currentColor' : 'none'} /></button>
            <button className="icon-button" aria-label={`More actions for ${track.title}`} onClick={() => setContextTrack(track)} data-testid={`button-track-menu-${track.id}`}><MoreHorizontal /></button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>;
  }

  const moveQueue = (index: number, step: number) => {
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex >= queueTracks.length) return;
    const ids = queueTracks.map(track => track.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    setQueue(ids);
  };
  const moveItem = (track: Track, index: number, step: number) => {
    if (page === 'queue') { moveQueue(index, step); return; }
    if (detail?.kind !== 'playlist') return;
    const playlist = playlists.find(item => item.name === detail.name);
    if (!playlist) return;
    const ids = [...playlist.trackIds];
    const currentIndex = ids.indexOf(track.id);
    const target = currentIndex + step;
    if (currentIndex < 0 || target < 0 || target >= ids.length) return;
    [ids[currentIndex], ids[target]] = [ids[target], ids[currentIndex]];
    void savePlaylist({ ...playlist, trackIds: ids }).then(reload).catch(() => notify('Could not reorder this playlist.'));
  };
  const clearQueue = () => { setQueue([]); notify('Queue cleared.'); };
  const removeFromQueue = (id: string) => setQueue(ids => ids.filter(item => item !== id));
  const removeFromPlaylist = async (id: string) => {
    if (detail?.kind !== 'playlist') return;
    const playlist = playlists.find(item => item.name === detail.name);
    if (!playlist) return;
    try { await savePlaylist({ ...playlist, trackIds: playlist.trackIds.filter(item => item !== id) }); await reload(); }
    catch { notify('Could not remove this song from the playlist.'); }
  };

  const pageDescription: Record<Page, string> = {
    home: 'Your music, kept on this Mac.', songs: `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} in your local library`,
    albums: `${albumNames.length} ${albumNames.length === 1 ? 'album' : 'albums'} found in your files`,
    artists: `${artistNames.length} ${artistNames.length === 1 ? 'artist' : 'artists'} found in your files`,
    playlists: 'A few things, gathered your way.', favorites: 'The songs you’ve kept close.', recent: 'Your listening, on this device.', queue: `${queueTracks.length} ${queueTracks.length === 1 ? 'song' : 'songs'} lined up next.`, settings: 'A few quiet preferences.',
  };

  return <div className="void-app">
    <audio ref={audio} preload="none" onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
      onLoadedMetadata={() => {
        const value = audio.current?.duration ?? 0; setDuration(value);
        const loadedTrack = tracks.find(item => item.id === activeId);
        if (activeId && loadedTrack) {
          const mimeType = resolveAudioMimeType(loadedTrack.fileName, loadedTrack.file.type || loadedTrack.mimeType);
          const file = loadedTrack.file.type === mimeType
            ? loadedTrack.file
            : loadedTrack.file.slice(0, loadedTrack.file.size, mimeType);
          const updatedTrack = { ...loadedTrack, file, mimeType, duration: value };
          setTracks(items => items.map(item => item.id === activeId ? updatedTrack : item));
          void saveTrack(updatedTrack).then(reload).catch(() => undefined);
        }
      }}
      onEnded={() => {
        if (prefs.repeat === 'one' && audio.current) { audio.current.currentTime = 0; void audio.current.play(); }
        else playRelative(1);
      }}
      onError={() => { if (activeTrack) { setIsPlaying(false); notify(`Unable to decode “${activeTrack.fileName}”. This format may not be supported by your browser.`); } }} />
    <div className="void-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <button className="brand" aria-label="VOID home" onClick={() => setPageAndRoute('home')} data-testid="button-void-home"><span className="eclipse" /><span className="brand-word">VOID</span></button>
        <div className="nav-group"><div className="nav-label">Listen</div>
          {navItems.filter(item => item.group === 'listen').map(item => { const Icon = item.icon; const active = page === item.id && !detail; return <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => setPageAndRoute(item.id)} key={item.id} aria-current={active ? 'page' : undefined} title={item.label} data-testid={`nav-${item.id}`}><Icon /><span>{item.label}</span></button>; })}
        </div>
        <div className="nav-group"><div className="nav-label">Your library</div>
          {navItems.filter(item => item.group === 'collection').map(item => { const Icon = item.icon; const active = page === item.id && !detail; return <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => setPageAndRoute(item.id)} key={item.id} aria-current={active ? 'page' : undefined} title={item.label} data-testid={`nav-${item.id}`}><Icon /><span>{item.label}</span></button>; })}
        </div>
        <div className="sidebar-bottom">
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPageAndRoute('settings')} aria-current={page === 'settings' ? 'page' : undefined} title="Settings" data-testid="nav-settings"><Settings /><span>Settings</span></button>
          <div className="library-note">{tracks.length ? `${tracks.length} local ${tracks.length === 1 ? 'file' : 'files'} · ${compactBytes(tracks.reduce((sum, track) => sum + track.fileSize, 0))} on this device` : 'Your files stay on this device.'}</div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="top-left"><span className="eclipse mobile-eclipse" /><span className="brand-word mobile-brand">VOID</span><span className="crumb">{detail ? title : page === 'home' ? 'A quiet place for your music' : 'Your library'}</span></div>
          <div className="top-actions">
            <button className="search-trigger" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }} aria-label="Search your library" data-testid="button-open-search"><Search size={14} /><span>Search library</span><kbd>⌘ K</kbd></button>
            {page !== 'settings' && <button className="icon-button" aria-label="Settings" title="Settings" onClick={() => setPageAndRoute('settings')} data-testid="button-open-settings"><SlidersHorizontal /></button>}
          </div>
        </header>
        <section className={`content ${page === 'home' && !detail ? 'home-content' : ''}`}>
          {storageError ? <div className="empty-state" role="alert" data-testid="status-storage-error"><strong>Local storage unavailable</strong><p>{storageError} Your browser may be in private mode or storage may be disabled. VOID does not upload your music.</p><button className="button" onClick={() => { setStorageError(''); void reload(); }} data-testid="button-retry-storage">Try again</button></div> : null}
          {!isReady && <div className="empty-state" data-testid="status-library-loading"><strong>Opening your library</strong><p>Looking for audio you’ve saved on this device.</p></div>}
          {page === 'home' && !detail && <>
            <div className="welcome">
              <div><div className="eyebrow">Your listening space</div><h1 className="page-title greeting-title" key={Math.floor(greetingHour / 2)} aria-live="polite">{greetings[Math.floor(greetingHour / 2)]}</h1><p className="welcome-copy">A quiet place for the music already yours.</p></div>
              <button className="button primary" onClick={() => fileInput.current?.click()} disabled={importing} data-testid="button-import-home"><Plus />{importing ? 'Adding files…' : 'Add music'}</button>
            </div>
            <div className="home-grid">
              <div>
                <div className="welcome-panel">
                  <div><div className="eyebrow">Made for your library</div><h2>Your music stays yours.</h2><p>Bring in audio from your Mac. VOID keeps the files in this browser, ready whenever you return.</p><button className="button" onClick={() => fileInput.current?.click()} data-testid="button-choose-files"><Plus />Choose audio files</button></div>
                  <div className="abstract-disc" aria-hidden="true" />
                </div>
                <div className="home-section"><div className="section-heading"><h2>Recently added</h2><button className="crumb" onClick={() => setPageAndRoute('songs')} data-testid="button-view-all-songs">View library</button></div>
                  {tracks.length ? <TrackRows items={tracks.slice(0, 4)} /> : <div className="empty-state"><strong>Your library is waiting.</strong><p>Bring your music into VOID and make this space yours.</p><button className="button" onClick={() => fileInput.current?.click()} data-testid="button-import-empty"><Plus />Add your music</button></div>}
                </div>
              </div>
              <div>
                <div className="section-heading"><h2>Your library</h2><span>On this device</span></div>
                <div className="stat-card"><div className="stat-number">{tracks.length}</div><div className="stat-caption">songs in your collection</div></div>
                <div style={{ height: 9 }} />
                <div className="stat-card"><div className="stat-number">{albumNames.length}</div><div className="stat-caption">albums, from available file names</div></div>
                <div className="home-section"><div className="section-heading"><h2>Recently played</h2><span>{tracks.filter(item => item.lastPlayedAt).length}</span></div>
                  {tracks.some(item => item.lastPlayedAt) ? <div>{tracks.filter(item => item.lastPlayedAt).sort((a,b) => (b.lastPlayedAt ?? 0)-(a.lastPlayedAt ?? 0)).slice(0,3).map(track => <div className="track-main" key={track.id} style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => void playTrack(track)}><Cover track={track} /><span><span className="track-title">{track.title}</span><span className="track-sub">{track.artist}</span></span></div>)}</div> : <p className="page-subtitle" style={{ lineHeight: 1.7 }}>Your listening history will appear here, only on this device.</p>}
                </div>
              </div>
            </div>
          </>}
          {page !== 'home' && page !== 'settings' && <div>
            <div className="eyebrow">{detail ? detail.kind === 'playlist' ? 'Your collection' : 'From your files' : 'Your collection'}</div>
            <div className="section-heading" style={{ alignItems: 'flex-end', marginBottom: 0 }}>
              <div><h1 className="page-title">{title}</h1><p className="page-subtitle">{pageDescription[page]}</p></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {page === 'playlists' && !detail && <button className="button" onClick={() => { setModal('playlist'); setModalValue(''); }} data-testid="button-create-playlist"><Plus />New playlist</button>}
                {page === 'queue' && queueTracks.length > 0 && <button className="button" onClick={clearQueue} data-testid="button-clear-queue"><Trash2 />Clear</button>}
                {(page === 'songs' || page === 'albums' || page === 'artists' || page === 'favorites' || page === 'recent' || page === 'playlists') && <input className="filter-input" aria-label={`Filter ${title}`} placeholder="Filter this view…" value={query} onChange={event => setQuery(event.target.value)} data-testid="input-filter-library" />}
              </div>
            </div>
            {detail?.kind === 'playlist' && <div className="track-toolbar"><button className="button primary" onClick={() => playList(filteredTracks)} disabled={!filteredTracks.length} data-testid="button-play-playlist"><Play />Play playlist</button><div style={{ display: 'flex', gap: 7 }}><button className="button" onClick={() => { setModal('rename'); setModalValue(detail.name); }} data-testid="button-rename-playlist">Rename</button><button className="button" onClick={() => { const playlist = playlists.find(item => item.name === detail.name); if (playlist) void deletePlaylistById(playlist); }} data-testid="button-delete-playlist"><Trash2 /></button></div></div>}
            {detail?.kind === 'album' || detail?.kind === 'artist' ? <div className="detail-hero"><Cover track={filteredTracks[0]} large /><div><div className="eyebrow">{detail.kind}</div><h1>{detail.name}</h1><p>{filteredTracks.length} {filteredTracks.length === 1 ? 'song' : 'songs'} in this collection</p><button className="button primary" style={{ marginTop: 19 }} onClick={() => playList(filteredTracks)} disabled={!filteredTracks.length} data-testid="button-play-collection"><Play />Play</button></div></div> : null}
            {page === 'songs' && <div className="track-toolbar"><span className="crumb">Audio files imported into VOID</span><button className="button" onClick={() => fileInput.current?.click()} data-testid="button-add-songs"><Plus />Add files</button></div>}
            {page === 'queue' ? queueTracks.length ? <div className="track-toolbar"><button className="button primary" onClick={() => playList(queueTracks)} data-testid="button-play-queue"><Play />Play queue</button><span className="crumb">Drag with arrows to change order</span></div> : null : null}
            {page === 'albums' && !detail ? albumNames.length ? <div className="cover-grid">{albumNames.filter(name => !query || name.toLowerCase().includes(query.toLowerCase())).map(name => {
              const representative = tracks.find(track => track.album === name);
              return <button className="cover-card" key={name} onClick={() => { setDetail({ kind: 'album', name }); setQuery(''); }} data-testid={`card-album-${name}`}><Cover track={representative} large /><div className="cover-card-title">{name}</div><div className="cover-card-sub">{representative?.artist} · {tracks.filter(track => track.album === name).length} songs</div></button>;
            })}</div> : <EmptyLibrary label="No albums yet" onImport={() => fileInput.current?.click()} /> : null}
            {page === 'artists' && !detail ? artistNames.length ? <div className="cover-grid">{artistNames.filter(name => !query || name.toLowerCase().includes(query.toLowerCase())).map(name => {
              const representative = tracks.find(track => track.artist === name);
              return <button className="cover-card" key={name} onClick={() => { setDetail({ kind: 'artist', name }); setQuery(''); }} data-testid={`card-artist-${name}`}><Cover track={representative} large /><div className="cover-card-title">{name}</div><div className="cover-card-sub">{tracks.filter(track => track.artist === name).length} songs</div></button>;
            })}</div> : <EmptyLibrary label="No artists yet" onImport={() => fileInput.current?.click()} /> : null}
            {page === 'playlists' && !detail && <div className="playlist-list">
              {playlists.map(playlist => <button className="playlist-tile" key={playlist.id} onClick={() => { setDetail({ kind: 'playlist', name: playlist.name }); setQuery(''); }} data-testid={`card-playlist-${playlist.id}`}><span className="playlist-glyph"><ListMusic /></span><strong>{playlist.name}</strong><span>{playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'song' : 'songs'}</span></button>)}
              {playlists.length === 0 && <div className="empty-state" style={{ gridColumn: '1 / -1' }}><strong>A place for your own collections.</strong><p>Create a playlist, then add songs from their track menu.</p><button className="button" onClick={() => { setModal('playlist'); setModalValue(''); }} data-testid="button-create-first-playlist"><Plus />Create playlist</button></div>}
            </div>}
            {(page === 'songs' || page === 'favorites' || page === 'recent' || page === 'queue' || detail) && (filteredTracks.length ? <TrackRows items={page === 'queue' ? queueTracks : filteredTracks} showIndex={page === 'queue'} reorder={page === 'queue' || detail?.kind === 'playlist'} /> : <EmptyLibrary label={page === 'favorites' ? 'Nothing saved here yet' : page === 'recent' ? 'Your recent listening will live here' : page === 'queue' ? 'Your queue is clear' : detail ? 'No songs in this collection' : 'No songs in your library yet'} onImport={() => fileInput.current?.click()} />)}
            {page === 'queue' && queueTracks.length > 0 && <div style={{ marginTop: 14 }}>{queueTracks.map(track => <span key={track.id} style={{ display: 'none' }}>{track.id}</span>)}</div>}
          </div>}
          {page === 'settings' && <div><div className="eyebrow">Preferences</div><h1 className="page-title">Settings</h1><p className="page-subtitle">Small adjustments for this device.</p>
            <div className="settings-section">
              <div className="section-heading"><h2>Appearance</h2><span>Saved locally</span></div>
              <div className="setting-row"><div><strong>Theme</strong><p>Follow your Mac, or choose a fixed appearance.</p></div><select className="select-control" value={prefs.theme} onChange={event => void updatePrefs({ ...prefs, theme: event.target.value as Preferences['theme'] })} aria-label="Theme" data-testid="select-theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Playback</h2></div>
              <div className="setting-row"><div><strong>Autoplay</strong><p>Continue through the queue when a song ends.</p></div><button className={`switch ${prefs.autoplay ? 'on' : ''}`} role="switch" aria-checked={prefs.autoplay} aria-label="Autoplay" onClick={() => void updatePrefs({ ...prefs, autoplay: !prefs.autoplay })} data-testid="switch-autoplay"><span /></button></div>
              <div className="setting-row"><div><strong>Shuffle</strong><p>Play the queue in a different order.</p></div><button className={`switch ${prefs.shuffle ? 'on' : ''}`} role="switch" aria-checked={prefs.shuffle} aria-label="Shuffle" onClick={() => void updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="switch-shuffle"><span /></button></div>
              <div className="setting-row"><div><strong>Repeat</strong><p>Choose what happens at the end of the queue.</p></div><select className="select-control" value={prefs.repeat} onChange={event => void updatePrefs({ ...prefs, repeat: event.target.value as Preferences['repeat'] })} aria-label="Repeat" data-testid="select-repeat"><option value="off">Off</option><option value="all">Repeat queue</option><option value="one">Repeat song</option></select></div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Your files</h2></div>
              <div className="setting-row"><div><strong>Local library</strong><p>Audio files stay in this browser’s private storage. Clearing site data removes them.</p></div><span className="crumb">{tracks.length} files · {compactBytes(tracks.reduce((sum, track) => sum + track.fileSize, 0))}</span></div>
              <p className="page-subtitle" style={{ marginTop: 17, lineHeight: 1.7 }}>VOID does not upload your audio. Browser storage can be limited, and playback depends on which codecs this browser supports. Imported files are copied into local browser storage so they can be available after refresh.</p>
               <div className="setting-row"><div><strong>Import music</strong><p>Add more audio from your Mac.</p></div><button className="button" onClick={() => fileInput.current?.click()} data-testid="button-settings-import">Choose files</button></div>
               <div className="setting-row"><div><strong>Rescan library</strong><p>Read available file tags and artwork again from stored audio.</p></div><button className="button" onClick={() => void rescanLibrary()} disabled={!tracks.length} data-testid="button-rescan-library">Rescan</button></div>
               <div className="setting-row"><div><strong>Clear library</strong><p>Remove VOID’s local copies and playlists. Original Mac files are untouched.</p></div><button className="button danger" onClick={() => void clearLibrary()} disabled={!tracks.length && !playlists.length} data-testid="button-clear-library">Clear library</button></div>
              <div className="section-heading" style={{ marginTop: 30 }}><h2>Keyboard shortcuts</h2></div>
              {[['Space', 'Play or pause'], ['← / →', 'Seek 5 seconds'], ['↑ / ↓', 'Adjust volume'], ['M', 'Mute or unmute'], ['⌘ K', 'Search library'], ['Esc', 'Close the current panel']].map(([key, label]) => <div className="setting-row" key={key}><strong>{label}</strong><kbd style={{ fontFamily: 'var(--app-font-mono)', fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>{key}</kbd></div>)}
            </div>
          </div>}
        </section>
      </main>
    </div>
    <div className="player-bar" data-testid="player-bar">
      <div className="progress-row"><input aria-label="Playback position" type="range" min="0" max={duration || 0} step=".1" value={Math.min(position, duration || 0)} onChange={event => { const next = Number(event.target.value); if (audio.current) audio.current.currentTime = next; setPosition(next); }} data-testid="input-seek" /></div>
      <div className="player-track" onClick={() => activeTrack && setExpanded(true)} onKeyDown={event => { if (activeTrack && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setExpanded(true); } }} role={activeTrack ? 'button' : undefined} tabIndex={activeTrack ? 0 : undefined} aria-label={activeTrack ? 'Open now playing' : undefined} data-testid="player-current-track">
        <Cover track={activeTrack ?? undefined} />
        <span style={{ minWidth: 0 }}><span className="track-title">{activeTrack?.title ?? 'Nothing playing'}</span><span className="track-sub">{activeTrack?.artist ?? 'Your music will be here'}</span></span>
      </div>
      <div className="player-controls">
        <button className={`icon-button ${prefs.shuffle ? 'active-control' : ''}`} aria-label="Shuffle" title="Shuffle" aria-pressed={prefs.shuffle} onClick={() => void updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="button-shuffle"><Shuffle /></button>
        <button className="icon-button" aria-label="Previous track" title="Previous track" onClick={() => playRelative(-1)} data-testid="button-previous"><SkipBack /></button>
        <button className="icon-button play-button" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={() => void togglePlay()} data-testid="button-play-pause">{isPlaying ? <Pause /> : <Play />}</button>
        <button className="icon-button" aria-label="Next track" title="Next track" onClick={() => playRelative(1)} data-testid="button-next"><SkipForward /></button>
        <button className={`icon-button ${prefs.repeat !== 'off' ? 'active-control' : ''}`} aria-label={`Repeat ${prefs.repeat}`} title={`Repeat ${prefs.repeat}`} aria-pressed={prefs.repeat !== 'off'} onClick={() => void updatePrefs({ ...prefs, repeat: prefs.repeat === 'off' ? 'all' : prefs.repeat === 'all' ? 'one' : 'off' })} data-testid="button-repeat">{prefs.repeat === 'one' ? <Repeat1 /> : <Repeat />}</button>
      </div>
      <div className="player-extra">
        <span className="crumb">{formatTime(position)} / {formatTime(duration)}</span>
        <button className="icon-button" aria-label={prefs.muted ? 'Unmute' : 'Mute'} title={prefs.muted ? 'Unmute' : 'Mute'} onClick={() => void updatePrefs({ ...prefs, muted: !prefs.muted })} data-testid="button-mute">{prefs.muted ? <VolumeX /> : <Volume2 />}</button>
        <input className="volume-slider" type="range" min="0" max="1" step=".01" value={prefs.volume} aria-label="Volume" onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.volume = value; void updatePrefs({ ...prefs, volume: value, muted: false }); }} data-testid="input-volume" />
        <button className="icon-button" aria-label="Expand now playing" onClick={() => setExpanded(true)} data-testid="button-expand-player"><ChevronDown style={{ transform: 'rotate(180deg)' }} /></button>
      </div>
    </div>
    <input ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.aiff,.aif,.alac" multiple hidden onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} data-testid="input-import-files" />
    {paletteOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}><div className="palette" role="dialog" aria-modal="true" aria-label="Search your library"><input autoFocus className="palette-input" placeholder="Search your music…" value={paletteQuery} onChange={event => setPaletteQuery(event.target.value)} onKeyDown={event => {
      if (event.key !== 'Enter') return;
      if (allSearchResults[0]) { void playTrack(allSearchResults[0]); setPaletteOpen(false); }
      else if (albumSearchResults[0]) { setPaletteOpen(false); openCollection('album', albumSearchResults[0]); }
      else if (artistSearchResults[0]) { setPaletteOpen(false); openCollection('artist', artistSearchResults[0]); }
      else if (playlistSearchResults[0]) { const playlist = playlistSearchResults[0]; setPaletteOpen(false); setPage('playlists'); setLocation('/playlists'); setDetail({ kind: 'playlist', name: playlist.name }); }
    }} data-testid="input-search-palette" /><div className="palette-results">
       {allSearchResults.map(track => <button key={track.id} className="palette-result" onClick={() => { void playTrack(track); setPaletteOpen(false); }} data-testid={`search-result-${track.id}`}><Cover track={track} /><span><span className="track-title">{track.title}</span><span className="track-sub">{track.artist} · {track.album}</span></span><Play size={13} /></button>)}
       {albumSearchResults.map(name => <button key={`album-${name}`} className="palette-result" onClick={() => { setPaletteOpen(false); openCollection('album', name); }} data-testid={`search-album-${name}`}><Disc3 size={16} /><span>{name}</span><span className="crumb" style={{ marginLeft: 'auto' }}>Album</span></button>)}
       {artistSearchResults.map(name => <button key={`artist-${name}`} className="palette-result" onClick={() => { setPaletteOpen(false); openCollection('artist', name); }} data-testid={`search-artist-${name}`}><Mic2 size={16} /><span>{name}</span><span className="crumb" style={{ marginLeft: 'auto' }}>Artist</span></button>)}
       {playlistSearchResults.map(playlist => <button key={playlist.id} className="palette-result" onClick={() => { setPaletteOpen(false); setPage('playlists'); setLocation('/playlists'); setDetail({ kind: 'playlist', name: playlist.name }); setQuery(''); }} data-testid={`search-playlist-${playlist.id}`}><ListMusic size={16} /><span>{playlist.name}</span><span className="crumb" style={{ marginLeft: 'auto' }}>Playlist</span></button>)}
       {paletteQuery && !allSearchResults.length && !albumSearchResults.length && !artistSearchResults.length && !playlistSearchResults.length && <div className="empty-state" style={{ margin: 8, padding: 20 }}><strong>No match in your library</strong><p>Search only checks files you’ve added here.</p></div>}
      {!paletteQuery && <div className="crumb" style={{ padding: '14px 12px' }}>Search your local songs by title, artist, album, or file name.</div>}
      </div></div></div>}
    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
       <h2 id="modal-title">{modal === 'playlist' ? 'New playlist' : modal === 'rename' ? 'Rename playlist' : modal === 'properties' ? 'Track details' : 'Add to playlist'}</h2>
       {modal === 'add-to-playlist' ? <>
        <p>Choose where “{contextTrack?.title}” belongs.</p>
        {playlists.length ? playlists.map(playlist => <button className="palette-result" key={playlist.id} onClick={() => contextTrack && void addTrackToPlaylist(playlist, contextTrack)} data-testid={`button-add-to-${playlist.id}`}><ListMusic size={15} />{playlist.name}<span className="crumb" style={{ marginLeft: 'auto' }}>{playlist.trackIds.length} songs</span></button>) : <p>Create a playlist first, then add songs from their menus.</p>}
        <div className="modal-actions"><button className="button" onClick={() => setModal(null)} data-testid="button-cancel-add-playlist">Close</button></div>
       </> : modal === 'properties' && contextTrack ? <>
         <p>File information stored with your local library.</p>
         <dl className="properties-list">
           <dt>File</dt><dd>{contextTrack.fileName}</dd>
           <dt>Title</dt><dd>{contextTrack.title}</dd>
           <dt>Artist</dt><dd>{contextTrack.artist}</dd>
           <dt>Album</dt><dd>{contextTrack.album}</dd>
           <dt>Duration</dt><dd>{formatTime(contextTrack.duration)}</dd>
           <dt>Format</dt><dd>{contextTrack.mimeType || 'Unknown'}</dd>
           <dt>Size</dt><dd>{compactBytes(contextTrack.fileSize)}</dd>
           <dt>Added</dt><dd>{new Date(contextTrack.importedAt).toLocaleString()}</dd>
         </dl>
         <div className="modal-actions"><button className="button" onClick={() => { setModal(null); setContextTrack(null); }} data-testid="button-close-properties">Close</button></div>
      </> : <>
        <p>{modal === 'playlist' ? 'A small collection, stored with your local library.' : 'Give this collection a new name.'}</p>
        <input autoFocus className="modal-input" value={modalValue} maxLength={70} placeholder="Playlist name" onChange={event => setModalValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') modal === 'playlist' ? void createPlaylist() : void renamePlaylist(); }} data-testid="input-playlist-name" />
        <div className="modal-actions"><button className="button" onClick={() => setModal(null)} data-testid="button-cancel-playlist">Cancel</button><button className="button primary" disabled={!modalValue.trim()} onClick={() => modal === 'playlist' ? void createPlaylist() : void renamePlaylist()} data-testid="button-save-playlist">{modal === 'playlist' ? 'Create playlist' : 'Save name'}</button></div>
      </>}
    </div></div>}
    {contextTrack && modal !== 'add-to-playlist' && modal !== 'properties' && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setContextTrack(null); }}><div className="modal" role="dialog" aria-modal="true" aria-label={`Actions for ${contextTrack.title}`}>
      <h2>{contextTrack.title}</h2><p>{contextTrack.artist} · {contextTrack.fileName}</p>
      <button className="palette-result" onClick={() => { void playTrack(contextTrack); setContextTrack(null); }} data-testid="context-play"><Play size={15} />Play now</button>
      <button className="palette-result" onClick={() => { addToQueue(contextTrack); setContextTrack(null); }} data-testid="context-add-queue"><ListPlus size={15} />Add to queue</button>
       <button className="palette-result" onClick={() => { playNext(contextTrack); setContextTrack(null); }} data-testid="context-play-next"><SkipForward size={15} />Play next</button>
      <button className="palette-result" onClick={() => { setModal('add-to-playlist'); }} data-testid="context-add-playlist"><ListMusic size={15} />Add to playlist</button>
      <button className="palette-result" onClick={() => { void toggleFavorite(contextTrack); setContextTrack(null); }} data-testid="context-favorite"><Heart size={15} />{contextTrack.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
       <button className="palette-result" onClick={() => openCollection('artist', contextTrack.artist)} data-testid="context-go-artist"><Mic2 size={15} />Go to artist</button>
       <button className="palette-result" onClick={() => openCollection('album', contextTrack.album)} data-testid="context-go-album"><Disc3 size={15} />Go to album</button>
       <button className="palette-result" onClick={() => setModal('properties')} data-testid="context-properties"><SlidersHorizontal size={15} />Properties</button>
      <button className="palette-result" onClick={() => { void deleteTrack(contextTrack); setContextTrack(null); }} data-testid="context-remove"><Trash2 size={15} />Remove from VOID</button>
      <div className="modal-actions"><button className="button" onClick={() => setContextTrack(null)} data-testid="button-close-track-menu">Close</button></div>
    </div></div>}
    {expanded && <div className="now-playing-overlay" data-testid="now-playing-expanded">
      <div className="now-playing-top"><span className="brand"><span className="eclipse" /><span className="brand-word">VOID</span></span><button className="icon-button" aria-label="Close now playing" onClick={() => setExpanded(false)} data-testid="button-close-expanded"><X /></button></div>
       {activeTrack ? <div className="now-playing-body">
        <Cover track={activeTrack} large />
        <div className="now-playing-meta"><div className="eyebrow">Now playing</div><h1>{activeTrack.title}</h1><p>{activeTrack.artist} · {activeTrack.album}</p>
          <div className="lyrics-box">{activeTrack.lyrics || 'Lyrics unavailable'}</div>
           <div className="expanded-progress"><input type="range" min="0" max={duration || 0} step=".1" value={Math.min(position, duration || 0)} aria-label="Now playing position" onChange={event => { const next = Number(event.target.value); if (audio.current) audio.current.currentTime = next; setPosition(next); }} data-testid="expanded-seek" /><div><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div></div>
            <div className="player-controls" style={{ justifyContent: 'flex-start', marginTop: 15 }}><button className="icon-button" onClick={() => playRelative(-1)} aria-label="Previous track" title="Previous track" data-testid="expanded-previous"><SkipBack /></button><button className="icon-button play-button" onClick={() => void togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} data-testid="expanded-play">{isPlaying ? <Pause /> : <Play />}</button><button className="icon-button" onClick={() => playRelative(1)} aria-label="Next track" title="Next track" data-testid="expanded-next"><SkipForward /></button><button className="icon-button" onClick={() => void toggleFavorite(activeTrack)} aria-label={activeTrack.favorite ? 'Remove favorite' : 'Add favorite'} title={activeTrack.favorite ? 'Remove favorite' : 'Add favorite'} data-testid="expanded-favorite"><Heart fill={activeTrack.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button" onClick={() => { setExpanded(false); setPageAndRoute('queue'); }} aria-label="Open queue" title="Open queue" data-testid="expanded-queue"><ListMusic /></button></div>
            <div className="expanded-toggles">
              <button className={`button ${prefs.shuffle ? 'selected' : ''}`} aria-pressed={prefs.shuffle} onClick={() => void updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="expanded-shuffle"><Shuffle />Shuffle</button>
              <button className={`button ${prefs.repeat !== 'off' ? 'selected' : ''}`} aria-pressed={prefs.repeat !== 'off'} onClick={() => void updatePrefs({ ...prefs, repeat: prefs.repeat === 'off' ? 'all' : prefs.repeat === 'all' ? 'one' : 'off' })} data-testid="expanded-repeat">{prefs.repeat === 'one' ? <Repeat1 /> : <Repeat />}Repeat{prefs.repeat === 'one' ? ' one' : prefs.repeat === 'all' ? ' queue' : ''}</button>
            </div>
           <label className="expanded-volume"><Volume2 size={15} /><input type="range" min="0" max="1" step=".01" value={prefs.volume} aria-label="Now playing volume" onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.volume = value; void updatePrefs({ ...prefs, volume: value, muted: false }); }} data-testid="expanded-volume" /></label>
        </div>
      </div> : <div className="empty-state" style={{ width: 'min(500px,90%)', margin: 'auto' }}><strong>Nothing playing just yet.</strong><p>Choose a song from your local library.</p><button className="button" onClick={() => { setExpanded(false); setPageAndRoute('songs'); }} data-testid="button-browse-library">Browse library</button></div>}
    </div>}
    {toast && <div className="toast-stack" aria-live="polite"><div className="toast-item" data-testid="status-toast">{toast}</div></div>}
  </div>;
}

function EmptyLibrary({ label, onImport }: { label: string; onImport: () => void }) {
  return <div className="empty-state" data-testid="empty-library"><strong>{label}</strong><p>VOID only shows audio you’ve added. No catalog, recommendations, or placeholder tracks.</p><button className="button" onClick={onImport} data-testid="button-empty-add-files"><Plus />Add audio files</button></div>;
}

export default App;
