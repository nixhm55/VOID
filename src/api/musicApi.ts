import {
  type QualityTier,
  type SearchResult,
  cleanCanonicalTrackTitle,
  detectTrackQuality,
  formatProviderLabel,
  getTrackQualityBadge,
} from "./quality";

export type { QualityTier, SearchResult };
export { detectTrackQuality, formatProviderLabel, getTrackQualityBadge };

const JIOSAAVN_MIRRORS = [
  "https://elitejiosaavn-api.vercel.app/api",
];
const JIOSAAVN_TIMEOUT_MS = 5500;

export interface ArtistResult {
  id: string;
  name: string;
  image: string;
}

type JioArtist = {
  id?: string | number;
  name?: string;
};

type JioImage = {
  quality?: string;
  url?: string;
  link?: string;
};

type JioDownload = {
  quality?: string;
  url?: string;
  link?: string;
};

type JioSong = {
  id?: string | number;
  name?: string;
  title?: string;
  subtitle?: string;
  language?: string;
  label?: string;
  primaryArtists?: string;
  album?: {
    name?: string;
  };
  artists?: {
    primary?: JioArtist[];
  };
  image?: JioImage[];
  downloadUrl?: JioDownload[];
  duration?: number | string;
};

type JioArtistProfile = {
  id?: string | number;
  name?: string;
  image?: JioImage[];
};

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getArtist(song: JioSong): string {
  if (typeof song.primaryArtists === "string" && song.primaryArtists.trim()) {
    return decodeHtmlEntities(song.primaryArtists);
  }
  const artists = song.artists?.primary;

  if (!Array.isArray(artists)) {
    return "Unknown Artist";
  }

  const joined = artists
    .map((artist) => decodeHtmlEntities(String(artist?.name || "")))
    .filter(Boolean)
    .join(", ");

  return joined || "Unknown Artist";
}

function getAlbum(song: JioSong): string {
  return decodeHtmlEntities(String(song.album?.name || "")) || "Unknown Album";
}

function getImage(song: JioSong): string {
  if (!Array.isArray(song.image)) {
    return "";
  }

  const validImages = song.image
    .map((img) => ({ quality: img?.quality, url: img?.url || img?.link || "" }))
    .filter((img) => isValidHttpUrl(img.url));
  const highQuality = validImages.find((image) => image.quality === "500x500");

  return (
    highQuality?.url ||
    validImages[validImages.length - 1]?.url ||
    validImages[0]?.url ||
    ""
  );
}

function parseQualityKbps(qualityLabel?: string): number | undefined {
  if (!qualityLabel) return undefined;
  const match = String(qualityLabel).match(/(\d+)\s*kbps/i);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

interface ResolvedJioVariant {
  url: string;
  qualityLabel?: string;
  bitrate?: number;
  fallbackUrls: string[];
}

function selectBestDownloadVariant(song: JioSong): ResolvedJioVariant | null {
  if (!Array.isArray(song.downloadUrl)) {
    return null;
  }

  const validVariants = song.downloadUrl
    .map((item) => ({
      quality: item?.quality,
      url: String(item?.url || item?.link || "").trim(),
    }))
    .filter((item) => isValidHttpUrl(item.url))
    .map((item) => ({
      url: item.url,
      qualityLabel: item.quality ? String(item.quality).trim() : undefined,
      bitrate: parseQualityKbps(item.quality),
    }));

  if (validVariants.length === 0) {
    return null;
  }

  const sorted = [...validVariants].sort((a, b) => (b.bitrate ?? -1) - (a.bitrate ?? -1));
  const best = sorted[0];
  const fallbackUrls = sorted
    .slice(1)
    .map((v) => v.url)
    .filter((url) => url !== best.url);

  return {
    url: best.url,
    qualityLabel: best.qualityLabel,
    bitrate: best.bitrate,
    fallbackUrls,
  };
}

function getArtistImage(artist: JioArtistProfile): string {
  if (!Array.isArray(artist.image)) {
    return "";
  }

  const images = artist.image
    .map((img) => ({ quality: img?.quality, url: img?.url || img?.link || "" }))
    .filter((image) => isValidHttpUrl(image.url));

  const highQuality = images.find((image) => image.quality === "500x500");

  return (
    highQuality?.url ||
    images[images.length - 1]?.url ||
    images[0]?.url ||
    ""
  );
}

async function fetchJioMirror(
  baseUrl: string,
  cleanQuery: string,
  limit: number,
  externalSignal?: AbortSignal
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JIOSAAVN_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(
      `${baseUrl}/search/songs?query=${encodeURIComponent(cleanQuery)}&page=1&limit=${limit}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return [];
    }

    const json = await response.json();
    const songs: JioSong[] = Array.isArray(json?.data?.results)
      ? json.data.results
      : Array.isArray(json?.results)
        ? json.results
        : [];

    if (!Array.isArray(songs)) {
      return [];
    }

    const normalized: SearchResult[] = [];

    for (const song of songs) {
      const id = String(song?.id || "").trim();
      const variant = selectBestDownloadVariant(song);
      if (!id || !variant || !variant.url) continue;

      const bitrate = variant.bitrate;
      const formatHint = variant.qualityLabel || "AAC";
      const qualityBadge = detectTrackQuality(variant.url, formatHint, bitrate, {
        codecHint: "AAC",
        mimeTypeHint: "audio/mp4",
        providerVerified: Boolean(bitrate),
      });

      const rawSongName = decodeHtmlEntities(String(song.name || song.title || "Unknown Song"));
      normalized.push({
        id,
        name: cleanCanonicalTrackTitle(rawSongName) || rawSongName,
        album: cleanCanonicalTrackTitle(getAlbum(song)) || getAlbum(song),
        artist: getArtist(song),
        image: getImage(song),
        downloadUrl: variant.url,
        duration: Number(song.duration) || 0,
        source: "JioSaavn",
        qualityBadge,
        bitrate,
        codec: "AAC",
        mimeType: "audio/mp4",
        format: variant.qualityLabel ? `MP4 (${variant.qualityLabel})` : "MP4/AAC",
        qualityVerified: Boolean(bitrate),
        fallbackUrls: variant.fallbackUrls,
        language: typeof song.language === "string" ? song.language.toLowerCase().trim() : undefined,
        label: typeof song.label === "string" ? decodeHtmlEntities(song.label) : undefined,
      });
    }

    return normalized;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Provider A: JioSaavn Search with automatic multi-mirror failover
 */
export async function searchJioSaavn(
  query: string,
  externalSignal?: AbortSignal,
  limit = 20
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  for (const mirror of JIOSAAVN_MIRRORS) {
    if (externalSignal?.aborted) return [];
    const results = await fetchJioMirror(mirror, cleanQuery, limit, externalSignal);
    if (results.length > 0) {
      return results;
    }
  }

  return [];
}

/**
 * Preserved export for backward compatibility with existing callers.
 */
export async function searchMusic(
  query: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  return searchJioSaavn(query, signal);
}

export async function fetchArtist(
  artistName: string
): Promise<ArtistResult | null> {
  const cleanName = artistName.trim();

  if (!cleanName || cleanName === "Unknown Artist") {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${JIOSAAVN_MIRRORS[0]}/artists/by-name?query=${encodeURIComponent(cleanName)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return null;
    }

    const json = await response.json();

    const artist: JioArtistProfile =
      json?.data?.artist || json?.data || json?.result || null;

    if (!artist || !artist.name) {
      return null;
    }

    const image = getArtistImage(artist);

    if (!image) {
      return null;
    }

    return {
      id: String(artist.id || ""),
      name: artist.name,
      image,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRecommendationsByMood(mood: string): Promise<SearchResult[]> {
  const queries = {
    romance: ["romantic songs", "love songs malayalam", "ar rahman romantic", "love hits hindi"],
    peace: ["peaceful instrumental", "lofi chill", "calm acoustic", "meditation music relaxing"],
    energy: ["workout hits", "high energy dance", "gym motivation songs", "party anthems"],
    focus: ["lofi hip hop study", "deep focus ambient", "instrumental study", "coding music"],
  };

  const moodKey = mood.toLowerCase() as keyof typeof queries;
  const moodQueries = queries[moodKey] || queries.peace;
  const randomQuery = moodQueries[Math.floor(Math.random() * moodQueries.length)];

  const results = await searchJioSaavn(randomQuery);
  return results.sort(() => 0.5 - Math.random()).slice(0, 10);
}
