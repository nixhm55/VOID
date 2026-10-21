/**
 * Provider F: YouTube Search, Exact Video Playback & Offline Download Resolution
 *
 * Ensures that playing or downloading a YouTube track ALWAYS uses the exact YouTube
 * video (`videoId`) selected by the user — never substituting audio from another song
 * or another catalog.
 */

import { type QualityTier, type SearchResult, detectTrackQuality } from "./quality";

export const SEARCH_BACKEND_URL = "https://void-backend-beta.vercel.app";
export const STREAM_BACKEND_URL = "https://void-backend-n0jb.onrender.com";

const PRIMARY_SEARCH_TIMEOUT_MS = 6000;
const FALLBACK_SEARCH_TIMEOUT_MS = 6500;
const LOCALHOST_SEARCH_TIMEOUT_MS = 1500;

export type YouTubeSearchResult = SearchResult;

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

function normalizeBaseUrl(url: string): string | null {
  const trimmed = String(url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

const SYNTHETIC_CATALOG_ID_REGEX =
  /^(?:ar|arabic|english|malayalam|tamil|hindi|urdu|telugu|kannada|punjabi|spanish|french|bengali|artist|seed|mounir|jio|saavn|lossless|ia|jamendo|radio)[-_:]|-\d+-\d+$/i;

function isStrict11CharYouTubeId(str: string): boolean {
  if (!str || SYNTHETIC_CATALOG_ID_REGEX.test(str)) return false;
  return /^[\w-]{11}$/.test(str);
}

export function extractCleanYouTubeId(raw: unknown): string {
  const rawStr = String(raw ?? "").trim();
  if (!rawStr) return "";

  // First check if it's a URL or explicit yt-stream:// / yt-audio?id= URI
  const urlMatch = rawStr.match(/(?:v=|youtu\.be\/|yt-stream:\/\/|yt-audio\?id=)([\w-]{11})/);
  if (urlMatch && !SYNTHETIC_CATALOG_ID_REGEX.test(urlMatch[1])) {
    return urlMatch[1];
  }

  return rawStr
    .replace(/^download:/i, "")
    .replace(/^api-(?:youtube-|yt-|jiosaavn-|jamendo-|online-)?/i, "")
    .replace(/^yt:/i, "")
    .trim();
}

export function extractYouTubeIdFromTrack(track: any): string {
  if (!track) return "";
  const audioUrl = String(track.audioUrl || track.downloadUrl || track.src || "").trim();

  // If the track already has a direct non-YouTube HTTP stream (such as JioSaavn saavncdn.com),
  // it is NOT a YouTube track unless its stream URL explicitly points to yt-stream / yt-audio.
  if (
    /^https?:\/\//i.test(audioUrl) &&
    !/youtube\.com|youtu\.be|yt-audio|yt-stream/i.test(audioUrl) &&
    String(track.source || "").toLowerCase() === "jiosaavn"
  ) {
    return "";
  }

  const candidates = [track.audioUrl, track.downloadUrl, track.src, track.id];
  for (const candidate of candidates) {
    const rawStr = String(candidate ?? "").trim();
    if (!rawStr) continue;
    const urlMatch = rawStr.match(/(?:v=|youtu\.be\/|yt-stream:\/\/|yt-audio\?id=)([\w-]{11})/);
    if (urlMatch && isStrict11CharYouTubeId(urlMatch[1])) {
      return urlMatch[1];
    }
    if (/^https?:\/\//i.test(rawStr) || rawStr.startsWith("trending-resolve://")) {
      continue;
    }
    const cleaned = extractCleanYouTubeId(rawStr);
    if (isStrict11CharYouTubeId(cleaned)) return cleaned;
  }
  return "";
}

export function getYouTubeSearchBackends(): { url: string; timeoutMs: number }[] {
  const list: { url: string; timeoutMs: number }[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string | undefined, timeoutMs: number) => {
    const normalized = normalizeBaseUrl(rawUrl || "");
    if (!normalized || seen.has(normalized)) return;
    if (
      isLocalhostUrl(normalized) &&
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      return;
    }
    seen.add(normalized);
    list.push({ url: normalized, timeoutMs });
  };

  const envPrimary = (import.meta as any).env?.VITE_YOUTUBE_BACKEND_URL as string | undefined;
  const envFallbacks = (import.meta as any).env?.VITE_YOUTUBE_FALLBACK_URLS as string | undefined;

  if (envPrimary && !isLocalhostUrl(envPrimary)) {
    add(envPrimary, PRIMARY_SEARCH_TIMEOUT_MS);
  }

  add(SEARCH_BACKEND_URL, PRIMARY_SEARCH_TIMEOUT_MS);
  add(STREAM_BACKEND_URL, FALLBACK_SEARCH_TIMEOUT_MS);

  if (envFallbacks) {
    for (const part of envFallbacks.split(/[\s,;]+/)) {
      add(part, FALLBACK_SEARCH_TIMEOUT_MS);
    }
  }

  if (
    envPrimary &&
    isLocalhostUrl(envPrimary) &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    add(envPrimary, LOCALHOST_SEARCH_TIMEOUT_MS);
  }

  return list;
}

export function warmUpYouTubeBackend(): void {
  // Intentionally silent to keep browser console completely clean.
}

export interface ResolvedYouTubeStream {
  url: string;
  fallbackUrls?: string[];
  bitrate?: number;
  codec?: string;
  mimeType?: string;
  qualityBadge?: QualityTier;
  qualityVerified?: boolean;
  duration?: number;
}

const resolvedStreamCache = new Map<string, ResolvedYouTubeStream>();

function parseYouTubeDuration(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 10000 ? Math.round(raw / 1000) : Math.round(raw);
  }
  if (raw && typeof raw === "object") {
    const sec = Number((raw as any).seconds ?? (raw as any).lengthSeconds ?? (raw as any).duration);
    if (Number.isFinite(sec) && sec > 0) return Math.round(sec);
    raw = (raw as any).timestamp ?? (raw as any).text ?? (raw as any).label;
  }
  if (typeof raw === "string") {
    const clean = raw.trim();
    if (/^\d+(\.\d+)?$/.test(clean)) return Math.round(Number(clean));
    const parts = clean.split(":").map((p) => Number(p.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  return 0;
}

/**
 * Queries the local Vite Node.js gateway (`/__void_api/yt-info?id=<videoId>`) for the exact
 * YouTube video's direct audio stream. Never substitutes a different video or song.
 */
async function tryLocalViteYouTubeGateway(
  videoId: string,
  titleHint?: string,
  artistHint?: string
): Promise<ResolvedYouTubeStream | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7500);
  try {
    const params = new URLSearchParams({ id: videoId });
    if (titleHint) params.set("title", titleHint);
    if (artistHint) params.set("artist", artistHint);
    const res = await fetch(`/__void_api/yt-info?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    const data: any = await res.json();
    if (!data?.ok || typeof data?.streamUrl !== "string") return null;

    const bitrate = Number(data.bitrate) || 320;
    const codec = String(data.codec || "AAC");
    const mimeType = String(data.mimeType || "audio/mp4");
    const duration = Number(data.duration) || undefined;
    const qualityBadge =
      bitrate >= 280
        ? "Very High (320kbps)"
        : detectTrackQuality(data.streamUrl, codec, bitrate, {
            codecHint: codec,
            mimeTypeHint: mimeType,
            providerVerified: true,
            sourceHint: "YouTube",
          });

    return {
      url: data.streamUrl,
      bitrate,
      codec,
      mimeType,
      qualityBadge,
      qualityVerified: true,
      duration,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves only the exact YouTube video's direct stream candidates (never another song).
 */
export async function resolveYouTubeDownloadCandidates(track: {
  id?: string;
  title?: string;
  name?: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  downloadUrl?: string;
}): Promise<string[]> {
  const urls: string[] = [];
  const rawId = extractYouTubeIdFromTrack(track);
  if (/^[\w-]{11}$/.test(rawId)) {
    const localInfo = await tryLocalViteYouTubeGateway(
      rawId,
      String(track.title || track.name || "").trim(),
      String(track.artist || "").trim()
    );
    if (localInfo?.url) {
      urls.push(localInfo.url);
    }
  }
  return urls;
}

/**
 * Resolves the direct audio stream URL for a YouTube track (`videoId`) when available
 * via the local Vite gateway, without ever substituting a different song.
 */
export async function resolveYouTubePlayableStream(track: {
  id?: string;
  title?: string;
  name?: string;
  artist?: string;
  duration?: number;
  audioUrl?: string;
  downloadUrl?: string;
}): Promise<ResolvedYouTubeStream | null> {
  const rawId = extractYouTubeIdFromTrack(track);

  if (rawId && resolvedStreamCache.has(rawId)) {
    return resolvedStreamCache.get(rawId)!;
  }

  if (/^[\w-]{11}$/.test(rawId)) {
    const exactYt = await tryLocalViteYouTubeGateway(
      rawId,
      String(track.title || track.name || "").trim(),
      String(track.artist || "").trim()
    );
    if (exactYt) {
      resolvedStreamCache.set(rawId, exactYt);
      return exactYt;
    }
  }

  return null;
}

function normalizeYouTubeRows(rows: any[], cleanQuery: string): SearchResult[] {
  const results: SearchResult[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    let id = String(row.id || row.videoId || row.video_id || "").trim();
    if (!id && typeof row.url === "string") {
      const match = row.url.match(/[?&]v=([\w-]{11})/);
      if (match) id = match[1];
    }
    if (!/^[\w-]{11}$/.test(id)) continue;

    let rawDownloadUrl = String(row.downloadUrl || "").trim();
    if (rawDownloadUrl) {
      try {
        const urlObj = new URL(rawDownloadUrl);
        rawDownloadUrl = `${STREAM_BACKEND_URL}${urlObj.pathname}${urlObj.search}`;
      } catch {
        // Keep rawDownloadUrl if not a full URL
      }
    }
    const primaryUrl = rawDownloadUrl || `yt-stream://${id}`;

    const rawBitrate = Number(row.bitrate ?? row.audioBitrate);
    const bitrate =
      Number.isFinite(rawBitrate) && rawBitrate > 0
        ? rawBitrate > 4000
          ? Math.round(rawBitrate / 1000)
          : Math.round(rawBitrate)
        : 160;

    const codec =
      typeof row.codec === "string" && row.codec.trim()
        ? row.codec.trim()
        : typeof row.audioCodec === "string" && row.audioCodec.trim()
          ? row.audioCodec.trim()
          : "Opus";

    const mimeType =
      typeof row.mimeType === "string" && row.mimeType.trim()
        ? row.mimeType.trim()
        : "audio/webm";

    const qualityBadge = detectTrackQuality(`yt-stream://${id}`, codec || mimeType, bitrate, {
      codecHint: codec,
      mimeTypeHint: mimeType,
      providerVerified: true,
      sourceHint: "YouTube",
    });

    const artist = String(row.artist || row.uploaderName || row.author || "YouTube").trim();

    const rawImg = String(row.image || row.thumbnail || "").trim();
    const image =
      rawImg && !rawImg.includes("hq720.jpg")
        ? rawImg
        : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const parsedDuration = parseYouTubeDuration(
      row.duration ?? row.lengthSeconds ?? row.durationFormatted ?? row.timestamp
    );

    results.push({
      id,
      name: String(row.name || row.title || cleanQuery).trim(),
      album: String(row.album || "YouTube").trim() || "YouTube",
      artist: artist || "YouTube",
      image,
      downloadUrl: primaryUrl,
      duration: parsedDuration,
      source: "YouTube",
      qualityBadge,
      bitrate,
      codec,
      mimeType,
      format: `YouTube (${codec} ${bitrate}kbps)`,
      qualityVerified: true,
    });
  }

  return results;
}

async function fetchYouTubeFromBackend(
  baseUrl: string,
  cleanQuery: string,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(
      `${baseUrl}/search?q=${encodeURIComponent(cleanQuery)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return [];
    }

    const payload: unknown = await response.json();
    const rows = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as any).results)
        ? (payload as any).results
        : payload && typeof payload === "object" && Array.isArray((payload as any).items)
          ? (payload as any).items
          : [];

    return normalizeYouTubeRows(rows, cleanQuery);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

export async function searchYouTube(
  query: string,
  externalSignal?: AbortSignal
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    try {
      const localController = new AbortController();
      const localTimer = setTimeout(() => localController.abort(), 3200);
      const onAbort = () => localController.abort();
      externalSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        const res = await fetch(`/__void_api/yt-search?q=${encodeURIComponent(cleanQuery)}`, {
          signal: localController.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const normalized = normalizeYouTubeRows(Array.isArray(data) ? data : [], cleanQuery);
          if (normalized.length > 0) return normalized;
        }
      } finally {
        clearTimeout(localTimer);
        externalSignal?.removeEventListener("abort", onAbort);
      }
    } catch {
      // Fall through to remote backends
    }
  }

  const backends = getYouTubeSearchBackends();
  for (const backend of backends) {
    if (externalSignal?.aborted) return [];
    const results = await fetchYouTubeFromBackend(
      backend.url,
      cleanQuery,
      backend.timeoutMs,
      externalSignal
    );
    if (results.length > 0) {
      return results;
    }
  }

  return [];
}
