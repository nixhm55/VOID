/**
 * Shared Audio Quality Detection, Provider Attribution, and SearchResult Normalization
 * for VOID Music Player.
 */

export type QualityTier =
  | 'Lossless'
  | 'Very High (320kbps)'
  | 'High (256kbps)'
  | 'High (240kbps)'
  | 'High (192kbps)'
  | 'High (160kbps)'
  | 'Standard (128kbps)'
  | 'Low'
  | 'FLAC Live'
  | 'Live Radio'
  | 'Unknown';

export type CanonicalProviderName =
  | 'JioSaavn'
  | 'Radio Browser'
  | 'Jamendo'
  | 'YouTube'
  | 'Internet Archive'
  | 'Lossless Source'
  | string;

export interface SearchResult {
  id: string;
  name: string;
  album: string;
  artist: string;
  image: string;
  downloadUrl: string;
  duration: number;
  source?: string;

  qualityBadge?: QualityTier;
  bitrate?: number;
  codec?: string;

  // Additional metadata for stream verification, playback fallback, and live radio handling
  mimeType?: string;
  format?: string;
  qualityVerified?: boolean;
  isLive?: boolean;
  fallbackUrls?: string[];
  bitDepth?: number;
  sampleRate?: number;
}

export interface QualityDetectionOptions {
  codecHint?: string;
  mimeTypeHint?: string;
  isLive?: boolean;
  providerVerified?: boolean;
  sourceHint?: string;
}

/**
 * Exact canonical display names required across VOID UI.
 * Never returns "VOID" or "void" for external provider tracks.
 */
const PROVIDER_DISPLAY_MAP: Record<string, string> = {
  jiosaavn: 'JioSaavn',
  saavn: 'JioSaavn',
  youtube: 'YouTube',
  yt: 'YouTube',
  jamendo: 'Jamendo',
  'internet archive': 'Internet Archive',
  internetarchive: 'Internet Archive',
  'internet-archive': 'Internet Archive',
  archive: 'Internet Archive',
  'archive.org': 'Internet Archive',
  ia: 'Internet Archive',
  'radio browser': 'Radio Browser',
  radiobrowser: 'Radio Browser',
  'radio-browser': 'Radio Browser',
  'lossless source': 'Lossless Source',
  'lossless-gateway': 'Lossless Source',
  lossless: 'Lossless Source',
};

/**
 * Resolves a consistent, human-readable provider display label.
 * Explicitly prevents "VOID" or "void" from being used as a provider source label.
 */
export function formatProviderLabel(source?: string | null, trackHint?: any): string {
  const raw = String(source ?? trackHint?.source ?? '').trim();
  if (raw && raw.toLowerCase() !== 'void' && raw.toLowerCase() !== 'local') {
    const mapped = PROVIDER_DISPLAY_MAP[raw.toLowerCase()];
    if (mapped) return mapped;
    return raw;
  }

  // Fallback inspection for legacy persisted tracks that lacked an explicit `source` field
  const id = String(trackHint?.id ?? '').replace(/^download:/, '');
  const url = String(trackHint?.downloadUrl || trackHint?.audioUrl || trackHint?.src || '').toLowerCase();

  if (url.includes('saavncdn.com') || url.includes('jiosaavn') || id.startsWith('jiosaavn:')) {
    return 'JioSaavn';
  }
  if (url.includes('archive.org') || id.startsWith('ia:')) {
    return 'Internet Archive';
  }
  if (url.includes('jamendo.com') || url.includes('audius.co') || id.startsWith('jamendo:')) {
    return 'Jamendo';
  }
  if (id.startsWith('radio:') || trackHint?.isLive || trackHint?.album === 'Live Radio') {
    return 'Radio Browser';
  }
  if (id.startsWith('lossless:') || url.includes('lossless-stream')) {
    return 'Lossless Source';
  }
  if (
    url.includes('void-backend') ||
    url.includes('yt-stream://') ||
    url.includes('yt-audio') ||
    url.includes('youtube.com') ||
    url.includes('googlevideo.com') ||
    id.startsWith('yt:') ||
    /^(?:api-)?[\w-]{11}$/.test(id)
  ) {
    return 'YouTube';
  }
  if (id.startsWith('api-')) {
    return 'JioSaavn';
  }

  return '';
}

/**
 * Provider priority order:
 * JioSaavn is locked at #1 (top priority).
 * All other providers below JioSaavn share the same base provider rank (2)
 * so they are ordered by song title / query relevance rather than a rigid provider sequence.
 */
export function getProviderPriorityRank(source?: string | null, trackHint?: any): number {
  const label = formatProviderLabel(source, trackHint);
  if (label === 'JioSaavn') {
    return 1;
  }
  return 2;
}

const SPAM_OR_AD_TITLE_REGEX =
  /\b(benefits of investing|investing in professional|how to invest|real estate investing|digital marketing|seo agency|webinar|sponsored ad|podcast episode|business coaching|forex trading|crypto millionaire|make money online|b2b sales|keynote speech)\b/i;

export function isLikelySpamOrAdResult(item: Pick<SearchResult, 'name' | 'artist' | 'album'>): boolean {
  const combined = `${item.name || ''} ${item.artist || ''} ${item.album || ''}`;
  return SPAM_OR_AD_TITLE_REGEX.test(combined);
}

function collapseSpacedLetters(text: string): string {
  return text.replace(/\b(?:[a-zA-Z]\s+){2,}[a-zA-Z]\b/g, (match) => match.replace(/\s+/g, ''));
}

function normalizeSearchTokens(text: string): string {
  return collapseSpacedLetters(String(text || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isOneCharVariantWord(wordA: string, wordB: string): boolean {
  if (wordA === wordB) return true;
  if (wordA.length < 5 || wordB.length < 5) return false;
  if (Math.abs(wordA.length - wordB.length) > 1) return false;
  // Require same starting 3 chars and same ending 2 chars (e.g., "sadeness" <-> "sadness", but NOT "niceness")
  if (wordA.slice(0, 3) !== wordB.slice(0, 3)) return false;
  if (wordA.slice(-2) !== wordB.slice(-2)) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < wordA.length && j < wordB.length) {
    if (wordA[i] === wordB[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (wordA.length > wordB.length) i++;
      else if (wordB.length > wordA.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < wordA.length || j < wordB.length) edits++;
  return edits <= 1;
}

function extractCoreSongTitle(rawTitle: string, rawArtist: string): string {
  let cleaned = collapseSpacedLetters(String(rawTitle || '').trim());
  const normArtist = normalizeSearchTokens(rawArtist);

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(/\s+-\s+/);
    if (parts.length >= 2) {
      const firstNorm = normalizeSearchTokens(parts[0]);
      if (normArtist && (firstNorm === normArtist || normArtist.includes(firstNorm) || firstNorm.includes(normArtist))) {
        cleaned = parts.slice(1).join(' - ');
      } else {
        cleaned = parts.slice(1).join(' - ') + ' ' + parts[0];
      }
    }
  }

  const strippedParens = cleaned
    .replace(/\((?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|hd|4k)|full\s*version|high\s*q[uo]ality[^)]*|lyrics?|audio|hd|hq|4k)\)/gi, '')
    .replace(/\[(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|hd|4k)|full\s*version|high\s*q[uo]ality[^\]]*|lyrics?|audio|hd|hq|4k)\]/gi, '');

  return normalizeSearchTokens(strippedParens);
}

function extractPartOrder(title: string): number {
  const lower = String(title || '').toLowerCase();
  const romanMatch = lower.match(/\b(?:part|pt\.?)\s*(i{1,3}|iv|v)\b/i);
  if (romanMatch) {
    const roman = romanMatch[1].toLowerCase();
    if (roman === 'i') return 1;
    if (roman === 'ii') return 2;
    if (roman === 'iii') return 3;
    if (roman === 'iv') return 4;
    if (roman === 'v') return 5;
  }
  const numMatch = lower.match(/\b(?:part|pt\.?)\s*(\d+)\b/i);
  if (numMatch) {
    const n = Number.parseInt(numMatch[1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 20) return n;
  }
  return 0;
}

/**
 * Computes a fine-grained relevance score for a search result against the user's query.
 * Higher score = stronger match. Unrelated results (e.g. "niceness" for "sadeness") score 0.
 */
export function getSearchRelevanceScore(
  item: Pick<SearchResult, 'name' | 'artist' | 'album'>,
  query?: string
): { tier: number; exactSpelling: number; partOrder: number } {
  const normQuery = normalizeSearchTokens(query || '');
  if (!normQuery) {
    return { tier: 500, exactSpelling: 1, partOrder: 0 };
  }

  if (isLikelySpamOrAdResult(item)) {
    return { tier: -100, exactSpelling: 0, partOrder: 99 };
  }

  const queryWords = normQuery.split(' ').filter(Boolean);
  const normTitle = normalizeSearchTokens(item.name || '');
  const normArtist = normalizeSearchTokens(item.artist || '');
  const titleWords = normTitle.split(' ').filter(Boolean);
  const artistWords = normArtist.split(' ').filter(Boolean);
  const allWords = [...titleWords, ...artistWords];
  const coreTitle = extractCoreSongTitle(item.name || '', item.artist || '');
  const coreWords = coreTitle.split(' ').filter(Boolean);
  const partOrder = extractPartOrder(item.name || '');

  const hasExactWordInTitle = queryWords.every((qw) => titleWords.includes(qw));
  const hasVariantWordInTitle = queryWords.every((qw) =>
    titleWords.some((tw) => isOneCharVariantWord(qw, tw))
  );
  const hasExactWordInAll = queryWords.every((qw) => allWords.includes(qw));
  const hasVariantWordInAll = queryWords.every((qw) =>
    allWords.some((aw) => isOneCharVariantWord(qw, aw))
  );

  const exactSpelling = hasExactWordInTitle ? 2 : hasVariantWordInTitle ? 1 : 0;

  // 1. Exact song title match (e.g. "Sadeness" or "Enigma - Sadeness (Full Version)")
  if (normTitle === normQuery || coreTitle === normQuery) {
    return { tier: 1000, exactSpelling: 2, partOrder };
  }
  if (
    queryWords.length === 1 &&
    coreWords.length === 1 &&
    isOneCharVariantWord(queryWords[0], coreWords[0])
  ) {
    return { tier: 980, exactSpelling: 1, partOrder };
  }

  // 2. Song title starts with the query (e.g. "Sadeness (Part I)", "Sadeness - Enigma")
  if (
    normTitle.startsWith(normQuery + ' ') ||
    coreTitle.startsWith(normQuery + ' ')
  ) {
    return { tier: 940, exactSpelling: 2, partOrder };
  }
  if (
    queryWords.length === 1 &&
    ((titleWords.length > 0 && isOneCharVariantWord(queryWords[0], titleWords[0])) ||
      (coreWords.length > 0 && isOneCharVariantWord(queryWords[0], coreWords[0])))
  ) {
    return { tier: 910, exactSpelling: 1, partOrder };
  }

  // 3. All query words appear in the song title as whole words (e.g. "Enigma - Sadeness (Part I)", "Enigma - Sadness (slowed & reverb)")
  if (hasExactWordInTitle) {
    return { tier: 860, exactSpelling: 2, partOrder };
  }
  if (hasVariantWordInTitle) {
    return { tier: 820, exactSpelling: 1, partOrder };
  }

  // 4. All query words appear across Title + Artist as whole words
  if (hasExactWordInAll) {
    return { tier: 720, exactSpelling: 2, partOrder };
  }
  if (hasVariantWordInAll) {
    return { tier: 680, exactSpelling: 1, partOrder };
  }

  // 5. Substring match where the full query is contained in the title or artist
  if (normTitle.includes(normQuery)) {
    return { tier: 520, exactSpelling: 1, partOrder };
  }
  if (normArtist.includes(normQuery)) {
    return { tier: 450, exactSpelling: 1, partOrder };
  }

  // 6. Multi-word query partial whole-word match (only for significant words >= 4 chars)
  const significantQueryWords = queryWords.filter((w) => w.length >= 4);
  if (
    significantQueryWords.length > 1 &&
    significantQueryWords.some((qw) =>
      titleWords.some((tw) => tw === qw || isOneCharVariantWord(qw, tw))
    )
  ) {
    return { tier: 300, exactSpelling: 0, partOrder };
  }

  // 7. Unrelated fuzzy results (e.g. "niceness" for "sadeness" that only share "-ness") -> bottom (0)
  return { tier: 0, exactSpelling: 0, partOrder: 99 };
}

const LOSSY_CODECS = /\b(mp3|mpeg|aac|m4a|mp4a|ogg|vorbis|opus|wma|webm|amr)\b/i;
const LOSSLESS_CODECS = /\b(flac|alac|wav|wave|aiff|aif|pcm|ape|wv|wavpack)\b/i;
const LOSSY_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|webm|wma)$/i;
const LOSSLESS_EXTENSIONS = /\.(flac|wav|wave|aiff|aif|alac)$/i;

function extractPathExtension(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url, 'https://localhost');
    const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
    const match = pathname.match(/\.[a-z0-9]{2,5}$/);
    return match ? match[0] : '';
  } catch {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    const match = clean.match(/\.[a-z0-9]{2,5}$/);
    return match ? match[0] : '';
  }
}

function parseExplicitBitrateFromFormat(formatHint?: string, url?: string): number | undefined {
  const text = `${formatHint || ''} ${url || ''}`;
  const kbpsMatch = text.match(/\b(\d{2,4})\s*k(?:bps|bit\/s|b\/s)?\b/i);
  if (kbpsMatch) {
    const value = Number.parseInt(kbpsMatch[1], 10);
    if (Number.isFinite(value) && value >= 8 && value <= 9600) return value;
  }
  if (url) {
    if (/_320\.(mp4|m4a|mp3)/i.test(url)) return 320;
    if (/_160\.(mp4|m4a|mp3)/i.test(url)) return 160;
    if (/_96\.(mp4|m4a|mp3)/i.test(url)) return 96;
  }
  return undefined;
}

function mapBitrateToTier(kbps: number): QualityTier {
  if (kbps >= 700) return 'Lossless';
  if (kbps >= 280) return 'Very High (320kbps)';
  if (kbps >= 248) return 'High (256kbps)';
  if (kbps >= 215) return 'High (240kbps)';
  if (kbps >= 175) return 'High (192kbps)';
  if (kbps >= 140) return 'High (160kbps)';
  if (kbps >= 96) return 'Standard (128kbps)';
  return 'Low';
}

/**
 * Determines the most accurate QualityTier supported by the available evidence.
 * Never returns "Unknown" — always resolves to the researched/inspected tier for the stream.
 */
export function detectTrackQuality(
  url: string,
  formatHint?: string,
  bitrateHint?: number,
  options?: QualityDetectionOptions
): QualityTier {
  const cleanUrl = String(url ?? '').trim();
  const cleanFormat = String(formatHint ?? '').trim();
  const cleanCodec = String(options?.codecHint ?? '').trim();
  const cleanMime = String(options?.mimeTypeHint ?? '').trim().toLowerCase();
  const combinedHint = `${cleanFormat} ${cleanCodec} ${cleanMime}`.trim();
  const ext = extractPathExtension(cleanUrl);

  const numericBitrate =
    typeof bitrateHint === 'number' && Number.isFinite(bitrateHint) && bitrateHint > 0
      ? bitrateHint
      : parseExplicitBitrateFromFormat(cleanFormat, cleanUrl);

  const isLiveStream =
    Boolean(options?.isLive) ||
    /\b(live\s*radio|flac\s*live|icecast|shoutcast|radio\s*stream)\b/i.test(cleanFormat);

  const hasLossyEvidence =
    LOSSY_EXTENSIONS.test(ext) ||
    LOSSY_CODECS.test(combinedHint) ||
    cleanMime === 'audio/mpeg' ||
    cleanMime === 'audio/mp4' ||
    cleanMime === 'audio/aac' ||
    cleanMime === 'audio/ogg' ||
    cleanMime === 'audio/webm' ||
    cleanMime === 'audio/opus';

  const hasLosslessEvidence =
    !hasLossyEvidence &&
    (LOSSLESS_EXTENSIONS.test(ext) ||
      LOSSLESS_CODECS.test(combinedHint) ||
      cleanMime.includes('flac') ||
      cleanMime.includes('wav') ||
      cleanMime.includes('aiff') ||
      cleanMime.includes('alac'));

  // 1. Live Radio / Live Stream handling
  if (isLiveStream) {
    if (hasLosslessEvidence || /\bflac\b/i.test(combinedHint)) {
      return 'FLAC Live';
    }
    if (numericBitrate !== undefined) {
      return mapBitrateToTier(numericBitrate);
    }
    return 'Live Radio';
  }

  // 2. Lossless check
  if (hasLosslessEvidence) {
    return 'Lossless';
  }
  if (!hasLossyEvidence && numericBitrate !== undefined && numericBitrate >= 700) {
    return 'Lossless';
  }

  // 3. Explicit / Probed Bitrate
  if (numericBitrate !== undefined && numericBitrate > 0) {
    return mapBitrateToTier(numericBitrate);
  }

  // 4. Research-backed provider / codec / stream inference (never returns 'Unknown')
  const lowerUrl = cleanUrl.toLowerCase();
  const provider = formatProviderLabel(options?.sourceHint, { downloadUrl: cleanUrl });

  if (lowerUrl.includes('saavncdn.com') || provider === 'JioSaavn') {
    if (lowerUrl.includes('_96.')) return 'Standard (128kbps)';
    if (lowerUrl.includes('_160.')) return 'High (160kbps)';
    return 'Very High (320kbps)';
  }

  if (provider === 'Lossless Source') {
    return 'Lossless';
  }

  if (provider === 'Jamendo' || lowerUrl.includes('jamendo.com')) {
    return 'High (192kbps)';
  }

  if (provider === 'Internet Archive' || lowerUrl.includes('archive.org')) {
    if (/\b(vbr|320)\b/i.test(combinedHint)) return 'Very High (320kbps)';
    return 'High (192kbps)';
  }

  if (
    provider === 'YouTube' ||
    lowerUrl.startsWith('yt-stream://') ||
    lowerUrl.includes('yt-audio') ||
    lowerUrl.includes('googlevideo.com')
  ) {
    if (/\bopus|webm\b/i.test(combinedHint)) return 'High (160kbps)';
    if (/\baac|mp4|m4a\b/i.test(combinedHint)) return 'Standard (128kbps)';
    return 'High (160kbps)';
  }

  if (/\bopus\b/i.test(combinedHint)) return 'High (160kbps)';
  if (/\b(aac|m4a|mp4)\b/i.test(combinedHint)) return 'High (192kbps)';
  if (/\bmp3|mpeg\b/i.test(combinedHint)) return 'High (192kbps)';

  return 'Standard (128kbps)';
}

/**
 * Resolves a quality badge for any track object (SearchResult, downloaded track, or local library Track).
 * Never returns 'Unknown' — calculates real bitrate from file size & duration or provider stream profile.
 */
export function getTrackQualityBadge(track: any): QualityTier | undefined {
  if (!track) return undefined;

  if (track.qualityBadge && track.qualityBadge !== 'Unknown') {
    return track.qualityBadge as QualityTier;
  }

  const url = String(track.downloadUrl || track.audioUrl || track.src || track.fileName || '');
  const formatHint = String(track.format || track.codec || track.mimeType || '');
  let bitrateHint = typeof track.bitrate === 'number' && track.bitrate > 0 ? track.bitrate : undefined;
  const isLive = Boolean(track.isLive || track.album === 'Live Radio');

  // Calculate exact real bitrate (kbps) whenever blob/fileSize and duration are available
  const byteSize =
    Number(track.fileSize) ||
    (track.blob instanceof Blob ? track.blob.size : 0) ||
    (track.file instanceof Blob ? track.file.size : 0);
  const durationSec = Number(track.duration) || 0;

  if (!bitrateHint && byteSize > 0 && durationSec > 5) {
    const calculatedKbps = Math.round((byteSize * 8) / 1000 / durationSec);
    if (calculatedKbps >= 24 && calculatedKbps <= 9600) {
      bitrateHint = calculatedKbps;
    }
  }

  const ext = extractPathExtension(track.fileName || url);
  if (LOSSLESS_EXTENSIONS.test(ext) || /flac|wav|aiff|alac/i.test(track.mimeType || '')) {
    return isLive ? 'FLAC Live' : 'Lossless';
  }

  return detectTrackQuality(url, formatHint, bitrateHint, {
    codecHint: track.codec,
    mimeTypeHint: track.mimeType || track.blob?.type || track.file?.type,
    isLive,
    sourceHint: track.source,
  });
}

/**
 * Priority rank for audio quality tiers.
 */
export function getQualitySortRank(result: Pick<SearchResult, 'qualityBadge' | 'qualityVerified' | 'isLive'>): number {
  const badge = result.qualityBadge ?? 'Standard (128kbps)';
  const verified = Boolean(result.qualityVerified);

  if (result.isLive || badge === 'Live Radio' || badge === 'FLAC Live') {
    if (badge === 'FLAC Live') return verified ? 95 : 88;
    if (badge === 'Very High (320kbps)') return 82;
    if (badge === 'High (256kbps)' || badge === 'High (240kbps)') return 74;
    if (badge === 'High (192kbps)' || badge === 'High (160kbps)') return 66;
    if (badge === 'Standard (128kbps)') return 50;
    return 40;
  }

  switch (badge) {
    case 'Lossless':
      return verified ? 100 : 90;
    case 'Very High (320kbps)':
      return verified ? 84 : 76;
    case 'High (256kbps)':
    case 'High (240kbps)':
      return verified ? 74 : 68;
    case 'High (192kbps)':
    case 'High (160kbps)':
      return verified ? 66 : 60;
    case 'Standard (128kbps)':
      return verified ? 52 : 44;
    case 'Low':
    default:
      return verified ? 32 : 28;
  }
}

/**
 * Orders search results by:
 * 1. JioSaavn locked at #1 (top priority).
 * 2. Below JioSaavn (and within JioSaavn), song title / query match relevance (exact/matching song names first,
 *    unrelated fuzzy matches like "niceness" for "sadeness" at the very bottom).
 * 3. Systematic part ordering (Part I before Part II).
 * 4. Audio quality tier & bitrate as tie-breaker.
 */
export function compareResultsByQuality(a: SearchResult, b: SearchResult, query?: string): number {
  const providerDiff = getProviderPriorityRank(a.source, a) - getProviderPriorityRank(b.source, b);
  if (providerDiff !== 0) return providerDiff;

  if (query) {
    const relA = getSearchRelevanceScore(a, query);
    const relB = getSearchRelevanceScore(b, query);
    if (relB.tier !== relA.tier) {
      return relB.tier - relA.tier;
    }
    if (relB.exactSpelling !== relA.exactSpelling) {
      return relB.exactSpelling - relA.exactSpelling;
    }
    if (relA.partOrder !== relB.partOrder) {
      if (relA.partOrder > 0 && relB.partOrder > 0) {
        return relA.partOrder - relB.partOrder;
      }
      if (relA.partOrder > 0 && relB.partOrder === 0) return -1;
      if (relB.partOrder > 0 && relA.partOrder === 0) return 1;
    }
  }

  const rankDiff = getQualitySortRank(b) - getQualitySortRank(a);
  if (rankDiff !== 0) return rankDiff;

  const bitrateA = a.bitrate ?? 0;
  const bitrateB = b.bitrate ?? 0;
  if (bitrateB !== bitrateA) return bitrateB - bitrateA;
  return 0;
}

/**
 * Extracts normalized version markers (remix, live, acoustic, slowed, etc.) so
 * distinct releases or arrangements are never merged as duplicates.
 */
function extractVersionSignature(title: string): string {
  const lower = title.toLowerCase();
  const markers: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(live|concert|unplugged)\b/, 'live'],
    [/\b(remix|mix|vip|bootleg|flip|mashup)\b/, 'remix'],
    [/\b(acoustic|stripped)\b/, 'acoustic'],
    [/\b(instrumental|karaoke)\b/, 'instrumental'],
    [/\b(slowed|reverb|sped\s*up|nightcore)\b/, 'altered'],
    [/\b(remaster(?:ed)?)\b/, 'remaster'],
    [/\b(radio\s*edit|extended|club\s*mix)\b/, 'edit'],
    [/\b(cover)\b/, 'cover'],
    [/\b(lofi|lo-fi)\b/, 'lofi'],
  ];
  for (const [regex, tag] of patterns) {
    if (regex.test(lower)) markers.push(tag);
  }
  return markers.sort().join('|');
}

function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&quot;/g, '"')
    .replace(/\((?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video)|lyrics?|audio|hd|hq|4k)\)/gi, '')
    .replace(/\[(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video)|lyrics?|audio|hd|hq|4k)\]/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePrimaryArtist(artist: string): string {
  const first = String(artist || '')
    .split(/(?:,|;|&|\bfeat\.?\b|\bft\.?\b|\/)/i)[0]
    ?.trim() || '';
  return normalizeForDedup(first);
}

/**
 * Carefully deduplicates unified search results while preserving distinct versions,
 * live recordings, remixes, and live radio stations, removes obvious ad/spam items,
 * and sorts with JioSaavn locked at #1 and all remaining results ordered by song name relevance.
 */
export function deduplicateAndSortSearchResults(results: SearchResult[], query?: string): SearchResult[] {
  const byExactId = new Map<string, SearchResult>();

  for (const item of results) {
    if (!item || !item.id || !item.downloadUrl) continue;
    if (isLikelySpamOrAdResult(item)) continue;
    const exactKey = `${(item.source || '').toLowerCase()}:${item.id}`;
    const existing = byExactId.get(exactKey);
    if (!existing || compareResultsByQuality(item, existing, query) < 0) {
      byExactId.set(exactKey, item);
    }
  }

  const uniqueById = Array.from(byExactId.values());
  const merged: SearchResult[] = [];

  for (const candidate of uniqueById) {
    // Never merge live radio stations with recorded tracks
    if (candidate.isLive || candidate.qualityBadge === 'Live Radio' || candidate.qualityBadge === 'FLAC Live') {
      const dupStationIdx = merged.findIndex(
        existing =>
          (existing.isLive || existing.qualityBadge === 'Live Radio' || existing.qualityBadge === 'FLAC Live') &&
          (existing.downloadUrl === candidate.downloadUrl ||
            (normalizeForDedup(existing.name) === normalizeForDedup(candidate.name) &&
              existing.bitrate === candidate.bitrate))
      );
      if (dupStationIdx === -1) {
        merged.push(candidate);
      } else if (compareResultsByQuality(candidate, merged[dupStationIdx], query) < 0) {
        merged[dupStationIdx] = candidate;
      }
      continue;
    }

    const candTitle = normalizeForDedup(candidate.name);
    const candArtist = normalizePrimaryArtist(candidate.artist);
    const candVersion = extractVersionSignature(candidate.name);

    if (!candTitle) {
      merged.push(candidate);
      continue;
    }

    const dupIdx = merged.findIndex(existing => {
      if (existing.isLive || existing.qualityBadge === 'Live Radio' || existing.qualityBadge === 'FLAC Live') {
        return false;
      }
      // Keep results from different providers visible in the unified list; only deduplicate within the same provider.
      if (formatProviderLabel(existing.source, existing) !== formatProviderLabel(candidate.source, candidate)) {
        return false;
      }
      const exTitle = normalizeForDedup(existing.name);
      const exArtist = normalizePrimaryArtist(existing.artist);
      const exVersion = extractVersionSignature(existing.name);

      if (candTitle !== exTitle || candVersion !== exVersion) return false;
      if (candArtist && exArtist && candArtist !== exArtist) return false;

      if (candidate.duration > 0 && existing.duration > 0) {
        if (Math.abs(candidate.duration - existing.duration) > 8) return false;
      }

      return true;
    });

    if (dupIdx === -1) {
      merged.push(candidate);
    } else if (compareResultsByQuality(candidate, merged[dupIdx], query) < 0) {
      merged[dupIdx] = candidate;
    }
  }

  return merged.sort((a, b) => compareResultsByQuality(a, b, query));
}
