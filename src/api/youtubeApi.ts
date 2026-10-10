const BACKEND_URL = (import.meta.env.VITE_YOUTUBE_API_URL || '').replace(/\/$/, '');

export interface YouTubeSearchResult {
  id: string;
  name: string;
  album: string;
  artist: string;
  image: string;
  downloadUrl: string;
  duration: number;
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // A Vite-hosted frontend cannot reach the developer's localhost backend after deployment.
  // Configure VITE_YOUTUBE_API_URL to the publicly deployed backend URL in Vercel.
  if (!BACKEND_URL) {
    console.error('YouTube video search is not configured. Set VITE_YOUTUBE_API_URL to your deployed YouTube backend URL.');
    return [];
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      `${BACKEND_URL}/search?q=${encodeURIComponent(cleanQuery)}`,
      { signal: controller.signal }
    );
    if (!response.ok) throw new Error(`YouTube backend returned HTTP ${response.status}`);

    const payload: unknown = await response.json();
    const rows = Array.isArray(payload)
      ? payload
      : (payload && typeof payload === 'object' && Array.isArray((payload as any).results))
        ? (payload as any).results
        : [];

    return rows
      .map((row: any) => {
        const id = String(row?.id || row?.videoId || row?.video_id || '');
        return {
          id,
          name: String(row?.name || row?.title || cleanQuery),
          album: String(row?.album || ''),
          artist: String(row?.artist || ''),
          image: String(row?.image || row?.thumbnail || ''),
          downloadUrl: String(row?.downloadUrl || ''),
          duration: Number(row?.duration) || 0,
        } satisfies YouTubeSearchResult;
      })
      .filter((row: YouTubeSearchResult) => /^[\w-]{11}$/.test(row.id));
  } catch (error) {
    console.error('YouTube backend search error:', error);
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}
