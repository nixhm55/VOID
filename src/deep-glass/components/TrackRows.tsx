import { memo } from 'react';
import { ArrowDown, ArrowUp, Heart, MoreHorizontal, X } from 'lucide-react';
import type { Track } from '@/lib/library';
import type { Page, RowActions } from '../../core/voidCore';
import { formatProviderLabel, getTrackQualityBadge } from '../../api/quality';
import { QualityBadge } from '../../components/QualityBadge';
import { DgReveal } from '../../motion';
import { formatTime } from '../utils/formatters';
import { Cover } from './Cover';
import { SelectionEmblem } from './SelectionEmblem';

export const TrackRows = memo(function TrackRows({
  items,
  showIndex = false,
  reorder = false,
  activeId,
  isPlaying = false,
  page,
  actions,
  selectedIds = [],
  toggleSelect,
  toggleSelectAll,
  isAllSelected,
  selectionMode = false,
  className = '',
  deletingIds = [],
  downloadingIds = [],
  recentlyDownloadedIds = [],
  downloadedCount = 0,
}: {
  items: Track[];
  showIndex?: boolean;
  reorder?: boolean;
  activeId: string | null;
  isPlaying?: boolean;
  page: Page;
  actions: RowActions;
  selectedIds?: string[];
  toggleSelect?: (id: string) => void;
  toggleSelectAll?: () => void;
  isAllSelected?: boolean;
  selectionMode?: boolean;
  className?: string;
  deletingIds?: string[];
  downloadingIds?: string[];
  recentlyDownloadedIds?: string[];
  downloadedCount?: number;
}) {
  void downloadingIds;
  void recentlyDownloadedIds;
  void downloadedCount;
  const isSelectionSupported =
    ['songs', 'playlists', 'favorites', 'recent', 'queue', 'downloads'].includes(page) &&
    Boolean(toggleSelectAll);
  const isSelectionMode = selectionMode;

  return (
    <div className={`table-wrap${className ? ` ${className}` : ''}`}>
      <table className="track-table">
        <thead>
          <tr>
            <th>{showIndex ? ' ' : 'Title'}</th>
            <th>Album</th>
            <th>Time</th>
            <th className="track-col-quality">Quality</th>
            <th aria-label="Actions">
              {isSelectionSupported && toggleSelectAll && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 8 }}>
                  <button
                    style={{
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                    }}
                    onClick={toggleSelectAll}
                    aria-label={selectionMode ? 'Exit selection mode' : 'Show selection options'}
                    title={selectionMode ? 'Exit selection mode' : 'Selection options'}
                  >
                    <SelectionEmblem selected={!!selectionMode || !!isAllSelected} />
                  </button>
                </div>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((track, index) => {
            const isSelected = selectedIds.includes(track.id);
            const current = activeId === track.id;
            void formatProviderLabel(track.source, track);
            const qualityBadge = getTrackQualityBadge(track);
            const playRowTrack = () => actions.play(track, items.map(item => item.id));
            return (
              <DgReveal
                as="tr"
                dir="row"
                index={index}
                key={track.id}
                className={`dg-row${current ? ' current' : ''}${isSelectionMode ? ' selection-mode' : ''}${deletingIds.includes(track.id) ? ' download-removing' : ''}`}
                aria-current={current ? 'true' : undefined}
                data-testid={`row-track-${track.id}`}
                onClick={playRowTrack}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {isSelectionSupported && toggleSelect && (
                      <div
                        className="track-selection-gutter"
                        style={{
                          width: isSelectionMode ? 32 : 0,
                          opacity: isSelectionMode ? 1 : 0,
                          overflow: 'hidden',
                          pointerEvents: isSelectionMode ? 'auto' : 'none',
                          transition:
                            'width .34s var(--ease-out-soft), opacity .24s var(--ease-out-soft)',
                          flex: `0 0 ${isSelectionMode ? 32 : 0}px`,
                        }}
                      >
                        <button
                          style={{
                            background: 'transparent',
                            border: 0,
                            padding: 0,
                            cursor: isSelectionMode ? 'pointer' : 'default',
                            display: 'flex',
                          }}
                          onClick={event => {
                            event.stopPropagation();
                            if (isSelectionMode) toggleSelect(track.id);
                          }}
                          aria-label={`Select ${track.title}`}
                          tabIndex={isSelectionMode ? 0 : -1}
                        >
                          <SelectionEmblem selected={isSelected} />
                        </button>
                      </div>
                    )}
                    <div className="track-main">
                      {showIndex ? (
                        <span style={{ width: 16, color: 'hsl(var(--muted-foreground))' }}>
                          {index + 1}
                        </span>
                      ) : null}
                      <div style={{ flex: '0 0 44px', width: 44, height: 44 }}>
                        <Cover track={track} />
                      </div>
                      <div
                        className="track-main"
                        style={{
                          border: 0,
                          background: 'transparent',
                          padding: 0,
                          textAlign: 'left',
                          minWidth: 0,
                          width: 0,
                          flex: '1 1 0%',
                          overflow: 'hidden',
                        }}
                      >
                        <span style={{ display: 'block', minWidth: 0, width: '100%', overflow: 'hidden' }}>
                          <span className="track-title" title={track.title}>
                            {track.title}
                          </span>
                          <span className="track-sub" title={track.artist}>
                            {track.artist}
                          </span>
                        </span>
                      </div>
                      {current && isPlaying ? (
                        <span className="dg-eq" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <button
                    className="crumb"
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
                    onClick={event => {
                      event.stopPropagation();
                      actions.openAlbum(track.album);
                    }}
                    data-testid={`link-album-${track.id}`}
                  >
                    {track.album}
                  </button>
                </td>
                <td>{track.isLive ? 'LIVE' : formatTime(track.duration)}</td>
                <td className="track-col-quality">
                  <div className="track-quality-cell">
                    {qualityBadge ? <QualityBadge tier={qualityBadge} track={track} compact /> : null}
                  </div>
                </td>
                <td>
                  <div className="row-actions">
                    {reorder && (
                      <>
                        <button
                          className="icon-button"
                          aria-label={`Move ${track.title} up`}
                          onClick={event => {
                            event.stopPropagation();
                            actions.move(track, index, -1);
                          }}
                          data-testid={`button-order-up-${track.id}`}
                        >
                          <ArrowUp />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Move ${track.title} down`}
                          onClick={event => {
                            event.stopPropagation();
                            actions.move(track, index, 1);
                          }}
                          data-testid={`button-order-down-${track.id}`}
                        >
                          <ArrowDown />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${track.title} from ${page === 'queue' ? 'queue' : 'playlist'}`}
                          onClick={event => {
                            event.stopPropagation();
                            actions.removeFromList(track.id);
                          }}
                          data-testid={`button-remove-from-list-${track.id}`}
                        >
                          <X />
                        </button>
                      </>
                    )}
                    {page !== 'downloads' && actions.canDownload?.(track) && (
                      <button
                        className={`download-icon-button row-download-button${actions.isDownloading?.(track) ? ' is-downloading' : ''}${actions.isDownloadSuccess?.(track) ? ' is-download-success' : ''}`}
                        aria-label={
                          actions.isDownloadSuccess?.(track)
                            ? `Downloaded ${track.title}`
                            : `Download ${track.title}`
                        }
                        title={
                          actions.isDownloadSuccess?.(track)
                            ? 'Downloaded'
                            : actions.isDownloading?.(track)
                              ? 'Saving offline…'
                              : `Save ${track.title} for offline listening`
                        }
                        disabled={Boolean(
                          actions.isDownloading?.(track) || actions.isDownloadSuccess?.(track)
                        )}
                        onClick={event => {
                          event.stopPropagation();
                          actions.download?.(track);
                        }}
                        data-testid={`button-download-${track.id}`}
                      >
                        <svg
                          width="13"
                          height="15"
                          viewBox="0 0 13 15"
                          fill="none"
                          aria-hidden="true"
                          style={{ display: 'block', overflow: 'visible' }}
                        >
                          {actions.isDownloadSuccess?.(track) ? (
                            <path
                              className="download-success-check"
                              d="M2.1 7.7L5.1 10.5L11 3.8"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ) : (
                            <path
                              d="M6.5 1.5V10.5M2.9 7.2L6.5 10.8L10.1 7.2M2.2 13H10.8"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                        </svg>
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={track.favorite ? 'Remove favorite' : 'Add favorite'}
                      onClick={event => {
                        event.stopPropagation();
                        actions.favorite(track);
                      }}
                      data-testid={`button-favorite-${track.id}`}
                    >
                      <Heart fill={track.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`More actions for ${track.title}`}
                      onClick={event => {
                        event.stopPropagation();
                        actions.menu(track);
                      }}
                      data-testid={`button-track-menu-${track.id}`}
                    >
                      <MoreHorizontal />
                    </button>
                  </div>
                </td>
              </DgReveal>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
