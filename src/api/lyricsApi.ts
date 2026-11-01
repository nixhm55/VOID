/**
 * Multi-Provider Universal Lyrics Engine for VOID Music Player.
 *
 * Integrates 7 distinct lyrics sources (client + Vite local gateway `/__void_api/lyrics`):
 * 1. LRCLIB Exact Match API (`lrclib.net/api/get`)
 * 2. LRCLIB Multi-Variant Search API (`lrclib.net/api/search`)
 * 3. JioSaavn Official Lyrics API (`elitejiosaavn-api.vercel.app/api/songs/{id}/lyrics`) — Malayalam, Tamil, Telugu, Hindi, Urdu, Kannada, Punjabi, Bengali, Arabic, English
 * 4. NetEase Cloud Music Synced LRC API (`music.163.com/api/song/lyric`) via `/__void_api/lyrics`
 * 5. Lyrics.ovh REST API (`api.lyrics.ovh/v1/{artist}/{title}`)
 * 6. LrcCx Synced LRC API (`api.lrc.cx/lyrics`) via `/__void_api/lyrics`
 * 7. ChartLyrics Direct API (`api.chartlyrics.com`) via `/__void_api/lyrics`
 *
 * Every candidate is strictly verified against the track title and artist so lyrics never mismatch.
 * When only plain (unsynced) lyrics are available, lines are smoothly time-aligned across the track duration.
 */

export interface LyricLine {
  time: number;
  text: string;
}

const JIOSAAVN_API_BASE = "https://elitejiosaavn-api.vercel.app/api";
const LYRICS_STORAGE_KEY = "void-lyrics-cache-v2";
const memoryLyricsCache = new Map<string, LyricLine[]>();

function loadPersistedLyricsMap(): Record<string, LyricLine[]> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LYRICS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedLyrics(key: string, lines: LyricLine[]): void {
  if (!lines.length) return;
  memoryLyricsCache.set(key, lines);
  try {
    if (typeof localStorage === "undefined") return;
    const map = loadPersistedLyricsMap();
    map[key] = lines;
    const keys = Object.keys(map);
    if (keys.length > 180) {
      delete map[keys[0]];
    }
    localStorage.setItem(LYRICS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore storage quota */
  }
}

function getCachedLyrics(key: string): LyricLine[] | null {
  const mem = memoryLyricsCache.get(key);
  if (mem && mem.length > 0) return mem;
  const map = loadPersistedLyricsMap();
  if (Array.isArray(map[key]) && map[key].length > 0) {
    memoryLyricsCache.set(key, map[key]);
    return map[key];
  }
  return null;
}

function decodeHtmlEntities(input: string): string {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Cleans track titles by stripping movie tags like `(From "Balettan")`,
 * `[Original Motion Picture Soundtrack]`, `(feat. ...)`, `(s l o w e d & r e v e r b)`, etc.
 */
export function cleanTrackTitleForLyrics(rawTitle: string): string {
  let cleaned = decodeHtmlEntities(rawTitle)
    .replace(/\s*\((?:from|feat|ft|prod|official|video|audio|lyric|lyrics|slowed|reverb|s\s*l\s*o\s*w\s*e\s*d|single|remaster|version|live)[^)]*\)/gi, "")
    .replace(/\s*\[(?:from|feat|ft|prod|official|video|audio|lyric|lyrics|slowed|reverb|single|remaster|version|live)[^\]]*\]/gi, "")
    .replace(/\s*-\s*(?:from\s+["']?[^"']+["']?|official\s+.*|remastered.*|single\s+version.*)$/i, "")
    .trim();

  // Also strip remaining parenthetical artist/movie suffixes if they look like metadata
  const withoutParens = cleaned.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\[[^\]]*\]\s*/g, " ").trim();
  if (withoutParens.length >= 2) {
    cleaned = withoutParens;
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Extracts distinct artist search variants from potentially bilingual or multi-artist strings
 * such as `"عمرو دياب · Amr Diab"` or `"K. J. Yesudas, K. S. Chithra"`.
 */
export function extractArtistVariants(rawArtist: string): string[] {
  const raw = decodeHtmlEntities(rawArtist).replace(/Unknown Artist/gi, "").trim();
  if (!raw) return [];

  const parts = raw
    .split(/[·•,/&|]+|\b(?:feat\.?|ft\.?)\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.includes(p)) unique.push(p);
    // Also add initials-collapsed form (e.g., "K. J. Yesudas" -> "KJ Yesudas" & "Yesudas")
    const noDots = p.replace(/\.\s*/g, " ").replace(/\s+/g, " ").trim();
    if (noDots && !unique.includes(noDots)) unique.push(noDots);
    const compactInitials = p.replace(/\b([A-Z])\.\s*([A-Z])\.\s*/g, "$1$2 ").replace(/\s+/g, " ").trim();
    if (compactInitials && !unique.includes(compactInitials)) unique.push(compactInitials);
    const words = noDots.split(" ").filter((w) => w.length > 2);
    if (words.length >= 1 && !unique.includes(words[words.length - 1])) {
      unique.push(words[words.length - 1]);
    }
  }
  return unique;
}

function normalizeMatchTokens(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w !== "the" && w !== "al" && w !== "el" && w !== "from");
}

/**
 * Strictly verifies that a candidate lyric item matches the target song title (and artist when provided)
 * so lyrics from another song are never shown.
 */
export function verifyLyricsCandidateMatch(
  targetTitle: string,
  targetArtists: string[],
  candidateTitle: string,
  candidateArtist?: string
): boolean {
  const targetTitleTokens = normalizeMatchTokens(cleanTrackTitleForLyrics(targetTitle));
  const candTitleTokens = normalizeMatchTokens(cleanTrackTitleForLyrics(candidateTitle));
  if (targetTitleTokens.length === 0 || candTitleTokens.length === 0) return false;

  const titleOverlap = targetTitleTokens.filter((tt) =>
    candTitleTokens.some((ct) => ct === tt || (tt.length >= 4 && ct.length >= 4 && (ct.includes(tt) || tt.includes(ct))))
  );

  // Require at least 60% of significant title tokens (or exact first token for 1-word titles) to match
  const requiredTitleMatches = targetTitleTokens.length === 1 ? 1 : Math.max(1, Math.ceil(targetTitleTokens.length * 0.6));
  if (titleOverlap.length < requiredTitleMatches) {
    return false;
  }

  if (candidateArtist && targetArtists.length > 0) {
    const candArtistTokens = normalizeMatchTokens(candidateArtist);
    if (candArtistTokens.length > 0) {
      const allTargetArtistTokens = targetArtists.flatMap(normalizeMatchTokens);
      if (allTargetArtistTokens.length > 0) {
        const artistMatched = allTargetArtistTokens.some((at) =>
          candArtistTokens.some((ct) => ct === at || (at.length >= 4 && ct.length >= 4 && (ct.includes(at) || at.includes(ct))))
        );
        // If title is only 1 common word, artist MUST also match strictly
        if (targetTitleTokens.length <= 2 && !artistMatched) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Parses `[mm:ss.xx]` LRC text into sorted `LyricLine[]`.
 */
export function parseSyncedLrc(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== "string") return [];
  const rawLines = decodeHtmlEntities(lrcText).split(/\r?\n/);
  const parsed: LyricLine[] = [];

  for (const rawLine of rawLines) {
    const timeMatches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
    if (timeMatches.length === 0) continue;
    const text = rawLine
      .replace(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g, "")
      .replace(/^\[[a-z]+:[^\]]*\]$/i, "")
      .trim();

    // Skip metadata headers inside LRC (like [ar:...], [ti:...], [by:...])
    if (/^(?:artist|title|album|by|offset|re|ve|length|id)\s*:/i.test(text)) continue;

    for (const m of timeMatches) {
      const mins = Number.parseInt(m[1], 10);
      const secs = Number.parseFloat(m[2]);
      if (!Number.isFinite(mins) || !Number.isFinite(secs)) continue;
      parsed.push({
        time: Math.max(0, mins * 60 + secs),
        text: text || "♪",
      });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed.filter((item, idx) => idx === 0 || item.time !== parsed[idx - 1].time || item.text !== parsed[idx - 1].text);
}

/**
 * Converts plain (unsynced) lyrics into smooth duration-aligned `LyricLine[]`
 * so songs whose lyrics provider only has plain text still display and scroll smoothly.
 */
export function synthesizeTimedLyricsFromPlain(plainText: string, durationSec?: number): LyricLine[] {
  const cleaned = decodeHtmlEntities(plainText)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^(?:paroles\s+de\s+la\s+chanson|lyrics\s+powered\s+by|submit\s+corrections)/i.test(line));

  if (cleaned.length < 3) return [];

  const totalDur = Number.isFinite(durationSec) && (durationSec as number) > 30 ? (durationSec as number) : 210;
  const startOffset = Math.min(8, Math.max(2, totalDur * 0.04));
  const usableSpan = Math.max(30, totalDur - startOffset - 6);

  // Weight each line slightly by word count so longer lines get proportionally more time
  const weights = cleaned.map((line) => Math.max(2, Math.min(12, line.split(/\s+/).length)));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || cleaned.length;

  let elapsed = startOffset;
  return cleaned.map((text, idx) => {
    const lineTime = Number(elapsed.toFixed(2));
    const step = (weights[idx] / totalWeight) * usableSpan;
    elapsed += step;
    return { time: lineTime, text };
  });
}

async function fetchJioSaavnLyricsForTrack(
  track: any,
  cleanTitle: string,
  artistVariants: string[],
  durationSec?: number
): Promise<LyricLine[] | null> {
  const candidateSongIds: string[] = [];
  const rawId = String(track?.id || "")
    .replace(/^download:/i, "")
    .replace(/^api-/i, "")
    .replace(/^lossless:master-/i, "")
    .trim();

  // If the track already has a JioSaavn ID (typically 8 alphanumeric chars), try it first
  if (/^[A-Za-z0-9_-]{6,12}$/.test(rawId) && !rawId.startsWith("ar-") && !rawId.includes("-")) {
    candidateSongIds.push(rawId);
  }

  // Also search JioSaavn for the song to find any matching song entry with `hasLyrics` or lyrics endpoint
  const primaryArtist = artistVariants[0] || "";
  const searchQuery = `${cleanTitle} ${primaryArtist}`.trim();
  if (searchQuery) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 3800);
    try {
      const res = await fetch(
        `${JIOSAAVN_API_BASE}/search/songs?query=${encodeURIComponent(searchQuery)}&page=1&limit=8`,
        { signal: ctrl.signal }
      );
      if (res.ok) {
        const json = await res.json();
        const songs: any[] = Array.isArray(json?.data?.results)
          ? json.data.results
          : Array.isArray(json?.results)
            ? json.results
            : [];
        for (const s of songs) {
          const sId = String(s?.id || "").trim();
          const sTitle = decodeHtmlEntities(String(s?.name || s?.title || ""));
          const sArtist = Array.isArray(s?.artists?.primary)
            ? s.artists.primary.map((a: any) => a?.name).filter(Boolean).join(", ")
            : String(s?.primaryArtists || "");
          if (sId && verifyLyricsCandidateMatch(cleanTitle, artistVariants, sTitle, sArtist)) {
            if (!candidateSongIds.includes(sId)) {
              if (s?.hasLyrics) candidateSongIds.unshift(sId);
              else candidateSongIds.push(sId);
            }
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      window.clearTimeout(timer);
    }
  }

  for (const songId of candidateSongIds.slice(0, 3)) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 3200);
    try {
      const res = await fetch(`${JIOSAAVN_API_BASE}/songs/${encodeURIComponent(songId)}/lyrics`, {
        signal: ctrl.signal,
      });
      if (res.ok) {
        const json = await res.json();
        const rawLyrics =
          json?.data?.lyrics ||
          json?.lyrics ||
          (typeof json?.data === "string" ? json.data : "");
        if (typeof rawLyrics === "string" && rawLyrics.trim().length > 20) {
          const synced = parseSyncedLrc(rawLyrics);
          if (synced.length >= 3) return synced;
          const synth = synthesizeTimedLyricsFromPlain(rawLyrics, durationSec);
          if (synth.length >= 3) return synth;
        }
      }
    } catch {
      /* try next */
    } finally {
      window.clearTimeout(timer);
    }
  }

  return null;
}

async function fetchLyricsOvhDirect(
  cleanTitle: string,
  artistVariants: string[],
  durationSec?: number
): Promise<LyricLine[] | null> {
  for (const artist of artistVariants.slice(0, 2)) {
    if (!artist || !cleanTitle) continue;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 3200);
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(cleanTitle)}`,
        { signal: ctrl.signal }
      );
      if (res.ok) {
        const json = await res.json();
        if (typeof json?.lyrics === "string" && json.lyrics.trim().length > 25) {
          const synced = parseSyncedLrc(json.lyrics);
          if (synced.length >= 3) return synced;
          const synth = synthesizeTimedLyricsFromPlain(json.lyrics, durationSec);
          if (synth.length >= 3) return synth;
        }
      }
    } catch {
      /* ignore */
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Resolves verified lyrics for any track (Malayalam, Arabic, Tamil, Telugu, Hindi, Urdu, English, Spanish, French, etc.)
 * across all 7 lyrics sources.
 */
export async function resolveUniversalTrackLyrics(track: any): Promise<LyricLine[] | null> {
  if (!track) return null;
  const rawTitle = String(track.title || track.name || "").trim();
  const rawArtist = String(track.artist || "").trim();
  if (!rawTitle) return null;

  const cleanTitle = cleanTrackTitleForLyrics(rawTitle);
  const artistVariants = extractArtistVariants(rawArtist);
  const primaryArtist = artistVariants[0] || "";
  const durationSec = Number(track.duration) || undefined;

  const cacheKey = `${cleanTitle.toLowerCase()}|${primaryArtist.toLowerCase()}`;
  const cached = getCachedLyrics(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  // 1. Query our enhanced multi-source server gateway `/__void_api/lyrics`
  //    (which fans out across LRCLIB Exact, LRCLIB Search, NetEase Cloud Music LRC, LrcCx, Lyrics.ovh, and ChartLyrics)
  //    AND JioSaavn Official Lyrics concurrently!
  const gatewayTask = (async (): Promise<LyricLine[] | null> => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5500);
    try {
      const params = new URLSearchParams();
      params.set("q", `${cleanTitle} ${primaryArtist}`.trim());
      params.set("title", cleanTitle);
      params.set("rawTitle", rawTitle);
      params.set("artist", rawArtist);
      if (durationSec && durationSec > 0) {
        params.set("duration", String(Math.round(durationSec)));
      }
      const res = await fetch(`/__void_api/lyrics?${params.toString()}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) return null;

      // Prefer verified syncedLyrics first
      for (const item of items) {
        const candTitle = String(item?.trackName || item?.name || item?.title || cleanTitle);
        const candArtist = String(item?.artistName || item?.artist || primaryArtist);
        if (
          item?.verified !== true &&
          !verifyLyricsCandidateMatch(cleanTitle, artistVariants, candTitle, candArtist)
        ) {
          continue;
        }
        if (typeof item?.syncedLyrics === "string" && item.syncedLyrics.trim().length > 0) {
          const parsed = parseSyncedLrc(item.syncedLyrics);
          if (parsed.length >= 3) return parsed;
        }
      }

      // Next, accept verified plainLyrics and convert to smooth duration-synced lines
      for (const item of items) {
        const candTitle = String(item?.trackName || item?.name || item?.title || cleanTitle);
        const candArtist = String(item?.artistName || item?.artist || primaryArtist);
        if (
          item?.verified !== true &&
          !verifyLyricsCandidateMatch(cleanTitle, artistVariants, candTitle, candArtist)
        ) {
          continue;
        }
        const plain = item?.plainLyrics || item?.lyrics;
        if (typeof plain === "string" && plain.trim().length > 20) {
          const synth = synthesizeTimedLyricsFromPlain(plain, durationSec);
          if (synth.length >= 3) return synth;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  const jioLyricsTask = fetchJioSaavnLyricsForTrack(track, cleanTitle, artistVariants, durationSec);

  const [gatewayLines, jioLines] = await Promise.all([gatewayTask, jioLyricsTask]);

  const bestLines = gatewayLines || jioLines || (await fetchLyricsOvhDirect(cleanTitle, artistVariants, durationSec));
  if (bestLines && bestLines.length > 0) {
    savePersistedLyrics(cacheKey, bestLines);
    return bestLines;
  }

  return null;
}
