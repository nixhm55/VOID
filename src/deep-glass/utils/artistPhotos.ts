import {
  areSameOrDuplicateArtist,
  isValidArtistAvatarUrl,
  normalizeArtistIdentityKey,
  scoreArtistAvatarUrl,
} from '../../api/artistCatalogApi';
import type { TrendingLanguage } from '../../api/trendingApi';

export const artistPhotoCache = new Map<string, string | null>();
export const artistPhotoListeners = new Set<() => void>();

export function getCachedArtistPhoto(artistName: string): string | null {
  if (!artistName) return null;
  const direct = artistPhotoCache.get(artistName);
  if (direct && isValidArtistAvatarUrl(direct)) return direct;
  const normKey = normalizeArtistIdentityKey(artistName);
  const byNorm = artistPhotoCache.get(normKey);
  if (byNorm && isValidArtistAvatarUrl(byNorm)) return byNorm;
  return null;
}

export function rememberArtistPhoto(artistName: string, imageUrl: string | null): void {
  const clean = artistName.trim();
  const normKey = normalizeArtistIdentityKey(clean);
  const validUrl = imageUrl && isValidArtistAvatarUrl(imageUrl) ? imageUrl.trim() : null;
  if (validUrl) {
    const existing = getCachedArtistPhoto(clean);
    if (!existing || scoreArtistAvatarUrl(validUrl) >= scoreArtistAvatarUrl(existing)) {
      artistPhotoCache.set(clean, validUrl);
      if (normKey) artistPhotoCache.set(normKey, validUrl);
      artistPhotoListeners.forEach(fn => fn());
    }
  } else if (!artistPhotoCache.has(clean)) {
    artistPhotoCache.set(clean, null);
    if (normKey && !artistPhotoCache.has(normKey)) artistPhotoCache.set(normKey, null);
  }
}

export function fetchArtistPhoto(artistName: string): Promise<string | null> {
  if (!artistName || artistName === 'Unknown Artist') return Promise.resolve(null);
  const existing = getCachedArtistPhoto(artistName);
  if (existing) return Promise.resolve(existing);
  const cleanName = artistName.trim();
  const normTarget = normalizeArtistIdentityKey(cleanName);
  if (artistPhotoCache.has(normTarget) && artistPhotoCache.get(normTarget) === null) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    const callbackName = 'dz_cb_' + Math.round(1000000 * Math.random());
    let resolved = false;
    (window as any)[callbackName] = (data: any) => {
      resolved = true;
      delete (window as any)[callbackName];
      const scriptEl = document.getElementById(callbackName);
      if (scriptEl) document.body.removeChild(scriptEl);
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        const candidates = data.data
          .map((a: any) => {
            const pic = String(a?.picture_xl || a?.picture_big || a?.picture_medium || '').trim();
            const avScore = scoreArtistAvatarUrl(pic);
            const nameMatch = areSameOrDuplicateArtist(String(a?.name || ''), cleanName) ? 1 : 0;
            return { artist: a, pic, avScore, nameMatch, fans: Number(a?.nb_fan) || 0 };
          })
          .filter((c: any) => c.avScore > 0)
          .sort(
            (a: any, b: any) =>
              b.nameMatch - a.nameMatch || b.avScore - a.avScore || b.fans - a.fans
          );

        const best = candidates[0];
        if (best && best.pic) {
          rememberArtistPhoto(artistName, best.pic);
          resolve(best.pic);
          return;
        }
      }
      void fallbackWiki();
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanName)}&output=jsonp&callback=${callbackName}`;
    document.body.appendChild(script);

    const fallbackWiki = async () => {
      try {
        const apiRes = await fetch(`/__void_api/artist-search?q=${encodeURIComponent(cleanName)}`);
        if (apiRes.ok) {
          const profiles = await apiRes.json();
          if (Array.isArray(profiles) && profiles.length > 0) {
            const valid = profiles.find((p: any) => isValidArtistAvatarUrl(p?.image));
            if (valid?.image) {
              rememberArtistPhoto(artistName, valid.image);
              resolve(valid.image);
              return;
            }
          }
        }
      } catch {}
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanName + ' musician')}&gsrlimit=1&prop=pageimages&pithumbsize=1000&format=json&origin=*`
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.query && wikiData.query.pages) {
            const pages = Object.values(wikiData.query.pages) as any[];
            if (pages.length > 0 && isValidArtistAvatarUrl(pages[0].thumbnail?.source)) {
              const imgUrl = pages[0].thumbnail.source;
              rememberArtistPhoto(artistName, imgUrl);
              resolve(imgUrl);
              return;
            }
          }
        }
      } catch {}
      rememberArtistPhoto(artistName, null);
      resolve(null);
    };

    setTimeout(() => {
      if (!resolved) {
        delete (window as any)[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) document.body.removeChild(scriptEl);
        void fallbackWiki();
      }
    }, 4000);
  });
}

export const TRENDING_CARD_ARTIST_STORAGE_KEY = 'void-trending-card-artist-hd-v13:';
export const TRENDING_CARD_BG_STORAGE_KEY = 'void-trending-card-bg-v9:';
export const trendingCardArtistMemCache = new Map<string, string>();
export const trendingCardBgMemCache = new Map<string, string>();

export function getCachedTrendingCardArtistPhoto(lang: TrendingLanguage): string | null {
  const mem = trendingCardArtistMemCache.get(lang.id);
  if (mem && isValidArtistAvatarUrl(mem)) return mem;
  try {
    const stored = localStorage.getItem(`${TRENDING_CARD_ARTIST_STORAGE_KEY}${lang.id}`);
    if (stored && isValidArtistAvatarUrl(stored)) {
      trendingCardArtistMemCache.set(lang.id, stored);
      return stored;
    }
  } catch {}
  if (
    lang.preferWikiArtistPortrait &&
    lang.artistPortraitUrl &&
    isValidArtistAvatarUrl(lang.artistPortraitUrl)
  ) {
    return lang.artistPortraitUrl;
  }
  return null;
}

export function saveTrendingCardArtistPhoto(lang: TrendingLanguage, url: string): void {
  if (!url || !isValidArtistAvatarUrl(url)) return;
  const clean = url.trim();
  trendingCardArtistMemCache.set(lang.id, clean);
  rememberArtistPhoto(lang.artistName, clean);
  try {
    localStorage.setItem(`${TRENDING_CARD_ARTIST_STORAGE_KEY}${lang.id}`, clean);
  } catch {}
}

export async function resolveTrendingCardArtistPhoto(
  lang: TrendingLanguage,
  skipStaticUrl = false
): Promise<string | null> {
  if (!skipStaticUrl) {
    const existing = getCachedTrendingCardArtistPhoto(lang);
    if (existing) return existing;
    if (
      lang.preferWikiArtistPortrait &&
      lang.artistPortraitUrl &&
      isValidArtistAvatarUrl(lang.artistPortraitUrl)
    ) {
      saveTrendingCardArtistPhoto(lang, lang.artistPortraitUrl);
      return lang.artistPortraitUrl;
    }
  }

  if (lang.id === 'arabic') {
    try {
      const res = await fetch(
        `/__void_api/itunes-search?term=${encodeURIComponent('بسمتك يا زين تسوى الف بسمه ميحد حمد')}&country=ae&entity=song&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        const items: any[] = Array.isArray(data?.results) ? data.results : [];
        for (const item of items) {
          const rawArt = String(item?.artworkUrl100 || '').trim();
          if (rawArt) {
            const hiRes = rawArt.replace('100x100bb', '1000x1000bb');
            if (isValidArtistAvatarUrl(hiRes)) {
              saveTrendingCardArtistPhoto(lang, hiRes);
              return hiRes;
            }
          }
        }
      }
    } catch {}
  }

  if (!lang.preferWikiArtistPortrait) {
    for (const candidateName of [lang.artistName, ...(lang.artistAliases || [])]) {
      const primary = await fetchArtistPhoto(candidateName);
      if (primary && isValidArtistAvatarUrl(primary)) {
        saveTrendingCardArtistPhoto(lang, primary);
        return primary;
      }
    }
    if (
      !skipStaticUrl &&
      lang.artistPortraitUrl &&
      isValidArtistAvatarUrl(lang.artistPortraitUrl)
    ) {
      saveTrendingCardArtistPhoto(lang, lang.artistPortraitUrl);
      return lang.artistPortraitUrl;
    }
  }

  const wikiLangs = lang.wikiArtistLang ? [lang.wikiArtistLang, 'en'] : ['en'];
  const wikiTitles = Array.from(
    new Set([lang.wikiArtistTitle, lang.artistName, ...(lang.artistAliases || [])].filter(Boolean))
  );
  for (const wLang of wikiLangs) {
    for (const title of wikiTitles) {
      try {
        const wikiRes = await fetch(
          `https://${wLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&redirects=1&prop=pageimages&pithumbsize=960&format=json&origin=*`
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const pages = wikiData?.query?.pages
            ? (Object.values(wikiData.query.pages) as any[])
            : [];
          for (const page of pages) {
            const src = String(page?.thumbnail?.source || '').trim();
            if (
              isValidArtistAvatarUrl(src) &&
              !/stamp_of_india|postage|flag_of|commons-logo/i.test(src)
            ) {
              saveTrendingCardArtistPhoto(lang, src);
              return src;
            }
          }
        }
      } catch {}
    }
  }

  for (const candidateName of [lang.artistName, ...(lang.artistAliases || [])]) {
    const primary = await fetchArtistPhoto(candidateName);
    if (primary && isValidArtistAvatarUrl(primary)) {
      saveTrendingCardArtistPhoto(lang, primary);
      return primary;
    }
  }

  return null;
}

export async function resolveTrendingCardWikiBg(lang: TrendingLanguage): Promise<string | null> {
  const mem = trendingCardBgMemCache.get(lang.id);
  if (mem) return mem;
  try {
    const stored = localStorage.getItem(`${TRENDING_CARD_BG_STORAGE_KEY}${lang.id}`);
    if (stored && /^https?:\/\//i.test(stored)) {
      trendingCardBgMemCache.set(lang.id, stored);
      return stored;
    }
  } catch {}
  if (!lang.bgWikiTitle) return null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(lang.bgWikiTitle)}&redirects=1&prop=pageimages&pithumbsize=1200&format=json&origin=*`
    );
    if (res.ok) {
      const data = await res.json();
      const pages = data?.query?.pages ? (Object.values(data.query.pages) as any[]) : [];
      for (const page of pages) {
        const src = String(page?.thumbnail?.source || '').trim();
        if (/^https?:\/\//i.test(src)) {
          trendingCardBgMemCache.set(lang.id, src);
          try {
            localStorage.setItem(`${TRENDING_CARD_BG_STORAGE_KEY}${lang.id}`, src);
          } catch {}
          return src;
        }
      }
    }
  } catch {}
  return null;
}
