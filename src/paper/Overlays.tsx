import { useState, useEffect, type CSSProperties } from 'react';
import { ChevronDown, Disc3, FileAudio, FolderOpen, Heart, ListMusic, ListPlus, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Trash2, X, Download, Check, Clock3 } from 'lucide-react';
import type { VoidCore } from '../core/voidCore';
import { PgCover, PgPlayIcon, PgVolume, countLabel, fmt, fmtElapsed, formatBytes, rangeStyle } from './parts';
import { QualityBadge } from '../components/QualityBadge';
import { detectTrackQuality, formatProviderLabel, getTrackQualityBadge } from '../api/quality';

const onBackdrop = (close: () => void) => (event: { target: unknown; currentTarget: unknown }) => {
  if (event.target === event.currentTarget) close();
};

function PgDownloadBtn({ track, core }: { track: any; core: VoidCore }) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'success' | 'hidden'>('idle');
  const isNonDownloadableStream =
    Boolean(track?.isLive) ||
    track?.qualityBadge === 'Live Radio' ||
    track?.qualityBadge === 'FLAC Live';

  useEffect(() => {
    if (isNonDownloadableStream) {
      setStatus('hidden');
      return;
    }
    let isMounted = true;
    
    const checkIsDownloaded = async () => {
      const downloadedTracks = (core as any).downloadedTracks || [];
      const trkId = String(track.id).replace(/^api-/, '').replace(/^download:/, '');
      const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
      const trkTitle = norm(track.name || track.title);
      const trkArtist = norm(track.artist);
      
      const isAlreadyDownloaded = downloadedTracks.some((t: any) => {
        const dlId = String(t.id).replace(/^download:/, '').replace(/^api-/, '');
        if (dlId === trkId) return true;
        const dlTitle = norm(t.title || t.name);
        const dlArtist = norm(t.artist);
        return Boolean(trkTitle && dlTitle && trkTitle === dlTitle && (!trkArtist || !dlArtist || trkArtist === dlArtist));
      });

      if (isAlreadyDownloaded) {
        if (isMounted) setStatus('success');
        return;
      }

      try {
        if ('indexedDB' in window) {
          const req = indexedDB.open('void-offline-downloads', 1);
          req.onsuccess = () => {
            const db = req.result;
            if (db.objectStoreNames.contains('tracks')) {
              const tx = db.transaction('tracks', 'readonly');
              const store = tx.objectStore('tracks');
              const getAllReq = store.getAll();
              
              getAllReq.onsuccess = () => {
                const downloads = getAllReq.result || [];
                const inDownloads = downloads.some((t: any) => {
                  const dlId = String(t.id).replace(/^download:/, '').replace(/^api-/, '');
                  return dlId === trkId;
                });

                if (isMounted) {
                  setStatus(inDownloads ? 'success' : 'idle');
                }
                db.close();
              };
            } else {
              db.close();
              if (isMounted) setStatus('idle');
            }
          };
        }
      } catch (e) {
        if (isMounted) setStatus('idle');
      }
    };

    checkIsDownloaded();
    const interval = setInterval(checkIsDownloaded, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [core.tracks, (core as any).downloadedTracks, isNonDownloadableStream, track.id]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status !== 'idle') return;
    setStatus('downloading');
    try {
      if (typeof (core as any).downloadSearchTrack === 'function') {
        await (core as any).downloadSearchTrack(track);
      } else if (typeof (core as any).downloadTrack === 'function') {
        await (core as any).downloadTrack(track);
      } else {
        // Fallback: Manually download and save to IndexedDB if core function is missing
        const trkId = String(track.id).replace(/^api-/, '').replace(/^download:/, '');
        const url = track.downloadUrl || track.audioUrl || track.src;
        if (!url) throw new Error('No downloadable URL found.');
        
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error('Network error');
        const blob = await response.blob();
        
        let coverBlob;
        if (track.image) {
          try {
            const coverRes = await fetch(track.image, { mode: 'cors' });
            if (coverRes.ok) coverBlob = await coverRes.blob();
          } catch (e) {}
        }
        
        const resolvedMime = blob.type || track.mimeType || 'audio/mpeg';
        const verifiedQuality = detectTrackQuality(url, track.format || resolvedMime, track.bitrate, {
          codecHint: track.codec,
          mimeTypeHint: resolvedMime,
        });

        const record = {
          id: trkId,
          title: String(track.name || track.title || 'Untitled'),
          artist: String(track.artist || 'Unknown artist'),
          album: String(track.album || 'Unknown album'),
          image: track.image,
          coverBlob,
          duration: Number(track.duration) || 0,
          mimeType: resolvedMime,
          source: formatProviderLabel(track.source, track),
          qualityBadge: verifiedQuality !== 'Unknown' ? verifiedQuality : track.qualityBadge,
          bitrate: track.bitrate,
          codec: track.codec,
          format: track.format,
          qualityVerified: track.qualityVerified,
          blob,
          downloadedAt: Date.now()
        };
        
        if ('indexedDB' in window) {
          await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open('void-offline-downloads', 1);
            req.onupgradeneeded = () => {
              if (!req.result.objectStoreNames.contains('tracks')) {
                req.result.createObjectStore('tracks', { keyPath: 'id' });
              }
            };
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains('tracks')) {
                reject(new Error('Database missing'));
                return;
              }
              const tx = db.transaction('tracks', 'readwrite');
              tx.objectStore('tracks').put(record);
              tx.oncomplete = () => { db.close(); resolve(); };
              tx.onerror = () => { db.close(); reject(tx.error); };
            };
            req.onerror = () => reject(req.error);
          });
        }
        
        if (typeof core.reload === 'function') {
           core.reload();
        }
      }
      
      setStatus('success');
    } catch (err) {
      setStatus('idle');
      if (core.notify) core.notify('Could not save this track offline.');
    }
  };

  if (status === 'hidden') return null;

  if (status === 'success') {
    return (
      <div className="pg-download-success-wrapper" onClick={(e) => e.stopPropagation()}>
        <svg className="pg-download-circle" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
        </svg>
        <Check className="pg-download-tick" size={14} />
      </div>
    );
  }

  return (
    <button
      className={`pg-download-btn-minimal ${status === 'downloading' ? 'pg-download-blinking' : ''}`}
      onClick={handleDownload}
      title="Download"
      aria-label="Download track"
    >
      <Download size={15} strokeWidth={1.8} />
    </button>
  );
}

export function PgOverlays({ core: c }: { core: VoidCore }) {
  const { contextTrack, modal } = c;
  const closeModal = () => c.setModal(null);

  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('void-search-history') || '[]'); } catch { return []; }
  });
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    if (!c.paletteOpen) setHistoryExpanded(false);
  }, [c.paletteOpen]);

  const handleSaveHistory = (term: string) => {
    if (!term.trim()) return;
    setSearchHistory(prev => {
      const updated = [term.trim(), ...prev.filter(t => t.toLowerCase() !== term.trim().toLowerCase())];
      try { localStorage.setItem('void-search-history', JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const handleRemoveHistory = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory(prev => {
      const updated = prev.filter(t => t !== term);
      try { localStorage.setItem('void-search-history', JSON.stringify(updated)); } catch {}
      if (updated.length <= 4) setHistoryExpanded(false);
      return updated;
    });
  };

  return <>
    {c.importMenu && (
      <div className="pg-backdrop" onMouseDown={onBackdrop(() => c.setImportMenu(false))}>
        <div className="pg-sheet pg-import" role="dialog" aria-modal="true" aria-labelledby="pg-import-title" data-testid="import-menu">
          <div className="pg-sheet-head"><h2 id="pg-import-title">Add music</h2><p>Files are copied into this browser’s private storage. Nothing is uploaded.</p></div>
          <button className="pg-option" onClick={() => { c.setImportMenu(false); c.folderInput.current?.click(); }} data-testid="button-auto-import">
            <span className="pg-option-icon"><FolderOpen /></span><span className="pg-option-copy"><strong>Auto Import</strong><span>Choose a folder and VOID finds the music inside it.</span></span>
          </button>
          <button className="pg-option" onClick={() => { c.setImportMenu(false); c.fileInput.current?.click(); }} data-testid="button-add-from-files">
            <span className="pg-option-icon"><FileAudio /></span><span className="pg-option-copy"><strong>Add from Files</strong><span>Pick individual songs from your Mac.</span></span>
          </button>
          <div className="pg-sheet-foot"><button className="pg-btn" onClick={() => c.setImportMenu(false)} data-testid="button-cancel-import">Cancel</button></div>
        </div>
      </div>
    )}

    {c.paletteOpen && (
      <div className="pg-backdrop" onMouseDown={onBackdrop(() => c.setPaletteOpen(false))}>
        <div className="pg-sheet pg-palette" role="dialog" aria-modal="true" aria-label="Search your library">
          <input autoFocus className="pg-palette-input" placeholder="Search your music…" value={c.paletteQuery} onChange={e => c.setPaletteQuery(e.target.value)}
            data-testid="input-search-palette"
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              e.stopPropagation();
              if (c.paletteQuery.trim()) {
                handleSaveHistory(c.paletteQuery);
              }
            }} />
          <div className="pg-palette-results">
            {c.allSearchResults.map(track => {
              const localQuality = getTrackQualityBadge(track);
              return (
                <div key={track.id} className="pg-result" role="button" tabIndex={0} 
                  style={{ cursor: 'pointer' }}
                  onClick={() => { handleSaveHistory(c.paletteQuery); void c.playTrack(track); c.setPaletteOpen(false); }} data-testid={`search-result-${track.id}`}>
                  <PgCover track={track} />
                  <span className="pg-row-text"><span className="pg-row-name">{track.title}</span><span className="pg-row-artist">{track.artist} · {track.album}</span></span>
                  {localQuality && <QualityBadge tier={localQuality} track={track} compact />}
                  <Play size={13} />
                </div>
              );
            })}
            {c.musicResults.map(track => {
              const sourceLabel = formatProviderLabel(track.source, track) || 'Online';
              const qualityTier = getTrackQualityBadge(track);

              return (
                <div key={`api-${track.source || ''}-${track.id}`} className="pg-result" data-testid={`search-music-${track.id}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    handleSaveHistory(c.paletteQuery);
                    const remote = {
                      id: `api-${track.id}`, 
                      title: track.name, 
                      artist: track.artist, 
                      album: track.album, 
                      fileName: `${track.name}.${track.codec ? track.codec.toLowerCase() : 'audio'}`,
                      audioUrl: track.downloadUrl, 
                      downloadUrl: track.downloadUrl,
                      src: track.downloadUrl, 
                      image: track.image,
                      duration: track.duration,
                      source: sourceLabel,
                      qualityBadge: qualityTier,
                      bitrate: track.bitrate,
                      codec: track.codec,
                      mimeType: track.mimeType,
                      format: track.format,
                      qualityVerified: track.qualityVerified,
                      isLive: track.isLive,
                      fallbackUrls: track.fallbackUrls,
                    };
                    c.setPaletteOpen(false);
                    void c.playTrack(remote);
                  }}>
                  <PgCover track={{ image: track.image }} />
                  <span className="pg-row-text"><span className="pg-row-name">{track.name}</span><span className="pg-row-artist">{track.artist}</span></span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <PgDownloadBtn track={track} core={c} />
                    {qualityTier && <QualityBadge tier={qualityTier} track={track} compact />}
                  </span>
                </div>
              );
            })}
            {c.albumSearchResults.map(name => (
              <div key={`album-${name}`} className="pg-result" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => { handleSaveHistory(c.paletteQuery); c.setPaletteOpen(false); c.openCollection('album', name); }} data-testid={`search-album-${name}`}>
                <Disc3 size={16} /><span className="pg-row-name">{name}</span><span className="pg-tag">Album</span>
              </div>
            ))}
            {c.artistSearchResults.map(name => (
              <div key={`artist-${name}`} className="pg-result" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => { handleSaveHistory(c.paletteQuery); c.setPaletteOpen(false); c.openCollection('artist', name); }} data-testid={`search-artist-${name}`}>
                <Mic2 size={16} /><span className="pg-row-name">{name}</span><span className="pg-tag">Artist</span>
              </div>
            ))}
            {c.playlistSearchResults.map(playlist => (
              <div key={playlist.id} className="pg-result" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => { handleSaveHistory(c.paletteQuery); c.setPaletteOpen(false); c.setPageAndRoute('playlists'); c.setDetail({ kind: 'playlist', name: playlist.name }); c.setQuery(''); }}>
                <ListMusic size={16} /><span className="pg-row-name">{playlist.name}</span><span className="pg-tag">Playlist</span>
              </div>
            ))}
            {c.musicSearching && c.paletteQuery && <div className="pg-palette-note">Searching music providers…</div>}
            {c.paletteQuery && !c.allSearchResults.length && !c.musicResults.length && !c.musicSearching && !c.albumSearchResults.length && !c.artistSearchResults.length && !c.playlistSearchResults.length && (
              <div className="pg-palette-note"><strong>No match found</strong><br />Try another title, artist or album.</div>
            )}
            {!c.paletteQuery && searchHistory.length > 0 && (
              <div className="search-history-list" data-expanded={historyExpanded ? 'true' : 'false'}>
                <div className="search-history-header">
                  <span className="pg-palette-note" style={{ padding: 0 }}>Recent Searches</span>
                  {searchHistory.length > 4 && (
                    <button
                      type="button"
                      className={`pg-icon-btn search-history-more-btn${historyExpanded ? ' is-expanded' : ''}`}
                      style={{ marginLeft: 'auto', width: 28, height: 28, flex: 'none' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistoryExpanded(prev => !prev);
                      }}
                      aria-label={historyExpanded ? 'Show fewer recent searches' : 'Show more recent searches'}
                      aria-expanded={historyExpanded}
                    >
                      <ChevronDown size={15} strokeWidth={1.85} />
                    </button>
                  )}
                </div>
                <div className={`search-history-items-scroll${historyExpanded ? ' is-expanded' : ''}`}>
                  {(historyExpanded ? searchHistory : searchHistory.slice(0, 4)).map((term, i) => (
                    <div
                      key={`history-${term}-${i}`}
                      className={`pg-result search-history-item${i >= 4 ? ' is-extra-history' : ''}`}
                      style={
                        i >= 4
                          ? ({ cursor: 'pointer', '--hist-idx': Math.min(i - 4, 8) } as CSSProperties)
                          : { cursor: 'pointer' }
                      }
                      onClick={() => c.setPaletteQuery(term)}
                    >
                      <Clock3 size={16} style={{ flex: 'none' }} />
                      <span className="pg-row-name" style={{ flex: 1 }}>{term}</span>
                      <button
                        className="pg-icon-btn"
                        style={{ marginLeft: 'auto', width: 28, height: 28, flex: 'none' }}
                        onClick={(e) => handleRemoveHistory(term, e)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!c.paletteQuery && searchHistory.length === 0 && <div className="pg-palette-note">Search your local songs and connected music providers.</div>}
          </div>
        </div>
      </div>
    )}

    {modal && (
      <div className="pg-backdrop" onMouseDown={onBackdrop(closeModal)}>
        <div className="pg-sheet pg-modal" role="dialog" aria-modal="true" aria-labelledby="pg-modal-title">
          <h2 id="pg-modal-title">{modal === 'playlist' ? 'New playlist' : modal === 'rename' ? 'Rename playlist' : modal === 'properties' ? 'Track details' : 'Add to playlist'}</h2>
          {modal === 'add-to-playlist' ? <>
            <p>Choose where “{contextTrack?.title}” belongs.</p>
            {c.playlists.length
              ? c.playlists.map(playlist => (
                <button className="pg-result" key={playlist.id} onClick={() => contextTrack && void c.addTrackToPlaylist(playlist, contextTrack)} data-testid={`button-add-to-${playlist.id}`}>
                  <ListMusic size={15} /><span className="pg-row-name">{playlist.name}</span><span className="pg-tag">{countLabel(playlist.trackIds.length, 'song')}</span>
                </button>))
              : <p>Create a playlist first, then add songs from their menus.</p>}
            <div className="pg-sheet-foot"><button className="pg-btn" onClick={closeModal} data-testid="button-cancel-add-playlist">Close</button></div>
          </> : modal === 'properties' && contextTrack ? <>
            <p>Track and audio quality metadata.</p>
            <dl className="pg-props">
              <dt>File</dt><dd>{contextTrack.fileName}</dd>
              <dt>Title</dt><dd>{contextTrack.title}</dd>
              <dt>Artist</dt><dd>{contextTrack.artist}</dd>
              <dt>Album</dt><dd>{contextTrack.album}</dd>
              <dt>Source</dt><dd>{formatProviderLabel(contextTrack.source, contextTrack) || 'Local Library'}</dd>
              <dt>Quality</dt><dd style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <QualityBadge tier={getTrackQualityBadge(contextTrack)} track={contextTrack} compact />
                {contextTrack.bitrate ? <span>{contextTrack.bitrate} kbps</span> : null}
                {contextTrack.codec ? <span>· {contextTrack.codec}</span> : null}
              </dd>
              <dt>Duration</dt><dd>{contextTrack.isLive ? 'Live Stream' : fmt(contextTrack.duration)}</dd>
              <dt>Format</dt><dd>{contextTrack.format || contextTrack.mimeType || 'Unknown'}</dd>
              {contextTrack.fileSize > 0 && <><dt>Size</dt><dd>{formatBytes(contextTrack.fileSize)}</dd></>}
              {contextTrack.importedAt > 0 && <><dt>Added</dt><dd>{new Date(contextTrack.importedAt).toLocaleString()}</dd></>}
            </dl>
            <div className="pg-sheet-foot"><button className="pg-btn" onClick={() => { closeModal(); c.setContextTrack(null); }} data-testid="button-close-properties">Close</button></div>
          </> : <>
            <p>{modal === 'playlist' ? 'A small collection, stored with your local library.' : 'Give this collection a new name.'}</p>
            <input autoFocus className="pg-input" value={c.modalValue} maxLength={70} placeholder="Playlist name" onChange={e => c.setModalValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { if (modal === 'playlist') void c.createPlaylist(); else void c.renamePlaylist(); } }} data-testid="input-playlist-name" />
            <div className="pg-sheet-foot">
              <button className="pg-btn" onClick={closeModal} data-testid="button-cancel-playlist">Cancel</button>
              <button className="pg-btn pg-btn--ink" disabled={!c.modalValue.trim()} onClick={() => { if (modal === 'playlist') void c.createPlaylist(); else void c.renamePlaylist(); }} data-testid="button-save-playlist">
                {modal === 'playlist' ? 'Create playlist' : 'Save name'}
              </button>
            </div>
          </>}
        </div>
      </div>
    )}

    {contextTrack && modal !== 'add-to-playlist' && modal !== 'properties' && (
      <div className="pg-backdrop" onMouseDown={onBackdrop(() => c.setContextTrack(null))}>
        <div className="pg-sheet pg-modal" role="dialog" aria-modal="true" aria-label={`Actions for ${contextTrack.title}`}>
          <h2>{contextTrack.title}</h2><p>{contextTrack.artist}</p>
          <button className="pg-result desktop-context-only" onClick={() => { void c.playTrack(contextTrack); c.setContextTrack(null); }} data-testid="context-play"><Play size={15} />Play now</button>
          <button className="pg-result mobile-context-only" onClick={() => { if (c.activeId === contextTrack.id) { void c.togglePlay(); } else { void c.playTrack(contextTrack); } c.setContextTrack(null); }} data-testid="context-play-mobile">{c.activeId === contextTrack.id && c.isPlaying ? <><Pause size={15} />Pause</> : <><Play size={15} />Play</>}</button>
          <button className="pg-result mobile-context-only context-fav-btn" onClick={() => { void c.toggleFavorite(contextTrack); c.setContextTrack(null); }} data-testid="context-favorite-mobile"><Heart size={15} fill={contextTrack.favorite ? 'currentColor' : 'none'} />{contextTrack.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
          <button className="pg-result" onClick={() => { c.addToQueue(contextTrack); c.setContextTrack(null); }} data-testid="context-add-queue"><ListPlus size={15} />Add to queue</button>
          <button className="pg-result" onClick={() => { c.playNext(contextTrack); c.setContextTrack(null); }} data-testid="context-play-next"><SkipForward size={15} />Play next</button>
          <button className="pg-result" onClick={() => c.setModal('add-to-playlist')} data-testid="context-add-playlist"><ListMusic size={15} />Add to playlist</button>
          <button className="pg-result desktop-context-only" onClick={() => { void c.toggleFavorite(contextTrack); c.setContextTrack(null); }} data-testid="context-favorite"><Heart size={15} fill={contextTrack.favorite ? 'currentColor' : 'none'} />{contextTrack.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
          <button className="pg-result" onClick={() => c.openCollection('artist', contextTrack.artist)} data-testid="context-go-artist"><Mic2 size={15} />Go to artist</button>
          <button className="pg-result" onClick={() => c.openCollection('album', contextTrack.album)} data-testid="context-go-album"><Disc3 size={15} />Go to album</button>
          <button className="pg-result" onClick={() => c.setModal('properties')} data-testid="context-properties"><SlidersHorizontal size={15} />Properties</button>
          
          {c.detail?.kind !== 'artist' && c.page !== 'trending' && (c.tracks.some(t => t.id === contextTrack.id) || ((c as any).downloadedTracks ?? []).some((d: any) => d.id === contextTrack.id || `download:${d.id}` === contextTrack.id)) && (
            <button className="pg-result" onClick={() => { 
              // Intercept window.confirm to execute IndexedDB delete silently AFTER the main app's confirm
              const originalConfirm = window.confirm;
              let confirmed = false;
              window.confirm = (msg) => {
                confirmed = originalConfirm(msg);
                return confirmed;
              };
              
              const finishDeletion = () => {
                window.confirm = originalConfirm;
                if (confirmed) {
                  const realId = String(contextTrack.id).replace(/^download:/, '').replace(/^api-/, '');
                  if ('indexedDB' in window) {
                    const req = indexedDB.open('void-offline-downloads', 1);
                    req.onsuccess = () => {
                      const db = req.result;
                      if (db.objectStoreNames.contains('tracks')) {
                        const tx = db.transaction('tracks', 'readwrite');
                        tx.objectStore('tracks').delete(realId);
                        tx.oncomplete = () => {
                          db.close();
                          setTimeout(() => window.location.reload(), 100);
                        };
                      } else db.close();
                    };
                  }
                }
              };
              
              const res = c.deleteTrack(contextTrack);
              if (res instanceof Promise) {
                res.finally(finishDeletion);
              } else {
                finishDeletion();
              }
              c.setContextTrack(null); 
            }} data-testid="context-remove"><Trash2 size={15} />Remove from VOID</button>
          )}
          
          <div className="pg-sheet-foot"><button className="pg-btn" onClick={() => c.setContextTrack(null)} data-testid="button-close-track-menu">Close</button></div>
        </div>
      </div>
    )}
  </>;
}

export function PgNowPlaying({ core: c }: { core: VoidCore }) {
  if (!c.expanded) return null;
  const t = c.activeTrack;
  const { prefs } = c;
  const npProvider = t ? formatProviderLabel(t.source, t) : '';
  const npQuality = t ? getTrackQualityBadge(t) : undefined;
  return (
    <div className="pg-np" data-closing={c.closing ? '' : undefined} data-testid="now-playing-expanded">
      <div className="pg-np-scrim" aria-hidden="true" onMouseDown={c.closeExpanded} />
      <section className="pg-np-panel" role="dialog" aria-modal="true" aria-label="Now playing">
        <header className="pg-np-top">
          <button className="pg-icon-btn" aria-label="Close now playing" title="Close" onClick={c.closeExpanded} data-testid="button-close-expanded"><X /></button>
          <span className="pg-brand"><span className="pg-eclipse" /><span className="pg-brand-word">VOID</span></span>
          <div className="pg-np-end"><PgVolume volume={prefs.volume} muted={prefs.muted} onVolume={c.changeVolume} onToggleMute={c.toggleMute} buttonTestId="expanded-mute" inputTestId="expanded-volume" /></div>
        </header>
        {t ? (
          <div className="pg-np-body">
            <div className="pg-np-main">
              <div className="pg-np-art"><PgCover track={t} fill /></div>
              <div className="pg-np-meta">
                <div className="pg-np-info">
                  <div className="pg-np-titles">
                    <h1>{t.title}</h1>
                    <p>{t.artist}{t.album ? ` · ${t.album}` : ''}</p>
                    {npQuality && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <QualityBadge tier={npQuality} track={t} />
                      </div>
                    )}
                  </div>
                  <button className="pg-icon-btn" onClick={() => void c.toggleFavorite(t)} aria-label={t.favorite ? 'Remove favorite' : 'Add favorite'} title={t.favorite ? 'Remove favorite' : 'Add favorite'} data-testid="expanded-favorite"><Heart fill={t.favorite ? 'currentColor' : 'none'} /></button>
                </div>
                <input className="pg-range pg-range--np" type="range" min="0" max={c.duration || 0} step=".1" style={rangeStyle(c.duration ? c.position / c.duration : 0)}
                  value={Math.min(c.position, c.duration || 0)} aria-label="Now playing position" onChange={e => c.seekTo(Number(e.target.value))} data-testid="expanded-seek" />
                <div className="pg-np-times"><span>{fmtElapsed(c.position)}</span><span>{t.isLive ? 'LIVE' : fmt(c.duration)}</span></div>
                <div className="pg-np-controls">
                  <button className={`pg-icon-btn${prefs.shuffle ? ' is-on' : ''}`} aria-pressed={prefs.shuffle} aria-label="Shuffle" title="Shuffle" onClick={() => void c.updatePrefs({ ...prefs, shuffle: !prefs.shuffle })} data-testid="expanded-shuffle"><Shuffle /></button>
                  <div className="pg-np-transport">
                    <button className="pg-icon-btn" onClick={() => c.playRelative(-1)} aria-label="Previous track" title="Previous track" data-testid="expanded-previous"><SkipBack /></button>
                    <button className="pg-icon-btn pg-play" onClick={() => void c.togglePlay()} aria-label={c.isPlaying ? 'Pause' : 'Play'} title={c.isPlaying ? 'Pause' : 'Play'} data-testid="expanded-play"><PgPlayIcon playing={c.isPlaying} /></button>
                    <button className="pg-icon-btn" onClick={() => c.playRelative(1)} aria-label="Next track" title="Next track" data-testid="expanded-next"><SkipForward /></button>
                  </div>
                  <button className={`pg-icon-btn${prefs.repeat !== 'off' ? ' is-on' : ''}`} aria-pressed={prefs.repeat !== 'off'} aria-label={`Repeat ${prefs.repeat}`} title={`Repeat ${prefs.repeat}`} onClick={c.cycleRepeat} data-testid="expanded-repeat">{prefs.repeat === 'one' ? <Repeat1 /> : <Repeat />}</button>
                </div>
              </div>
            </div>
            <div className="pg-np-lyrics" data-empty={t.lyrics ? undefined : ''}>{t.lyrics || 'Lyrics unavailable'}</div>
          </div>
        ) : (
          <div className="pg-np-body pg-np-body--empty">
            <div className="pg-empty"><strong>Nothing playing just yet.</strong><p>Choose a song from your local library.</p>
              <button className="pg-btn pg-btn--ink" onClick={() => { c.closeExpanded(); c.setPageAndRoute('songs'); }} data-testid="button-browse-library">Browse library</button></div>
          </div>
        )}
        {t && <div className="pg-np-dock"><button className="pg-icon-btn" onClick={() => { c.closeExpanded(); c.setPageAndRoute('queue'); }} aria-label="Open queue" title="Open queue" data-testid="expanded-queue"><ListMusic /></button></div>}
      </section>
    </div>
  );
}
