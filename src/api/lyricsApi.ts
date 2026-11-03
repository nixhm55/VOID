import { extractYouTubeIdFromTrack } from "./youtubeApi";

/**
 * Multi-Provider Universal Synced & Original Lyrics Engine for VOID Music Player.
 *
 * Supports all languages (Arabic, Malayalam, Hindi, Marathi, Tamil, Telugu, Kannada, Punjabi, Urdu, Bengali, English, etc.)
 * across 12+ authentic lyrics & LRC providers via `/__void_api/lyrics` + direct browser fallbacks:
 * 1. LRCLIB Exact Match (`lrclib.net/api/get`)
 * 2. LRCLIB Multi-Variant & Bilingual Search (`lrclib.net/api/search`)
 * 3. Kugou Global Synced LRC (`mobilecdn.kugou.com` + `krcs.kugou.com` + `lyrics.kugou.com`)
 * 4. NetEase Cloud Music Synced LRC (`music.163.com/api/cloudsearch/pc` + `song/lyric`)
 * 5. QQ Music Synced LRC (`c.y.qq.com`)
 * 6. Megalobiz Synced LRC Archive (`megalobiz.com`)
 * 7. LrcCx & Textyl Synced LRC APIs (`api.lrc.cx`, `api.textyl.co`)
 * 8. Official Direct JioSaavn API (`www.jiosaavn.com/api.php`) + Mirrors (`saavn.dev`, `elitejiosaavn-api.vercel.app`)
 * 9. Genius Official Lyrics Extractor (`genius.com/api/search/multi`)
 * 10. Shazam Official Catalog & Lyrics API (`shazam.com`)
 * 11. YouTube Official Human-Synced Captions (`kind !== 'asr'`)
 * 12. Lyrist, Lyrics.ovh & ChartLyrics Global Fallbacks
 */

export interface LyricLine {
  time: number;
  text: string;
}

interface CachedLyricsEntry {
  lines: LyricLine[];
  synced: boolean;
  duration?: number;
}

const JIOSAAVN_MIRRORS = [
  "https://saavn.dev/api",
  "https://elitejiosaavn-api.vercel.app/api",
];
const LYRICS_STORAGE_KEY = "void-lyrics-cache-v6";
const memoryLyricsCache = new Map<string, CachedLyricsEntry>();

// Purge older caches on startup so any stale/unverified lyrics are removed immediately
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("void-lyrics-cache-v3");
    localStorage.removeItem("void-lyrics-cache-v4");
    localStorage.removeItem("void-lyrics-cache-v5");
  }
} catch {
  /* ignore */
}

function loadPersistedLyricsMap(): Record<string, CachedLyricsEntry> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LYRICS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedLyrics(key: string, entry: CachedLyricsEntry): void {
  if (!entry.lines.length) return;
  memoryLyricsCache.set(key, entry);
  try {
    if (typeof localStorage === "undefined") return;
    const map = loadPersistedLyricsMap();
    map[key] = entry;
    const keys = Object.keys(map);
    if (keys.length > 220) {
      delete map[keys[0]];
    }
    localStorage.setItem(LYRICS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore storage quota */
  }
}

function getCachedLyrics(key: string): CachedLyricsEntry | null {
  const mem = memoryLyricsCache.get(key);
  if (mem && Array.isArray(mem.lines) && mem.lines.length > 0) return mem;
  const map = loadPersistedLyricsMap();
  const stored = map[key];
  if (stored && Array.isArray(stored.lines) && stored.lines.length > 0) {
    memoryLyricsCache.set(key, stored);
    return stored;
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

const NOISE_LABEL_RE =
  /\b(?:sony\s*music(?:\s*south|\s*india)?|t-series(?:\s*malayalam|\s*tamil|\s*telugu|\s*regional|\s*marathi)?|think\s*music(?:\s*india)?|muzik\s*247|saregama(?:\s*malayalam|\s*tamil|\s*hindi|\s*marathi)?|zee\s*music(?:\s*company|\s*south|\s*marathi)?|aditya\s*music|lahari\s*music|manorama\s*music|satyam\s*audios|millennium\s*audios|goodwill\s*entertainments|speed\s*records|yrf|tips\s*official|everest\s*marathi|fountain\s*music|rotana|mazzika|coke\s*studio|vevo|topic|official\s*channel|records|music\s*label|unknown\s*artist)\b/gi;

const NOISE_TITLE_RE =
  /\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|mv|visualizer)|lyric(?:al)?\s*(?:video|song)?|full\s*(?:video|audio|song)|video\s*song|audio\s*song|4k|8k|hd|hq|remastered|from\s+["'“”]?[^"'”)\]]+["'”]?|original\s+motion\s+picture\s+soundtrack|ost|malayalam\s*song|tamil\s*song|hindi\s*song|marathi\s*song|urdu\s*song|telugu\s*song|kannada\s*song|arabic\s*song|mongolian\s*song|chinese\s*song)\b/gi;

/**
 * Cleans track titles by stripping movie tags, channel labels, and bracketed noise.
 */
export function cleanTrackTitleForLyrics(rawTitle: string): string {
  let cleaned = decodeHtmlEntities(rawTitle)
    .replace(/\s*\((?:from|feat|ft|prod|official|video|audio|lyric|lyrics|slowed|reverb|s\s*l\s*o\s*w\s*e\s*d|single|remaster|version|live|ost|theme)[^)]*\)/gi, " ")
    .replace(/\s*\[(?:from|feat|ft|prod|official|video|audio|lyric|lyrics|slowed|reverb|single|remaster|version|live|ost|theme)[^\]]*\]/gi, " ")
    .replace(/[【《「『][^】》」』]*[】》」』]/g, " ")
    .replace(NOISE_TITLE_RE, " ")
    .replace(NOISE_LABEL_RE, " ")
    .replace(/\s*-\s*(?:from\s+["']?[^"']+["']?|official\s+.*|remastered.*|single\s+version.*)$/i, " ")
    .trim();

  const withoutParens = cleaned.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\[[^\]]*\]\s*/g, " ").trim();
  if (withoutParens.length >= 2) {
    cleaned = withoutParens;
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Extracts multiple candidate song titles from compound/bilingual strings
 * (e.g. `"Manjummel Boys - Kuthanthram | Sushin Shyam"`, `"تملي معاك · Tamally Maak"`).
 */
export function extractTitleVariants(rawTitle: string, artistVariants: string[] = []): string[] {
  const decoded = decodeHtmlEntities(rawTitle);
  if (!decoded) return [];
  const out: string[] = [];
  const add = (val: string) => {
    const c = val.replace(/\s+/g, " ").trim();
    if (c.length >= 2 && !out.some((x) => x.toLowerCase() === c.toLowerCase())) {
      out.push(c);
    }
  };

  for (const m of decoded.matchAll(/[【《「『]([^】》」』]{2,40})[】》」』]/g)) {
    if (m[1]?.trim()) add(cleanTrackTitleForLyrics(m[1]));
  }

  const segments = decoded
    .split(/\s*(?:\||·|•|\/\/| - | – | — |:)\s*/)
    .map((s) => cleanTrackTitleForLyrics(s))
    .filter((s) => s.length >= 2);

  for (const seg of segments) {
    const isArtistOnly = artistVariants.some((a) => a.toLowerCase() === seg.toLowerCase());
    if (!isArtistOnly) add(seg);
  }

  const primaryClean = cleanTrackTitleForLyrics(decoded);
  if (primaryClean) add(primaryClean);

  return out.slice(0, 6);
}

/**
 * Extracts distinct artist search variants from potentially bilingual or multi-artist strings,
 * stripping record labels and YouTube channel suffixes.
 */
export function extractArtistVariants(rawArtist: string): string[] {
  const raw = decodeHtmlEntities(rawArtist)
    .replace(NOISE_LABEL_RE, " ")
    .replace(/Unknown Artist/gi, "")
    .trim();
  if (!raw) return [];

  const parts = raw
    .split(/[·•,/&|;]+|\b(?:feat\.?|ft\.?|x|vs\.?)\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.includes(p)) unique.push(p);
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

function normalizePhoneticToken(w: string): string {
  let s = String(w || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  if (/^[a-z0-9]+$/.test(s)) {
    s = s
      .replace(/^(?:al|el)-?/, "")
      .replace(/\b(?:mehad|mihed|maihad|mihad|mahad)\b/g, "mehad")
      .replace(/\b(?:hamad|hamed|ahmed|ahmad)\b/g, "hamad")
      .replace(/\b(?:jser|jisser|jisr|jesr)\b/g, "jisr")
      .replace(/\b(?:sadaqa|sadaka|sadaqah|sadakah)\b/g, "sadaqa")
      .replace(/\b(?:mater|matar|mtar)\b/g, "matar")
      .replace(/\b(?:wen|wain|wayn|wein|fein|fain)\b/g, "wain")
      .replace(/\b(?:ent|enta|inta|ant|anta|enti|inti)\b/g, "inta")
      .replace(/\b(?:tamally|tamali|tamalli)\b/g, "tamali")
      .replace(/\b(?:maak|ma3ak|mak)\b/g, "mak")
      .replace(/\b(?:leila|layla|laila|leyla)\b/g, "laila")
      .replace(/\b(?:habibi|habiby|7abibi)\b/g, "habibi")
      .replace(/\b(?:bismatak|besmetak|basmatak)\b/g, "basmatak")
      .replace(/\b(?:ahib|aheb|oheb|uhib)\b/g, "ahib")
      .replace(/aa+/g, "a")
      .replace(/ee+|ii+/g, "i")
      .replace(/oo+|uu+|ou/g, "u")
      .replace(/ph/g, "f")
      .replace(/kh/g, "k")
      .replace(/gh/g, "g")
      .replace(/sh/g, "s")
      .replace(/th/g, "t")
      .replace(/dh/g, "d")
      .replace(/bh/g, "b")
      .replace(/zh/g, "l")
      .replace(/q/g, "k")
      .replace(/([a-z])\1+/g, "$1");
  }
  return s;
}

const STOP_TOKENS = new Set([
  "the", "al", "el", "from", "song", "video", "audio", "official",
  "lyrics", "lyrical", "full", "movie", "film", "version", "original",
  "كلمات", "اغنية", "أغنية", "اغنيه",
]);

function normalizeMatchTokens(input: string): string[] {
  return String(input || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map(normalizePhoneticToken)
    .filter((w) => w.length >= 1 && !STOP_TOKENS.has(w));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);
  if (minLen >= 4 && minLen / maxLen >= 0.78 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

/**
 * Strictly verifies that a candidate lyric item matches the target song title.
 */
export function verifyLyricsCandidateMatch(
  targetTitle: string,
  targetArtists: string[],
  candidateTitle: string,
  candidateArtist?: string,
  targetDurationSec?: number,
  candidateDurationSec?: number
): boolean {
  const titleVariants = extractTitleVariants(targetTitle, targetArtists);
  const candTitleTokens = normalizeMatchTokens(cleanTrackTitleForLyrics(candidateTitle));
  if (candTitleTokens.length === 0) return false;

  let bestScore = 0;
  for (const tv of titleVariants.length ? titleVariants : [targetTitle]) {
    const tTokens = normalizeMatchTokens(tv);
    if (!tTokens.length) continue;
    const fwd = tTokens.filter((tt) => candTitleTokens.some((ct) => tokensMatch(tt, ct))).length;
    const bwd = candTitleTokens.filter((ct) => tTokens.some((tt) => tokensMatch(tt, ct))).length;
    const fwdRatio = fwd / tTokens.length;
    const bwdRatio = bwd / candTitleTokens.length;
    if (fwdRatio >= 0.5 && bwdRatio >= 0.4) {
      const score = Math.max((2 * fwd) / (tTokens.length + candTitleTokens.length), (fwdRatio + bwdRatio) * 0.5);
      if (score > bestScore) bestScore = score;
    } else if (tTokens.length >= 2 && fwd === tTokens.length && bwdRatio >= 0.34) {
      bestScore = Math.max(bestScore, 0.7);
    }
  }

  if (bestScore < 0.48) return false;

  const allTargetArtistTokens = targetArtists.flatMap(normalizeMatchTokens);
  const candArtistTokens = candidateArtist ? normalizeMatchTokens(candidateArtist) : [];
  const artistMatched =
    allTargetArtistTokens.length > 0 &&
    candArtistTokens.length > 0 &&
    allTargetArtistTokens.some((at) =>
      candArtistTokens.some((ct) => at.length >= 2 && ct.length >= 2 && tokensMatch(at, ct))
    );

  const durClose =
    Boolean(targetDurationSec && targetDurationSec > 30 && candidateDurationSec && candidateDurationSec > 30) &&
    Math.abs((candidateDurationSec as number) - (targetDurationSec as number)) <= 7;

  const firstTitleTokens = normalizeMatchTokens(titleVariants[0] || targetTitle);
  if (
    firstTitleTokens.length <= 1 &&
    allTargetArtistTokens.length > 0 &&
    candArtistTokens.length > 0 &&
    !artistMatched &&
    !durClose
  ) {
    return false;
  }

  return true;
}

/**
 * Parses `[mm:ss.xx]` or `[mm:ss:xx]` LRC text (including LRC `[offset:...]` tags) into sorted `LyricLine[]`.
 */
export function parseSyncedLrc(lrcText: string, targetDurationSec?: number): LyricLine[] {
  if (!lrcText || typeof lrcText !== "string") return [];
  const rawLines = decodeHtmlEntities(lrcText).split(/\r?\n/);
  const parsed: LyricLine[] = [];

  let offsetSec = 0;
  const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch?.[1]) {
    const ms = Number.parseInt(offsetMatch[1], 10);
    if (Number.isFinite(ms)) offsetSec = ms / 1000;
  }

  for (const rawLine of rawLines) {
    const timeMatches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (timeMatches.length === 0) continue;
    const text = rawLine
      .replace(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, "")
      .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, "")
      .replace(/^\[[a-z]+:[^\]]*\]$/i, "")
      .trim();

    if (/^(?:artist|title|album|by|offset|re|ve|length|id|al|ar|ti|au)\s*:/i.test(text)) continue;
    if (/^(?:lyrics\s*by|synced\s*by|lrc\s*by|www\.|http)/i.test(text)) continue;

    for (const m of timeMatches) {
      const mins = Number.parseInt(m[1], 10);
      const secs = Number.parseInt(m[2], 10);
      const fracRaw = m[3] ? m[3].padEnd(3, "0").slice(0, 3) : "0";
      const ms = Number.parseInt(fracRaw, 10) / 1000;
      if (!Number.isFinite(mins) || !Number.isFinite(secs)) continue;
      const time = Math.max(0, Number((mins * 60 + secs + ms - offsetSec).toFixed(2)));
      parsed.push({
        time,
        text: text || "♪",
      });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  const deduped = parsed.filter(
    (item, idx) =>
      idx === 0 ||
      Math.abs(item.time - parsed[idx - 1].time) > 0.05 ||
      item.text !== parsed[idx - 1].text
  );

  const cleaned = deduped.filter(
    (item, idx) =>
      item.text !== "♪" ||
      idx === 0 ||
      idx === deduped.length - 1 ||
      (deduped[idx + 1] && deduped[idx + 1].time - item.time >= 4.0)
  );

  if (targetDurationSec && targetDurationSec > 40 && cleaned.length >= 5) {
    const lastTime = cleaned[cleaned.length - 1].time;
    if (lastTime > targetDurationSec + 3 && lastTime < targetDurationSec * 1.18) {
      const scale = (targetDurationSec - 2) / lastTime;
      return cleaned.map((l) => ({
        time: Number((l.time * scale).toFixed(2)),
        text: l.text,
      }));
    }
  }

  return cleaned;
}

/**
 * Converts verified original plain lyrics into smooth duration-aligned `LyricLine[]`
 * using multi-script syllable/character density and stanza pauses across any language
 * (Arabic, Malayalam, Hindi, Marathi, Tamil, Telugu, Urdu, English).
 */
export function synthesizeTimedLyricsFromPlain(plainText: string, durationSec?: number): LyricLine[] {
  const rawLines = decodeHtmlEntities(plainText)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());

  const structured: Array<{ text: string; stanzaBreakBefore: boolean }> = [];
  let sawBlank = false;
  for (const line of rawLines) {
    if (!line) {
      sawBlank = true;
      continue;
    }
    if (/^(?:paroles\s+de\s+la\s+chanson|lyrics\s+powered\s+by|submit\s+corrections|contributors\s*\d*|.*lyrics$|\[?(?:verse|chorus|bridge|intro|outro|hook|pre-chorus|instrumental).*\]?)$/i.test(line)) {
      sawBlank = true;
      continue;
    }
    structured.push({ text: line, stanzaBreakBefore: structured.length > 0 && sawBlank });
    sawBlank = false;
  }

  if (structured.length < 3) return [];

  const totalDur = Number.isFinite(durationSec) && (durationSec as number) > 30 ? (durationSec as number) : 210;
  const startOffset = Math.min(10, Math.max(3.0, totalDur * 0.05));
  const endMargin = Math.min(12, Math.max(4, totalDur * 0.06));
  const usableSpan = Math.max(25, totalDur - startOffset - endMargin);

  const weights = structured.map((item) => {
    const charCount = [...item.text.replace(/\s+/g, "")].length;
    const wordCount = item.text.split(/\s+/).filter(Boolean).length;
    const effectiveSyllables = Math.max(wordCount * 1.8, charCount * 0.42);
    const stanzaPauseWeight = item.stanzaBreakBefore ? 2.2 : 0;
    return Math.max(2.5, Math.min(16, effectiveSyllables)) + stanzaPauseWeight;
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || structured.length;

  let elapsed = startOffset;
  return structured.map((item, idx) => {
    if (item.stanzaBreakBefore) {
      elapsed += (1.6 / totalWeight) * usableSpan;
    }
    const lineTime = Number(elapsed.toFixed(2));
    const lyricWeight = weights[idx] - (item.stanzaBreakBefore ? 1.6 : 0);
    elapsed += (lyricWeight / totalWeight) * usableSpan;
    return { time: lineTime, text: item.text };
  });
}

async function fetchJioSaavnLyricsDirect(
  track: any,
  titleVariants: string[],
  artistVariants: string[],
  durationSec?: number
): Promise<{ lines: LyricLine[]; synced: boolean } | null> {
  const candidateSongIds: string[] = [];
  const rawId = String(track?.id || "")
    .replace(/^download:/i, "")
    .replace(/^api-/i, "")
    .replace(/^lossless:master-/i, "")
    .trim();

  if (/^[A-Za-z0-9_-]{6,12}$/.test(rawId) && !rawId.startsWith("ar-") && !rawId.includes("-")) {
    candidateSongIds.push(rawId);
  }

  const primaryTitle = titleVariants[0] || "";
  const primaryArtist = artistVariants[0] || "";
  const searchQuery = `${primaryTitle} ${primaryArtist}`.trim() || primaryTitle;

  for (const mirror of JIOSAAVN_MIRRORS) {
    if (searchQuery && candidateSongIds.length < 3) {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 3400);
      try {
        const res = await fetch(
          `${mirror}/search/songs?query=${encodeURIComponent(searchQuery)}&page=1&limit=6`,
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
            const sDur = Number(s?.duration) || undefined;
            if (
              sId &&
              verifyLyricsCandidateMatch(primaryTitle, artistVariants, sTitle, sArtist, durationSec, sDur)
            ) {
              if (!candidateSongIds.includes(sId)) {
                if (s?.hasLyrics) candidateSongIds.unshift(sId);
                else candidateSongIds.push(sId);
              }
            }
          }
        }
      } catch {
        /* try next mirror */
      } finally {
        window.clearTimeout(timer);
      }
    }

    for (const songId of candidateSongIds.slice(0, 3)) {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch(`${mirror}/songs/${encodeURIComponent(songId)}/lyrics`, {
          signal: ctrl.signal,
        });
        if (res.ok) {
          const json = await res.json();
          const rawLyrics =
            json?.data?.lyrics ||
            json?.lyrics ||
            (typeof json?.data === "string" ? json.data : "");
          if (typeof rawLyrics === "string" && rawLyrics.trim().length > 20) {
            const synced = parseSyncedLrc(rawLyrics, durationSec);
            if (synced.length >= 3) return { lines: synced, synced: true };
            const synth = synthesizeTimedLyricsFromPlain(rawLyrics, durationSec);
            if (synth.length >= 3) return { lines: synth, synced: false };
          }
        }
      } catch {
        /* try next */
      } finally {
        window.clearTimeout(timer);
      }
    }
  }

  return null;
}

async function fetchDirectLrclibBrowserFallback(
  titleVariants: string[],
  artistVariants: string[],
  durationSec?: number
): Promise<{ lines: LyricLine[]; synced: boolean } | null> {
  const primaryTitle = titleVariants[0] || "";
  const primaryArtist = artistVariants[0] || "";
  const queries = Array.from(
    new Set([
      primaryArtist ? `${primaryTitle} ${primaryArtist}`.trim() : "",
      primaryTitle,
      titleVariants[1] || "",
    ].filter((q) => q.length >= 2))
  ).slice(0, 3);

  for (const q of queries) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 3500);
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const items: any[] = await res.json();
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const cTitle = String(item?.trackName || item?.name || "");
        const cArtist = String(item?.artistName || "");
        const cDur = Number(item?.duration) || undefined;
        if (!verifyLyricsCandidateMatch(primaryTitle, artistVariants, cTitle, cArtist, durationSec, cDur)) {
          continue;
        }
        if (typeof item?.syncedLyrics === "string" && item.syncedLyrics.trim().length > 0) {
          const parsed = parseSyncedLrc(item.syncedLyrics, durationSec);
          if (parsed.length >= 3) return { lines: parsed, synced: true };
        }
      }

      for (const item of items) {
        const cTitle = String(item?.trackName || item?.name || "");
        const cArtist = String(item?.artistName || "");
        const cDur = Number(item?.duration) || undefined;
        if (!verifyLyricsCandidateMatch(primaryTitle, artistVariants, cTitle, cArtist, durationSec, cDur)) {
          continue;
        }
        if (typeof item?.plainLyrics === "string" && item.plainLyrics.trim().length > 20) {
          const synth = synthesizeTimedLyricsFromPlain(item.plainLyrics, durationSec);
          if (synth.length >= 3) return { lines: synth, synced: false };
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
 * Resolves verified, accurately synced original lyrics for any track in any language
 * (Arabic, Malayalam, Hindi, Marathi, Tamil, Telugu, Kannada, Punjabi, Urdu, Bengali, English, etc.).
 */
export async function resolveUniversalTrackLyrics(
  track: any,
  liveDurationSec?: number
): Promise<LyricLine[] | null> {
  if (!track) return null;
  const rawTitle = String(track.title || track.name || "").trim();
  const rawArtist = String(track.artist || "").trim();
  const rawAlbum = String(track.album || "").trim();
  if (!rawTitle) return null;

  const artistVariants = extractArtistVariants(rawArtist);
  const titleVariants = extractTitleVariants(rawTitle, artistVariants);
  const cleanTitle = titleVariants[0] || cleanTrackTitleForLyrics(rawTitle) || rawTitle;
  const primaryArtist = artistVariants[0] || "";
  const durationSec =
    (Number.isFinite(liveDurationSec) && (liveDurationSec as number) > 25
      ? (liveDurationSec as number)
      : Number(track.duration)) || undefined;

  const videoId = extractYouTubeIdFromTrack(track) || "";
  const rawTrackId = String(track?.id || "")
    .replace(/^download:/i, "")
    .replace(/^api-/i, "")
    .replace(/^lossless:master-/i, "")
    .trim();
  const songId =
    /^[A-Za-z0-9_-]{6,12}$/.test(rawTrackId) && !rawTrackId.startsWith("ar-") && !rawTrackId.includes("-")
      ? rawTrackId
      : "";

  const cacheKey = `${cleanTitle.toLowerCase()}|${primaryArtist.toLowerCase()}`;
  const cached = getCachedLyrics(cacheKey);
  if (cached && cached.lines.length > 0) {
    if (cached.synced) return cached.lines;
    if (!durationSec || (cached.duration && Math.abs(cached.duration - durationSec) <= 4)) {
      return cached.lines;
    }
  }

  const gatewayTask = (async (): Promise<{ lines: LyricLine[]; synced: boolean } | null> => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 7500);
    try {
      const params = new URLSearchParams();
      params.set("q", `${cleanTitle} ${primaryArtist}`.trim());
      params.set("title", cleanTitle);
      params.set("rawTitle", rawTitle);
      params.set("artist", rawArtist);
      if (rawAlbum) params.set("album", rawAlbum);
      if (videoId) params.set("videoId", videoId);
      if (songId) params.set("songId", songId);
      if (durationSec && durationSec > 0) {
        params.set("duration", String(Math.round(durationSec)));
      }
      const res = await fetch(`/__void_api/lyrics?${params.toString()}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) return null;

      // 1. Strictly prioritize real timestamped synced LRC candidates
      for (const item of items) {
        if (typeof item?.syncedLyrics === "string" && item.syncedLyrics.trim().length > 0) {
          const parsed = parseSyncedLrc(item.syncedLyrics, durationSec);
          if (parsed.length >= 3) {
            return { lines: parsed, synced: true };
          }
        }
      }

      // 2. Fallback to verified original plain lyrics aligned to track duration
      for (const item of items) {
        const plain = item?.plainLyrics || item?.lyrics;
        if (typeof plain === "string" && plain.trim().length > 20) {
          const synth = synthesizeTimedLyricsFromPlain(plain, durationSec);
          if (synth.length >= 3) {
            return { lines: synth, synced: false };
          }
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  const jioDirectTask = fetchJioSaavnLyricsDirect(track, titleVariants, artistVariants, durationSec);

  const [gatewayRes, jioRes] = await Promise.all([gatewayTask, jioDirectTask]);

  if (gatewayRes?.synced) {
    savePersistedLyrics(cacheKey, { lines: gatewayRes.lines, synced: true, duration: durationSec });
    return gatewayRes.lines;
  }
  if (jioRes?.synced) {
    savePersistedLyrics(cacheKey, { lines: jioRes.lines, synced: true, duration: durationSec });
    return jioRes.lines;
  }

  const directLrcRes = await fetchDirectLrclibBrowserFallback(titleVariants, artistVariants, durationSec);
  if (directLrcRes?.synced) {
    savePersistedLyrics(cacheKey, { lines: directLrcRes.lines, synced: true, duration: durationSec });
    return directLrcRes.lines;
  }

  const bestPlain = gatewayRes || jioRes || directLrcRes;
  if (bestPlain && bestPlain.lines.length > 0) {
    savePersistedLyrics(cacheKey, {
      lines: bestPlain.lines,
      synced: bestPlain.synced,
      duration: durationSec,
    });
    return bestPlain.lines;
  }

  return null;
}
