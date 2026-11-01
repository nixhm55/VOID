import {
  type QualityTier,
  cleanCanonicalTrackTitle,
  deduplicateTrackCollection,
  detectTrackQuality,
} from "./quality";
import { searchJioSaavn } from "./musicApi";
import {
  extractCleanYouTubeId,
  resolveYouTubePlayableStream,
  searchYouTube,
} from "./youtubeApi";
import {
  cacheResolvedArabicStream,
  enrichArabicCatalogArtwork,
  fetchDeepSearchedArabicTop200,
  getInstantArabicTop200,
} from "./arabicTrendingCatalog";
import {
  MULTI_LANG_TOP_40_ARTISTS,
  fetchDeepSearchedMultiLangTop200,
  getCachedMultiLangTop200,
  getInstantMultiLangTop200,
} from "./multiLangTrendingCatalog";

const SPAM_PATTERNS =
  /\b(karaoke|ringtone|tribute to|8d audio|16d audio|whatsapp status|bgm ringtone|cover by|instrumental version)\b/i;

function isSpamOrUnwantedResult(title: string, artist: string, album: string): boolean {
  return SPAM_PATTERNS.test(`${title} ${artist} ${album}`);
}

export interface TrendingLanguage {
  id: string;
  label: string;
  nativeLabel: string;
  region: string;
  subtitle: string;
  artistName: string;
  artistAliases: readonly string[];
  wikiArtistTitle: string;
  wikiArtistLang?: string;
  artistPortraitUrl?: string;
  preferWikiArtistPortrait?: boolean;
  bgWikiTitle: string;
  bgFallbackUrls: readonly string[];
  accentGradient: string;
  queries: readonly string[];
}

export interface TrendingTrackItem {
  id: string;
  title: string;
  name: string;
  artist: string;
  album: string;
  fileName: string;
  fileSize: number;
  importedAt: number;
  audioUrl: string;
  downloadUrl: string;
  src: string;
  image: string;
  duration: number;
  source: string;
  qualityBadge: QualityTier;
  bitrate?: number;
  codec?: string;
  mimeType?: string;
  format?: string;
  qualityVerified?: boolean;
  fallbackUrls?: string[];
  playCount?: number;
  year?: number;
  trendingRank: number;
  trendingScore: number;
  favorite?: boolean;
  file?: any;
}

const TRENDING_ORDER_STORAGE_KEY = "void-trending-language-order";
const TRENDING_CACHE_PREFIX = "void-trending-cache-v5:";
const JIOSAAVN_API_BASE = "https://elitejiosaavn-api.vercel.app/api";

export const TRENDING_LANGUAGES: readonly TrendingLanguage[] = [
  {
    id: "english",
    label: "English",
    nativeLabel: "US · Global",
    region: "United States & Global",
    subtitle: "Global Hits",
    artistName: "Michael Jackson",
    artistAliases: ["Michael Jackson"],
    wikiArtistTitle: "Michael Jackson",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/3/31/Michael_Jackson_in_1988.jpg",
    preferWikiArtistPortrait: false,
    bgWikiTitle: "United States Capitol",
    bgFallbackUrls: [
      "https://upload.wikimedia.org/wikipedia/commons/e/e4/White_House_02.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/a/af/WhiteHouseSouthFacade.JPG",
      "https://upload.wikimedia.org/wikipedia/commons/9/9f/US_Capitol_east_side.JPG",
    ],
    accentGradient: "linear-gradient(145deg, #0d1629 0%, #172542 52%, #07090e 100%)",
    queries: [],
  },
  {
    id: "arabic",
    label: "Arabic",
    nativeLabel: "العربية · UAE & MENA",
    region: "UAE, Saudi, Qatar, Kuwait, Bahrain & Palestine",
    subtitle: "Arab World",
    artistName: "Mehad Hamad",
    artistAliases: ["Mehad Hamad", "ميحد حمد", "Maihad Hamad", "Mihad Hamad"],
    wikiArtistTitle: "ميحد حمد",
    wikiArtistLang: "ar",
    artistPortraitUrl: "",
    preferWikiArtistPortrait: false,
    bgWikiTitle: "Sheikh Zayed Grand Mosque",
    bgFallbackUrls: [
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #24170c 0%, #3d2512 52%, #090807 100%)",
    queries: [],
  },
  {
    id: "malayalam",
    label: "Malayalam",
    nativeLabel: "മലയാളം · India",
    region: "India",
    subtitle: "Malayalam Classics",
    artistName: "K. J. Yesudas",
    artistAliases: ["K. J. Yesudas", "KJ Yesudas", "Yesudas"],
    wikiArtistTitle: "K. J. Yesudas",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/6/6e/Yesudas_at_Nishagandhi.jpg",
    preferWikiArtistPortrait: false,
    bgWikiTitle: "Kerala backwaters",
    bgFallbackUrls: [
      "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #0b2219 0%, #13392a 52%, #060b09 100%)",
    queries: [],
  },
  {
    id: "tamil",
    label: "Tamil",
    nativeLabel: "தமிழ் · India",
    region: "India",
    subtitle: "Kollywood Hits",
    artistName: "A. R. Rahman",
    artistAliases: ["A. R. Rahman", "AR Rahman"],
    wikiArtistTitle: "A. R. Rahman",
    artistPortraitUrl:
      "https://c.saavncdn.com/artists/AR_Rahman_002_20210120084455_500x500.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Brihadisvara Temple",
    bgFallbackUrls: [
      "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1621252179027-94459d278660?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #26140d 0%, #422214 52%, #0a0706 100%)",
    queries: [],
  },
  {
    id: "hindi",
    label: "Hindi",
    nativeLabel: "हिन्दी · India",
    region: "India",
    subtitle: "Bollywood Hits",
    artistName: "Lata Mangeshkar",
    artistAliases: ["Lata Mangeshkar", "Arijit Singh"],
    wikiArtistTitle: "Lata Mangeshkar",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/e/e4/Lata_Mangeshkar_-_still_29065_crop.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Taj Mahal",
    bgFallbackUrls: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/960px-Taj_Mahal_%28Edited%29.jpeg",
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #24101c 0%, #3d1b30 52%, #090608 100%)",
    queries: [],
  },
  {
    id: "urdu",
    label: "Urdu",
    nativeLabel: "اردو · Coke Studio & Indie",
    region: "South Asia",
    subtitle: "Sufi & Qawwali",
    artistName: "Nusrat Fateh Ali Khan",
    artistAliases: ["Nusrat Fateh Ali Khan"],
    wikiArtistTitle: "Nusrat Fateh Ali Khan",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/2/2d/Nusrat_Fateh_Ali_Khan_%281948-1997%29.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Faisal Mosque",
    bgFallbackUrls: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Ali_Mujtaba_WLM2017_FAISAL_MOSQUE_019.jpg/960px-Ali_Mujtaba_WLM2017_FAISAL_MOSQUE_019.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Badshahi_Mosque_front_picture.jpg/960px-Badshahi_Mosque_front_picture.jpg",
    ],
    accentGradient: "linear-gradient(145deg, #1b150e 0%, #342619 52%, #080706 100%)",
    queries: [],
  },
  {
    id: "telugu",
    label: "Telugu",
    nativeLabel: "తెలుగు · India",
    region: "India",
    subtitle: "Tollywood Hits",
    artistName: "S. P. Balasubrahmanyam",
    artistAliases: ["S. P. Balasubrahmanyam", "SP Balasubrahmanyam"],
    wikiArtistTitle: "S. P. Balasubrahmanyam",
    artistPortraitUrl:
      "https://c.saavncdn.com/artists/S_P_Balasubrahmanyam_500x500.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Charminar",
    bgFallbackUrls: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Charminar_Hyderabad_1.jpg/960px-Charminar_Hyderabad_1.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/7/71/Charminar_Hyderabad_1.jpg",
    ],
    accentGradient: "linear-gradient(145deg, #101e29 0%, #1a3347 52%, #06090c 100%)",
    queries: [],
  },
  {
    id: "kannada",
    label: "Kannada",
    nativeLabel: "ಕನ್ನಡ · India",
    region: "India",
    subtitle: "Sandalwood Hits",
    artistName: "Puneeth Rajkumar",
    artistAliases: ["Puneeth Rajkumar", "Dr. Rajkumar", "Sonu Nigam", "Vijay Prakash"],
    wikiArtistTitle: "Puneeth Rajkumar",
    artistPortraitUrl:
      "https://c.saavncdn.com/artists/Puneeth_Rajkumar_004_20250825093702_500x500.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Mysore Palace",
    bgFallbackUrls: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Mysore_Palace_Morning.jpg/960px-Mysore_Palace_Morning.jpg",
      "https://images.unsplash.com/photo-1600100397608-f010f423b971?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #25190c 0%, #402b14 52%, #090705 100%)",
    queries: [],
  },
  {
    id: "punjabi",
    label: "Punjabi",
    nativeLabel: "ਪੰਜਾਬੀ · India",
    region: "India",
    subtitle: "Punjabi Hits",
    artistName: "Diljit Dosanjh",
    artistAliases: ["Diljit Dosanjh"],
    wikiArtistTitle: "Diljit Dosanjh",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/3/36/Diljit_Dosanjh_-_IIFA_2017_Green_Carpet_%2835586489253%29_%28cropped%29.jpg",
    preferWikiArtistPortrait: false,
    bgWikiTitle: "Golden Temple",
    bgFallbackUrls: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/The_Golden_Temple_of_Amrithsar_7.jpg/960px-The_Golden_Temple_of_Amrithsar_7.jpg",
      "https://images.unsplash.com/photo-1588096344356-9b497caeeb64?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #1d1a0b 0%, #383114 52%, #080805 100%)",
    queries: [],
  },
  {
    id: "spanish",
    label: "Spanish",
    nativeLabel: "Español · Spain & Latin",
    region: "Spain & Latin America",
    subtitle: "Latin & Spanish Hits",
    artistName: "Enrique Iglesias",
    artistAliases: ["Enrique Iglesias"],
    wikiArtistTitle: "Enrique Iglesias",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/9/9a/Enrique_Iglesias_2011%2C_2_%28cropped%29.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Sagrada Família",
    bgFallbackUrls: [
      "https://images.unsplash.com/photo-1543783207-ec64e4d95325?auto=format&fit=crop&w=900&q=85",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/SF_maig_2_cropped.jpg/960px-SF_maig_2_cropped.jpg",
    ],
    accentGradient: "linear-gradient(145deg, #261111 0%, #451d1d 52%, #0a0606 100%)",
    queries: [],
  },
  {
    id: "french",
    label: "French",
    nativeLabel: "Français · France",
    region: "France",
    subtitle: "French Hits",
    artistName: "Stromae",
    artistAliases: ["Stromae", "Indila"],
    wikiArtistTitle: "Stromae",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/9/9c/Stromae_2011_cropped.jpg",
    preferWikiArtistPortrait: true,
    bgWikiTitle: "Eiffel Tower",
    bgFallbackUrls: [
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #111828 0%, #1e2a47 52%, #07090e 100%)",
    queries: [],
  },
  {
    id: "bengali",
    label: "Bengali",
    nativeLabel: "বাংলা · India",
    region: "India",
    subtitle: "Bengali Hits",
    artistName: "Shreya Ghoshal",
    artistAliases: ["Shreya Ghoshal", "Arijit Singh"],
    wikiArtistTitle: "Shreya Ghoshal",
    artistPortraitUrl:
      "https://upload.wikimedia.org/wikipedia/commons/b/bd/Shreya_Ghoshal_at_Filmfare_Awards_South.jpg",
    preferWikiArtistPortrait: false,
    bgWikiTitle: "Victoria Memorial, Kolkata",
    bgFallbackUrls: [
      "https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=85",
      "https://images.unsplash.com/photo-1536421469767-80559bb6f5e1?auto=format&fit=crop&w=900&q=85",
    ],
    accentGradient: "linear-gradient(145deg, #102022 0%, #1a383c 52%, #060a0b 100%)",
    queries: [],
  },
];

export function getOrderedTrendingLanguages(): TrendingLanguage[] {
  try {
    const raw = localStorage.getItem(TRENDING_ORDER_STORAGE_KEY);
    if (!raw) return [...TRENDING_LANGUAGES];
    const savedIds: unknown = JSON.parse(raw);
    if (!Array.isArray(savedIds)) return [...TRENDING_LANGUAGES];

    const byId = new Map(TRENDING_LANGUAGES.map((lang) => [lang.id, lang]));
    const ordered: TrendingLanguage[] = [];
    const seen = new Set<string>();

    for (const item of savedIds) {
      const id = String(item || "").trim();
      const found = byId.get(id);
      if (found && !seen.has(id)) {
        ordered.push(found);
        seen.add(id);
      }
    }

    for (const lang of TRENDING_LANGUAGES) {
      if (!seen.has(lang.id)) {
        ordered.push(lang);
        seen.add(lang.id);
      }
    }

    return ordered;
  } catch {
    return [...TRENDING_LANGUAGES];
  }
}

export function promoteTrendingLanguage(langId: string): TrendingLanguage[] {
  const current = getOrderedTrendingLanguages();
  const target = current.find((lang) => lang.id === langId);
  if (!target) return current;

  const updated = [target, ...current.filter((lang) => lang.id !== langId)];
  try {
    localStorage.setItem(
      TRENDING_ORDER_STORAGE_KEY,
      JSON.stringify(updated.map((lang) => lang.id))
    );
  } catch {
    /* ignore storage quota issues */
  }
  return updated;
}

const trendingMemoryCache = new Map<string, TrendingTrackItem[]>();

function readCachedTrending(langId: string): TrendingTrackItem[] | null {
  const mem = trendingMemoryCache.get(langId);
  if (mem && mem.length > 0) return mem;
  try {
    const raw = localStorage.getItem(`${TRENDING_CACHE_PREFIX}${langId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      trendingMemoryCache.set(langId, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCachedTrending(langId: string, items: TrendingTrackItem[]): void {
  if (!items.length) return;
  trendingMemoryCache.set(langId, items);
  try {
    localStorage.setItem(`${TRENDING_CACHE_PREFIX}${langId}`, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Returns cached or built-in tracks synchronously in 0ms so clicking a language
 * opens the list immediately without a loading screen.
 */
export function getInitialTrendingTracks(langId: string): TrendingTrackItem[] {
  if (langId === "arabic") {
    const instant = getInstantArabicTop200();
    trendingMemoryCache.set("arabic", instant);
    return instant;
  }
  if (MULTI_LANG_TOP_40_ARTISTS[langId]) {
    const instantMulti = getInstantMultiLangTop200(langId);
    if (instantMulti.length > 0) {
      trendingMemoryCache.set(langId, instantMulti);
      return instantMulti;
    }
  }
  return readCachedTrending(langId) ?? [];
}

function decodeHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseKbps(label?: string): number | undefined {
  if (!label) return undefined;
  const match = String(label).match(/(\d+)\s*kbps/i);
  if (!match) return undefined;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function computeTrendingScore(
  playCount: number,
  year: number,
  queryTier: number,
  rankInQuery: number
): number {
  const currentYear = new Date().getFullYear();
  const playScore =
    playCount > 0 ? Math.log10(Math.max(10, playCount)) * 26 : 125;

  let recencyBoost = 0;
  if (year >= currentYear - 1) recencyBoost = 44;
  else if (year === currentYear - 2) recencyBoost = 34;
  else if (year === currentYear - 3) recencyBoost = 24;
  else if (year === currentYear - 4) recencyBoost = 15;
  else if (year >= 2018) recencyBoost = 8;

  const tierBoost = Math.max(0, (6 - queryTier) * 5);
  const rankBoost = Math.max(0, (40 - Math.min(40, rankInQuery)) * 1.15);

  return playScore + recencyBoost + tierBoost + rankBoost;
}

export async function fetchTrendingTop100(
  langId: string,
  externalSignal?: AbortSignal,
  onPartial?: (items: TrendingTrackItem[]) => void
): Promise<TrendingTrackItem[]> {
  if (langId === "arabic") {
    const instant = getInstantArabicTop200();
    if (instant.length > 0 && onPartial) onPartial(instant);
    const resolved = await fetchDeepSearchedArabicTop200((updated) => {
      trendingMemoryCache.set("arabic", updated);
      if (!externalSignal?.aborted && onPartial) {
        onPartial(updated);
      }
    });
    if (resolved.length > 0) {
      trendingMemoryCache.set("arabic", resolved);
      return resolved;
    }
    return instant;
  }

  if (MULTI_LANG_TOP_40_ARTISTS[langId]) {
    const instant = getCachedMultiLangTop200(langId);
    if (instant.length > 0 && onPartial) onPartial(instant);
    const resolved = await fetchDeepSearchedMultiLangTop200(langId, externalSignal, (updated) => {
      trendingMemoryCache.set(langId, updated);
      if (!externalSignal?.aborted && onPartial) {
        onPartial(updated);
      }
    });
    if (resolved.length > 0) {
      trendingMemoryCache.set(langId, resolved);
      return resolved;
    }
    return instant;
  }

  const cached = readCachedTrending(langId);
  if (cached && cached.length >= 60) {
    if (onPartial) onPartial(cached);
    return cached;
  }

  const language =
    TRENDING_LANGUAGES.find((l) => l.id === langId) || TRENDING_LANGUAGES[0];

  type RawCandidate = Omit<TrendingTrackItem, "trendingRank">;
  const candidates: RawCandidate[] = [];

  const buildRankedSnapshot = (): TrendingTrackItem[] => {
    const sorted = [...candidates].sort((a, b) => b.trendingScore - a.trendingScore);
    const deduped = deduplicateTrackCollection(sorted, {
      ignoreArtist: false,
      cleanTitles: true,
    });
    return deduped.slice(0, 100).map((item, idx) => ({
      ...item,
      title: cleanCanonicalTrackTitle(item.title),
      name: cleanCanonicalTrackTitle(item.name),
      trendingRank: idx + 1,
    }));
  };

  const fetchQueryPage = async (
    query: string,
    page: number,
    queryTier: number
  ): Promise<RawCandidate[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onAbort, { once: true });

    try {
      const url = `${JIOSAAVN_API_BASE}/search/songs?query=${encodeURIComponent(
        query
      )}&page=${page}&limit=40`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return [];
      const json = await res.json();
      const results: any[] = Array.isArray(json?.data?.results)
        ? json.data.results
        : Array.isArray(json?.results)
          ? json.results
          : [];

      const out: RawCandidate[] = [];
      results.forEach((song, idx) => {
        const rawId = String(song?.id || "").trim();
        if (!rawId) return;

        const title = decodeHtml(String(song?.name || song?.title || ""));
        const primaryArtists = Array.isArray(song?.artists?.primary)
          ? song.artists.primary
              .map((a: any) => decodeHtml(String(a?.name || "")))
              .filter(Boolean)
              .join(", ")
          : decodeHtml(String(song?.primaryArtists || ""));
        const artist = primaryArtists || "Unknown Artist";
        const album =
          decodeHtml(String(song?.album?.name || "")) || "Unknown Album";

        if (!title || isSpamOrUnwantedResult(title, artist, album)) return;

        const downloads: any[] = Array.isArray(song?.downloadUrl)
          ? song.downloadUrl
          : [];
        const validVariants = downloads
          .map((d) => ({
            url: String(d?.url || d?.link || "").trim(),
            quality: d?.quality ? String(d.quality).trim() : undefined,
            bitrate: parseKbps(d?.quality),
          }))
          .filter((d) => d.url.startsWith("http"));

        if (!validVariants.length) return;
        validVariants.sort((a, b) => (b.bitrate ?? -1) - (a.bitrate ?? -1));
        const best = validVariants[0];
        const fallbackUrls = validVariants
          .slice(1)
          .map((v) => v.url)
          .filter((u) => u !== best.url);

        const images: any[] = Array.isArray(song?.image) ? song.image : [];
        const validImages = images
          .map((img) => ({
            quality: img?.quality,
            url: String(img?.url || img?.link || "").trim(),
          }))
          .filter((img) => img.url.startsWith("http"));
        const hiImg =
          validImages.find((img) => img.quality === "500x500")?.url ||
          validImages[validImages.length - 1]?.url ||
          "";

        const playCount = Number(song?.playCount) || 0;
        const year = Number(song?.year) || 0;
        const duration = Number(song?.duration) || 0;
        const rankInQuery = (page - 1) * 40 + idx;
        const trendingScore = computeTrendingScore(
          playCount,
          year,
          queryTier,
          rankInQuery
        );

        const qualityBadge = detectTrackQuality(
          best.url,
          best.quality || "AAC",
          best.bitrate,
          {
            codecHint: "AAC",
            mimeTypeHint: "audio/mp4",
            providerVerified: Boolean(best.bitrate),
          }
        );

        out.push({
          id: `api-${rawId}`,
          title,
          name: title,
          artist,
          album,
          fileName: `${title}.m4a`,
          fileSize: 0,
          importedAt: Date.now(),
          audioUrl: best.url,
          downloadUrl: best.url,
          src: best.url,
          image: hiImg,
          duration,
          source: "JioSaavn",
          qualityBadge,
          bitrate: best.bitrate,
          codec: "AAC",
          mimeType: "audio/mp4",
          format: best.quality ? `MP4 (${best.quality})` : "MP4/AAC",
          qualityVerified: Boolean(best.bitrate),
          fallbackUrls,
          playCount,
          year,
          trendingScore,
        });
      });

      if (out.length > 0 && !externalSignal?.aborted) {
        candidates.push(...out);
        if (onPartial) {
          onPartial(buildRankedSnapshot());
        }
      }

      return out;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  };

  const tasks: Promise<RawCandidate[]>[] = [];
  language.queries.forEach((q, tierIdx) => {
    tasks.push(fetchQueryPage(q, 1, tierIdx));
    if (tierIdx < 2) {
      tasks.push(fetchQueryPage(q, 2, tierIdx));
    }
  });

  await Promise.allSettled(tasks);

  let top100 = buildRankedSnapshot();

  if (top100.length < 100 && !externalSignal?.aborted) {
    try {
      const ytResults = await searchYouTube(
        `${language.label} top trending songs`,
        externalSignal
      );
      ytResults.forEach((yt, idx) => {
        const id = yt.id.startsWith("api-") ? yt.id : `api-${yt.id}`;
        candidates.push({
          id,
          title: yt.name,
          name: yt.name,
          artist: yt.artist,
          album: yt.album || `${language.label} Trending`,
          fileName: `${yt.name}.m4a`,
          fileSize: 0,
          importedAt: Date.now(),
          audioUrl: yt.downloadUrl,
          downloadUrl: yt.downloadUrl,
          src: yt.downloadUrl,
          image: yt.image,
          duration: yt.duration || 0,
          source: "YouTube",
          qualityBadge: yt.qualityBadge || "High (160kbps)",
          bitrate: yt.bitrate,
          codec: yt.codec,
          mimeType: yt.mimeType,
          format: yt.format,
          qualityVerified: yt.qualityVerified,
          fallbackUrls: yt.fallbackUrls,
          trendingScore: 160 - idx * 1.2,
        });
      });
      top100 = buildRankedSnapshot();
    } catch {
      /* ignore supplemental failure */
    }
  }

  if (top100.length > 0) {
    writeCachedTrending(langId, top100);
    if (!externalSignal?.aborted && onPartial) {
      onPartial(top100);
    }
  }

  return top100;
}

function normalizeArabicText(input: string): string {
  return String(input || "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTransliteration(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bmohammed\b|\bmohammad\b|\bmuhammad\b|\bmohamed\b/g, "mohamed")
    .replace(/\bhussain\b|\bhussein\b|\bhusein\b/g, "hussein")
    .replace(/\brashid\b|\brashed\b/g, "rashid")
    .replace(/\bmajed\b|\bmajid\b|\bmaged\b/g, "majid")
    .replace(/\babdul\s+majeed\b|\babdel\s+majeed\b|\babdulmajeed\b|\babdelmajeed\b/g, "abdulmajeed")
    .replace(/\babdu\b|\babdo\b|\babdou\b/g, "abdo")
    .replace(/\bkadim\b|\bkazem\b|\bkathem\b|\bkadhem\b/g, "kazem")
    .replace(/\bassala\b|\basala\b|\bassalah\b/g, "asala")
    .replace(/\bkfoury\b|\bkfouri\b/g, "kfoury")
    .replace(/\bmehad\b|\bmihad\b/g, "mehad")
    .replace(/\bfouad\b|\bfuad\b/g, "fouad")
    .replace(/\bsaqer\b|\bsager\b|\bsaqr\b/g, "saqer")
    .replace(/\browaished\b|\bruwaished\b/g, "rowaished")
    .replace(/\blamjarred\b|\blamjared\b/g, "lamjarred")
    .replace(/3/g, "a")
    .replace(/7/g, "h")
    .replace(/2/g, "a")
    .replace(/5/g, "kh")
    .replace(/\bel\b|\bal\b/g, "al")
    .replace(/ee|ey|ay|ai|ei|ie|ea|y/g, "i")
    .replace(/oo|ou|ow/g, "u")
    .replace(/aa/g, "a")
    .replace(/ph/g, "f")
    .replace(/gh/g, "g")
    .replace(/kh/g, "k")
    .replace(/q/g, "k")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/(.)\1+/g, "$1")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistSimple(a: string, b: string): number {
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

const INDIC_SCRIPT_REGEX = /[\u0900-\u0D7F]/;

const UNWANTED_ARABIC_VERSION_REGEX =
  /\b(karaoke|instrumental|tribute|in the style of|originally performed by|made famous by|backing track|minus one|without vocals|no vocals|ringtone|8d audio|16d audio|slowed|reverb|sped up|nightcore|cover|lofi|lo-fi|mashup|dj\s*mix|remix)\b|كاريوكي|بدون موسيقى|بدون ايقاع|موسيقى فقط|نسخة موسيقية|ريمكس|بطيء|مسرع/i;

const INDIAN_REGIONAL_LANGUAGES = new Set([
  "bengali",
  "hindi",
  "urdu",
  "malayalam",
  "tamil",
  "telugu",
  "punjabi",
  "marathi",
  "gujarati",
  "assamese",
  "odia",
  "oriYa",
  "kannada",
  "bhojpuri",
  "haryanvi",
  "rajasthani",
  "sanskrit",
  "nepali",
  "sinhala",
]);

function singleTokenMatches(targetToken: string, hayTokens: string[]): boolean {
  return hayTokens.some((ht) => {
    if (ht === targetToken) return true;
    if (targetToken.length >= 4 && ht.length >= 4 && editDistSimple(targetToken, ht) <= 1) {
      return true;
    }
    if (targetToken.length >= 6 && ht.length >= 6 && editDistSimple(targetToken, ht) <= 2) {
      return true;
    }
    return false;
  });
}

function allSignificantTokensMatch(targetTokens: string[], hayTokens: string[]): boolean {
  const sig = targetTokens.filter((t) => t.length >= 2 && t !== "al" && t !== "el");
  if (!sig.length || !hayTokens.length) return false;
  return sig.every((tt) => singleTokenMatches(tt, hayTokens));
}

const inFlightTrackResolvers = new Map<string, Promise<{
  url: string;
  source: string;
  bitrate?: number;
  codec?: string;
  mimeType?: string;
  format?: string;
  qualityBadge?: QualityTier;
  qualityVerified?: boolean;
  fallbackUrls?: string[];
  image?: string;
  duration?: number;
} | null>>();

/**
 * Resolves a `trending-resolve://` catalog track (such as the 200 curated Arabic songs)
 * into its genuine original song stream:
 * 1. First checks JioSaavn 320kbps with STRICT verification (language === 'arabic', zero Indic script,
 *    non-karaoke/non-tribute/non-instrumental, and ALL primary artist + song title tokens matched).
 * 2. If the genuine original song is not on JioSaavn, resolves the exact original Arabic song from YouTube
 *    (converting to direct `/__void_api/yt-audio?id=...` stream when possible for seamless background playback).
 */
export async function resolveTrendingTrackStream(track: any): Promise<{
  url: string;
  source: string;
  bitrate?: number;
  codec?: string;
  mimeType?: string;
  format?: string;
  qualityBadge?: QualityTier;
  qualityVerified?: boolean;
  fallbackUrls?: string[];
  image?: string;
  duration?: number;
} | null> {
  const rawUrl = String(track?.audioUrl || track?.downloadUrl || track?.src || "");

  if (
    !rawUrl.startsWith("trending-resolve://") &&
    !rawUrl.includes("void-backend") &&
    (rawUrl.startsWith("http") || rawUrl.startsWith("/__void_api/yt-audio") || rawUrl.startsWith("yt-stream://"))
  ) {
    const isYt = rawUrl.startsWith("/__void_api/yt-audio") || rawUrl.startsWith("yt-stream://") || track?.source === "YouTube";
    return {
      url: rawUrl,
      source: isYt ? "YouTube" : (track?.source || "JioSaavn"),
      bitrate: track?.bitrate ?? (isYt ? 160 : 320),
      codec: track?.codec ?? (isYt ? "Opus" : "AAC"),
      mimeType: track?.mimeType ?? (isYt ? "audio/webm" : "audio/mp4"),
      format: track?.format ?? (isYt ? "YouTube (Opus 160kbps)" : "MP4 (320kbps)"),
      qualityBadge: track?.qualityBadge ?? (isYt ? "High (160kbps)" : "Very High (320kbps)"),
      qualityVerified: true,
      fallbackUrls: track?.fallbackUrls,
      image: track?.image,
      duration: track?.duration,
    };
  }

  const dedupKey = String(track?.id || rawUrl);
  if (inFlightTrackResolvers.has(dedupKey)) {
    return inFlightTrackResolvers.get(dedupKey)!;
  }

  const task = (async () => {
    const decoded = rawUrl.startsWith("trending-resolve://")
      ? decodeURIComponent(rawUrl.slice("trending-resolve://".length)).trim()
      : "";
    let titleAr = String(track?.title || "").trim().replace(/\s*—\s*Top Hit$|\s*\(\d+\)$/i, "");
    let artistAr = "";
    let titleEn = "";
    let artistEn = "";
    let payloadLangId = "";

    if (decoded.startsWith("{")) {
      try {
        const parsed = JSON.parse(decoded);
        titleAr = String(parsed.titleAr || titleAr).trim();
        artistAr = String(parsed.artistAr || "").trim();
        titleEn = String(parsed.titleEn || "").trim();
        artistEn = String(parsed.artistEn || "").trim();
        payloadLangId = String(parsed.langId || "").trim().toLowerCase();
      } catch {
        /* fallback below */
      }
    }
    if (!artistAr && !artistEn) {
      const parts = String(track?.artist || "").split("·").map((s) => s.trim());
      artistAr = parts[0] || "";
      artistEn = parts[1] || parts[0] || "";
    }

    const cleanIdKey = String(track?.id || "").replace(/^api-/, "").replace(/^download:/, "");
    const isArabicResolve =
      payloadLangId === "arabic" || cleanIdKey.startsWith("ar-") || /[\u0600-\u06FF]/.test(`${titleAr} ${artistAr}`);

    if ((!titleEn || !artistEn) && cleanIdKey.startsWith("ar-")) {
      const catalogItems = getInstantArabicTop200();
      const matchedCatalog = catalogItems.find((it) => it.id === `api-${cleanIdKey}`);
      if (matchedCatalog && matchedCatalog.audioUrl.startsWith("trending-resolve://")) {
        try {
          const p = JSON.parse(
            decodeURIComponent(matchedCatalog.audioUrl.slice("trending-resolve://".length))
          );
          titleAr = p.titleAr || titleAr;
          artistAr = p.artistAr || artistAr;
          titleEn = p.titleEn || titleEn;
          artistEn = p.artistEn || artistEn;
        } catch {
          /* ignore */
        }
      }
    }

    const arQuery = `${titleAr} ${artistAr}`.trim();
    const enQuery = `${titleEn} ${artistEn}`.trim() || arQuery;

    const targetTitleArNorm = normalizeArabicText(titleAr);
    const targetArtistArNorm = normalizeArabicText(artistAr);
    const targetTitleEnNorm = normalizeTransliteration(titleEn || titleAr);
    const targetArtistEnNorm = normalizeTransliteration(artistEn || artistAr);

    const targetTitleEnTokens = targetTitleEnNorm
      .split(" ")
      .filter((w) => w.length >= 2 && w !== "al" && w !== "el");
    const targetArtistEnTokens = targetArtistEnNorm
      .split(" ")
      .filter((w) => w.length >= 2 && w !== "al" && w !== "el");
    const targetTitleArTokens = targetTitleArNorm.split(" ").filter((w) => w.length >= 2);
    const targetArtistArTokens = targetArtistArNorm.split(" ").filter((w) => w.length >= 2);

    const fetchItunesMetadata = async (): Promise<{
      image?: string;
      duration?: number;
    } | null> => {
      const country = isArabicResolve ? "ae" : (MULTI_LANG_TOP_40_ARTISTS[payloadLangId]?.itunesCountry || "us");
      for (const term of [arQuery, enQuery]) {
        if (!term) continue;
        try {
          const res = await fetch(
            `/__void_api/itunes-search?term=${encodeURIComponent(term)}&country=${country}&entity=song&limit=10`
          );
          if (!res.ok) continue;
          const data = await res.json();
          const items: any[] = Array.isArray(data?.results) ? data.results : [];
          const exactMatch = items.find((it) => {
            const tNameAr = normalizeArabicText(String(it?.trackName || ""));
            const tNameEn = normalizeTransliteration(String(it?.trackName || ""));
            const aNameAr = normalizeArabicText(String(it?.artistName || ""));
            const aNameEn = normalizeTransliteration(String(it?.artistName || ""));
            const titleOk =
              (targetTitleArNorm && tNameAr.includes(targetTitleArNorm)) ||
              allSignificantTokensMatch(targetTitleEnTokens, tNameEn.split(" ").filter(Boolean));
            const artistOk =
              (targetArtistArNorm && aNameAr.includes(targetArtistArNorm)) ||
              allSignificantTokensMatch(targetArtistEnTokens, aNameEn.split(" ").filter(Boolean));
            return titleOk && artistOk;
          });
          if (exactMatch) {
            return {
              image:
                String(exactMatch.artworkUrl100 || "").replace("100x100bb", "600x600bb") ||
                undefined,
              duration:
                Math.round((Number(exactMatch.trackTimeMillis) || 0) / 1000) || undefined,
            };
          }
        } catch {
          /* ignore */
        }
      }
      return null;
    };

    // 1. Search JioSaavn (English + Arabic queries) & iTunes metadata concurrently
    const [jioEnSettled, jioArSettled, itunesSettled] = await Promise.allSettled([
      searchJioSaavn(enQuery, undefined, 15),
      arQuery !== enQuery ? searchJioSaavn(arQuery, undefined, 15) : Promise.resolve([]),
      fetchItunesMetadata(),
    ]);

    const allJioRaw = [
      ...(jioEnSettled.status === "fulfilled" ? jioEnSettled.value : []),
      ...(jioArSettled.status === "fulfilled" ? jioArSettled.value : []),
    ];

    const seenJioUrls = new Set<string>();
    const strictJioMatches: { item: any; score: number }[] = [];

    for (let idx = 0; idx < allJioRaw.length; idx++) {
      const item = allJioRaw[idx];
      if (!item?.downloadUrl || !item.downloadUrl.startsWith("http")) continue;
      if (seenJioUrls.has(item.downloadUrl)) continue;
      seenJioUrls.add(item.downloadUrl);

      const combinedMeta = `${item.name || ""} ${item.artist || ""} ${item.album || ""} ${item.label || ""}`;
      if (UNWANTED_ARABIC_VERSION_REGEX.test(combinedMeta)) continue;

      const itemLang = String(item.language || "").toLowerCase().trim();
      if (isArabicResolve) {
        if (INDIC_SCRIPT_REGEX.test(combinedMeta)) continue;
        if (itemLang && INDIAN_REGIONAL_LANGUAGES.has(itemLang)) continue;
        if (itemLang && itemLang !== "arabic" && itemLang !== "english") continue;
      }

      const dur = Number(item.duration) || 0;
      if (dur > 0 && (dur < 95 || dur > 900)) continue;

      const itemTitleAr = normalizeArabicText(item.name || "");
      const itemArtistAr = normalizeArabicText(item.artist || "");
      const itemTitleEn = normalizeTransliteration(item.name || "");
      const itemArtistEn = normalizeTransliteration(item.artist || "");

      const itemTitleArTokens = itemTitleAr.split(" ").filter(Boolean);
      const itemArtistArTokens = itemArtistAr.split(" ").filter(Boolean);
      const itemTitleEnTokens = itemTitleEn.split(" ").filter(Boolean);
      const itemArtistEnTokens = itemArtistEn.split(" ").filter(Boolean);

      const artistStrictlyMatched =
        (targetArtistArNorm.length >= 3 && itemArtistAr.includes(targetArtistArNorm)) ||
        allSignificantTokensMatch(targetArtistArTokens, itemArtistArTokens) ||
        allSignificantTokensMatch(targetArtistEnTokens, itemArtistEnTokens);

      const titleStrictlyMatched =
        (targetTitleArNorm.length >= 3 && itemTitleAr.includes(targetTitleArNorm)) ||
        allSignificantTokensMatch(targetTitleArTokens, itemTitleArTokens) ||
        allSignificantTokensMatch(targetTitleEnTokens, itemTitleEnTokens);

      if (!artistStrictlyMatched || !titleStrictlyMatched) continue;

      // If language is 'english' (not 'arabic'), require exact multi-token match on both artist and title
      if (itemLang === "english" && (!allSignificantTokensMatch(targetArtistEnTokens, itemArtistEnTokens) || !allSignificantTokensMatch(targetTitleEnTokens, itemTitleEnTokens))) {
        continue;
      }

      const is320 =
        (item.bitrate && item.bitrate >= 280) ||
        /_320\.(mp4|m4a|mp3)/i.test(item.downloadUrl) ||
        item.qualityBadge === "Very High (320kbps)";

      let score = 1000;
      if (itemLang === "arabic") score += 200;
      if (is320) score += 100;
      if (itemTitleEn === targetTitleEnNorm || itemTitleAr === targetTitleArNorm) score += 80;
      score -= idx * 2;

      strictJioMatches.push({ item, score });
    }

    strictJioMatches.sort((a, b) => b.score - a.score);
    const bestJio = strictJioMatches[0]?.item;
    const itunesMeta = itunesSettled.status === "fulfilled" ? itunesSettled.value : null;

    if (bestJio && bestJio.downloadUrl) {
      const fallbacks = [
        ...(Array.isArray(bestJio.fallbackUrls) ? bestJio.fallbackUrls : []),
        ...strictJioMatches
          .slice(1, 3)
          .map((s) => s.item.downloadUrl)
          .filter(Boolean),
      ].filter((u, i, arr) => u && u !== bestJio.downloadUrl && arr.indexOf(u) === i);

      const resolvedImg = itunesMeta?.image || bestJio.image || track?.image;
      const resolvedDur = bestJio.duration || itunesMeta?.duration || track?.duration;

      cacheResolvedArabicStream(track.id, bestJio.downloadUrl, {
        source: "JioSaavn",
        bitrate: 320,
        codec: "AAC",
        mimeType: "audio/mp4",
        format: "MP4 (320kbps)",
        qualityBadge: "Very High (320kbps)",
        fallbackUrls: fallbacks,
        duration: resolvedDur,
        image: resolvedImg,
      });

      return {
        url: bestJio.downloadUrl,
        source: "JioSaavn",
        bitrate: 320,
        codec: "AAC",
        mimeType: "audio/mp4",
        format: "MP4 (320kbps)",
        qualityBadge: "Very High (320kbps)" as QualityTier,
        qualityVerified: true,
        fallbackUrls: fallbacks.length > 0 ? fallbacks : undefined,
        image: resolvedImg,
        duration: resolvedDur,
      };
    }

    // 2. Genuine original song is NOT on JioSaavn -> Search YouTube for the exact original Arabic song
    const [ytArSettled, ytEnSettled] = await Promise.allSettled([
      searchYouTube(arQuery),
      enQuery !== arQuery ? searchYouTube(`${enQuery} official`) : Promise.resolve([]),
    ]);

    const allYtRaw = [
      ...(ytArSettled.status === "fulfilled" ? ytArSettled.value : []),
      ...(ytEnSettled.status === "fulfilled" ? ytEnSettled.value : []),
    ];

    const seenYtIds = new Set<string>();
    const scoredYt: { item: any; ytId: string; score: number }[] = [];

    for (let idx = 0; idx < allYtRaw.length; idx++) {
      const item = allYtRaw[idx];
      const ytId = extractCleanYouTubeId(item?.id || item?.downloadUrl);
      if (!/^[_a-zA-Z0-9-]{11}$/.test(ytId) || seenYtIds.has(ytId)) continue;
      seenYtIds.add(ytId);

      const combinedMeta = `${item.name || ""} ${item.artist || ""}`;
      if (INDIC_SCRIPT_REGEX.test(combinedMeta)) continue;
      if (UNWANTED_ARABIC_VERSION_REGEX.test(combinedMeta)) continue;

      const dur = Number(item.duration) || 0;
      if (dur > 0 && (dur < 90 || dur > 780)) continue;

      const hayAr = normalizeArabicText(combinedMeta);
      const hayEn = normalizeTransliteration(combinedMeta);
      const hayArTokens = hayAr.split(" ").filter(Boolean);
      const hayEnTokens = hayEn.split(" ").filter(Boolean);

      const titleArMatched =
        (targetTitleArNorm.length >= 2 && hayAr.includes(targetTitleArNorm)) ||
        allSignificantTokensMatch(targetTitleArTokens, hayArTokens);
      const titleEnMatched =
        (targetTitleEnNorm.length >= 3 && hayEn.includes(targetTitleEnNorm)) ||
        allSignificantTokensMatch(targetTitleEnTokens, hayEnTokens);

      const artistArMatched =
        (targetArtistArNorm.length >= 2 && hayAr.includes(targetArtistArNorm)) ||
        allSignificantTokensMatch(targetArtistArTokens, hayArTokens);
      const artistEnMatched =
        (targetArtistEnNorm.length >= 3 && hayEn.includes(targetArtistEnNorm)) ||
        allSignificantTokensMatch(targetArtistEnTokens, hayEnTokens);

      const titleMatched = titleArMatched || titleEnMatched;
      const artistMatched = artistArMatched || artistEnMatched;

      if (!titleMatched && !artistMatched) continue;

      let score = 0;
      if (titleMatched && artistMatched) score += 1000;
      else if (titleMatched && idx < 3) score += 750;
      else if (artistMatched && idx < 2) score += 600;
      else continue;

      if (titleArMatched && artistArMatched) score += 150;
      if (/\b(official|audio|lyric|vevo|rotana|mazzika|watary|nujoom)\b|رسمي|نسخة أصلية|روتانا/i.test(combinedMeta)) {
        score += 90;
      }
      if (/\b(live|concert|حفل|حفلة)\b/i.test(combinedMeta)) {
        score -= 120;
      }
      score -= idx * 10;

      scoredYt.push({ item, ytId, score });
    }

    scoredYt.sort((a, b) => b.score - a.score);
    const bestYtEntry = scoredYt[0];

    if (bestYtEntry) {
      const { item: bestYt, ytId } = bestYtEntry;
      const resolvedImg = itunesMeta?.image || track?.image || bestYt.image;
      const resolvedDur = bestYt.duration || itunesMeta?.duration || track?.duration;

      // Try resolving direct stream via local Vite YouTube audio gateway for background-safe <audio> playback
      const directYt = await resolveYouTubePlayableStream({
        id: ytId,
        title: titleAr,
        name: titleAr,
        artist: artistEn || artistAr,
        duration: resolvedDur,
        audioUrl: `yt-stream://${ytId}`,
      });

      const finalUrl = directYt?.url || bestYt.downloadUrl || `yt-stream://${ytId}`;
      const finalBitrate = directYt?.bitrate || bestYt.bitrate || 160;
      const finalCodec = directYt?.codec || bestYt.codec || "Opus";
      const finalMime = directYt?.mimeType || bestYt.mimeType || "audio/webm";
      const finalBadge: QualityTier =
        directYt?.qualityBadge || bestYt.qualityBadge || "High (160kbps)";
      const finalFormat = `YouTube (${finalCodec} ${finalBitrate}kbps)`;

      cacheResolvedArabicStream(track.id, finalUrl, {
        source: "YouTube",
        bitrate: finalBitrate,
        codec: finalCodec,
        mimeType: finalMime,
        format: finalFormat,
        qualityBadge: finalBadge,
        duration: directYt?.duration || resolvedDur,
        image: resolvedImg,
      });

      return {
        url: finalUrl,
        source: "YouTube",
        bitrate: finalBitrate,
        codec: finalCodec,
        mimeType: finalMime,
        format: finalFormat,
        qualityBadge: finalBadge,
        qualityVerified: true,
        image: resolvedImg,
        duration: directYt?.duration || resolvedDur,
      };
    }

    return null;
  })();

  inFlightTrackResolvers.set(dedupKey, task);
  try {
    return await task;
  } finally {
    inFlightTrackResolvers.delete(dedupKey);
  }
}

let prewarmStarted = false;
let prewarmingArabicStreams = false;

export async function prewarmArabicTopStreams(limit = 25): Promise<void> {
  if (prewarmingArabicStreams) return;
  prewarmingArabicStreams = true;
  try {
    const tracks = getInstantArabicTop200();
    const unresolved = tracks
      .slice(0, limit)
      .filter((t) => String(t.audioUrl || "").startsWith("trending-resolve://"));
    for (let i = 0; i < unresolved.length; i += 4) {
      const batch = unresolved.slice(i, i + 4);
      await Promise.allSettled(batch.map((t) => resolveTrendingTrackStream(t)));
    }
  } catch {
    /* ignore background prewarm errors */
  } finally {
    prewarmingArabicStreams = false;
  }
}

/**
 * Pre-warms the Arabic 200-song artwork, top 320kbps JioSaavn streams, and top user languages in the background
 * so opening and playing Trending languages is instantaneous.
 */
export function warmUpTrendingCatalog(): void {
  if (prewarmStarted) return;
  prewarmStarted = true;
  window.setTimeout(() => {
    void enrichArabicCatalogArtwork();
    void prewarmArabicTopStreams(20);
    const ordered = getOrderedTrendingLanguages();
    const topLang = ordered.find((lang) => lang.id !== "arabic");
    if (topLang) {
      window.setTimeout(() => {
        void fetchTrendingTop100(topLang.id);
      }, 600);
    }
  }, 150);
}
