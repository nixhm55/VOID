export const SEARCH_BACKEND_URL = 'https://void-backend-beta.vercel.app';
export const STREAM_BACKEND_URL = 'https://void-backend-n0jb.onrender.com';

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

  if (!SEARCH_BACKEND_URL) {
    console.error('YouTube video search is not configured. Set SEARCH_BACKEND_URL to your deployed YouTube backend URL.');
    return [];
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  
  try {
    const response = await fetch(
      `${SEARCH_BACKEND_URL}/search?q=${encodeURIComponent(cleanQuery)}`,
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
        let rawDownloadUrl = String(row?.downloadUrl || '');
        
        if (rawDownloadUrl) {
          try {
            const urlObj = new URL(rawDownloadUrl);
            rawDownloadUrl = `${STREAM_BACKEND_URL}${urlObj.pathname}${urlObj.search}`;
          } catch (e) {
            // Fallback if parsing fails
          }
        }

        return {
          id,
          name: String(row?.name || row?.title || cleanQuery),
          album: String(row?.album || ''),
          artist: String(row?.artist || ''),
          image: String(row?.image || row?.thumbnail || ''),
          downloadUrl: rawDownloadUrl,
          duration: Number(row?.duration) || 0,
        } satisfies YouTubeSearchResult;
      })
      .filter((row: YouTubeSearchResult) => /^[\w-]{11}$/.test(row.id));
      
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('YouTube search request was cancelled or timed out.');
      return [];
    }
    console.error('YouTube backend search error:', error);
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}
