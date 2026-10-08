const BACKEND_URL = "http://localhost:4000";

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
  if (!query) return [];

  try {
    const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Network response was not ok");
    
    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error("YouTube backend search error:", error);
    return [];
  }
}
