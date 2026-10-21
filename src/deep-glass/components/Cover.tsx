import { memo, useEffect, useState } from 'react';
import { Disc3, ListMusic } from 'lucide-react';
import {
  computeAutoFitCoverScale,
  getCachedCoverScale,
  getStickyCoverUrl,
  isCoverUrlLoaded,
  markCoverUrlLoaded,
  rememberStickyCover,
} from '../../api/arabicTrendingCatalog';

export const Cover = memo(
  function Cover({
    track,
    large = false,
    kind = 'disc',
    identity,
  }: {
    track?: any;
    large?: boolean;
    kind?: 'disc' | 'list';
    identity?: string;
  }) {
    const stickyRemoteUrl = track ? getStickyCoverUrl(track) : '';
    const [blobSrc, setBlobSrc] = useState<string | null>(null);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const finalSrc = stickyRemoteUrl || blobSrc;
    const [fitScale, setFitScale] = useState<number>(() => getCachedCoverScale(finalSrc, track));

    useEffect(() => {
      setFitScale(getCachedCoverScale(finalSrc, track));
    }, [finalSrc, track]);

    useEffect(() => {
      if (!track) {
        setBlobSrc(null);
        return;
      }
      if (stickyRemoteUrl) {
        rememberStickyCover(track, stickyRemoteUrl);
        setBlobSrc(null);
        return;
      }
      if (!track.artwork || !(track.artwork instanceof Blob || track.artwork instanceof File)) {
        setBlobSrc(null);
        return;
      }
      let active = true;
      const url = URL.createObjectURL(track.artwork);
      if (active) setBlobSrc(url);
      return () => {
        active = false;
        URL.revokeObjectURL(url);
      };
    }, [track, stickyRemoteUrl, track?.artwork, track?.id]);

    const failed = Boolean(finalSrc && failedUrl === finalSrc);
    const Glyph = kind === 'list' ? ListMusic : Disc3;

    return (
      <div
        className={large ? 'cover-large' : 'cover-mini'}
        data-testid={large ? 'cover-artwork' : 'cover-thumbnail'}
      >
        {finalSrc && !failed ? (
          <img
            src={finalSrc}
            alt={`${track?.album ?? 'Album'} artwork`}
            className="loaded"
            style={{ opacity: 1, transform: fitScale > 1.005 ? `scale(${fitScale})` : undefined }}
            decoding="async"
            onLoad={e => {
              markCoverUrlLoaded(finalSrc);
              void isCoverUrlLoaded(finalSrc);
              const computed = computeAutoFitCoverScale(
                e.currentTarget,
                finalSrc,
                track,
                asyncScale => {
                  setFitScale(prev => (Math.abs(asyncScale - prev) > 0.01 ? asyncScale : prev));
                }
              );
              if (Math.abs(computed - fitScale) > 0.01) setFitScale(computed);
            }}
            onError={() => {
              setFailedUrl(finalSrc);
            }}
          />
        ) : (
          <Glyph aria-hidden="true" />
        )}
      </div>
    );
  },
  (a, b) =>
    a.large === b.large &&
    a.kind === b.kind &&
    a.identity === b.identity &&
    a.track?.artwork === b.track?.artwork &&
    a.track?.image === b.track?.image &&
    a.track?.id === b.track?.id &&
    a.track?.album === b.track?.album &&
    a.track?.artist === b.track?.artist &&
    a.track?.source === b.track?.source
);
