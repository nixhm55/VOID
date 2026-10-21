import './paperGlass.css';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AudioLines, BookOpen, ChevronUp, Clock3, Disc3, Download, Heart, Home, ListMusic, Mic2, Music2, PanelLeftClose, PanelLeftOpen, Play, Plus,
  Repeat, Repeat1, Search, Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Trash2, TrendingUp, Check, X,
} from 'lucide-react';

import { DESIGN_OPTIONS, type DesignId, type Page, type VoidCore } from '../core/voidCore';
import { Reveal, useScrollVar } from './motion';
import {
  HandCircle, PgArtistPhoto, PgCover, PgEmpty, PgPlayIcon, PgTrackList, PgVolume,
  countLabel, fmt, fmtElapsed, formatBytes, rangeStyle,
} from './parts';
import { PgOverlays, PgNowPlaying } from './Overlays';
import { QualityBadge } from '../components/QualityBadge';
import { formatProviderLabel, getTrackQualityBadge } from '../api/quality';
import { areSameOrDuplicateArtist } from '../api/artistCatalogApi';

const NAV: { id: Page; label: string; icon: typeof Home; group: 'listen' | 'library'; compact: boolean }[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'listen', compact: true },
  { id: 'trending', label: 'Trending', icon: TrendingUp, group: 'listen', compact: true },
  { id: 'recent', label: 'Recently played', icon: Clock3, group: 'listen', compact: true },
  { id: 'songs', label: 'Songs', icon: Music2, group: 'library', compact: true },
  { id: 'albums', label: 'Albums', icon: Disc3, group: 'library', compact: false },
  { id: 'artists', label: 'Artists', icon: Mic2, group: 'library', compact: false },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, group: 'library', compact: true },
  { id: 'favorites', label: 'Favorites', icon: Heart, group: 'library', compact: true },
  { id: 'queue', label: 'Queue', icon: AudioLines, group: 'library', compact: false },
];
const MOBILE_NAV: { id: Page | 'library'; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'songs', icon: Music2, label: 'Songs' },
  { id: 'trending', icon: TrendingUp, label: 'Trending' },
  { id: 'library', icon: BookOpen, label: 'Library' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];
const FONT_PREVIEW = 'A quiet place for your music';

export default function PaperGlassApp({ core: c }: { core: VoidCore }) {
  const { tracks, playlists, page, detail, prefs, activeTrack, isPlaying } = c;
  const mainRef = useRef<HTMLDivElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const homeRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const discFrame = useRef(0);
  const [fontPanelOpen, setFontPanelOpen] = useState(false);
  const isHome = page === 'home' && !detail;

  useScrollVar(mainRef, homeRef, [isHome, c.isReady]);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [page, detail?.kind, detail?.name]);
  useEffect(() => () => window.cancelAnimationFrame(discFrame.current), []);

  const pgBackRef = useRef({ libraryOpen, fontPanelOpen });
  pgBackRef.current = { libraryOpen, fontPanelOpen };
  useEffect(() => {
    if (!libraryOpen && !fontPanelOpen) return;
    const currentPath = window.location.pathname + window.location.search;
    window.history.pushState({ ...(window.history.state || {}), voidBackGuard: true }, '', currentPath);
  }, [libraryOpen, fontPanelOpen]);
  useEffect(() => {
    const onPgPop = (event: PopStateEvent) => {
      if (c.modal || c.contextTrack || c.importMenu || c.paletteOpen || c.expanded) return;
      if (pgBackRef.current.fontPanelOpen) {
        event.stopImmediatePropagation();
        setFontPanelOpen(false);
        return;
      }
      if (pgBackRef.current.libraryOpen && !c.detail) {
        event.stopImmediatePropagation();
        setLibraryOpen(false);
      }
    };
    window.addEventListener('popstate', onPgPop, true);
    return () => window.removeEventListener('popstate', onPgPop, true);
  }, [c.contextTrack, c.detail, c.expanded, c.importMenu, c.modal, c.paletteOpen]);

  const moveDisc = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = discRef.current;
    if (!el || event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)));
    window.cancelAnimationFrame(discFrame.current);
    discFrame.current = window.requestAnimationFrame(() => { el.style.setProperty('--pg-ox', x.toFixed(3)); el.style.setProperty('--pg-oy', y.toFixed(3)); });
  };
  const resetDisc = () => {
    const el = discRef.current;
    if (!el) return;
    window.cancelAnimationFrame(discFrame.current);
    el.style.setProperty('--pg-ox', '0'); el.style.setProperty('--pg-oy', '0');
  };

  const a = c.atmos;
  const ambient = a ? ({ '--h1': a[0], '--h2': a[1], '--h3': a[2], '--s': `${a[3]}%` } as CSSProperties) : undefined;
  const totalBytes = tracks.reduce((sum, t) => sum + (Number.isFinite(t.fileSize) ? t.fileSize : 0), 0);
  const words = c.greeting.split(' ');
  const lastWord = words.pop() ?? '';
  const sleeveTrack = activeTrack ?? tracks[0];
  const filterMatch = (name: string) => !c.query || name.toLowerCase().includes(c.query.toLowerCase());
  const artistTracks = (name: string) => tracks.filter(t => c.splitArtists(t.artist || '').some(x => areSameOrDuplicateArtist(x, name)));
  const openPlaylist = (name: string) => { c.setDetail({ kind: 'playlist', name }); c.setQuery(''); };
  
  const [artistTopExpanded, setArtistTopExpanded] = useState(false);
  useEffect(() => {
    setArtistTopExpanded(false);
  }, [page, detail?.kind, detail?.name, libraryOpen]);

  const artistTopTracks = (c.artistTopTracks ?? []).slice(0, 15);
  const artistViewTab = c.artistViewTab ?? 'top100';
  const visibleArtistTopTracks = artistTopExpanded ? artistTopTracks : artistTopTracks.slice(0, 5);
  const listItems =
    detail?.kind === 'artist' && artistViewTab === 'top100'
      ? visibleArtistTopTracks
      : page === 'queue'
        ? c.queueTracks
        : ((page as string) === 'downloads' && (c as any).downloadedTracks ? (c as any).downloadedTracks : c.filteredTracks);
  
  const listProps = {
    activeId: c.activeId, isPlaying, page, actions: c.rowActions,
    selectedIds: detail?.kind === 'artist' ? [] : c.selectedSongIds,
    toggleSelect: detail?.kind === 'artist' ? undefined : c.toggleSelectSong,
    toggleSelectAll: detail?.kind === 'artist' ? undefined : () => c.toggleSelectAllSongs(listItems),
    isAllSelected: detail?.kind === 'artist' ? false : (listItems.length > 0 && c.selectedSongIds.length === listItems.length),
  };

  const navButton = (item: (typeof NAV)[number]) => {
    const Icon = item.icon;
    const active = page === item.id && !detail;
    return (
      <button key={item.id} className={`pg-nav-item${active ? ' is-active' : ''}`} onClick={() => c.setPageAndRoute(item.id)} aria-current={active ? 'page' : undefined}
        title={item.label} data-collapsed-hidden={!item.compact && !active} data-testid={`nav-${item.id}`}>
        <Icon /><span>{item.label}</span>
      </button>
    );
  };

  /* ───────────────────────── pages ───────────────────────── */
  const home = (
    <div className="pg-page pg-home" key="home" ref={homeRef}>
      <section className="pg-hero">
        <h1 className="pg-display" key={c.greeting} aria-live="polite">
          {words.join(' ')}{words.length ? ' ' : ''}<span className="pg-mark">{lastWord}<HandCircle /></span>
        </h1>
        <div className="pg-hero-foot">
          <div>
            <p className="pg-lede">A quiet place for the music already yours.</p>
            {tracks.length ? <p className="pg-meta">{countLabel(c.albumNames.length, 'album')} · {countLabel(tracks.length, 'song')}</p> : null}
          </div>
        </div>
      </section>

      <Reveal as="section" dir="depth" className="pg-mood" aria-label={c.moodLabel}>
        <div className="pg-disc-stage" ref={discRef} onPointerMove={moveDisc} onPointerLeave={resetDisc} aria-hidden="true" data-testid="mood-orb">
          <div className="pg-sleeve"><PgCover track={sleeveTrack} fill /></div>
          <div className="pg-disc" data-playing={isPlaying ? '' : undefined}>
            <div className="pg-disc-body">
              <div className="pg-disc-label">{activeTrack ? <PgCover track={activeTrack} fill /> : <span className="pg-disc-blank" />}</div>
            </div>
            <i className="pg-disc-light" />
            <i className="pg-disc-hole" />
          </div>
        </div>
        <div className="pg-mood-copy">
          <div className="pg-mood-label">{c.moodLabel}</div>
          <h2>{c.moodLine}</h2>
          <button className="pg-btn pg-btn--glass" onClick={c.playSomething} disabled={!tracks.length} data-testid="button-play-something"><Play />Play something for me</button>
        </div>
      </Reveal>

      {tracks.length ? <>
        <section className="pg-section">
          <Reveal dir="left" className="pg-section-head"><h2>{c.hasPlayed ? 'Jump back in' : 'Start listening'}</h2></Reveal>
          <div className="pg-tiles">
            {c.jumpBack.map((track, i) => (
              <Reveal key={track.id} dir="right" index={i}>
                <button className="pg-tile" onClick={() => void c.playTrack(track)} aria-label={`Play ${track.title}`} data-testid={`tile-jump-${track.id}`}>
                  <PgCover track={track} fill />
                  <span className="pg-tile-title">{track.title}</span>
                  <span className="pg-tile-sub">{track.artist}</span>
                </button>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="pg-section">
          <Reveal dir="left" className="pg-section-head">
            <h2>Recently added</h2>
            <button className="pg-link" onClick={() => c.setPageAndRoute('songs')} data-testid="button-view-all-songs">View library</button>
          </Reveal>
          <PgTrackList items={c.recentlyAdded} {...listProps} selectedIds={[]} />
        </section>
      </> : c.isReady && !c.storageError ? (
        <div className="pg-empty">
          <strong>Your library is waiting.</strong>
          <p>Bring your music into VOID and make this space yours.</p>
          <button className="pg-btn pg-btn--ink" onClick={c.openImport} data-testid="button-import-empty"><Plus />Import music</button>
          <span className="pg-formats">MP3 · M4A · FLAC · WAV</span>
        </div>
      ) : null}
    </div>
  );

  const emptyLabel = page === 'favorites' ? 'Nothing saved here yet' : page === 'recent' ? 'Your recent listening will live here'
    : page === 'queue' ? 'Your queue is clear' : (page as string) === 'downloads' ? 'No downloaded songs yet' : detail ? 'No songs in this collection' : 'No songs in your library yet';

  const library = (
    <div className={`pg-page${detail?.kind === 'artist' ? ' dg-page--artist-view' : ''}`} key={`${page}:${detail?.kind ?? ''}:${detail?.name ?? ''}`}>
      {detail?.kind !== 'artist' && page !== 'favorites' && (
        <header className="pg-head">
          <div>
            <div className="pg-eyebrow">{detail ? (detail.kind === 'playlist' ? 'Your collection' : 'From your files') : 'Your collection'}</div>
            <h1 className="pg-title">{c.title}</h1>
            <p className="pg-sub">{c.pageDescription[page]}</p>
          </div>
          <div className="pg-head-actions">
            {page === 'playlists' && !detail && <button className="pg-btn" onClick={() => { c.setModal('playlist'); c.setModalValue(''); }} data-testid="button-create-playlist"><Plus />New playlist</button>}
            {page === 'queue' && c.queueTracks.length > 0 && <button className="pg-btn" onClick={c.clearQueue} data-testid="button-clear-queue"><Trash2 />Clear</button>}
            {['songs', 'albums', 'artists', 'recent', 'playlists'].includes(page) &&
              <input className="pg-input pg-filter" aria-label={`Filter ${c.title}`} placeholder="Filter this view…" value={c.query} onChange={e => c.setQuery(e.target.value)} data-testid="input-filter-library" />}
          </div>
        </header>
      )}

      {page === 'favorites' && !detail && (
        <section className="cinematic-hero-banner favorites-hero-banner" data-testid="favorites-hero-banner">
          <div className="cinematic-hero-backdrop" aria-hidden="true">
            {c.filteredTracks[0] ? (
              <div className="cinematic-hero-bg-img"><PgCover track={c.filteredTracks[0]} fill /></div>
            ) : null}
            <div className="cinematic-hero-gradient" />
          </div>
          <div className="cinematic-hero-topbar">
            <button className="cinematic-back-btn cinematic-back-btn--chevron" onClick={() => c.setPageAndRoute('home')} aria-label="Back to home" title="Back to home" data-testid="button-back-home">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
          <div className="cinematic-hero-body">
            <div className="cinematic-hero-portrait favorites-hero-portrait">
              {c.filteredTracks[0] ? <PgCover track={c.filteredTracks[0]} fill /> : <Heart size={44} />}
            </div>
            <div className="cinematic-hero-copy">
              <h1 className="cinematic-artist-title">Favorites</h1>
              <div className="artist-verified-row">
                <span className="verified-artist-badge" title="Verified Collection" aria-label="Verified Collection">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="verified-artist-icon">
                    <path
                      d="M12 2.25L14.62 4.39L17.96 3.96L19.06 7.16L22.25 8.26L21.82 11.6L23.96 14.22L21.82 16.84L22.25 20.18L19.06 21.28L17.96 24.48L14.62 24.05L12 26.19L9.38 24.05L6.04 24.48L4.94 21.28L1.75 20.18L2.18 16.84L0.04 14.22L2.18 11.6L1.75 8.26L4.94 7.16L6.04 3.96L9.38 4.39L12 2.25Z"
                      transform="scale(0.84) translate(2.2, 0.8)"
                      fill="currentColor"
                    />
                    <path
                      d="M8.6 12.4L10.85 14.65L15.6 9.75"
                      stroke="#06080c"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="artist-verified-label">Verified Collection</span>
              </div>
              <p className="cinematic-hero-subtitle artist-hero-subtitle">
                {c.filteredTracks.length > 0
                  ? `${c.filteredTracks.length} ${c.filteredTracks.length === 1 ? 'Top song' : 'Top songs'} saved in your favorites`
                  : 'Songs you mark with a heart stay right here'}
              </p>
            </div>
          </div>
        </section>
      )}

      {detail?.kind === 'playlist' && (
        <div className="pg-toolbar">
          <button className="pg-btn pg-btn--ink" onClick={() => c.playList(c.filteredTracks)} disabled={!c.filteredTracks.length} data-testid="button-play-playlist"><Play />Play playlist</button>
          <div className="pg-toolbar-end">
            <button className="pg-btn" onClick={() => { c.setModal('rename'); c.setModalValue(detail.name); }} data-testid="button-rename-playlist">Rename</button>
            <button className="pg-btn" aria-label="Delete playlist" onClick={() => { const p = playlists.find(item => item.name === detail.name); if (p) void c.deletePlaylistById(p); }} data-testid="button-delete-playlist"><Trash2 /></button>
          </div>
        </div>
      )}

      {detail?.kind === 'album' && (
        <Reveal as="section" dir="depth" className="pg-detail-hero">
          <PgCover track={c.filteredTracks[0]} fill />
          <div>
            <div className="pg-eyebrow">{detail.kind}</div>
            <h1>{detail.name}</h1>
            <p>{countLabel(c.filteredTracks.length, 'song')} in this collection</p>
            <button className="pg-btn pg-btn--ink" onClick={() => c.playList(c.filteredTracks)} disabled={!c.filteredTracks.length} data-testid="button-play-collection"><Play />Play</button>
          </div>
        </Reveal>
      )}
      {detail?.kind === 'artist' && (() => {
        const availableTopCount = artistTopTracks.length;
        return (
          <>
            <section className="cinematic-hero-banner artist-hero-banner" data-testid="artist-hero-banner">
              <div className="cinematic-hero-backdrop" aria-hidden="true">
                <div className="cinematic-hero-bg-img cinematic-hero-bg-fallback">
                  <PgArtistPhoto name={detail.name} fetchPhoto={c.fetchArtistPhoto} />
                </div>
                <div className="cinematic-hero-gradient" />
              </div>
              <div className="cinematic-hero-topbar">
                <button className="cinematic-back-btn cinematic-back-btn--chevron" onClick={() => { c.setDetail(null); c.setQuery(''); }} aria-label="Back to artists" title="Back to artists" data-testid="button-back-artists">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              </div>
              <div className="cinematic-hero-body">
                <div className="cinematic-hero-portrait artist-hero-portrait">
                  <PgArtistPhoto name={detail.name} fetchPhoto={c.fetchArtistPhoto} />
                </div>
                <div className="cinematic-hero-copy">
                  <h1 className="cinematic-artist-title">{detail.name}</h1>
                  <div className="artist-verified-row">
                    <span className="verified-artist-badge" title="Verified Artist" aria-label="Verified Artist">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="verified-artist-icon">
                        <path
                          d="M12 2.25L14.62 4.39L17.96 3.96L19.06 7.16L22.25 8.26L21.82 11.6L23.96 14.22L21.82 16.84L22.25 20.18L19.06 21.28L17.96 24.48L14.62 24.05L12 26.19L9.38 24.05L6.04 24.48L4.94 21.28L1.75 20.18L2.18 16.84L0.04 14.22L2.18 11.6L1.75 8.26L4.94 7.16L6.04 3.96L9.38 4.39L12 2.25Z"
                          transform="scale(0.84) translate(2.2, 0.8)"
                          fill="currentColor"
                        />
                        <path
                          d="M8.6 12.4L10.85 14.65L15.6 9.75"
                          stroke="#06080c"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="artist-verified-label">Verified Artist</span>
                  </div>
                  <p className="cinematic-hero-subtitle artist-hero-subtitle">
                    {artistViewTab === 'top100'
                      ? (c.artistTopLoading
                          ? `Loading ${detail.name}’s top songs…`
                          : availableTopCount > 0
                            ? `${availableTopCount} ${availableTopCount === 1 ? 'Top song' : 'Top songs'} ranked by global popularity`
                            : `${countLabel(c.filteredTracks.length, 'song')} in your library`)
                      : `${countLabel(c.filteredTracks.length, 'song')} in your library`}
                  </p>
                </div>
              </div>
            </section>
            <div className="artist-view-tabs" role="tablist" aria-label="Artist songs view">
              <button type="button" role="tab" aria-selected={artistViewTab === 'top100'} className={`artist-view-tab ${artistViewTab === 'top100' ? 'active' : ''}`} onClick={() => c.setArtistViewTab?.('top100')}>
                Top
              </button>
              <button type="button" role="tab" aria-selected={artistViewTab === 'library'} className={`artist-view-tab ${artistViewTab === 'library' ? 'active' : ''}`} onClick={() => c.setArtistViewTab?.('library')}>
                Library
              </button>
            </div>
          </>
        );
      })()}

      {(page === 'songs' || (page as string) === 'downloads') && c.selectedSongIds.length > 0 && (
        <div className="pg-toolbar">
          <span className="pg-sub">{c.selectedSongIds.length} selected</span>
          <div className="pg-toolbar-end">
            <button className="pg-btn pg-btn--danger" onClick={() => {
              const originalConfirm = window.confirm;
              let confirmed = false;
              window.confirm = (msg) => {
                confirmed = originalConfirm(msg);
                return confirmed;
              };
              
              const finishDeletion = () => {
                window.confirm = originalConfirm;
                if (confirmed) {
                  if (window.indexedDB) {
                    const req = window.indexedDB.open('void-offline-downloads', 1);
                    req.onsuccess = () => {
                      const db = req.result;
                      if (db.objectStoreNames.contains('tracks')) {
                        const tx = db.transaction('tracks', 'readwrite');
                        const store = tx.objectStore('tracks');
                        c.selectedSongIds.forEach(id => {
                          const realId = String(id).replace(/^download:/, '').replace(/^api-/, '');
                          store.delete(realId);
                        });
                        tx.oncomplete = () => {
                          db.close();
                          setTimeout(() => window.location.reload(), 100);
                        };
                      } else {
                        db.close();
                      }
                    };
                  }
                }
              };
              
              const res = c.deleteSelectedSongs();
              if (res instanceof Promise) res.finally(finishDeletion);
              else finishDeletion();
            }} data-testid="button-delete-selected"><Trash2 />Delete selected ({c.selectedSongIds.length})</button>
          </div>
        </div>
      )}

      {page === 'queue' && c.queueTracks.length > 0 && (
        <div className="pg-toolbar">
          <button className="pg-btn pg-btn--ink" onClick={() => c.playList(c.queueTracks)} data-testid="button-play-queue"><Play />Play queue</button>
          <span className="pg-sub">Use the arrows to change the order</span>
        </div>
      )}

      {page === 'albums' && !detail && (c.albumNames.length ? (
        <div className="pg-grid">
          {c.albumNames.filter(filterMatch).map((name, i) => {
            const rep = tracks.find(t => t.album === name);
            return (
              <Reveal key={name} dir="depth" index={i}>
                <button className="pg-card" onClick={() => { c.setDetail({ kind: 'album', name }); c.setQuery(''); }} data-testid={`card-album-${name}`}>
                  <PgCover track={rep} fill />
                  <span className="pg-tile-title">{name}</span>
                  <span className="pg-tile-sub">{rep?.artist} · {countLabel(tracks.filter(t => t.album === name).length, 'song')}</span>
                </button>
              </Reveal>
            );
          })}
        </div>
      ) : <PgEmpty label="No albums yet" onImport={c.openImport} />)}

      {page === 'artists' && !detail && (c.artistNames.length ? (
        <div className="pg-grid pg-grid--artists">
          {c.artistNames.filter(filterMatch).map((name, i) => (
            <Reveal key={name} dir="depth" index={i}>
              <button className="pg-card pg-card--artist" onClick={() => { c.setDetail({ kind: 'artist', name }); c.setQuery(''); }} data-testid={`card-artist-${name}`}>
                <span className="pg-artist-wrap"><PgArtistPhoto name={name} fetchPhoto={c.fetchArtistPhoto} /><span className="pg-badge">{artistTracks(name).length}</span></span>
                <span className="pg-tile-title">{name}</span>
              </button>
            </Reveal>
          ))}
        </div>
      ) : <PgEmpty label="No artists yet" onImport={c.openImport} />)}

      {page === 'playlists' && !detail && (
        <div className="pg-grid">
          {playlists.map((playlist, i) => {
            const lead = tracks.find(t => t.id === playlist.trackIds[0]);
            return (
              <Reveal key={playlist.id} dir="depth" index={i}>
                <button className="pg-card" onClick={() => openPlaylist(playlist.name)} data-testid={`card-playlist-${playlist.id}`}>
                  <PgCover track={lead} fill kind="list" />
                  <span className="pg-tile-title">{playlist.name}</span>
                  <span className="pg-tile-sub">{countLabel(playlist.trackIds.length, 'song')}</span>
                </button>
              </Reveal>
            );
          })}
          {playlists.length === 0 && (
            <div className="pg-empty pg-empty--wide">
              <strong>A place for your own collections.</strong><p>Create a playlist, then add songs from their track menu.</p>
              <button className="pg-btn pg-btn--ink" onClick={() => { c.setModal('playlist'); c.setModalValue(''); }} data-testid="button-create-first-playlist"><Plus />Create playlist</button>
            </div>
          )}
        </div>
      )}

      {(page === 'songs' || page === 'favorites' || page === 'recent' || page === 'queue' || (page as string) === 'downloads' || detail) && (listItems.length
        ? (
          <>
            <PgTrackList items={listItems} showIndex={page === 'queue' || (detail?.kind === 'artist' && artistViewTab === 'top100')} reorder={page === 'queue' || detail?.kind === 'playlist'} {...listProps} />
            {detail?.kind === 'artist' && artistViewTab === 'top100' && artistTopTracks.length > 5 && (
              <div className="artist-see-more-row">
                <button
                  type="button"
                  className="artist-see-more-btn"
                  onClick={() => setArtistTopExpanded(v => !v)}
                  data-testid="button-artist-see-more"
                >
                  {artistTopExpanded ? 'See less' : 'See more'}
                </button>
              </div>
            )}
          </>
        )
        : <PgEmpty label={emptyLabel} onImport={c.openImport} />)}
    </div>
  );

  const settings = (
    <div className="pg-page" key="settings">
      <header className="pg-head"><div><div className="pg-eyebrow">Preferences</div><h1 className="pg-title">Settings</h1><p className="pg-sub">{c.pageDescription.settings}</p></div></header>
      <div className="pg-settings">
        <div className="pg-group-head"><h2>Appearance</h2><span>Saved locally</span></div>
        <div className="pg-setting"><div><strong>Theme</strong><p>Follow your Mac, or choose a fixed appearance.</p></div>
          <select className="pg-select" value={prefs.theme} onChange={e => void c.updatePrefs({ ...prefs, theme: e.target.value as typeof prefs.theme })} aria-label="Theme" data-testid="select-theme">
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select></div>
        <div className="pg-setting"><div><strong>Design</strong><p>Change how VOID looks. Your music, queue and playback stay exactly as they are.</p></div>
          <select className="pg-select" value={c.design} onChange={e => c.setDesign(e.target.value as DesignId)} aria-label="Design" data-testid="select-design">
            {DESIGN_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select></div>

        <button className="pg-group-head pg-group-toggle" type="button" aria-expanded={fontPanelOpen} aria-controls="pg-font-panel" onClick={() => setFontPanelOpen(open => !open)} data-testid="toggle-font-panel"><span><h2>Font</h2><small>Applies across VOID</small></span><ChevronUp className={fontPanelOpen ? 'pg-font-chevron is-open' : 'pg-font-chevron'} /></button>
        {fontPanelOpen && <div id="pg-font-panel" className="pg-fonts" role="radiogroup" aria-label="Font" data-testid="font-panel">
          {c.fontOptions.map(option => {
            const disabled = !!option.note;
            const selected = c.fontId === option.id && !disabled;
            return (
              <div className={`pg-font${selected ? ' is-selected' : ''}`} key={option.id}>
                <button className="pg-font-pick" role="radio" aria-checked={selected} disabled={disabled} onClick={() => { c.setFontId(option.id); setFontPanelOpen(false); }} data-testid={`font-option-${option.id}`}>
                  <span className="pg-font-check" aria-hidden="true">{selected ? <Check /> : null}</span>
                  <span className="pg-font-copy">
                    <span className="pg-font-name">{option.name}<em>{option.tag}</em></span>
                    {option.note ? <span className="pg-font-note">{option.note}</span> : <span className="pg-font-preview" style={{ fontFamily: option.family }}>{FONT_PREVIEW}</span>}
                  </span>
                </button>
                {option.font ? <button className="pg-icon-btn" aria-label={`Remove ${option.name}`} title="Remove font" onClick={() => void c.deleteFont(option.font)} data-testid={`button-remove-font-${option.id}`}><Trash2 /></button> : null}
              </div>
            );
          })}
          <button className="pg-font-import" onClick={() => c.fontInput.current?.click()} disabled={c.fontBusy} data-testid="button-import-font">
            <span className="pg-font-check" aria-hidden="true"><Plus /></span>{c.fontBusy ? 'Adding font…' : 'Import Font'}<small>.ttf · .otf · .woff · .woff2</small>
          </button>
        </div>}

        <div className="pg-group-head"><h2>Playback</h2></div>
        <div className="pg-setting"><div><strong>Autoplay</strong><p>Continue through the queue when a song ends.</p></div>
          <button className={`pg-switch${prefs.autoplay ? ' is-on' : ''}`} role="switch" aria-checked={prefs.autoplay} aria-label="Autoplay" onClick={() => void c.updatePrefs({ ...prefs, autoplay: !prefs.autoplay })} data-testid="switch-autoplay"><span /></button></div>
        <div className="pg-setting"><div><strong>Shuffle</strong><p>Play the queue in a different order.</p></div>
          <button className={`pg-switch${prefs.shuffle ? ' is-on' : ''}`} role="switch" aria-checked={prefs.shuffle} aria-label="Shuffle" onClick={() => void c.updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="switch-shuffle"><span /></button></div>
        <div className="pg-setting"><div><strong>Repeat</strong><p>Choose what happens at the end of the queue.</p></div>
          <select className="pg-select" value={prefs.repeat} onChange={e => void c.updatePrefs({ ...prefs, repeat: e.target.value as typeof prefs.repeat })} aria-label="Repeat" data-testid="select-repeat">
            <option value="off">Off</option><option value="all">Repeat queue</option><option value="one">Repeat song</option>
          </select></div>

        <div className="pg-group-head"><h2>Your files</h2></div>
        <div className="pg-setting"><div><strong>Local library</strong><p>Audio files stay in this browser’s private storage. Clearing site data removes them.</p></div><span className="pg-sub">{tracks.length} files · {formatBytes(totalBytes)}</span></div>
        <p className="pg-note">VOID does not upload your audio. Browser storage can be limited, and playback depends on which codecs this browser supports. Imported files are copied into local browser storage so they can be available after refresh.</p>
        <div className="pg-setting"><div><strong>Import music</strong><p>Add more audio from your Mac.</p></div><button className="pg-btn" onClick={c.openImport} data-testid="button-settings-import">Add music</button></div>
        <div className="pg-setting"><div><strong>Rescan library</strong><p>Read available file tags and artwork again from stored audio.</p></div><button className="pg-btn" onClick={() => void c.rescanLibrary()} disabled={!tracks.length} data-testid="button-rescan-library">Rescan</button></div>
        
        <div className="pg-setting"><div><strong>Clear library</strong><p>Remove VOID’s local copies and playlists. Original Mac files are untouched.</p></div>
          <button className="pg-btn pg-btn--danger" onClick={() => {
            const originalConfirm = window.confirm;
            let confirmed = false;
            window.confirm = (msg) => {
              confirmed = originalConfirm(msg);
              return confirmed;
            };
            
            const finishClear = () => {
              window.confirm = originalConfirm;
              if (confirmed) {
                if (window.indexedDB) {
                  const req = window.indexedDB.open('void-offline-downloads', 1);
                  req.onsuccess = () => {
                    const db = req.result;
                    if (db.objectStoreNames.contains('tracks')) {
                      const tx = db.transaction('tracks', 'readwrite');
                      tx.objectStore('tracks').clear();
                      tx.oncomplete = () => {
                        db.close();
                        window.location.reload();
                      };
                    } else {
                      db.close();
                      window.location.reload();
                    }
                  };
                } else {
                  window.location.reload();
                }
              }
            };
            
            const res = c.clearLibrary();
            if (res instanceof Promise) res.finally(finishClear);
            else finishClear();
          }} disabled={!tracks.length && !playlists.length && !(c as any).downloadedTracks?.length} data-testid="button-clear-library">Clear library</button>
        </div>

        <div className="pg-group-head"><h2>Keyboard shortcuts</h2></div>
        {[['Space', 'Play or pause'], ['← / →', 'Seek 5 seconds'], ['↑ / ↓', 'Adjust volume'], ['M', 'Mute or unmute'], ['⌘ K', 'Search library'], ['Esc', 'Close the current panel']].map(([key, label]) => (
          <div className="pg-setting pg-setting--compact" key={key}><strong>{label}</strong><kbd>{key}</kbd></div>
        ))}
      </div>
    </div>
  );

  /* ───────────────────────── shell ───────────────────────── */
  return (
    <div className="pg-app" data-page={page} data-track-ambient={a ? '' : undefined} data-sidebar={c.sidebarCollapsed ? 'collapsed' : 'expanded'} style={ambient}>
      {/* environment: paper, light, optional video — all behind the interface */}
      <div className="pg-bg" aria-hidden="true" />
      {c.canvasVideoId && c.canvasEnabled && (
        <div className="pg-video" data-ready={c.canvasReady} aria-hidden="true">
          <iframe className="pg-video-frame" tabIndex={-1} frameBorder="0" allow="autoplay; encrypted-media; fullscreen" onLoad={() => c.setCanvasReady(true)}
            src={`https://www.youtube.com/embed/${c.canvasVideoId}?autoplay=1&mute=1&loop=1&controls=0&disablekb=1&playsinline=1&modestbranding=1&iv_load_policy=3&rel=0&playlist=${c.canvasVideoId}`} />
        </div>
      )}
      <div className="pg-veil" aria-hidden="true" data-video={c.canvasVideoId && c.canvasEnabled ? '' : undefined} />
      <div className="pg-light" aria-hidden="true" />
      <div className="pg-grain" aria-hidden="true" />

      <aside className="pg-side" aria-label="Main navigation">
        <div className="pg-side-head">
          <button className="pg-brand" aria-label="VOID home" onClick={() => c.setPageAndRoute('home')} data-testid="button-void-home"><span className="pg-eclipse" /><span className="pg-brand-word">VOID</span></button>
          <button className="pg-icon-btn pg-side-toggle" aria-label={c.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!c.sidebarCollapsed}
            title={c.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => c.setSidebarCollapsed(v => !v)} data-testid="button-toggle-sidebar">
            {c.sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        <nav className="pg-nav-group"><div className="pg-nav-label">Listen</div>{NAV.filter(n => n.group === 'listen').map(navButton)}</nav>
        <nav className="pg-nav-group"><div className="pg-nav-label">Your library</div>{NAV.filter(n => n.group === 'library').map(navButton)}</nav>
        <div className="pg-side-bottom">
          <button className={`pg-nav-item${page === 'settings' ? ' is-active' : ''}`} onClick={() => c.setPageAndRoute('settings')} aria-current={page === 'settings' ? 'page' : undefined} title="Settings" data-testid="nav-settings"><Settings /><span>Settings</span></button>
          <div className="pg-side-note">{tracks.length ? `${countLabel(tracks.length, 'local file')} · ${formatBytes(totalBytes)} on this device` : 'Your files stay on this device.'}</div>
        </div>
      </aside>

      <div className="pg-main" ref={mainRef}>
        <header className={`pg-top ${c.page !== 'home' ? 'is-scrolled' : ''}`}>
          <div className="pg-top-left"><span className="pg-eclipse pg-eclipse--mobile" /><span className="pg-brand-word pg-brand-word--mobile">VOID</span><span className="pg-crumb">{detail ? c.title : page === 'home' ? 'A quiet place for your music' : 'Your library'}</span></div>
          <div className="pg-top-actions">
            <button className="pg-search" onClick={() => { c.setPaletteOpen(true); c.setPaletteQuery(''); }} aria-label="Search your library" data-testid="button-open-search"><Search size={14} /><span>Search library</span><kbd>⌘ K</kbd></button>
            <button className="pg-icon-btn" onClick={c.openImport} disabled={c.importing} aria-label="Add music" title="Add music" data-testid="button-add-music-compact"><Plus /></button>
            <button className="pg-icon-btn" onClick={() => c.setCanvasEnabled(v => !v)} aria-label={c.canvasEnabled ? 'Stop background video' : 'Play background video'}
              title={c.canvasEnabled ? 'Stop background video' : 'Play background video'} data-testid="button-toggle-canvas">
              <svg width="18" height="13" viewBox="0 0 18 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="16" height="10" rx="2" /><path d="M5 12h8" /></svg>
              {!c.canvasEnabled && <i className="pg-strike" />}
            </button>
            {page !== 'settings' && <button className="pg-icon-btn" aria-label="Settings" title="Settings" onClick={() => c.setPageAndRoute('settings')} data-testid="button-open-settings"><SlidersHorizontal /></button>}
          </div>
        </header>

        <main className="pg-content">
          {c.storageError ? (
            <div className="pg-empty" role="alert" data-testid="status-storage-error"><strong>Local storage unavailable</strong>
              <p>{c.storageError} Your browser may be in private mode or storage may be disabled. VOID does not upload your music.</p>
              <button className="pg-btn" onClick={() => { c.setStorageError(''); void c.reload(); }} data-testid="button-retry-storage">Try again</button></div>
          ) : null}
          {!c.isReady && <div className="pg-empty" data-testid="status-library-loading"><strong>Opening your library</strong><p>Looking for audio you’ve saved on this device.</p></div>}
          
          {c.isReady && libraryOpen && !detail && (
            <div className="pg-page" key="library-hub">
              <header className="pg-head">
                <div>
                  <div className="pg-eyebrow">Your collection</div>
                  <h1 className="pg-title">Library</h1>
                  <p className="pg-sub">{countLabel(c.albumNames.length, 'album')} · {countLabel(c.artistNames.length, 'artist')} · {countLabel(playlists.length, 'playlist')}</p>
                </div>
              </header>
              <div className="pg-library-grid">
                {([
                  { id: 'downloads' as Page, label: 'Downloads', icon: Download, count: 'Saved for offline' },
                  { id: 'favorites' as Page, label: 'Favorites', icon: Heart, count: countLabel(tracks.filter(t => t.favorite).length, 'song') },
                  { id: 'albums' as Page, label: 'Albums', icon: Disc3, count: countLabel(c.albumNames.length, 'album') },
                  { id: 'artists' as Page, label: 'Artists', icon: Mic2, count: countLabel(c.artistNames.length, 'artist') },
                  { id: 'playlists' as Page, label: 'Playlists', icon: ListMusic, count: countLabel(playlists.length, 'playlist') },
                  { id: 'recent' as Page, label: 'Recently played', icon: Clock3, count: `${tracks.filter(t => t.lastPlayedAt).length} played` },
                ]).map((entry, index) => {
                  const Icon = entry.icon;
                  return (
                    <Reveal key={entry.id} dir="depth" index={index}>
                      <button
                        className="pg-library-card"
                        onClick={() => { setLibraryOpen(false); c.setPageAndRoute(entry.id); }}
                        data-testid={`library-${entry.id}`}
                      >
                        <span className="pg-library-card-icon"><Icon /></span>
                        <span className="pg-library-card-copy">
                          <strong>{entry.label}</strong>
                          <small>{entry.count}</small>
                        </span>
                      </button>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          )}

          {c.isReady && !libraryOpen && page === 'trending' && !detail && (
            !c.activeTrendingLang ? (
              <div className="pg-page" key="trending-hub">
                <header className="pg-head">
                  <div>
                    <div className="pg-eyebrow">Discover</div>
                    <h1 className="pg-title">Trending</h1>
                    <p className="pg-sub">Top 200 trending songs across languages</p>
                  </div>
                  <div className="pg-head-actions">
                    <input
                      className="pg-input pg-filter"
                      aria-label="Search languages"
                      placeholder="Search languages…"
                      value={c.trendingQuery ?? ''}
                      onChange={e => c.setTrendingQuery?.(e.target.value)}
                      data-testid="input-filter-trending-languages"
                    />
                  </div>
                </header>
                <div className="trending-lang-grid">
                  {(c.trendingLanguages ?? []).map((lang: any, index: number) => (
                    <Reveal key={lang.id} dir="depth" index={index}>
                      <button
                        type="button"
                        className="trending-lang-card"
                        onClick={() => c.openTrendingLanguage?.(lang.id)}
                        style={{ '--card-accent-bg': lang.accentGradient } as CSSProperties}
                        aria-label={`${lang.label} — ${lang.subtitle}`}
                        data-testid={`trending-lang-${lang.id}`}
                      >
                        <div className="trending-lang-card-bg-wrap" aria-hidden="true">
                          {lang.bgFallbackUrls?.[0] && (
                            <img
                              src={lang.bgFallbackUrls[0]}
                              alt=""
                              className="trending-lang-card-bg is-loaded"
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                          <div className="trending-lang-card-atmosphere" />
                        </div>
                        <div className="trending-lang-card-artist-wrap" aria-hidden="true">
                          <PgArtistPhoto name={lang.artistName} fetchPhoto={c.fetchArtistPhoto} />
                        </div>
                        <div className="trending-lang-card-scrim" aria-hidden="true" />
                        <div className="trending-lang-card-copy">
                          <strong className="trending-lang-card-title">{lang.label}</strong>
                          <span className="trending-lang-card-subtitle">{lang.subtitle}</span>
                        </div>
                      </button>
                    </Reveal>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pg-page" key={`trending:${c.activeTrendingLang.id}`}>
                <header className="pg-head">
                  <div>
                    <div className="pg-eyebrow">
                      <button className="pg-link" onClick={() => c.openTrendingLanguage?.(null)} data-testid="button-back-trending">
                        ← Trending
                      </button>
                    </div>
                    <h1 className="pg-title">{c.activeTrendingLang.label}</h1>
                    <p className="pg-sub">{`Top 200 most trending songs · 40 Top ${c.activeTrendingLang.id === 'arabic' ? 'Arab' : c.activeTrendingLang.id === 'english' ? 'Global' : c.activeTrendingLang.label} Artists`}</p>
                  </div>
                  <div className="pg-head-actions">
                    <input
                      className="pg-input pg-filter"
                      aria-label={`Search ${c.activeTrendingLang.label} trending`}
                      placeholder="Search this chart…"
                      value={c.trendingQuery ?? ''}
                      onChange={e => c.setTrendingQuery?.(e.target.value)}
                      data-testid="input-filter-trending-tracks"
                    />
                  </div>
                </header>
                {(c.trendingTracks ?? []).length > 0 ? (
                  <PgTrackList
                    items={c.trendingTracks ?? []}
                    showIndex={true}
                    activeId={c.activeId}
                    isPlaying={isPlaying}
                    page={page}
                    actions={c.rowActions}
                    selectedIds={[]}
                  />
                ) : (c.trendingQuery ?? '').trim().length > 0 ? (
                  <div className="pg-empty">
                    <strong>No matching songs</strong>
                    <p>Try another search term in {c.activeTrendingLang.label}.</p>
                  </div>
                ) : null}
              </div>
            )
          )}

          {c.isReady && !libraryOpen && page !== 'trending' && (page === 'home' && !detail ? home : page === 'settings' ? settings : library)}
        </main>
      </div>

      <nav className="pg-mobile-nav" aria-label="Mobile navigation" data-hidden={c.expanded ? '' : undefined}>
        {MOBILE_NAV.map(item => {
          const Icon = item.icon;
          const LIBRARY_PAGES: Page[] = ['downloads', 'favorites', 'albums', 'artists', 'playlists', 'recent', 'queue'];
          const active = item.id === 'library'
            ? (libraryOpen && !detail) || (!detail && LIBRARY_PAGES.includes(page))
            : page === item.id && !detail && !libraryOpen;
          
          return (
            <button 
              key={item.id} 
              className={active ? 'is-active' : ''} 
              onClick={() => { 
                if (item.id === 'library') { 
                  c.setDetail(null); 
                  setLibraryOpen(true); 
                } else { 
                  setLibraryOpen(false); 
                  c.setPageAndRoute(item.id as Page); 
                } 
              }} 
              aria-label={item.label} 
              aria-current={active ? 'page' : undefined}
            >
              <Icon />
            </button>
          );
        })}
      </nav>

      {/* mini player — same state, same behaviour, Paper Glass surface */}
      <div className="pg-player" data-testid="player-bar" data-idle={activeTrack ? undefined : ''} data-np={c.expanded ? '' : undefined}>
        <div className="pg-player-track" role={activeTrack ? 'button' : undefined} tabIndex={activeTrack ? 0 : undefined} aria-label={activeTrack ? 'Open now playing' : undefined} data-testid="player-current-track"
          onClick={() => activeTrack && c.openExpanded()} onKeyDown={e => { if (activeTrack && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); c.openExpanded(); } }}>
          <PgCover track={activeTrack ?? undefined} />
          <span className="pg-row-text">
            <span className="pg-row-name mini-player-title-row">
              {activeTrack?.title ?? 'Nothing playing'}
            </span>
            <span className="pg-row-artist mini-player-sub-row">
              <span className="mini-player-artist-name">
                {activeTrack ? (activeTrack.artist || '') : 'Your music will be here'}
              </span>
              {activeTrack && getTrackQualityBadge(activeTrack) && (
                <>
                  <span className="mini-player-dot" aria-hidden="true">·</span>
                  <QualityBadge tier={getTrackQualityBadge(activeTrack)} track={activeTrack} compact />
                </>
              )}
            </span>
          </span>
        </div>

        <button className="pg-icon-btn pg-play pg-play--mobile" onClick={e => { e.stopPropagation(); void c.togglePlay(); }} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!activeTrack}><PgPlayIcon playing={isPlaying} /></button>

        <div className="pg-player-center">
          <div className="pg-controls">
            <button className={`pg-icon-btn${prefs.shuffle ? ' is-on' : ''}`} aria-label="Shuffle" title="Shuffle" aria-pressed={prefs.shuffle} onClick={() => void c.updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="button-shuffle"><Shuffle /></button>
            <button className="pg-icon-btn" aria-label="Previous track" title="Previous track" onClick={() => c.playRelative(-1)} data-testid="button-previous"><SkipBack /></button>
            <button className="pg-icon-btn pg-play" aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={() => void c.togglePlay()} data-testid="button-play-pause"><PgPlayIcon playing={isPlaying} /></button>
            <button className="pg-icon-btn" aria-label="Next track" title="Next track" onClick={() => c.playRelative(1)} data-testid="button-next"><SkipForward /></button>
            <button className={`pg-icon-btn${prefs.repeat !== 'off' ? ' is-on' : ''}`} aria-label={`Repeat ${prefs.repeat}`} title={`Repeat ${prefs.repeat}`} aria-pressed={prefs.repeat !== 'off'} onClick={c.cycleRepeat} data-testid="button-repeat">{prefs.repeat === 'one' ? <Repeat1 /> : <Repeat />}</button>
          </div>
          <div className="pg-scrub">
            <span>{activeTrack ? fmtElapsed(c.position) : '—:—'}</span>
            <input className="pg-range" aria-label="Playback position" style={rangeStyle(c.duration > 0 && Number.isFinite(c.duration) ? c.position / c.duration : 0)} type="range" min="0" max={c.duration > 0 && Number.isFinite(c.duration) ? c.duration : 100} step=".1"
              value={c.duration > 0 && Number.isFinite(c.duration) ? Math.min(c.position, c.duration) : 0} disabled={!activeTrack} onChange={e => c.seekTo(Number(e.target.value))} data-testid="input-seek" />
            <span>{activeTrack ? (activeTrack.isLive ? 'LIVE' : fmt(c.duration)) : '—:—'}</span>
          </div>
        </div>

        <div className="pg-player-extra">
          <button className="pg-icon-btn pg-extra pg-extra--opt" aria-label={activeTrack?.favorite ? 'Remove favorite' : 'Add favorite'} title={activeTrack?.favorite ? 'Remove favorite' : 'Add favorite'} disabled={!activeTrack} onClick={() => activeTrack && void c.toggleFavorite(activeTrack)} data-testid="button-player-favorite"><Heart fill={activeTrack?.favorite ? 'currentColor' : 'none'} /></button>
          <button className="pg-icon-btn pg-extra pg-extra--opt" aria-label="Open queue" title="Queue" onClick={() => c.setPageAndRoute('queue')} data-testid="button-open-queue"><ListMusic /></button>
          <button className="pg-icon-btn pg-extra" aria-label="Expand now playing" title="Now playing" onClick={c.openExpanded} data-testid="button-expand-player"><ChevronUp /></button>
          <PgVolume volume={prefs.volume} muted={prefs.muted} onVolume={c.changeVolume} onToggleMute={c.toggleMute} buttonTestId="button-mute" inputTestId="input-volume" />
        </div>
      </div>

      {/* hidden file inputs — same handlers as the original app */}
      <input ref={c.fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.aiff,.aif,.alac" multiple hidden
        onChange={e => { if (e.target.files) void c.importFiles(e.target.files); e.target.value = ''; }} data-testid="input-import-files" />
      <input ref={el => { c.folderInput.current = el; el?.setAttribute('webkitdirectory', ''); }} type="file" multiple hidden
        onChange={e => { if (e.target.files) void c.autoImport(e.target.files); e.target.value = ''; }} data-testid="input-import-folder" />
      <input ref={c.fontInput} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void c.importFont(file); }} data-testid="input-import-font" />

      <PgNowPlaying core={c} />
      <PgOverlays core={c} />
    </div>
  );
}
