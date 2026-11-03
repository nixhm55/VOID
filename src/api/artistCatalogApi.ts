/**
 * Unified Artist Discovery, Canonical Name/Portrait Resolution, Smart Artist Deduplication
 * (Avatar-Priority Merging) & Dynamic Top Songs Engine for VOID Music Player.
 *
 * Aggregates artist profiles and ranked discographies from:
 * 1. Deezer Official Artist Chart API (`/search/artist` & `/artist/:id/top?limit=100`)
 * 2. Apple Music / iTunes Artist & Song Lookup API (`/search?entity=musicArtist` & `/lookup?entity=song&limit=200`)
 * 3. JioSaavn High-Bitrate 320kbps Catalog (`/api/search/songs`)
 * 4. Wikipedia / YouTube Music fallback enrichment
 */

import {
  type QualityTier,
  cleanCanonicalTrackTitle,
  deduplicateTrackCollection,
  detectTrackQuality,
} from './quality';
import { type TrendingTrackItem } from './trendingApi';
import {
  TOP_40_ARABIC_ARTISTS,
  normalizeArabicText,
  normalizeLatinArtistOrTitle,
} from './arabicTrendingCatalog';
import { MULTI_LANG_TOP_40_ARTISTS } from './multiLangTrendingCatalog';

export interface CanonicalArtistProfile {
  id: string;
  name: string;
  image: string;
  fans?: number;
  deezerId?: number;
  itunesId?: number;
}

const ARTIST_TOP100_CACHE_PREFIX = 'void-artist-top100-v5:';
const JIOSAAVN_API_BASE = 'https://elitejiosaavn-api.vercel.app/api';
const memoryArtistSearchCache = new Map<string, CanonicalArtistProfile[]>();
const memoryArtistTop100Cache = new Map<string, TrendingTrackItem[]>();

export function stripDiacritics(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const temp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = temp;
    }
  }
  return dp[a.length];
}

/**
 * Validates whether an artist image URL is a genuine, non-placeholder portrait.
 */
export function isValidArtistAvatarUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return false;
  if (
    /\/images\/artist\/\/|default[_-]?artist|artist[_-]?default|placeholder|no[_-]?image|blank|mystery|avatar[_-]?default|d41d8cd98f00b204e9800998ecf8427e/i.test(
      clean
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Scores an artist avatar URL so Avatar-Priority merging always keeps the highest-resolution
 * valid portrait (`picture_xl` / 1000x1000 > `picture_big` / 600x600 / 500x500 > standard > missing/placeholder).
 */
export function scoreArtistAvatarUrl(url?: string | null): number {
  if (!isValidArtistAvatarUrl(url)) return 0;
  const clean = String(url).trim().toLowerCase();
  if (/1000x1000|picture_xl|1200x1200/i.test(clean)) return 100;
  if (/600x600|500x500|picture_big|800x800/i.test(clean)) return 85;
  if (/250x250|300x300|picture_medium/i.test(clean)) return 60;
  return 45;
}

/**
 * Normalizes an artist name into a canonical identity key (collapsing initials like "A. R. Rahman" -> "ar rahman",
 * case differences, and extra spaces).
 */
export function normalizeArtistIdentityKey(rawName: string): string {
  const base = stripDiacritics(rawName)
    .replace(/\b([a-z])\.\s*(?=[a-z]\.)/g, '$1')
    .replace(/\b([a-z])\.\s+/g, '$1 ')
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base;
}

/**
 * Chooses the cleanest, most official display spelling between two duplicate artist names
 * (e.g., "Michael Jackson" over "michael jackson" or "MICHAEL JACKSON").
 */
export function pickCanonicalArtistDisplayName(nameA: string, nameB: string): string {
  const a = String(nameA || '').trim();
  const b = String(nameB || '').trim();
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;

  const scoreName = (s: string): number => {
    let score = 0;
    const words = s.split(/\s+/);
    const isTitleCase = words.every(w => /^[A-Z\u0600-\u06FF]/.test(w));
    const isAllLower = s === s.toLowerCase() && /[a-z]/.test(s);
    const isAllUpper = s === s.toUpperCase() && /[A-Z]{3,}/.test(s);
    if (isTitleCase) score += 30;
    if (isAllLower) score -= 25;
    if (isAllUpper) score -= 20;
    // Prefer properly spaced initials like "A. R. Rahman" or clean full names
    if (words.length >= 2) score += 10;
    return score;
  };

  return scoreName(b) > scoreName(a) ? b : a;
}

/**
 * Checks if a candidate artist string is a compound/collaboration string
 * (e.g., "Amr Diab & Orange", "Amr Diab-Khalied", "عمرو دياب · Amr Diab").
 */
export function isCompoundArtistString(name: string): boolean {
  const clean = String(name || '').trim();
  if (!clean) return true;
  if (/[&,;|/·]/.test(clean)) return true;
  if (/\s+[-–—]\s+|(?=[A-Za-z])[-–—](?=[A-Za-z])/.test(clean)) return true;
  if (/\b(?:feat\.?|ft\.?|with|and|vs\.?|x|presents)\b/i.test(clean)) return true;
  return false;
}

/**
 * Checks if two artist names refer to the same artist (handling typos like
 * "Amro Diab" vs "Amr Diab", "Micheal Jackson" vs "Michael Jackson", "A.R. Rahman" vs "A. R. Rahman", etc.).
 */
export function areSameOrDuplicateArtist(aRaw: string, bRaw: string): boolean {
  const a = normalizeArtistIdentityKey(aRaw);
  const b = normalizeArtistIdentityKey(bRaw);

  if (!a || !b) return true;
  if (a === b) return true;
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return true;

  if (Math.max(a.length, b.length) >= 5 && editDistance(a, b) <= 2) {
    return true;
  }

  const aTokens = a.split(' ');
  const bTokens = b.split(' ');
  if (aTokens.length === bTokens.length && aTokens.length >= 2) {
    const allTokensClose = aTokens.every((tok, i) => editDistance(tok, bTokens[i]) <= 1);
    if (allTokensClose) return true;
  }

  return false;
}

/**
 * Smart Artist Deduplication with Avatar-Priority Merging for CanonicalArtistProfile lists.
 * Ensures only one unique, canonical artist profile exists per artist name, prioritizing
 * profiles with a valid, high-resolution photo/avatar (`picture_xl` / HD source) and discarding
 * duplicate profiles with missing, generic, or placeholder avatars.
 */
export function deduplicateArtistProfiles<
  T extends { name: string; image?: string | null; fans?: number }
>(profiles: T[]): T[] {
  const merged: T[] = [];

  for (const candidate of profiles) {
    const rawName = String(candidate?.name || '').trim();
    if (!rawName || rawName.length < 2 || isCompoundArtistString(rawName)) continue;

    const candAvatarScore = scoreArtistAvatarUrl(candidate.image);
    const cleanCandidate: T = {
      ...candidate,
      name: rawName,
      image: candAvatarScore > 0 ? String(candidate.image).trim() : '',
    };

    const dupIdx = merged.findIndex(existing =>
      areSameOrDuplicateArtist(existing.name, cleanCandidate.name)
    );

    if (dupIdx === -1) {
      merged.push(cleanCandidate);
    } else {
      const existing = merged[dupIdx];
      const exAvatarScore = scoreArtistAvatarUrl(existing.image);
      const bestName = pickCanonicalArtistDisplayName(existing.name, cleanCandidate.name);

      // Avatar-Priority: keep the profile with a valid high-res avatar; use fan count as tie-breaker
      if (
        candAvatarScore > exAvatarScore ||
        (candAvatarScore === exAvatarScore && (cleanCandidate.fans || 0) > (existing.fans || 0))
      ) {
        merged[dupIdx] = {
          ...existing,
          ...cleanCandidate,
          name: bestName,
          image: cleanCandidate.image || existing.image || '',
          fans: Math.max(existing.fans || 0, cleanCandidate.fans || 0),
        };
      } else {
        merged[dupIdx] = {
          ...existing,
          name: bestName,
          image: existing.image || cleanCandidate.image || '',
          fans: Math.max(existing.fans || 0, cleanCandidate.fans || 0),
        };
      }
    }
  }

  return merged;
}

/**
 * Deduplicates a list of artist names across the app using Smart Artist Deduplication & Avatar Priority.
 * Merges duplicate names (e.g. "Michael Jackson" & "michael jackson") and prioritizes the entry
 * with a valid high-resolution avatar.
 */
export function deduplicateArtistNames(
  names: string[],
  getAvatarUrl?: (name: string) => string | null | undefined,
  getSongCount?: (name: string) => number
): string[] {
  const canonicalList: string[] = [];

  for (const rawName of names) {
    const clean = String(rawName || '').trim();
    if (!clean || clean.length < 2) continue;

    const dupIdx = canonicalList.findIndex(existing => areSameOrDuplicateArtist(existing, clean));
    if (dupIdx === -1) {
      canonicalList.push(clean);
    } else {
      const existing = canonicalList[dupIdx];
      const exAvatarScore = scoreArtistAvatarUrl(getAvatarUrl?.(existing));
      const candAvatarScore = scoreArtistAvatarUrl(getAvatarUrl?.(clean));
      const exSongs = getSongCount?.(existing) ?? 0;
      const candSongs = getSongCount?.(clean) ?? 0;

      if (candAvatarScore > exAvatarScore) {
        canonicalList[dupIdx] = clean;
      } else if (candAvatarScore === exAvatarScore) {
        const preferred = pickCanonicalArtistDisplayName(existing, clean);
        canonicalList[dupIdx] = preferred === clean && candSongs >= exSongs ? clean : preferred;
      }
    }
  }

  return canonicalList;
}

/**
 * Checks whether an artist name matches the user's search query, allowing
 * prefix matches ("michael" -> "Michael Jackson") and 1-2 character typos
 * ("micheal jackson" -> "Michael Jackson", "amro diab" -> "Amr Diab") while
 * rejecting unrelated words ("Amor de Días", "AMIR DIBA").
 */
export function doesArtistMatchQuery(artistName: string, query: string): {
  matches: boolean;
  exactOrPrefix: boolean;
  score: number;
} {
  const normName = stripDiacritics(artistName)
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normQuery = stripDiacritics(query)
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normName || !normQuery) return { matches: false, exactOrPrefix: false, score: 0 };

  if (normName === normQuery) {
    return { matches: true, exactOrPrefix: true, score: 1000 };
  }

  if (normName.startsWith(normQuery + ' ') || normName.startsWith(normQuery)) {
    return { matches: true, exactOrPrefix: true, score: 900 };
  }

  const nameTokens = normName.split(' ').filter(Boolean);
  const queryTokens = normQuery.split(' ').filter(Boolean);

  // Every query token is a prefix of a name token (e.g. "michael" -> "Michael Jackson", "amr d" -> "Amr Diab")
  const allPrefix = queryTokens.every(qt => nameTokens.some(nt => nt.startsWith(qt)));
  if (allPrefix) {
    const firstTokenMatches =
      nameTokens[0]?.startsWith(queryTokens[0]) ||
      nameTokens.some(nt => nt === queryTokens[0]);
    if (firstTokenMatches) {
      return { matches: true, exactOrPrefix: true, score: 820 };
    }
  }

  // Typo tolerance: e.g. "micheal jackson" -> "michael jackson"
  if (queryTokens.length === nameTokens.length) {
    const tokenDistances = queryTokens.map((qt, idx) => {
      const nt = nameTokens[idx];
      if (nt.startsWith(qt)) return 0;
      if (qt.length >= 4 && nt.length >= 4) {
        if (qt[0] === nt[0] && editDistance(qt, nt) <= 2) return editDistance(qt, nt);
      }
      return 99;
    });
    const maxDist = Math.max(...tokenDistances);
    const totalDist = tokenDistances.reduce((a, b) => a + b, 0);
    if (maxDist <= 2 && totalDist <= 2) {
      return { matches: true, exactOrPrefix: false, score: 700 - totalDist * 50 };
    }
  }

  return { matches: false, exactOrPrefix: false, score: 0 };
}

/**
 * Searches for canonical solo/official artists matching `query` via the local Vite
 * server endpoint `/__void_api/artist-search` with Smart Artist Deduplication & Avatar Priority.
 */
export async function searchCanonicalArtists(
  query: string,
  signal?: AbortSignal,
  onPhotoResolved?: (name: string, imageUrl: string) => void
): Promise<CanonicalArtistProfile[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const cacheKey = normalizeArtistIdentityKey(cleanQuery);
  if (memoryArtistSearchCache.has(cacheKey)) {
    const cached = memoryArtistSearchCache.get(cacheKey)!;
    if (onPhotoResolved) {
      for (const item of cached) {
        if (isValidArtistAvatarUrl(item.image)) onPhotoResolved(item.name, item.image);
      }
    }
    return cached;
  }

  try {
    const res = await fetch(`/__void_api/artist-search?q=${encodeURIComponent(cleanQuery)}`, {
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const deduped = deduplicateArtistProfiles(data as CanonicalArtistProfile[]).filter(p =>
          isValidArtistAvatarUrl(p.image)
        );
        memoryArtistSearchCache.set(cacheKey, deduped);
        if (onPhotoResolved) {
          for (const item of deduped) {
            if (isValidArtistAvatarUrl(item.image)) onPhotoResolved(item.name, item.image);
          }
        }
        return deduped;
      }
    }
  } catch {
    if (signal?.aborted) return [];
  }

  return [];
}

function isVerifiedFullJioSaavnItem(item: any): boolean {
  const url = String(item?.audioUrl || item?.downloadUrl || item?.src || '').trim();
  if (!url.startsWith('http')) return false;
  if (
    url.startsWith('trending-resolve://') ||
    url.startsWith('yt-stream://') ||
    url.includes('/__void_api/yt-audio') ||
    url.includes('itunes.apple.com') ||
    url.includes('mzstatic.com') ||
    url.includes('dzcdn.net')
  ) {
    return false;
  }
  const source = String(item?.source || 'JioSaavn').toLowerCase();
  if (source.includes('youtube')) return false;
  const duration = Number(item?.duration) || 0;
  if (duration > 0 && duration < 60) return false;
  return true;
}

function readCachedArtistTop100(artistName: string): TrendingTrackItem[] | null {
  const key = normalizeArtistIdentityKey(artistName);
  if (memoryArtistTop100Cache.has(key)) {
    return memoryArtistTop100Cache.get(key)!;
  }
  try {
    const raw = localStorage.getItem(ARTIST_TOP100_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items) && parsed.items.length >= 1) {
      const validOnly = (parsed.items as TrendingTrackItem[]).filter(isVerifiedFullJioSaavnItem);
      if (validOnly.length === 0) return null;
      const deduped = deduplicateTrackCollection(validOnly, {
        ignoreArtist: true,
        cleanTitles: true,
      }).map((item, idx) => ({
        ...item,
        trendingRank: idx + 1,
      }));
      memoryArtistTop100Cache.set(key, deduped);
      return deduped;
    }
  } catch {
    /* ignore storage errors */
  }
  return null;
}

function writeCachedArtistTop100(artistName: string, items: TrendingTrackItem[]): void {
  const validOnly = items.filter(isVerifiedFullJioSaavnItem);
  if (validOnly.length === 0) return;
  const key = normalizeArtistIdentityKey(artistName);
  memoryArtistTop100Cache.set(key, validOnly);
  try {
    localStorage.setItem(
      ARTIST_TOP100_CACHE_PREFIX + key,
      JSON.stringify({ updatedAt: Date.now(), items: validOnly })
    );
  } catch {
    /* ignore storage quota */
  }
}

export function getInitialArtistTop100(artistName: string): TrendingTrackItem[] {
  return readCachedArtistTop100(artistName) || [];
}

function decodeHtmlEntities(input: string): string {
  return String(input || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function normalizePhoneticArtistMatch(input: string): string {
  return normalizeLatinArtistOrTitle(input)
    .replace(/\b(mehad|mihed|maihad|mihad|mahad)\b/g, 'mehad')
    .replace(/\b(hamad|hamed|ahmed|ahmad)\b/g, 'hamad')
    .replace(/\b(ilaiyaraaja|ilayaraja)\b/g, 'ilaiyaraaja')
    .trim();
}

async function fetchDirectJioSaavnArtistSongsClient(
  rawArtistName: string,
  signal?: AbortSignal
): Promise<TrendingTrackItem[]> {
  const parts = String(rawArtistName || '')
    .split(/\s*[·|]\s*/)
    .map(p => p.trim())
    .filter(Boolean);

  const matchedArabicSeed = TOP_40_ARABIC_ARTISTS.find(seed => {
    const seedAr = normalizeArabicText(seed.artistAr);
    const seedEn = normalizePhoneticArtistMatch(seed.artistEn);
    const seedAliases = seed.aliasesEn.map(normalizePhoneticArtistMatch);
    return parts.some(p => {
      const pAr = normalizeArabicText(p);
      const pEn = normalizePhoneticArtistMatch(p);
      return (pAr && seedAr && pAr === seedAr) || (pEn && (pEn === seedEn || seedAliases.includes(pEn)));
    });
  });

  const extraAliases: string[] = [];
  if (matchedArabicSeed) {
    extraAliases.push(matchedArabicSeed.artistEn, matchedArabicSeed.artistAr, ...matchedArabicSeed.aliasesEn);
    if (normalizePhoneticArtistMatch(matchedArabicSeed.artistEn) === 'mehad hamad') {
      extraAliases.push('Mihed Hamad', 'Maihad Hamad', 'Mihad Hamad');
    }
  }

  for (const config of Object.values(MULTI_LANG_TOP_40_ARTISTS)) {
    for (const seed of config.artists) {
      const seedNorm = normalizePhoneticArtistMatch(seed.name);
      const aliasNorms = (seed.aliases || []).map(normalizePhoneticArtistMatch);
      if (parts.some(p => {
        const pNorm = normalizePhoneticArtistMatch(p);
        return pNorm && (pNorm === seedNorm || aliasNorms.includes(pNorm));
      })) {
        extraAliases.push(seed.name, ...(seed.aliases || []));
      }
    }
  }

  const allAliases = Array.from(
    new Set(
      [
        ...extraAliases,
        ...parts,
        ...parts.map(p => p.replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim()),
        ...parts.map(p => p.replace(/\./g, '').replace(/\s+/g, ' ').trim()),
      ].filter(Boolean)
    )
  );

  const displayArtist =
    matchedArabicSeed?.artistEn ||
    allAliases.find(a => /[A-Za-z]/.test(a) && !/[\u0600-\u06FF]/.test(a)) ||
    parts[0] ||
    rawArtistName;

  const isArabicArtist =
    Boolean(matchedArabicSeed) || allAliases.some(a => /[\u0600-\u06FF]/.test(a));

  const targetArList = Array.from(
    new Set(allAliases.filter(a => /[\u0600-\u06FF]/.test(a)).map(normalizeArabicText).filter(Boolean))
  );
  const targetEnList = Array.from(
    new Set(allAliases.map(normalizePhoneticArtistMatch).filter(Boolean))
  );

  const doesJioSongMatch = (song: any): boolean => {
    const pList: any[] = Array.isArray(song?.artists?.primary) ? song.artists.primary : [];
    const aList: any[] = Array.isArray(song?.artists?.all) ? song.artists.all : [];
    const combinedNames = [
      ...pList.map(a => decodeHtmlEntities(String(a?.name || ''))),
      ...aList.map(a => decodeHtmlEntities(String(a?.name || ''))),
      ...String(song?.primaryArtists || '').split(',').map(s => decodeHtmlEntities(s)),
    ].filter(Boolean);

    return combinedNames.some(cand => {
      const cAr = normalizeArabicText(cand);
      for (const tAr of targetArList) {
        if (tAr.length >= 3 && cAr.includes(tAr)) return true;
        const tTokens = tAr.split(' ').filter(w => w.length >= 2);
        const cTokens = cAr.split(' ').filter(w => w.length >= 2);
        if (tTokens.length >= 2 && tTokens.every(t => cTokens.includes(t))) return true;
      }
      const cEn = normalizePhoneticArtistMatch(cand);
      if (!cEn) return false;
      const cEnTokens = cEn.split(' ').filter(Boolean);
      for (const tEn of targetEnList) {
        if (!tEn) continue;
        if (cEn === tEn || cEn.includes(tEn)) return true;
        const tEnTokens = tEn.split(' ').filter(w => w.length >= 2);
        if (tEnTokens.length >= 2 && tEnTokens.every(t => cEnTokens.includes(t))) return true;
        if (tEnTokens.length === 1 && tEnTokens[0].length >= 3 && cEnTokens.includes(tEnTokens[0])) return true;
      }
      return false;
    });
  };

  const searchQueries = Array.from(
    new Set([displayArtist, ...allAliases].filter(q => q.length >= 2))
  ).slice(0, 5);

  const pageTasks: Promise<any[]>[] = [];
  searchQueries.forEach((q, idx) => {
    const pages = idx < 2 ? [1, 2, 3] : [1];
    for (const page of pages) {
      pageTasks.push(
        fetch(`${JIOSAAVN_API_BASE}/search/songs?query=${encodeURIComponent(q)}&page=${page}&limit=40`, {
          signal,
        })
          .then(r => (r.ok ? r.json() : null))
          .then(json =>
            Array.isArray(json?.data?.results)
              ? json.data.results
              : Array.isArray(json?.results)
                ? json.results
                : []
          )
          .catch(() => [])
      );
    }
  });

  const settledPages = await Promise.allSettled(pageTasks);
  const rawSongs = settledPages.flatMap(s => (s.status === 'fulfilled' ? s.value : []));
  rawSongs.sort((a, b) => (Number(b?.playCount) || 0) - (Number(a?.playCount) || 0));

  const seenIds = new Set<string>();
  const out: TrendingTrackItem[] = [];

  for (const song of rawSongs) {
    const rawId = String(song?.id || '').trim();
    if (!rawId || seenIds.has(rawId)) continue;
    seenIds.add(rawId);

    const duration = Number(song?.duration) || 0;
    if (duration < 60 || duration > 1200) continue;

    if (!doesJioSongMatch(song)) continue;

    const songLang = String(song?.language || '').toLowerCase().trim();
    const rawTitle = decodeHtmlEntities(String(song?.name || song?.title || ''));
    const rawAlbum = decodeHtmlEntities(String(song?.album?.name || ''));
    if (isArabicArtist) {
      if (/[\u0900-\u0D7F]/.test(`${rawTitle} ${rawAlbum}`)) continue;
      if (songLang && songLang !== 'arabic' && songLang !== 'english' && songLang !== 'unknown') continue;
    }

    const cleanTitle = cleanCanonicalTrackTitle(rawTitle);
    if (!cleanTitle) continue;
    if (/\b(?:karaoke|tribute|ringtone|8d audio|instrumental version|made famous by|in the style of)\b/i.test(`${cleanTitle} ${rawAlbum}`)) {
      continue;
    }

    const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
    const best = urls.find(u => u?.quality === '320kbps') || urls[urls.length - 1];
    const bestUrl = String(best?.url || best?.link || '').trim();
    if (!bestUrl.startsWith('http')) continue;

    const fallbacks = urls
      .map(u => String(u?.url || u?.link || '').trim())
      .filter(u => u.startsWith('http') && u !== bestUrl);

    const imgs: any[] = Array.isArray(song?.image) ? song.image : [];
    const bestImg = String(
      imgs.find(i => i?.quality === '500x500')?.url || imgs[imgs.length - 1]?.url || ''
    ).trim();

    const idx = out.length;
    out.push({
      id: `api-${rawId}`,
      title: cleanTitle,
      name: cleanTitle,
      artist: displayArtist,
      album: cleanCanonicalTrackTitle(rawAlbum || `${displayArtist} Essentials`),
      fileName: `${cleanTitle}.m4a`,
      fileSize: 0,
      importedAt: Date.now() - idx * 1000,
      audioUrl: bestUrl,
      downloadUrl: bestUrl,
      src: bestUrl,
      image: bestImg,
      duration,
      source: 'JioSaavn',
      qualityBadge: 'Very High (320kbps)',
      bitrate: 320,
      codec: 'AAC',
      mimeType: 'audio/mp4',
      format: 'MP4 (320kbps)',
      qualityVerified: true,
      fallbackUrls: fallbacks.length > 0 ? fallbacks : undefined,
      trendingRank: idx + 1,
      trendingScore: 1000 - idx * 5,
    });
  }

  return out;
}

/**
 * Fetches an artist's Top Songs strictly from verified full-length JioSaavn 320kbps streams
 * (never 30-second previews, never YouTube), ranked by global popularity and play count.
 */
export async function fetchArtistTop100(
  artistName: string,
  signal?: AbortSignal,
  onPartial?: (items: TrendingTrackItem[]) => void
): Promise<TrendingTrackItem[]> {
  const cleanArtist = String(artistName || '').trim();
  if (!cleanArtist) return [];

  const cached = readCachedArtistTop100(cleanArtist);
  if (cached && cached.length >= 15 && onPartial) {
    onPartial(cached);
  }

  try {
    const [gatewaySettled, directJioSettled] = await Promise.allSettled([
      fetch(`/__void_api/artist-top100?artist=${encodeURIComponent(cleanArtist)}`, { signal }).then(
        r => (r.ok ? r.json() : null)
      ),
      fetchDirectJioSaavnArtistSongsClient(cleanArtist, signal),
    ]);

    const combinedCandidates: TrendingTrackItem[] = [];

    if (gatewaySettled.status === 'fulfilled' && Array.isArray(gatewaySettled.value?.items)) {
      for (let idx = 0; idx < gatewaySettled.value.items.length; idx++) {
        const item = gatewaySettled.value.items[idx];
        const streamUrl = String(item?.audioUrl || '').trim();
        const duration = Number(item?.duration) || 0;
        if (
          !streamUrl.startsWith('http') ||
          streamUrl.includes('itunes.apple.com') ||
          streamUrl.includes('mzstatic.com') ||
          streamUrl.includes('dzcdn.net') ||
          duration < 60
        ) {
          continue;
        }
        const cleanTitle = cleanCanonicalTrackTitle(String(item.title || 'Untitled'));
        const qualityBadge: QualityTier = detectTrackQuality(
          streamUrl,
          item.format || 'AAC',
          item.bitrate || 320,
          {
            codecHint: item.codec || 'AAC',
            mimeTypeHint: item.mimeType || 'audio/mp4',
            providerVerified: true,
            sourceHint: 'JioSaavn',
          }
        );

        combinedCandidates.push({
          id: String(item.id || `artist-top:${normalizeArtistIdentityKey(cleanArtist)}:${idx + 1}`),
          title: cleanTitle,
          name: cleanTitle,
          artist: String(item.artist || cleanArtist),
          album: cleanCanonicalTrackTitle(String(item.album || `${cleanArtist} Essentials`)),
          fileName: `${cleanTitle}.m4a`,
          fileSize: 0,
          importedAt: Date.now() - idx * 1000,
          audioUrl: streamUrl,
          downloadUrl: streamUrl,
          src: streamUrl,
          image: String(item.image || ''),
          duration,
          source: 'JioSaavn',
          qualityBadge,
          bitrate: Number(item.bitrate) || 320,
          codec: String(item.codec || 'AAC'),
          mimeType: String(item.mimeType || 'audio/mp4'),
          format: String(item.format || 'MP4 (320kbps)'),
          qualityVerified: true,
          fallbackUrls: Array.isArray(item.fallbackUrls) ? item.fallbackUrls : undefined,
          trendingRank: idx + 1,
          trendingScore: 1000 - idx * 5,
        });
      }
    }

    if (directJioSettled.status === 'fulfilled' && Array.isArray(directJioSettled.value)) {
      combinedCandidates.push(...directJioSettled.value);
    }

    if (combinedCandidates.length > 0) {
      const mapped = deduplicateTrackCollection(combinedCandidates, {
        ignoreArtist: true,
        cleanTitles: true,
      })
        .filter(isVerifiedFullJioSaavnItem)
        .map((item, idx) => ({
          ...item,
          trendingRank: idx + 1,
          trendingScore: 1000 - idx * 5,
        }));

      if (mapped.length > 0) {
        writeCachedArtistTop100(cleanArtist, mapped);
        if (!signal?.aborted && onPartial) {
          onPartial(mapped);
        }
        return mapped;
      }
    }
  } catch {
    if (signal?.aborted) return cached || [];
  }

  return cached || [];
}
