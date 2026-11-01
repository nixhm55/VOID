import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { TrendingLanguage } from '../../api/trendingApi';
import {
  getCachedTrendingCardArtistPhoto,
  resolveTrendingCardArtistPhoto,
  resolveTrendingCardWikiBg,
  trendingCardBgMemCache,
} from '../utils/artistPhotos';

export const TrendingLanguageCard = memo(function TrendingLanguageCard({
  lang,
  onSelect,
}: {
  lang: TrendingLanguage;
  onSelect: (langId: string) => void;
}) {
  const [artistUrl, setArtistUrl] = useState<string | null>(() =>
    getCachedTrendingCardArtistPhoto(lang)
  );
  const [artistLoaded, setArtistLoaded] = useState(false);
  const [artistRetried, setArtistRetried] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);
  const [wikiBgUrl, setWikiBgUrl] = useState<string | null>(
    () => trendingCardBgMemCache.get(lang.id) || null
  );
  const [bgLoaded, setBgLoaded] = useState(false);

  const bgCandidates = useMemo(() => {
    const list = [...(lang.bgFallbackUrls || [])];
    if (wikiBgUrl && !list.includes(wikiBgUrl)) list.push(wikiBgUrl);
    return list;
  }, [lang.bgFallbackUrls, wikiBgUrl]);

  const currentBgUrl = bgCandidates[bgIndex] || null;

  useEffect(() => {
    let active = true;
    setArtistRetried(false);
    const cached = getCachedTrendingCardArtistPhoto(lang);
    if (cached) {
      setArtistUrl(cached);
    } else {
      setArtistLoaded(false);
      resolveTrendingCardArtistPhoto(lang).then(url => {
        if (active && url) setArtistUrl(url);
      });
    }
    resolveTrendingCardWikiBg(lang).then(url => {
      if (active && url) setWikiBgUrl(url);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  return (
    <button
      type="button"
      className="trending-lang-card"
      onClick={() => onSelect(lang.id)}
      style={{ '--card-accent-bg': lang.accentGradient } as CSSProperties}
      aria-label={`${lang.label} — ${lang.subtitle}`}
      data-testid={`trending-lang-${lang.id}`}
    >
      <div className="trending-lang-card-bg-wrap" aria-hidden="true">
        {currentBgUrl && (
          <img
            src={currentBgUrl}
            alt=""
            className={`trending-lang-card-bg ${bgLoaded ? 'is-loaded' : ''}`}
            loading="eager"
            decoding="async"
            onLoad={() => setBgLoaded(true)}
            onError={() => {
              setBgLoaded(false);
              setBgIndex(i => i + 1);
            }}
          />
        )}
        <div className="trending-lang-card-atmosphere" />
      </div>

      {artistUrl && (
        <div className="trending-lang-card-artist-wrap" aria-hidden="true">
          <img
            src={artistUrl}
            alt={lang.artistName}
            className={`trending-lang-card-artist ${artistLoaded ? 'is-loaded' : ''}`}
            loading="eager"
            decoding="async"
            onLoad={() => setArtistLoaded(true)}
            onError={() => {
              setArtistLoaded(false);
              if (!artistRetried) {
                setArtistRetried(true);
                resolveTrendingCardArtistPhoto(lang, true).then(fallbackUrl => {
                  if (fallbackUrl && fallbackUrl !== artistUrl) {
                    setArtistUrl(fallbackUrl);
                  } else {
                    setArtistUrl(null);
                  }
                });
              } else {
                setArtistUrl(null);
              }
            }}
          />
        </div>
      )}

      <div className="trending-lang-card-scrim" aria-hidden="true" />

      <div className="trending-lang-card-copy">
        <strong className="trending-lang-card-title">{lang.label}</strong>
        <span className="trending-lang-card-subtitle">{lang.subtitle}</span>
      </div>
    </button>
  );
});
