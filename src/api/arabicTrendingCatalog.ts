import type { QualityTier } from "./quality";
import type { TrendingTrackItem } from "./trendingApi";
import {
  extractCleanYouTubeId,
  resolveYouTubePlayableStream,
  searchYouTube,
} from "./youtubeApi";

export interface ArabicArtistSeed {
  artistAr: string;
  artistEn: string;
  aliasesEn: readonly string[];
  country: string;
  basePopularity: number;
}

/**
 * 40 Top Arab Artists (UAE / GCC / Levant / Egypt / Iraq / Maghreb).
 * All old hardcoded song lists have been removed — songs are deep-searched live
 * (5 verified songs per artist = 200 songs) with JioSaavn 320kbps as #1 priority
 * and automatic YouTube fallback when a genuine Arabic track is not on JioSaavn.
 */
export const TOP_40_ARABIC_ARTISTS: readonly ArabicArtistSeed[] = [
  { artistAr: "عمرو دياب", artistEn: "Amr Diab", aliasesEn: ["Amr Diab", "Amr Diyab"], country: "Egypt", basePopularity: 995 },
  { artistAr: "ميحد حمد", artistEn: "Mehad Hamad", aliasesEn: ["Mehad Hamad", "Maihad Hamad", "Mihad Hamad"], country: "UAE", basePopularity: 992 },
  { artistAr: "حسين الجسمي", artistEn: "Hussain Al Jassmi", aliasesEn: ["Hussain Al Jassmi", "Hussein Al Jassmi", "Hussain Aljassmi"], country: "UAE", basePopularity: 988 },
  { artistAr: "راشد الماجد", artistEn: "Rashid Al Majed", aliasesEn: ["Rashid Al Majed", "Rashed Al Majid", "Rashed Al Majed", "Rashid Al Majid"], country: "Saudi Arabia", basePopularity: 984 },
  { artistAr: "عبد المجيد عبدالله", artistEn: "Abdul Majeed Abdullah", aliasesEn: ["Abdul Majeed Abdullah", "Abdulmajeed Abdullah"], country: "Saudi Arabia", basePopularity: 980 },
  { artistAr: "محمد عبده", artistEn: "Mohammed Abdu", aliasesEn: ["Mohammed Abdu", "Mohamed Abdu", "Mohammad Abdu"], country: "Saudi Arabia", basePopularity: 976 },
  { artistAr: "الشامي", artistEn: "Al Shami", aliasesEn: ["Al Shami", "Alshami"], country: "Syria", basePopularity: 973 },
  { artistAr: "عيضة المنهالي", artistEn: "Eida Al Menhali", aliasesEn: ["Eida Al Menhali", "Aida Al Menhali"], country: "UAE", basePopularity: 969 },
  { artistAr: "ماجد المهندس", artistEn: "Majid Al Mohandis", aliasesEn: ["Majid Al Mohandis", "Majid Al Muhandis", "Majed Al Mohandes"], country: "Saudi Arabia", basePopularity: 965 },
  { artistAr: "نانسي عجرم", artistEn: "Nancy Ajram", aliasesEn: ["Nancy Ajram"], country: "Lebanon", basePopularity: 961 },
  { artistAr: "إليسا", artistEn: "Elissa", aliasesEn: ["Elissa"], country: "Lebanon", basePopularity: 958 },
  { artistAr: "شيرين عبدالوهاب", artistEn: "Sherine", aliasesEn: ["Sherine", "Sherine Abdel Wahab", "Sherine Abdelwahab"], country: "Egypt", basePopularity: 954 },
  { artistAr: "محمد عساف", artistEn: "Mohammed Assaf", aliasesEn: ["Mohammed Assaf", "Mohamed Assaf", "Mohammad Assaf"], country: "Palestine", basePopularity: 951 },
  { artistAr: "أحلام", artistEn: "Ahlam", aliasesEn: ["Ahlam", "Ahlam Alshamsi", "Ahlam Al Shamsi"], country: "UAE", basePopularity: 947 },
  { artistAr: "عايض", artistEn: "Ayed", aliasesEn: ["Ayed", "Ayed Yousef"], country: "Saudi Arabia", basePopularity: 944 },
  { artistAr: "نوال الكويتية", artistEn: "Nawal El Kuwaitia", aliasesEn: ["Nawal El Kuwaitia", "Nawal Al Kuwaitia"], country: "Kuwait", basePopularity: 940 },
  { artistAr: "فهد الكبيسي", artistEn: "Fahad Al Kubaisi", aliasesEn: ["Fahad Al Kubaisi", "Fahad Alkubaisi"], country: "Qatar", basePopularity: 937 },
  { artistAr: "أحمد سعد", artistEn: "Ahmed Saad", aliasesEn: ["Ahmed Saad", "Ahmad Saad"], country: "Egypt", basePopularity: 934 },
  { artistAr: "تامر حسني", artistEn: "Tamer Hosny", aliasesEn: ["Tamer Hosny", "Tamer Hosni"], country: "Egypt", basePopularity: 930 },
  { artistAr: "أصالة نصري", artistEn: "Assala", aliasesEn: ["Assala", "Assala Nasri", "Asala", "Asala Nasri"], country: "Syria", basePopularity: 927 },
  { artistAr: "كاظم الساهر", artistEn: "Kadim Al Sahir", aliasesEn: ["Kadim Al Sahir", "Kazem El Saher", "Kadhem Al Saher", "Kazem Al Saher"], country: "Iraq", basePopularity: 924 },
  { artistAr: "رابح صقر", artistEn: "Rabeh Saqer", aliasesEn: ["Rabeh Saqer", "Rabeh Sager"], country: "Saudi Arabia", basePopularity: 920 },
  { artistAr: "عبدالله الرويشد", artistEn: "Abdullah Al Rowaished", aliasesEn: ["Abdullah Al Rowaished", "Abdallah Al Rowaished"], country: "Kuwait", basePopularity: 917 },
  { artistAr: "نبيل شعيل", artistEn: "Nabil Shuail", aliasesEn: ["Nabil Shuail", "Nabeel Shuail"], country: "Kuwait", basePopularity: 914 },
  { artistAr: "بلقيس", artistEn: "Balqees", aliasesEn: ["Balqees", "Balqees Fathi", "Balqis"], country: "UAE", basePopularity: 911 },
  { artistAr: "سعد لمجرد", artistEn: "Saad Lamjarred", aliasesEn: ["Saad Lamjarred"], country: "Morocco", basePopularity: 908 },
  { artistAr: "وائل كفوري", artistEn: "Wael Kfoury", aliasesEn: ["Wael Kfoury"], country: "Lebanon", basePopularity: 905 },
  { artistAr: "ناصيف زيتون", artistEn: "Nassif Zeytoun", aliasesEn: ["Nassif Zeytoun", "Nassif Zaitoun"], country: "Syria", basePopularity: 902 },
  { artistAr: "فؤاد عبدالواحد", artistEn: "Fouad Abdulwahed", aliasesEn: ["Fouad Abdulwahed", "Fuad Abdulwahed"], country: "UAE", basePopularity: 899 },
  { artistAr: "داليا مبارك", artistEn: "Dalia Mubarak", aliasesEn: ["Dalia Mubarak"], country: "Saudi Arabia", basePopularity: 896 },
  { artistAr: "رحمة رياض", artistEn: "Rahma Riad", aliasesEn: ["Rahma Riad", "Rahma Riyad"], country: "Iraq", basePopularity: 893 },
  { artistAr: "سيف نبيل", artistEn: "Saif Nabeel", aliasesEn: ["Saif Nabeel", "Saif Nabil"], country: "Iraq", basePopularity: 890 },
  { artistAr: "مروان عبدالحميد", artistEn: "Saint Levant", aliasesEn: ["Saint Levant", "Marwan Abdelhamid"], country: "Palestine", basePopularity: 887 },
  { artistAr: "إليانا", artistEn: "Elyanna", aliasesEn: ["Elyanna"], country: "Palestine", basePopularity: 884 },
  { artistAr: "بهاء سلطان", artistEn: "Bahaa Sultan", aliasesEn: ["Bahaa Sultan", "Baha Sultan"], country: "Egypt", basePopularity: 881 },
  { artistAr: "حمزة نمرة", artistEn: "Hamza Namira", aliasesEn: ["Hamza Namira", "Hamza Namera"], country: "Egypt", basePopularity: 878 },
  { artistAr: "محمد حماقي", artistEn: "Mohamed Hamaki", aliasesEn: ["Mohamed Hamaki", "Mohammed Hamaki", "Hamaki"], country: "Egypt", basePopularity: 875 },
  { artistAr: "أصيل أبوبكر", artistEn: "Aseel Abu Bakr", aliasesEn: ["Aseel Abu Bakr", "Aseel Abubakr"], country: "Saudi Arabia", basePopularity: 872 },
  { artistAr: "بدر الشعيبي", artistEn: "Bader Al Shuaibi", aliasesEn: ["Bader Al Shuaibi", "Badr Al Shuaibi"], country: "Kuwait", basePopularity: 869 },
  { artistAr: "هند البحرينية", artistEn: "Hind Al Bahrainia", aliasesEn: ["Hind Al Bahrainia"], country: "Bahrain", basePopularity: 866 },
];

const JIOSAAVN_API_BASE = "https://elitejiosaavn-api.vercel.app/api";
const DEEP_CATALOG_STORAGE_KEY = "void-arabic-deep-catalog-v8";
const ARTWORK_STORAGE_KEY = "void-arabic-art-v9";
const STICKY_COVER_STORAGE_KEY = "void-sticky-covers-v9";
const STREAM_STORAGE_KEY = "void-arabic-stream-v8";
const STREAM_META_STORAGE_KEY = "void-arabic-stream-meta-v8";
const RANK3_MOUNIR_STORAGE_KEY = "void-arabic-rank3-mounir-v2";

// Purge old caches and keep localStorage well below Safari's 5MB quota on startup
try {
  if (typeof localStorage !== "undefined") {
    const keysToRemove: string[] = [];
    const multiLangKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("void-trending-cache-") || k.startsWith("void-artist-top100-")) {
        keysToRemove.push(k);
        continue;
      }
      if (k.startsWith("void-multilang-deep-")) {
        multiLangKeys.push(k);
        continue;
      }
      if (
        (k.startsWith("void-arabic-") ||
          k.startsWith("void-sticky-covers-") ||
          k === "void-remote-favorites") &&
        k !== DEEP_CATALOG_STORAGE_KEY &&
        k !== ARTWORK_STORAGE_KEY &&
        k !== STICKY_COVER_STORAGE_KEY &&
        k !== STREAM_STORAGE_KEY &&
        k !== STREAM_META_STORAGE_KEY &&
        k !== RANK3_MOUNIR_STORAGE_KEY
      ) {
        keysToRemove.push(k);
      }
    }
    // Keep at most 2 multi-language catalogs in localStorage so quota is never exceeded
    if (multiLangKeys.length > 2) {
      keysToRemove.push(...multiLangKeys.slice(2));
    }
    for (const k of keysToRemove) {
      if (k === "void-remote-favorites") {
        try {
          const favs = JSON.parse(localStorage.getItem(k) || "[]");
          if (Array.isArray(favs)) {
            const cleaned = favs.filter((item: any) => {
              const idStr = String(item?.id || "");
              if (/^(?:api-|download:)?ar-\d+-\d+$/.test(idStr) || idStr.includes("-seed-")) return false;
              const titleStr = String(item?.title || item?.name || "");
              const albumStr = String(item?.album || "");
              if (/leila\s+ya\s+samra/i.test(titleStr) && /super\s*hits/i.test(albumStr)) return false;
              return true;
            });
            localStorage.setItem(k, JSON.stringify(cleaned));
          }
        } catch {
          localStorage.removeItem(k);
        }
      } else {
        localStorage.removeItem(k);
      }
    }
  }
} catch {
  /* ignore storage errors */
}

const INDIC_AND_NON_ARABIC_SCRIPT_REGEX = /[\u0900-\u0D7F\u0E00-\u0E7F\u3000-\u9FFF\uAC00-\uD7AF]/;

const UNWANTED_VERSION_REGEX =
  /\b(karaoke|instrumental|tribute|in the style of|originally performed by|made famous by|backing track|minus one|without vocals|no vocals|ringtone|8d|16d|slowed|reverb|sped up|nightcore|cover|lofi|lo-fi|mashup|dj\s*mix|remix|piano version|guitar version|violin version|oud version|qanun|shorts|whatsapp status|ameritz|done again|sunfly|karafun|sing king|party tyme|hit crew|countdown)\b|كاريوكي|بدون موسيقى|بدون ايقاع|موسيقى فقط|نسخة موسيقية|ريمكس|بطيء|مسرع/i;

const BLOCKED_LANGUAGES_REGEX =
  /\b(hindi|tamil|bengali|telugu|malayalam|kannada|punjabi|marathi|gujarati|urdu|bhojpuri|odia|oriya|assamese|haryanvi|rajasthani|nepali|sinhala|bollywood|kollywood|tollywood|mollywood)\b/i;

function decodeHtml(input: string): string {
  return String(input || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function normalizeArabicText(input: string): string {
  return String(input || "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeLatinArtistOrTitle(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(el|al)\b/g, " ")
    .replace(/\b(mohammed|mohamed|muhammad|mohamad)\b/g, "mohamed")
    .replace(/\b(hussain|hussein|hosein)\b/g, "hussain")
    .replace(/\b(rashed|rashid)\b/g, "rashid")
    .replace(/\b(majed|majid|majeed)\b/g, "majed")
    .replace(/\b(abdul\s+majed|abdel\s+majed|abdulmajeed|abdelmajeed|abdulmajid)\b/g, "abdulmajed")
    .replace(/\b(abdu|abdo|abdou)\b/g, "abdu")
    .replace(/\b(abdullah|abdallah)\b/g, "abdullah")
    .replace(/\b(kfoury|kafoury|kfouri)\b/g, "kfoury")
    .replace(/\b(kazem|kadim|kadhem|kathem)\b/g, "kadim")
    .replace(/\b(saher|sahir)\b/g, "sahir")
    .replace(/\b(assala|asala|assalah)\b/g, "assala")
    .replace(/\b(balqees|balqis)\b/g, "balqees")
    .replace(/\b(zeytoun|zaitoun)\b/g, "zeytoun")
    .replace(/\b(nabeel|nabil)\b/g, "nabil")
    .replace(/\b(mehad|maihad|mihad)\b/g, "mehad")
    .replace(/\b(fouad|fuad)\b/g, "fouad")
    .replace(/\b(saqer|sager|saqr)\b/g, "saqer")
    .replace(/\b(rowaished|ruwaished)\b/g, "rowaished")
    .replace(/\b(mohandis|muhandis|mohandes)\b/g, "mohandis")
    .replace(/\b(menhali|minhali)\b/g, "menhali")
    .replace(/\b(kubaisi|kobaisi)\b/g, "kubaisi")
    .replace(/\b(shuaibi|shuaiby)\b/g, "shuaibi")
    .replace(/\b(bahaa|baha)\b/g, "bahaa")
    .replace(/\b(namira|namera)\b/g, "namira")
    .replace(/\s+/g, " ")
    .trim();
}

function doesSingleArtistNameMatchSeed(candidateArtistName: string, seed: ArabicArtistSeed): boolean {
  if (!candidateArtistName) return false;
  if (INDIC_AND_NON_ARABIC_SCRIPT_REGEX.test(candidateArtistName)) return false;
  if (UNWANTED_VERSION_REGEX.test(candidateArtistName)) return false;

  const candAr = normalizeArabicText(candidateArtistName);
  const seedAr = normalizeArabicText(seed.artistAr);
  if (seedAr.length >= 3 && candAr) {
    if (candAr === seedAr) return true;
    const seedArTokens = seedAr.split(" ").filter((w) => w.length >= 2);
    const candArTokens = candAr.split(" ").filter((w) => w.length >= 2);
    if (seedArTokens.length >= 2 && seedArTokens.every((t) => candArTokens.includes(t))) {
      return true;
    }
  }

  const candEn = normalizeLatinArtistOrTitle(candidateArtistName);
  if (!candEn) return false;
  const candEnTokens = candEn.split(" ").filter(Boolean);

  for (const alias of [seed.artistEn, ...seed.aliasesEn]) {
    const aliasEn = normalizeLatinArtistOrTitle(alias);
    if (!aliasEn) continue;
    if (candEn === aliasEn) return true;
    const aliasTokens = aliasEn.split(" ").filter(Boolean);
    if (aliasTokens.length >= 2 && aliasTokens.every((t) => candEnTokens.includes(t))) {
      return true;
    }
  }

  return false;
}

function doesJioSongMatchArtist(song: any, seed: ArabicArtistSeed): boolean {
  const primaryList: string[] = Array.isArray(song?.artists?.primary)
    ? song.artists.primary.map((a: any) => decodeHtml(String(a?.name || "")))
    : String(song?.primaryArtists || "")
        .split(",")
        .map((s) => decodeHtml(s));

  if (!primaryList.length) return false;
  return primaryList.some((pName) => doesSingleArtistNameMatchSeed(pName, seed));
}

function loadJsonMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveJsonMap(key: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

export interface CachedStreamMeta {
  url: string;
  source?: string;
  bitrate?: number;
  codec?: string;
  mimeType?: string;
  format?: string;
  qualityBadge?: string;
  fallbackUrls?: string[];
  duration?: number;
  image?: string;
}

function loadStreamMetaMap(): Record<string, CachedStreamMeta> {
  try {
    const raw = localStorage.getItem(STREAM_META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStreamMetaMap(map: Record<string, CachedStreamMeta>): void {
  try {
    localStorage.setItem(STREAM_META_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

function isValidDirectAudioUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) return false;
  const clean = url.trim();
  if (clean.startsWith("trending-resolve://") || clean.includes("void-backend")) {
    return false;
  }
  if (clean.startsWith("/__void_api/yt-audio") || clean.startsWith("/__void_api/lossless-stream")) {
    return true;
  }
  if (clean.startsWith("yt-stream://")) {
    const ytId = clean.slice("yt-stream://".length).trim();
    return /^[\w-]{11}$/.test(ytId);
  }
  return /^https?:\/\//i.test(clean);
}

function isValidCoverUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) return false;
  const clean = url.trim();
  if (clean.includes("fbcdn.net") || clean.includes("archive.org/services/img/")) return false;
  return /^https?:\/\//i.test(clean) || clean.startsWith("blob:") || clean.startsWith("data:");
}

const stickyCoverMemoryMap = new Map<string, string>();
const loadedCoverUrls = new Set<string>();
const preloadedCoverUrls = new Set<string>();
let stickyCoversHydrated = false;

function hydrateStickyCovers(): void {
  if (stickyCoversHydrated || typeof localStorage === "undefined") return;
  stickyCoversHydrated = true;
  const saved = loadJsonMap(STICKY_COVER_STORAGE_KEY);
  for (const [k, v] of Object.entries(saved)) {
    if (isValidCoverUrl(v)) {
      stickyCoverMemoryMap.set(k, v);
    }
  }
  const artCache = loadJsonMap(ARTWORK_STORAGE_KEY);
  for (const [k, v] of Object.entries(artCache)) {
    if (isValidCoverUrl(v)) {
      stickyCoverMemoryMap.set(k, v);
      if (k.startsWith("ar-")) {
        stickyCoverMemoryMap.set(`api-${k}`, v);
        stickyCoverMemoryMap.set(`download:${k}`, v);
      }
    }
  }
}

function normalizeTrackKey(track: any): string[] {
  if (!track) return [];
  const keys: string[] = [];
  const rawId = String(track.id ?? "").trim();
  if (rawId) {
    keys.push(rawId);
    const cleanId = rawId.replace(/^download:/i, "").replace(/^api-/i, "");
    if (cleanId) {
      keys.push(cleanId);
      keys.push(`api-${cleanId}`);
      keys.push(`download:${cleanId}`);
    }
  }
  const title = String(track.title || track.name || "").trim().toLowerCase();
  const artist = String(track.artist || "").trim().toLowerCase();
  if (title && artist) {
    keys.push(`meta:${title}|${artist}`);
  }
  return keys;
}

export function preloadCoverImage(url: string): void {
  if (!isValidCoverUrl(url) || url.startsWith("blob:") || preloadedCoverUrls.has(url)) return;
  if (typeof Image === "undefined") return;
  preloadedCoverUrls.add(url);
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    loadedCoverUrls.add(url);
  };
  img.src = url;
}

export function isCoverUrlLoaded(url?: string | null): boolean {
  if (!url) return false;
  return loadedCoverUrls.has(url);
}

export function markCoverUrlLoaded(url?: string | null): void {
  if (url && isValidCoverUrl(url)) {
    loadedCoverUrls.add(url);
  }
}

const coverScaleCache = new Map<string, number>();
const pendingYoutubeScaleProbes = new Map<string, Promise<number>>();

/**
 * Strictly checks whether a track or cover URL belongs to YouTube.
 * Non-YouTube providers (JioSaavn, Lossless Source, Apple Music/iTunes, Deezer, etc.)
 * and standard 1:1 square album covers must NEVER be scaled or cropped.
 */
export function isYouTubeCoverOrTrack(
  track?: any,
  url?: string | null,
  img?: HTMLImageElement | null
): boolean {
  const cleanUrl = String(url || track?.image || "").trim();

  // 1. Official 1:1 album cover CDNs (JioSaavn, Apple Music, Deezer, Spotify, Tidal, Wikimedia) are NEVER YouTube
  if (
    /(?:saavncdn\.com|jiosaavn\.com|mzstatic\.com|dzcdn\.net|scdn\.co|tidal\.com|wikimedia\.org|archive\.org|itunes\.apple\.com)/i.test(
      cleanUrl
    )
  ) {
    return false;
  }

  // 2. Explicit YouTube thumbnail domains
  if (/(?:ytimg\.com|youtube\.com|youtu\.be|ggpht\.com)/i.test(cleanUrl)) {
    return true;
  }

  // 3. Explicit non-YouTube track provider labels (e.g. JioSaavn, Lossless Source, Apple Music, Deezer)
  const srcLabel = String(track?.source || "").trim();
  if (
    srcLabel &&
    /(?:jiosaavn|lossless|apple|itunes|deezer|spotify|tidal)/i.test(srcLabel) &&
    !/youtube/i.test(srcLabel)
  ) {
    return false;
  }

  // 4. Explicit YouTube track metadata (including offline downloaded YouTube tracks with blob: covers)
  if (
    /youtube/i.test(srcLabel) ||
    Boolean(track?.exactYtBlob) ||
    /youtube/i.test(String(track?.format || "")) ||
    /(?:ytimg\.com|youtube\.com)/i.test(String(track?.image || "")) ||
    /^(?:yt-stream:\/\/|\/__void_api\/yt-audio)/i.test(
      String(track?.audioUrl || track?.downloadUrl || track?.src || "")
    ) ||
    /^(?:download:|api-)?yt:/i.test(String(track?.id || ""))
  ) {
    return true;
  }

  // 5. Fallback for local/downloaded blob covers where source metadata was omitted:
  // JioSaavn/iTunes/Deezer covers are always 1:1 square (500x500 or 600x600),
  // whereas YouTube thumbnails are landscape (4:3 = 480x360/640x480 or 16:9 = 1280x720/320x180).
  if (
    cleanUrl.startsWith("blob:") &&
    img &&
    img.naturalWidth > 0 &&
    img.naturalHeight > 0
  ) {
    const ratio = img.naturalWidth / img.naturalHeight;
    if (ratio >= 1.24 && ratio <= 1.85) {
      return true;
    }
  }

  return false;
}

export function getCachedCoverScale(url?: string | null, track?: any): number {
  if (!url) return 1;
  if (!isYouTubeCoverOrTrack(track, url, null)) return 1;
  const cached = coverScaleCache.get(url);
  if (cached !== undefined) return cached;
  if (
    /(?:ytimg\.com|youtube\.com)\/vi(?:_webp)?\/[^/]+\/(?:hqdefault|sddefault|0|default)\./i.test(
      url
    )
  ) {
    return 1.35;
  }
  return 1;
}

function inspectYouTubeImageCanvas(img: HTMLImageElement, urlKey: string): number | null {
  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  if (w <= 0 || h <= 0) return null;

  const ratio = w / h;
  let scale = 1;

  // 4:3 YouTube thumbnails (480x360 hqdefault / 640x480 sddefault) always have 12.5% top & bottom letterbox bars
  if (
    /(?:ytimg\.com|youtube\.com)\/vi(?:_webp)?\/[^/]+\/(?:hqdefault|sddefault|0|default)\./i.test(
      urlKey
    ) ||
    (ratio >= 1.25 && ratio <= 1.45 && w !== h)
  ) {
    scale = 1.35;
  }

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return scale;

  // Draw the center square (matching CSS object-fit: cover inside a 1:1 container)
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const isUniformOrDarkRow = (y: number, xStart: number, xEnd: number): boolean => {
    const span = xEnd - xStart + 1;
    if (span <= 4) return false;
    let darkCount = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let x = xStart; x <= xEnd; x++) {
      const i = (y * size + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (Math.max(r, g, b) < 30) darkCount++;
      sumR += r;
      sumG += g;
      sumB += b;
    }
    if (darkCount >= span * 0.85) return true;
    const meanR = sumR / span;
    const meanG = sumG / span;
    const meanB = sumB / span;
    let mad = 0;
    for (let x = xStart; x <= xEnd; x++) {
      const i = (y * size + x) * 4;
      mad +=
        Math.abs(data[i] - meanR) +
        Math.abs(data[i + 1] - meanG) +
        Math.abs(data[i + 2] - meanB);
    }
    return mad / (span * 3) < 6.5;
  };

  const isUniformOrDarkCol = (x: number, yStart: number, yEnd: number): boolean => {
    const span = yEnd - yStart + 1;
    if (span <= 4) return false;
    let darkCount = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let y = yStart; y <= yEnd; y++) {
      const i = (y * size + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (Math.max(r, g, b) < 30) darkCount++;
      sumR += r;
      sumG += g;
      sumB += b;
    }
    if (darkCount >= span * 0.85) return true;
    const meanR = sumR / span;
    const meanG = sumG / span;
    const meanB = sumB / span;
    let mad = 0;
    for (let y = yStart; y <= yEnd; y++) {
      const i = (y * size + x) * 4;
      mad +=
        Math.abs(data[i] - meanR) +
        Math.abs(data[i + 1] - meanG) +
        Math.abs(data[i + 2] - meanB);
    }
    return mad / (span * 3) < 6.5;
  };

  const maxScan = Math.floor(size * 0.28); // up to 18px out of 64px on each side

  let topBars = 0;
  while (topBars < maxScan && isUniformOrDarkRow(topBars, 6, size - 7)) {
    topBars++;
  }
  let bottomBars = 0;
  while (bottomBars < maxScan && isUniformOrDarkRow(size - 1 - bottomBars, 6, size - 7)) {
    bottomBars++;
  }

  // Require symmetric top & bottom bars so dark artwork on only one side is not over-cropped
  const vBar =
    topBars >= 2 && bottomBars >= 2
      ? Math.abs(topBars - bottomBars) <= 4
        ? Math.max(topBars, bottomBars)
        : Math.min(topBars, bottomBars) + 2
      : 0;

  // Scan left & right pillarbox gaps inside the active vertical region (excluding top/bottom letterbox bars)
  const activeYStart = Math.max(4, topBars + 1);
  const activeYEnd = Math.min(size - 5, size - 1 - bottomBars - 1);

  let leftBars = 0;
  while (leftBars < maxScan && isUniformOrDarkCol(leftBars, activeYStart, activeYEnd)) {
    leftBars++;
  }
  let rightBars = 0;
  while (
    rightBars < maxScan &&
    isUniformOrDarkCol(size - 1 - rightBars, activeYStart, activeYEnd)
  ) {
    rightBars++;
  }

  const hBar =
    leftBars >= 2 && rightBars >= 2
      ? Math.abs(leftBars - rightBars) <= 4
        ? Math.max(leftBars, rightBars)
        : Math.min(leftBars, rightBars) + 2
      : 0;

  const maxBar = Math.max(vBar, hBar);
  if (maxBar >= 2) {
    const barFraction = maxBar / size;
    const needed = 1 / Math.max(0.52, 1 - 2 * barFraction) + 0.02;
    scale = Math.max(scale, Math.min(1.72, Number(needed.toFixed(3))));
  }

  return scale;
}

function probeYouTubeCoverScaleViaProxy(
  url: string,
  onAsyncUpdate?: (scale: number) => void
): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  const existing = pendingYoutubeScaleProbes.get(url);
  if (existing) {
    if (onAsyncUpdate) {
      void existing.then((s) => onAsyncUpdate(s));
    }
    return;
  }

  const promise = new Promise<number>((resolve) => {
    const probeImg = new Image();
    probeImg.crossOrigin = "anonymous";
    probeImg.decoding = "async";
    probeImg.onload = () => {
      try {
        const computed = inspectYouTubeImageCanvas(probeImg, url) ?? 1;
        coverScaleCache.set(url, computed);
        resolve(computed);
      } catch {
        const fallback = getCachedCoverScale(url, { source: "YouTube", image: url });
        coverScaleCache.set(url, fallback);
        resolve(fallback);
      }
    };
    probeImg.onerror = () => {
      const fallback = getCachedCoverScale(url, { source: "YouTube", image: url });
      resolve(fallback);
    };
    probeImg.src = `/__void_api/proxy?url=${encodeURIComponent(url)}`;
  });

  pendingYoutubeScaleProbes.set(url, promise);
  if (onAsyncUpdate) {
    void promise.then((s) => onAsyncUpdate(s));
  }
}

export function computeAutoFitCoverScale(
  img: HTMLImageElement | null,
  url?: string | null,
  track?: any,
  onAsyncUpdate?: (scale: number) => void
): number {
  const key = String(url || img?.src || "").trim();

  // Strictly only detect & adjust YouTube covers; all JioSaavn / standard album covers stay at 1
  if (!isYouTubeCoverOrTrack(track, key, img)) {
    return 1;
  }

  if (key && coverScaleCache.has(key)) {
    return coverScaleCache.get(key)!;
  }

  if (!img) return getCachedCoverScale(key, track);

  const w = img.naturalWidth || 0;
  const h = img.naturalHeight || 0;
  if (w <= 0 || h <= 0) return getCachedCoverScale(key, track);

  try {
    const scale = inspectYouTubeImageCanvas(img, key);
    if (scale !== null) {
      if (key) coverScaleCache.set(key, scale);
      return scale;
    }
  } catch {
    // Remote YouTube image without CORS header on the <img> element:
    // probe via local CORS-safe proxy to detect any letterbox or left/right pillarbox gaps
    if (key && /^https?:\/\//i.test(key)) {
      probeYouTubeCoverScaleViaProxy(key, onAsyncUpdate);
    }
  }

  const ratio = w / h;
  const initialScale =
    /(?:ytimg\.com|youtube\.com)\/vi(?:_webp)?\/[^/]+\/(?:hqdefault|sddefault|0|default)\./i.test(
      key
    ) ||
    (ratio >= 1.25 && ratio <= 1.45 && w !== h)
      ? 1.35
      : 1;

  return initialScale;
}

let saveStickyTimer: number | undefined;
function persistStickyCoversDeferred(): void {
  if (typeof window === "undefined") return;
  window.clearTimeout(saveStickyTimer);
  saveStickyTimer = window.setTimeout(() => {
    const obj: Record<string, string> = {};
    for (const [k, v] of stickyCoverMemoryMap.entries()) {
      if (isValidCoverUrl(v) && !v.startsWith("blob:")) {
        obj[k] = v;
      }
    }
    saveJsonMap(STICKY_COVER_STORAGE_KEY, obj);
  }, 400);
}

export function rememberStickyCover(track: any, explicitUrl?: string): void {
  hydrateStickyCovers();
  const url = explicitUrl || track?.image;
  if (!isValidCoverUrl(url)) return;
  const keys = normalizeTrackKey(track);
  let changed = false;
  for (const key of keys) {
    if (stickyCoverMemoryMap.get(key) !== url) {
      stickyCoverMemoryMap.set(key, url);
      changed = true;
    }
  }
  if (!url.startsWith("blob:")) {
    preloadCoverImage(url);
    if (changed) persistStickyCoversDeferred();
  }
}

export function getStickyCoverUrl(track: any): string {
  if (!track) return "";
  hydrateStickyCovers();
  if (isValidCoverUrl(track.image)) {
    rememberStickyCover(track, track.image);
    return track.image.trim();
  }
  const keys = normalizeTrackKey(track);
  for (const key of keys) {
    const found = stickyCoverMemoryMap.get(key);
    if (found && isValidCoverUrl(found)) {
      return found;
    }
  }
  return "";
}

let memoryDeepCatalog: TrendingTrackItem[] | null = null;
let resolvingRank3Mounir: Promise<TrendingTrackItem | null> | null = null;

function buildRank3ElLeilaYaSamraFallback(): TrendingTrackItem {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(RANK3_MOUNIR_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          parsed.audioUrl &&
          !String(parsed.audioUrl).startsWith("trending-resolve://") &&
          !/super\s*hits/i.test(String(parsed.album || "")) &&
          (Number(parsed.duration) || 346) >= 300
        ) {
          if (isValidCoverUrl(parsed.image)) {
            rememberStickyCover(parsed, parsed.image);
          }
          return {
            ...parsed,
            album: "Shababeek",
            trendingRank: 3,
            trendingScore: 1037,
          };
        }
      }
      const favRaw = localStorage.getItem("void-remote-favorites");
      if (favRaw) {
        const favs = JSON.parse(favRaw);
        if (Array.isArray(favs)) {
          const found = favs.find(
            (f: any) =>
              /leila\s+ya\s+samra/i.test(String(f?.title || f?.name || "")) &&
              !/super\s*hits/i.test(String(f?.album || "")) &&
              (Number(f?.duration) || 346) >= 300 &&
              f?.audioUrl
          );
          if (found) {
            const built: TrendingTrackItem = {
              id: String(found.id || "api-ar-mounir-leila").startsWith("api-")
                ? String(found.id)
                : `api-${String(found.id).replace(/^download:/, "")}`,
              title: "El Leila Ya Samra",
              name: "El Leila Ya Samra",
              artist: "محمد منير · Mohamed Mounir",
              album: "Shababeek",
              fileName: "El Leila Ya Samra.m4a",
              fileSize: 0,
              importedAt: 1700000001037,
              audioUrl: String(found.audioUrl || found.downloadUrl || found.src),
              downloadUrl: String(found.downloadUrl || found.audioUrl || found.src),
              src: String(found.audioUrl || found.downloadUrl || found.src),
              image: String(found.image || ""),
              duration: Number(found.duration) || 346,
              source: "JioSaavn",
              qualityBadge: "Very High (320kbps)" as QualityTier,
              bitrate: 320,
              codec: "AAC",
              mimeType: "audio/mp4",
              format: "MP4 (320kbps)",
              qualityVerified: true,
              fallbackUrls: Array.isArray(found.fallbackUrls) ? found.fallbackUrls : undefined,
              year: 1981,
              trendingRank: 3,
              trendingScore: 1037,
            };
            localStorage.setItem(RANK3_MOUNIR_STORAGE_KEY, JSON.stringify(built));
            if (isValidCoverUrl(built.image)) rememberStickyCover(built, built.image);
            return built;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  const resolvePayload = JSON.stringify({
    titleAr: "El Leila Ya Samra",
    artistAr: "Mohamed Mounir",
    titleEn: "El Leila Ya Samra",
    artistEn: "Mohamed Mounir",
  });
  const resolveUrl = `trending-resolve://${encodeURIComponent(resolvePayload)}`;

  return {
    id: "api-ar-mounir-leila",
    title: "El Leila Ya Samra",
    name: "El Leila Ya Samra",
    artist: "محمد منير · Mohamed Mounir",
    album: "Shababeek",
    fileName: "El Leila Ya Samra.m4a",
    fileSize: 0,
    importedAt: 1700000001037,
    audioUrl: resolveUrl,
    downloadUrl: resolveUrl,
    src: resolveUrl,
    image: getStickyCoverUrl({ id: "api-ar-mounir-leila", title: "El Leila Ya Samra", artist: "محمد منير · Mohamed Mounir" }),
    duration: 346,
    source: "JioSaavn",
    qualityBadge: "Very High (320kbps)" as QualityTier,
    bitrate: 320,
    codec: "AAC",
    mimeType: "audio/mp4",
    format: "MP4 (320kbps)",
    qualityVerified: true,
    year: 1981,
    trendingRank: 3,
    trendingScore: 1037,
  };
}

function applyRank3ElLeilaYaSamraOverride(items: TrendingTrackItem[]): TrendingTrackItem[] {
  if (!Array.isArray(items) || items.length < 3) return items;
  const rank3Track = buildRank3ElLeilaYaSamraFallback();
  const next = [...items];
  next[2] = {
    ...rank3Track,
    trendingRank: 3,
    trendingScore: 1037,
  };
  return next.map((item, idx) => ({
    ...item,
    trendingRank: idx + 1,
  }));
}

function readPersistedDeepCatalog(): TrendingTrackItem[] {
  if (memoryDeepCatalog && memoryDeepCatalog.length > 0) {
    return applyRank3ElLeilaYaSamraOverride(memoryDeepCatalog);
  }
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(DEEP_CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    // Filter out any synthetic seed placeholders so only real playable songs are used
    const realItems = parsed.filter(
      (item: any) =>
        item &&
        !String(item.id || "").includes("-seed-") &&
        !/—\s*Top Hit$|\(\d+\)$/.test(String(item.title || ""))
    );
    if (realItems.length === 0) return [];
    const patched = applyRank3ElLeilaYaSamraOverride(realItems);
    memoryDeepCatalog = patched;
    for (const item of patched) {
      if (isValidCoverUrl(item?.image)) {
        rememberStickyCover(item, item.image);
      }
    }
    return patched;
  } catch {
    return [];
  }
}

function writePersistedDeepCatalog(items: TrendingTrackItem[]): void {
  const realItems = items.filter(
    (item) =>
      item &&
      !String(item.id || "").includes("-seed-") &&
      !/—\s*Top Hit$|\(\d+\)$/.test(String(item.title || ""))
  );
  if (realItems.length === 0) return;
  const patched = applyRank3ElLeilaYaSamraOverride(realItems);
  memoryDeepCatalog = patched;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DEEP_CATALOG_STORAGE_KEY, JSON.stringify(patched));
    }
  } catch {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("void-multilang-") || k.startsWith("void-artist-top100-") || k.startsWith("void-trending-cache-"))) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(DEEP_CATALOG_STORAGE_KEY, JSON.stringify(patched));
    } catch {
      /* ignore storage quota */
    }
  }
}

/**
 * Returns the cached deep-searched Arabic Top 200 if already resolved in this browser,
 * or an empty array so the live deep search streams real playable tracks immediately.
 */
export function getInstantArabicTop200(): TrendingTrackItem[] {
  hydrateStickyCovers();
  return readPersistedDeepCatalog();
}

interface ItunesCandidate {
  trackName: string;
  collectionName: string;
  artworkUrl600: string;
  durationSec: number;
  year: number;
}

async function fetchArtistItunesSongs(seed: ArabicArtistSeed): Promise<ItunesCandidate[]> {
  const queries = [seed.artistAr, seed.artistEn];
  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(
          `/__void_api/itunes-search?term=${encodeURIComponent(q)}&country=ae&entity=song&limit=25`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json?.results) ? json.results : [];
      } catch {
        return [];
      } finally {
        window.clearTimeout(timer);
      }
    })
  );

  const rawList = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const out: ItunesCandidate[] = [];
  const seenTitles = new Set<string>();

  for (const row of rawList) {
    const artistName = String(row?.artistName || "").trim();
    const trackName = String(row?.trackName || "").trim();
    const collectionName = String(row?.collectionName || seed.artistAr).trim();
    if (!trackName || !artistName) continue;
    if (!doesSingleArtistNameMatchSeed(artistName, seed)) continue;
    if (INDIC_AND_NON_ARABIC_SCRIPT_REGEX.test(`${trackName} ${collectionName}`)) continue;
    if (UNWANTED_VERSION_REGEX.test(`${trackName} ${collectionName}`)) continue;

    const cleanTitle = trackName.replace(/\s*\((?:feat|ft)\.[^)]*\)/gi, "").trim();
    const dedupKey = normalizeArabicText(cleanTitle) || normalizeLatinArtistOrTitle(cleanTitle);
    if (!dedupKey || seenTitles.has(dedupKey)) continue;
    seenTitles.add(dedupKey);

    const art600 = String(row?.artworkUrl100 || "")
      .replace("100x100bb", "600x600bb")
      .trim();
    const durationSec = Math.round((Number(row?.trackTimeMillis) || 0) / 1000) || 240;
    if (durationSec < 90 || durationSec > 900) continue;
    const year = row?.releaseDate ? new Date(row.releaseDate).getFullYear() || 2024 : 2024;

    out.push({
      trackName: cleanTitle,
      collectionName,
      artworkUrl600: isValidCoverUrl(art600) ? art600 : "",
      durationSec,
      year,
    });
  }

  return out;
}

async function fetchJioRawSongs(query: string, limit = 30): Promise<any[]> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 5500);
  try {
    const res = await fetch(
      `${JIOSAAVN_API_BASE}/search/songs?query=${encodeURIComponent(query)}&page=1&limit=${limit}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data?.results)
      ? json.data.results
      : Array.isArray(json?.results)
        ? json.results
        : [];
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

function extractBestJioStream(song: any): {
  url: string;
  bitrate: number;
  fallbackUrls: string[];
} | null {
  if (!Array.isArray(song?.downloadUrl)) return null;
  const variants = song.downloadUrl
    .map((d: any) => ({
      url: String(d?.url || d?.link || "").trim(),
      kbps: Number.parseInt(String(d?.quality || "").replace(/\D+/g, ""), 10) || 0,
    }))
    .filter((d: { url: string; kbps: number }) => d.url.startsWith("http"));
  if (variants.length === 0) return null;
  variants.sort((a: { kbps: number }, b: { kbps: number }) => b.kbps - a.kbps);
  return {
    url: variants[0].url,
    bitrate: variants[0].kbps || 320,
    fallbackUrls: variants.slice(1).map((v: { url: string }) => v.url),
  };
}

function extractBestJioCover(song: any): string {
  if (!Array.isArray(song?.image)) return "";
  const imgs = song.image
    .map((i: any) => ({ q: i?.quality, url: String(i?.url || i?.link || "").trim() }))
    .filter((i: { url: string }) => isValidCoverUrl(i.url));
  return (
    imgs.find((i: { q?: string }) => i.q === "500x500")?.url ||
    imgs[imgs.length - 1]?.url ||
    ""
  );
}

/**
 * Deep searches 5 genuine original Arabic songs for a single artist:
 * 1. First Priority: JioSaavn 320kbps — strictly verified (`language === 'arabic'`, exact primary artist match,
 *    zero Hindi/Tamil/Bengali, zero karaoke/tribute/instrumental).
 * 2. Second Priority (Automatic Fallback): YouTube — for any remaining slots up to 5 songs, finds the artist's
 *    genuine Arabic songs on YouTube and resolves them with official artwork & duration.
 */
async function deepSearch5SongsForArtist(
  seed: ArabicArtistSeed,
  artistIdx: number
): Promise<Omit<TrendingTrackItem, "trendingRank">[]> {
  // 1. Discover artist's real top songs & artwork from UAE Apple Music + search JioSaavn concurrently
  const [itunesSongs, jioByEn, jioByAr] = await Promise.all([
    fetchArtistItunesSongs(seed),
    fetchJioRawSongs(seed.artistEn, 35),
    fetchJioRawSongs(seed.artistAr, 35),
  ]);

  const defaultArtistCover =
    itunesSongs.find((s) => isValidCoverUrl(s.artworkUrl600))?.artworkUrl600 || "";

  // Also search JioSaavn for top iTunes song names of this artist to maximize genuine JioSaavn hits
  const topItunesQueries = itunesSongs
    .slice(0, 5)
    .map((s) => `${s.trackName} ${seed.artistEn}`);
  const extraJioBatches =
    topItunesQueries.length > 0
      ? await Promise.all(topItunesQueries.map((q) => fetchJioRawSongs(q, 10)))
      : [];

  const allJioRaw = [...jioByEn, ...jioByAr, ...extraJioBatches.flat()];
  const seenJioIds = new Set<string>();
  const usedSongKeys = new Set<string>();
  const selectedTracks: Omit<TrendingTrackItem, "trendingRank">[] = [];
  const rankBonuses = [48, 42, 36, 30, 24];

  for (const song of allJioRaw) {
    if (selectedTracks.length >= 5) break;
    const rawId = String(song?.id || "").trim();
    if (!rawId || seenJioIds.has(rawId)) continue;
    seenJioIds.add(rawId);

    const lang = String(song?.language || "").toLowerCase().trim();
    const allowEnglish = seed.artistEn === "Saint Levant" || seed.artistEn === "Elyanna";
    if (lang !== "arabic" && !(allowEnglish && lang === "english")) {
      continue;
    }

    const name = decodeHtml(String(song?.name || song?.title || "")).replace(
      /\s*\((?:feat|ft)\.[^)]*\)/gi,
      ""
    );
    const album = decodeHtml(String(song?.album?.name || ""));
    const label = decodeHtml(String(song?.label || ""));
    const subtitle = decodeHtml(String(song?.subtitle || ""));
    const primaryArtistsStr = decodeHtml(String(song?.primaryArtists || ""));
    const combinedMeta = `${name} ${album} ${label} ${subtitle} ${primaryArtistsStr}`;

    if (!name) continue;
    if (INDIC_AND_NON_ARABIC_SCRIPT_REGEX.test(combinedMeta)) continue;
    if (BLOCKED_LANGUAGES_REGEX.test(combinedMeta)) continue;
    if (UNWANTED_VERSION_REGEX.test(combinedMeta)) continue;

    // Must strictly match primary artist
    if (!doesJioSongMatchArtist(song, seed)) continue;

    const duration = Number(song?.duration) || 0;
    if (duration < 95 || duration > 900) continue;

    const stream = extractBestJioStream(song);
    if (!stream || !stream.url) continue;

    const normKey = normalizeArabicText(name) || normalizeLatinArtistOrTitle(name);
    if (!normKey || usedSongKeys.has(normKey)) continue;

    // Check if an iTunes song matches to enrich Arabic title & 600x600 cover art
    const matchedItunes = itunesSongs.find((it) => {
      const itAr = normalizeArabicText(it.trackName);
      const itEn = normalizeLatinArtistOrTitle(it.trackName);
      return (
        (itAr && normKey && (itAr.includes(normKey) || normKey.includes(itAr))) ||
        (itEn && normKey && (itEn.includes(normKey) || normKey.includes(itEn)))
      );
    });

    const displayTitle = matchedItunes?.trackName || name;
    const displayAlbum = matchedItunes?.collectionName || album || seed.artistAr;
    const coverUrl =
      matchedItunes?.artworkUrl600 || extractBestJioCover(song) || defaultArtistCover;

    usedSongKeys.add(normKey);
    if (matchedItunes) {
      const itKey =
        normalizeArabicText(matchedItunes.trackName) ||
        normalizeLatinArtistOrTitle(matchedItunes.trackName);
      if (itKey) usedSongKeys.add(itKey);
    }

    const slotIdx = selectedTracks.length;
    const trackId = `api-ar-${artistIdx + 1}-${slotIdx + 1}`;
    const score = seed.basePopularity + (rankBonuses[slotIdx] || 20);

    if (isValidCoverUrl(coverUrl)) {
      stickyCoverMemoryMap.set(`ar-${artistIdx + 1}-${slotIdx + 1}`, coverUrl);
      stickyCoverMemoryMap.set(trackId, coverUrl);
      preloadCoverImage(coverUrl);
    }

    selectedTracks.push({
      id: trackId,
      title: displayTitle,
      name: displayTitle,
      artist: `${seed.artistAr} · ${seed.artistEn}`,
      album: displayAlbum,
      fileName: `${displayTitle}.m4a`,
      fileSize: 0,
      importedAt: 1700000000000 + score,
      audioUrl: stream.url,
      downloadUrl: stream.url,
      src: stream.url,
      image: coverUrl,
      duration,
      source: "JioSaavn",
      qualityBadge: "Very High (320kbps)" as QualityTier,
      bitrate: 320,
      codec: "AAC",
      mimeType: "audio/mp4",
      format: "MP4 (320kbps)",
      qualityVerified: true,
      fallbackUrls: stream.fallbackUrls,
      year: Number(song?.year) || matchedItunes?.year || 2024,
      trendingScore: score,
    });
  }

  // 2. If JioSaavn had fewer than 5 verified songs for this artist, deep-search YouTube!
  if (selectedTracks.length < 5) {
    const remainingItunesCandidates = itunesSongs.filter((it) => {
      const key =
        normalizeArabicText(it.trackName) || normalizeLatinArtistOrTitle(it.trackName);
      return key && !usedSongKeys.has(key);
    });

    // Search YouTube for each specific iTunes song of this artist, plus general artist YouTube search
    const generalYtResults =
      remainingItunesCandidates.length < 5 - selectedTracks.length
        ? await searchYouTube(`${seed.artistAr} ${seed.artistEn} أغاني`)
        : [];

    for (const itSong of remainingItunesCandidates) {
      if (selectedTracks.length >= 5) break;
      const ytResults = await searchYouTube(`${itSong.trackName} ${seed.artistAr}`);
      const validYt = ytResults.find((yt) => {
        const ytId = extractCleanYouTubeId(yt.id || yt.downloadUrl);
        if (!/^[\w-]{11}$/.test(ytId)) return false;
        const meta = `${yt.name || ""} ${yt.artist || ""}`;
        if (INDIC_AND_NON_ARABIC_SCRIPT_REGEX.test(meta)) return false;
        if (BLOCKED_LANGUAGES_REGEX.test(meta)) return false;
        if (UNWANTED_VERSION_REGEX.test(meta)) return false;
        if (yt.duration > 0 && (yt.duration < 90 || yt.duration > 900)) return false;
        return true;
      });

      if (validYt) {
        const ytId = extractCleanYouTubeId(validYt.id || validYt.downloadUrl);
        const slotIdx = selectedTracks.length;
        const trackId = `api-ar-${artistIdx + 1}-${slotIdx + 1}`;
        const score = seed.basePopularity + (rankBonuses[slotIdx] || 20);
        const coverUrl = itSong.artworkUrl600 || defaultArtistCover || validYt.image;
        const streamUrl = validYt.downloadUrl || `yt-stream://${ytId}`;

        const key =
          normalizeArabicText(itSong.trackName) ||
          normalizeLatinArtistOrTitle(itSong.trackName);
        if (key) usedSongKeys.add(key);
        usedSongKeys.add(ytId);

        if (isValidCoverUrl(coverUrl)) {
          stickyCoverMemoryMap.set(`ar-${artistIdx + 1}-${slotIdx + 1}`, coverUrl);
          stickyCoverMemoryMap.set(trackId, coverUrl);
          preloadCoverImage(coverUrl);
        }

        selectedTracks.push({
          id: trackId,
          title: itSong.trackName,
          name: itSong.trackName,
          artist: `${seed.artistAr} · ${seed.artistEn}`,
          album: itSong.collectionName || seed.artistAr,
          fileName: `${itSong.trackName}.webm`,
          fileSize: 0,
          importedAt: 1700000000000 + score,
          audioUrl: streamUrl,
          downloadUrl: streamUrl,
          src: streamUrl,
          image: coverUrl,
          duration: validYt.duration || itSong.durationSec || 240,
          source: "YouTube",
          qualityBadge: (validYt.qualityBadge || "High (160kbps)") as QualityTier,
          bitrate: validYt.bitrate || 160,
          codec: validYt.codec || "Opus",
          mimeType: validYt.mimeType || "audio/webm",
          format: `YouTube (${validYt.codec || "Opus"} ${validYt.bitrate || 160}kbps)`,
          qualityVerified: true,
          year: itSong.year || 2024,
          trendingScore: score,
        });
      }
    }

    // If still fewer than 5 (e.g. artist had fewer than 5 results on iTunes), fill from general YouTube search for that artist
    if (selectedTracks.length < 5) {
      const moreYt =
        generalYtResults.length > 0
          ? generalYtResults
          : await searchYouTube(`${seed.artistAr} ${seed.artistEn}`);
      for (const yt of moreYt) {
        if (selectedTracks.length >= 5) break;
        const ytId = extractCleanYouTubeId(yt.id || yt.downloadUrl);
        if (!/^[\w-]{11}$/.test(ytId) || usedSongKeys.has(ytId)) continue;
        const meta = `${yt.name || ""} ${yt.artist || ""}`;
        if (INDIC_AND_NON_ARABIC_SCRIPT_REGEX.test(meta)) continue;
        if (BLOCKED_LANGUAGES_REGEX.test(meta)) continue;
        if (UNWANTED_VERSION_REGEX.test(meta)) continue;
        if (yt.duration > 0 && (yt.duration < 90 || yt.duration > 900)) continue;

        usedSongKeys.add(ytId);
        const slotIdx = selectedTracks.length;
        const trackId = `api-ar-${artistIdx + 1}-${slotIdx + 1}`;
        const score = seed.basePopularity + (rankBonuses[slotIdx] || 20);
        const coverUrl = defaultArtistCover || yt.image;
        const streamUrl = yt.downloadUrl || `yt-stream://${ytId}`;

        if (isValidCoverUrl(coverUrl)) {
          stickyCoverMemoryMap.set(`ar-${artistIdx + 1}-${slotIdx + 1}`, coverUrl);
          stickyCoverMemoryMap.set(trackId, coverUrl);
          preloadCoverImage(coverUrl);
        }

        selectedTracks.push({
          id: trackId,
          title: yt.name,
          name: yt.name,
          artist: `${seed.artistAr} · ${seed.artistEn}`,
          album: seed.artistAr,
          fileName: `${yt.name}.webm`,
          fileSize: 0,
          importedAt: 1700000000000 + score,
          audioUrl: streamUrl,
          downloadUrl: streamUrl,
          src: streamUrl,
          image: coverUrl,
          duration: yt.duration || 240,
          source: "YouTube",
          qualityBadge: (yt.qualityBadge || "High (160kbps)") as QualityTier,
          bitrate: yt.bitrate || 160,
          codec: yt.codec || "Opus",
          mimeType: yt.mimeType || "audio/webm",
          format: `YouTube (${yt.codec || "Opus"} ${yt.bitrate || 160}kbps)`,
          qualityVerified: true,
          year: 2024,
          trendingScore: score,
        });
      }
    }
  }

  return selectedTracks;
}

let activeDeepSearchPromise: Promise<TrendingTrackItem[]> | null = null;

/**
 * Performs the full Deep Search across all 40 top Arab artists (5 songs each = 200 songs),
 * prioritizing verified JioSaavn 320kbps Arabic streams and automatically falling back to
 * YouTube when a song or artist is not on JioSaavn.
 */
async function ensureRank3ElLeilaYaSamraFromJioSaavn(
  onResolved?: () => void
): Promise<TrendingTrackItem | null> {
  const current = buildRank3ElLeilaYaSamraFallback();
  if (
    current.audioUrl.startsWith("http") &&
    isValidCoverUrl(current.image) &&
    !/super\s*hits/i.test(String(current.album || "")) &&
    (Number(current.duration) || 346) >= 300
  ) {
    return current;
  }
  if (resolvingRank3Mounir) return resolvingRank3Mounir;

  resolvingRank3Mounir = (async () => {
    try {
      const [jioShababeek, jioGeneral] = await Promise.all([
        fetchJioRawSongs("El Leila Ya Samra Shababeek Mohamed Mounir", 10),
        fetchJioRawSongs("El Leila Ya Samra Mohamed Mounir", 15),
      ]);
      const allJio = [...jioShababeek, ...jioGeneral];

      // Strictly prefer the 5:46 (346s) 'Shababeek' album release over 'Super Hits Vol. 1' (3:51)
      const shababeekMatch =
        allJio.find(
          (s) =>
            /leila\s+ya\s+samra/i.test(decodeHtml(String(s?.name || s?.title || ""))) &&
            (/shababeek/i.test(decodeHtml(String(s?.album?.name || ""))) ||
              (Number(s?.duration) || 0) >= 310) &&
            extractBestJioStream(s)?.url
        ) ||
        allJio.find(
          (s) =>
            /leila\s+ya\s+samra/i.test(decodeHtml(String(s?.name || s?.title || ""))) &&
            !/super\s*hits/i.test(decodeHtml(String(s?.album?.name || ""))) &&
            extractBestJioStream(s)?.url
        ) ||
        allJio.find(
          (s) =>
            /leila\s+ya\s+samra/i.test(decodeHtml(String(s?.name || s?.title || ""))) &&
            extractBestJioStream(s)?.url
        );

      if (!shababeekMatch) return null;
      const stream = extractBestJioStream(shababeekMatch);
      if (!stream?.url) return null;
      const cover = extractBestJioCover(shababeekMatch);
      const rawId = String(shababeekMatch?.id || "mounir-leila").trim();
      const resolvedTrack: TrendingTrackItem = {
        id: `api-${rawId}`,
        title: "El Leila Ya Samra",
        name: "El Leila Ya Samra",
        artist: "محمد منير · Mohamed Mounir",
        album: "Shababeek",
        fileName: "El Leila Ya Samra.m4a",
        fileSize: 0,
        importedAt: 1700000001037,
        audioUrl: stream.url,
        downloadUrl: stream.url,
        src: stream.url,
        image: cover,
        duration: Number(shababeekMatch?.duration) >= 300 ? Number(shababeekMatch.duration) : 346,
        source: "JioSaavn",
        qualityBadge: "Very High (320kbps)" as QualityTier,
        bitrate: 320,
        codec: "AAC",
        mimeType: "audio/mp4",
        format: "MP4 (320kbps)",
        qualityVerified: true,
        fallbackUrls: stream.fallbackUrls,
        year: 1981,
        trendingRank: 3,
        trendingScore: 1037,
      };

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(RANK3_MOUNIR_STORAGE_KEY, JSON.stringify(resolvedTrack));
      }
      if (isValidCoverUrl(cover)) {
        rememberStickyCover(resolvedTrack, cover);
        rememberStickyCover({ id: "api-ar-mounir-leila", title: "El Leila Ya Samra", artist: "محمد منير · Mohamed Mounir" }, cover);
      }
      if (memoryDeepCatalog && memoryDeepCatalog.length >= 3) {
        writePersistedDeepCatalog(memoryDeepCatalog);
      }
      if (onResolved) onResolved();
      return resolvedTrack;
    } catch {
      return null;
    } finally {
      resolvingRank3Mounir = null;
    }
  })();

  return resolvingRank3Mounir;
}

export async function fetchDeepSearchedArabicTop200(
  onPartial?: (items: TrendingTrackItem[]) => void
): Promise<TrendingTrackItem[]> {
  hydrateStickyCovers();
  void ensureRank3ElLeilaYaSamraFromJioSaavn(() => {
    const updated = readPersistedDeepCatalog();
    if (updated.length > 0 && onPartial) {
      onPartial(updated);
    }
  });
  const cached = readPersistedDeepCatalog();
  if (cached.length >= 180) {
    writePersistedDeepCatalog(cached);
    if (onPartial) onPartial(cached);
    return cached;
  }

  if (activeDeepSearchPromise) {
    const res = await activeDeepSearchPromise;
    if (onPartial && res.length > 0) onPartial(res);
    return res;
  }

  activeDeepSearchPromise = (async () => {
    const collected: Omit<TrendingTrackItem, "trendingRank">[] = [];

    const buildRanked = (): TrendingTrackItem[] => {
      const sorted = [...collected].sort((a, b) => b.trendingScore - a.trendingScore);
      const ranked = sorted.map((item, idx) => ({
        ...item,
        trendingRank: idx + 1,
      }));
      return applyRank3ElLeilaYaSamraOverride(ranked);
    };

    // Process the 40 artists in fast parallel batches of 10 artists with instant per-artist streaming
    for (let i = 0; i < TOP_40_ARABIC_ARTISTS.length; i += 10) {
      const batch = TOP_40_ARABIC_ARTISTS.slice(i, i + 10);
      await Promise.allSettled(
        batch.map(async (seed, bIdx) => {
          const songs = await deepSearch5SongsForArtist(seed, i + bIdx);
          if (songs.length > 0) {
            collected.push(...songs);
            const snapshot = buildRanked();
            if (snapshot.length >= 10 && onPartial) {
              onPartial(snapshot);
            }
          }
        })
      );
      persistStickyCoversDeferred();
    }

    const finalRanked = buildRanked();
    if (finalRanked.length > 0) {
      writePersistedDeepCatalog(finalRanked);
      persistStickyCoversDeferred();
    }
    return finalRanked;
  })();

  try {
    return await activeDeepSearchPromise;
  } finally {
    activeDeepSearchPromise = null;
  }
}

export async function enrichArabicCatalogArtwork(
  onUpdate?: (updated: TrendingTrackItem[]) => void
): Promise<void> {
  await fetchDeepSearchedArabicTop200(onUpdate);
}

/**
 * Resolves a YouTube fallback stream for any Arabic track whose JioSaavn stream failed
 * or was unavailable at playback time.
 */
export async function resolveArabicYouTubeFallback(track: any): Promise<{
  url: string;
  ytId: string;
  source: string;
  bitrate: number;
  codec: string;
  mimeType: string;
  format: string;
  qualityBadge: QualityTier;
  image?: string;
  duration?: number;
} | null> {
  const title = String(track?.title || track?.name || "").trim();
  const rawArtist = String(track?.artist || "").trim();
  const artistParts = rawArtist.split("·").map((s) => s.trim()).filter(Boolean);
  const artistAr = artistParts[0] || rawArtist;
  const artistEn = artistParts[1] || artistParts[0] || rawArtist;

  const queries = [`${title} ${artistAr}`.trim(), `${title} ${artistEn} official`.trim()].filter(
    Boolean
  );

  const isArabicTrack =
    /^(?:api-|download:)?ar-\d+-\d+$/.test(String(track?.id || "")) ||
    /[\u0600-\u06FF]/.test(`${title} ${rawArtist}`);

  for (const q of queries) {
    const ytResults = await searchYouTube(q);
    const validYt = ytResults.find((yt) => {
      const ytId = extractCleanYouTubeId(yt.id || yt.downloadUrl);
      if (!/^[\w-]{11}$/.test(ytId)) return false;
      const meta = `${yt.name || ""} ${yt.artist || ""}`;
      if (isArabicTrack) {
        if (INDIC_AND_NON_ARABIC_SCRIPT_REGEX.test(meta)) return false;
        if (BLOCKED_LANGUAGES_REGEX.test(meta)) return false;
      }
      if (UNWANTED_VERSION_REGEX.test(meta)) return false;
      if (yt.duration > 0 && (yt.duration < 90 || yt.duration > 900)) return false;
      return true;
    });

    if (validYt) {
      const ytId = extractCleanYouTubeId(validYt.id || validYt.downloadUrl);
      const directYt = await resolveYouTubePlayableStream({
        id: ytId,
        title,
        name: title,
        artist: artistEn || artistAr,
        duration: validYt.duration || track?.duration,
        audioUrl: `yt-stream://${ytId}`,
      });

      const finalUrl = directYt?.url || validYt.downloadUrl || `yt-stream://${ytId}`;
      const bitrate = directYt?.bitrate || validYt.bitrate || 160;
      const codec = directYt?.codec || validYt.codec || "Opus";
      const mimeType = directYt?.mimeType || validYt.mimeType || "audio/webm";
      const qualityBadge: QualityTier =
        directYt?.qualityBadge || validYt.qualityBadge || "High (160kbps)";

      return {
        url: finalUrl,
        ytId,
        source: "YouTube",
        bitrate,
        codec,
        mimeType,
        format: `YouTube (${codec} ${bitrate}kbps)`,
        qualityBadge,
        image: track?.image || validYt.image,
        duration: directYt?.duration || validYt.duration || track?.duration,
      };
    }
  }

  return null;
}

export function cacheResolvedArabicStream(
  trackId: string,
  streamUrl: string,
  extra?: {
    source?: string;
    bitrate?: number;
    codec?: string;
    mimeType?: string;
    format?: string;
    qualityBadge?: string;
    fallbackUrls?: string[];
    duration?: number;
    image?: string;
  }
): void {
  const idKey = String(trackId).replace(/^api-/, "").replace(/^download:/, "");
  if (!idKey.startsWith("ar-")) return;
  if (!isValidDirectAudioUrl(streamUrl)) return;

  const streamCache = loadJsonMap(STREAM_STORAGE_KEY);
  streamCache[idKey] = streamUrl;
  saveJsonMap(STREAM_STORAGE_KEY, streamCache);

  const metaMap = loadStreamMetaMap();
  metaMap[idKey] = {
    url: streamUrl,
    source: extra?.source || metaMap[idKey]?.source || "JioSaavn",
    bitrate: extra?.bitrate ?? metaMap[idKey]?.bitrate ?? 320,
    codec: extra?.codec || metaMap[idKey]?.codec || "AAC",
    mimeType: extra?.mimeType || metaMap[idKey]?.mimeType || "audio/mp4",
    format: extra?.format || metaMap[idKey]?.format || "MP4 (320kbps)",
    qualityBadge: extra?.qualityBadge || metaMap[idKey]?.qualityBadge || "Very High (320kbps)",
    fallbackUrls: extra?.fallbackUrls?.filter(isValidDirectAudioUrl),
    duration: extra?.duration || metaMap[idKey]?.duration,
    image: isValidCoverUrl(extra?.image) ? extra?.image : metaMap[idKey]?.image,
  };
  saveStreamMetaMap(metaMap);

  if (isValidCoverUrl(extra?.image)) {
    const artCache = loadJsonMap(ARTWORK_STORAGE_KEY);
    artCache[idKey] = extra!.image!;
    saveJsonMap(ARTWORK_STORAGE_KEY, artCache);
    stickyCoverMemoryMap.set(idKey, extra!.image!);
    stickyCoverMemoryMap.set(`api-${idKey}`, extra!.image!);
    preloadCoverImage(extra!.image!);
    persistStickyCoversDeferred();
  }
}
