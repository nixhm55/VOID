import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Check, Disc3, Heart, ListMusic, Mic2, MoreHorizontal, Pause, Play, Plus, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import type { Page, RowActions } from '../core/voidCore';
import { Reveal } from './motion';

/* ───────────── formatting helpers (presentation only) ───────────── */
export const fmt = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—:—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};
export const fmtElapsed = (seconds: number) => (!Number.isFinite(seconds) || seconds <= 0) ? '0:00' : fmt(seconds);
export const countLabel = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  return bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
};
export const rangeStyle = (fraction: number) =>
  ({ '--p': `${Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100}%` }) as CSSProperties;
const hueOf = (seed: string) => { let h = 0; for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360; return h; };

/* ───────────── small marks ───────────── */
/** Hand-drawn loop, the one signature gesture of Paper Glass. It draws itself once. */
export const HandCircle = () => (
  <svg className="pg-hand" viewBox="0 0 220 90" preserveAspectRatio="none" aria-hidden="true">
    <path pathLength={1} d="M14 50 C 6 22, 62 8, 118 9 C 176 10, 214 28, 206 50 C 198 74, 134 84, 84 80 C 36 76, 4 62, 18 36" />
  </svg>
);

export const PgPlayIcon = ({ playing }: { playing: boolean }) => (playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />);

/* ───────────── cover art ───────────── */
export const PgCover = memo(function PgCover({ track, fill = false, kind = 'disc' }: { track?: any; fill?: boolean; kind?: 'disc' | 'list' }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false); setFailed(false);
    if (!track) { setSrc(null); return; }
    if (track.image) { setSrc(track.image); return; }
    if (!track.artwork || !(track.artwork instanceof Blob)) { setSrc(null); return; }
    const url = URL.createObjectURL(track.artwork);
    if (active) setSrc(url);
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [track?.artwork, track?.image, track?.id]);

  const Glyph = kind === 'list' ? ListMusic : Disc3;
  return (
    <div className={fill ? 'pg-cover pg-cover--fill' : 'pg-cover'} style={{ '--ch': hueOf(String(track?.id ?? 'void')) } as CSSProperties}
      data-testid={fill ? 'cover-artwork' : 'cover-thumbnail'}>
      {src && !failed
        ? <img src={src} alt={`${track?.album ?? 'Album'} artwork`} className={loaded ? 'is-loaded' : ''} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        : <Glyph aria-hidden="true" />}
    </div>
  );
}, (a, b) => a.fill === b.fill && a.kind === b.kind && a.track?.artwork === b.track?.artwork && a.track?.image === b.track?.image
  && a.track?.id === b.track?.id && a.track?.album === b.track?.album);

/* ───────────── artist photo (uses the original app's fetcher + cache) ───────────── */
export const PgArtistPhoto = memo(function PgArtistPhoto({ name, fetchPhoto }: { name: string; fetchPhoto: (n: string) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(false); setUrl(null);
    fetchPhoto(name).then(found => { if (active && found) setUrl(found); }).catch(() => undefined);
    return () => { active = false; };
  }, [name, fetchPhoto]);
  return (
    <div className="pg-artist-photo">
      {!url && <span className="pg-artist-fallback"><Mic2 size={26} strokeWidth={1.3} /></span>}
      {url && <img src={url} alt={name} className={loaded ? 'is-loaded' : ''} onLoad={() => setLoaded(true)} />}
    </div>
  );
});

/* ───────────── volume capsule ───────────── */
export function PgVolume({ volume, muted, onVolume, onToggleMute, buttonTestId, inputTestId }: {
  volume: number; muted: boolean; onVolume: (v: number) => void; onToggleMute: () => void; buttonTestId: string; inputTestId: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const silent = muted || volume <= 0;
  const Icon = silent ? VolumeX : volume < 0.4 ? Volume1 : Volume2;
  const clear = () => window.clearTimeout(timer.current);
  const arm = () => { clear(); timer.current = window.setTimeout(() => { if (!dragging.current) setOpen(false); }, 1800); };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const label = open ? (silent ? 'Unmute' : 'Mute') : 'Volume';
  return (
    <div ref={root} className="pg-vol" data-open={open ? '' : undefined} data-silent={silent ? '' : undefined}
      onPointerEnter={clear} onPointerLeave={() => { if (open) arm(); }}
      onKeyDown={e => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}
      onBlur={e => { if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) arm(); }}>
      <div className="pg-vol-pop">
        <input className="pg-range" style={rangeStyle(silent ? 0 : volume)} type="range" min="0" max="1" step=".01" value={silent ? 0 : volume}
          aria-label="Volume" tabIndex={open ? 0 : -1} onChange={e => onVolume(Number(e.target.value))}
          onPointerDown={() => { dragging.current = true; clear(); window.addEventListener('pointerup', () => { dragging.current = false; }, { once: true }); }}
          data-testid={inputTestId} />
      </div>
      <button className="pg-icon-btn pg-vol-btn" aria-label={label} aria-expanded={open} title={label}
        onClick={() => { if (open) onToggleMute(); else setOpen(true); }} data-testid={buttonTestId}>
        <Icon key={silent ? 'silent' : 'sound'} />
      </button>
    </div>
  );
}

/* ───────────── track list ───────────── */
type ListProps = {
  items: any[]; showIndex?: boolean; reorder?: boolean; activeId: string | null; isPlaying: boolean; page: Page; actions: RowActions;
  selectedIds?: string[]; toggleSelect?: (id: string) => void; toggleSelectAll?: () => void; isAllSelected?: boolean;
};

export const PgTrackList = memo(function PgTrackList({
  items, showIndex = false, reorder = false, activeId, isPlaying, page, actions, selectedIds = [], toggleSelect, toggleSelectAll, isAllSelected,
}: ListProps) {
  const selecting = selectedIds.length > 0;
  const selectable = page === 'songs' && !!toggleSelect;
  return (
    <div className="pg-list" role="list" data-selecting={selecting ? '' : undefined} style={{ '--pg-aw': reorder ? '176px' : '84px' } as CSSProperties}>
      <div className="pg-list-head" role="presentation">
        <span>{showIndex ? '' : 'Title'}</span><span>Album</span><span>Time</span>
        <span className="pg-list-head-end">
          {page === 'songs' && toggleSelectAll
            ? <button className="pg-dot" data-on={isAllSelected ? '' : undefined} onClick={toggleSelectAll} aria-label="Select all" title="Select all"><Check /></button>
            : null}
        </span>
      </div>
      {items.map((track, index) => {
        const current = activeId === track.id;
        const selected = selectedIds.includes(track.id);
        return (
          <Reveal key={track.id} dir="left" index={index} role="listitem"
            className={`pg-row${current ? ' is-current' : ''}${selected ? ' is-selected' : ''}`} data-testid={`row-track-${track.id}`}>
            <div className="pg-row-title">
              {selectable && <button className="pg-dot pg-dot--row" data-on={selected ? '' : undefined} onClick={() => toggleSelect!(track.id)} aria-label={`Select ${track.title}`}><Check /></button>}
              {showIndex && <span className="pg-row-index">{index + 1}</span>}
              <button className="pg-row-main" aria-label={`Play ${track.title}`} data-testid={`button-play-${track.id}`}
                onClick={() => { try { document.querySelector('audio')?.load(); } catch { /* ignore */ } actions.play(track, items.map(item => item.id)); }}>
                <PgCover track={track} />
                <span className="pg-row-text"><span className="pg-row-name">{track.title}</span><span className="pg-row-artist">{track.artist}</span></span>
              </button>
              {current && isPlaying && <span className="pg-eq" aria-hidden="true"><i /><i /><i /></span>}
            </div>
            <button className="pg-row-album" onClick={() => actions.openAlbum(track.album)} data-testid={`link-album-${track.id}`}>{track.album}</button>
            <span className="pg-row-time">{fmt(track.duration)}</span>
            <div className="pg-row-actions">
              {reorder && <>
                <button className="pg-icon-btn" aria-label={`Move ${track.title} up`} onClick={() => actions.move(track, index, -1)} data-testid={`button-order-up-${track.id}`}><ArrowUp /></button>
                <button className="pg-icon-btn" aria-label={`Move ${track.title} down`} onClick={() => actions.move(track, index, 1)} data-testid={`button-order-down-${track.id}`}><ArrowDown /></button>
                <button className="pg-icon-btn" aria-label={`Remove ${track.title} from ${page === 'queue' ? 'queue' : 'playlist'}`} onClick={() => actions.removeFromList(track.id)} data-testid={`button-remove-from-list-${track.id}`}><X /></button>
              </>}
              <button className="pg-icon-btn" aria-label={track.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => actions.favorite(track)} data-testid={`button-favorite-${track.id}`}><Heart fill={track.favorite ? 'currentColor' : 'none'} /></button>
              <button className="pg-icon-btn" aria-label={`More actions for ${track.title}`} onClick={() => actions.menu(track)} data-testid={`button-track-menu-${track.id}`}><MoreHorizontal /></button>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
});

export function PgEmpty({ label, onImport, body }: { label: string; onImport: () => void; body?: string }) {
  return (
    <div className="pg-empty" data-testid="empty-library">
      <strong>{label}</strong>
      <p>{body ?? 'VOID only shows audio you’ve added. No catalog, recommendations, or placeholder tracks.'}</p>
      <button className="pg-btn pg-btn--ink" onClick={onImport} data-testid="button-empty-add-files"><Plus />Add audio files</button>
    </div>
  );
}