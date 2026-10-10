import { Disc3, FileAudio, FolderOpen, Heart, ListMusic, ListPlus, Mic2, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { VoidCore } from '../core/voidCore';
import { PgCover, PgPlayIcon, PgVolume, countLabel, fmt, fmtElapsed, formatBytes, rangeStyle } from './parts';

const onBackdrop = (close: () => void) => (event: { target: unknown; currentTarget: unknown }) => {
  if (event.target === event.currentTarget) close();
};

export function PgOverlays({ core: c }: { core: VoidCore }) {
  const { contextTrack, modal } = c;
  const closeModal = () => c.setModal(null);

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
              if (c.allSearchResults[0]) { void c.playTrack(c.allSearchResults[0]); c.setPaletteOpen(false); }
              else if (c.musicResults[0]) c.setPaletteOpen(false);
              else if (c.albumSearchResults[0]) { c.setPaletteOpen(false); c.openCollection('album', c.albumSearchResults[0]); }
              else if (c.artistSearchResults[0]) { c.setPaletteOpen(false); c.openCollection('artist', c.artistSearchResults[0]); }
              else if (c.playlistSearchResults[0]) {
                const playlist = c.playlistSearchResults[0];
                c.setPaletteOpen(false); c.setPageAndRoute('playlists'); c.setDetail({ kind: 'playlist', name: playlist.name });
              }
            }} />
          <div className="pg-palette-results">
            {c.allSearchResults.map(track => (
              <button key={track.id} className="pg-result" onClick={() => { void c.playTrack(track); c.setPaletteOpen(false); }} data-testid={`search-result-${track.id}`}>
                <PgCover track={track} />
                <span className="pg-row-text"><span className="pg-row-name">{track.title}</span><span className="pg-row-artist">{track.artist} · {track.album}</span></span>
                <Play size={13} />
              </button>
            ))}
            {c.musicResults.map(track => (
              <button key={`saavn-${track.id}`} className="pg-result" data-testid={`search-music-${track.id}`}
                onClick={() => {
                  const remote = {
                    id: `saavn-${track.id}`, title: track.name, artist: track.artist, album: track.album, fileName: `${track.name}.mp4`,
                    audioUrl: track.downloadUrl, src: track.downloadUrl, image: track.image, duration: track.duration,
                  };
                  c.setPaletteOpen(false);
                  void c.playTrack(remote);
                }}>
                <PgCover track={{ image: track.image }} />
                <span className="pg-row-text"><span className="pg-row-name">{track.name}</span><span className="pg-row-artist">{track.artist}</span></span>
                <span className="pg-tag">JioSaavn</span>
              </button>
            ))}
            {c.albumSearchResults.map(name => (
              <button key={`album-${name}`} className="pg-result" onClick={() => { c.setPaletteOpen(false); c.openCollection('album', name); }} data-testid={`search-album-${name}`}>
                <Disc3 size={16} /><span className="pg-row-name">{name}</span><span className="pg-tag">Album</span>
              </button>
            ))}
            {c.artistSearchResults.map(name => (
              <button key={`artist-${name}`} className="pg-result" onClick={() => { c.setPaletteOpen(false); c.openCollection('artist', name); }} data-testid={`search-artist-${name}`}>
                <Mic2 size={16} /><span className="pg-row-name">{name}</span><span className="pg-tag">Artist</span>
              </button>
            ))}
            {c.playlistSearchResults.map(playlist => (
              <button key={playlist.id} className="pg-result" data-testid={`search-playlist-${playlist.id}`}
                onClick={() => { c.setPaletteOpen(false); c.setPageAndRoute('playlists'); c.setDetail({ kind: 'playlist', name: playlist.name }); c.setQuery(''); }}>
                <ListMusic size={16} /><span className="pg-row-name">{playlist.name}</span><span className="pg-tag">Playlist</span>
              </button>
            ))}
            {c.musicSearching && c.paletteQuery && <div className="pg-palette-note">Searching…</div>}
            {c.paletteQuery && !c.allSearchResults.length && !c.musicResults.length && !c.musicSearching && !c.albumSearchResults.length && !c.artistSearchResults.length && !c.playlistSearchResults.length && (
              <div className="pg-palette-note"><strong>No match in your library</strong><br />Try another title, artist or album.</div>
            )}
            {!c.paletteQuery && <div className="pg-palette-note">Search your local songs and the online catalog.</div>}
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
            <p>File information stored with your local library.</p>
            <dl className="pg-props">
              <dt>File</dt><dd>{contextTrack.fileName}</dd>
              <dt>Title</dt><dd>{contextTrack.title}</dd>
              <dt>Artist</dt><dd>{contextTrack.artist}</dd>
              <dt>Album</dt><dd>{contextTrack.album}</dd>
              <dt>Duration</dt><dd>{fmt(contextTrack.duration)}</dd>
              <dt>Format</dt><dd>{contextTrack.mimeType || 'Unknown'}</dd>
              <dt>Size</dt><dd>{formatBytes(contextTrack.fileSize)}</dd>
              <dt>Added</dt><dd>{new Date(contextTrack.importedAt).toLocaleString()}</dd>
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
          <h2>{contextTrack.title}</h2><p>{contextTrack.artist} · {contextTrack.fileName}</p>
          <button className="pg-result" onClick={() => { void c.playTrack(contextTrack); c.setContextTrack(null); }} data-testid="context-play"><Play size={15} />Play now</button>
          <button className="pg-result" onClick={() => { c.addToQueue(contextTrack); c.setContextTrack(null); }} data-testid="context-add-queue"><ListPlus size={15} />Add to queue</button>
          <button className="pg-result" onClick={() => { c.playNext(contextTrack); c.setContextTrack(null); }} data-testid="context-play-next"><SkipForward size={15} />Play next</button>
          <button className="pg-result" onClick={() => c.setModal('add-to-playlist')} data-testid="context-add-playlist"><ListMusic size={15} />Add to playlist</button>
          <button className="pg-result" onClick={() => { void c.toggleFavorite(contextTrack); c.setContextTrack(null); }} data-testid="context-favorite"><Heart size={15} />{contextTrack.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
          <button className="pg-result" onClick={() => c.openCollection('artist', contextTrack.artist)} data-testid="context-go-artist"><Mic2 size={15} />Go to artist</button>
          <button className="pg-result" onClick={() => c.openCollection('album', contextTrack.album)} data-testid="context-go-album"><Disc3 size={15} />Go to album</button>
          <button className="pg-result" onClick={() => c.setModal('properties')} data-testid="context-properties"><SlidersHorizontal size={15} />Properties</button>
          <button className="pg-result" onClick={() => { void c.deleteTrack(contextTrack); c.setContextTrack(null); }} data-testid="context-remove"><Trash2 size={15} />Remove from VOID</button>
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
                  <div className="pg-np-titles"><h1>{t.title}</h1><p>{t.artist} · {t.album}</p></div>
                  <button className="pg-icon-btn" onClick={() => void c.toggleFavorite(t)} aria-label={t.favorite ? 'Remove favorite' : 'Add favorite'} title={t.favorite ? 'Remove favorite' : 'Add favorite'} data-testid="expanded-favorite"><Heart fill={t.favorite ? 'currentColor' : 'none'} /></button>
                </div>
                <input className="pg-range pg-range--np" type="range" min="0" max={c.duration || 0} step=".1" style={rangeStyle(c.duration ? c.position / c.duration : 0)}
                  value={Math.min(c.position, c.duration || 0)} aria-label="Now playing position" onChange={e => c.seekTo(Number(e.target.value))} data-testid="expanded-seek" />
                <div className="pg-np-times"><span>{fmtElapsed(c.position)}</span><span>{fmt(c.duration)}</span></div>
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