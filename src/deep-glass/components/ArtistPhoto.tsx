import { memo, useEffect, useState } from 'react';
import { Mic2 } from 'lucide-react';
import type { Track } from '@/lib/library';
import { getStickyCoverUrl } from '../../api/arabicTrendingCatalog';
import { fetchArtistPhoto, getCachedArtistPhoto } from '../utils/artistPhotos';

export const ArtistPhoto = memo(function ArtistPhoto({
  artistName,
  fallbackTrack,
  square = false,
}: {
  artistName: string;
  fallbackTrack?: Track;
  square?: boolean;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => getCachedArtistPhoto(artistName));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    const cached = getCachedArtistPhoto(artistName);
    if (cached) {
      setPhotoUrl(cached);
      return () => {
        active = false;
      };
    }
    setPhotoUrl(null);
    fetchArtistPhoto(artistName).then(url => {
      if (active && url) setPhotoUrl(url);
    });
    return () => {
      active = false;
    };
  }, [artistName]);

  const fallbackImg =
    !photoUrl && fallbackTrack
      ? fallbackTrack.image || getStickyCoverUrl(fallbackTrack)
      : '';
  const finalUrl = photoUrl || fallbackImg || null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: square ? 'inherit' : '50%',
        overflow: 'hidden',
        background: 'hsl(var(--foreground) / .06)',
      }}
    >
      {!finalUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'hsl(var(--muted-foreground) / .45)',
          }}
        >
          <Mic2 size={28} strokeWidth={1.2} />
        </div>
      )}
      {finalUrl && (
        <img
          src={finalUrl}
          alt={artistName}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity .28s ease',
          }}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
});
