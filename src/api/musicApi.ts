const API_BASE_URL = "https://elitejiosaavn-api.vercel.app/api";

export interface SearchResult {
  id: string;
  name: string;
  album: string;
  artist: string;
  image: string;
  downloadUrl: string;
  duration: number;
}

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
};

type JioDownload = {
  quality?: string;
  url?: string;
};

type JioSong = {
  id?: string | number;
  name?: string;
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

function getArtist(song: JioSong): string {
  const artists = song.artists?.primary;

  if (!Array.isArray(artists)) {
    return "Unknown Artist";
  }

  return (
    artists
      .map((artist) => artist?.name)
      .filter(Boolean)
      .join(", ") || "Unknown Artist"
  );
}

function getAlbum(song: JioSong): string {
  return song.album?.name || "Unknown Album";
}

function getImage(song: JioSong): string {
  if (!Array.isArray(song.image)) {
    return "";
  }

  const highQuality = song.image.find(
    (image) => image?.quality === "500x500"
  );

  return (
    highQuality?.url ||
    song.image[song.image.length - 1]?.url ||
    song.image[0]?.url ||
    ""
  );
}

function getDownloadUrl(song: JioSong): string {
  if (!Array.isArray(song.downloadUrl)) {
    return "";
  }

  const highQuality = song.downloadUrl.find(
    (item) => item?.quality === "320kbps"
  );

  if (highQuality?.url) {
    return highQuality.url;
  }

  return (
    song.downloadUrl[song.downloadUrl.length - 1]?.url ||
    song.downloadUrl[0]?.url ||
    ""
  );
}

function getArtistImage(artist: JioArtistProfile): string {
  if (!Array.isArray(artist.image)) {
    return "";
  }

  const images = artist.image.filter(
    (image) => Boolean(image?.url)
  );

  const highQuality = images.find(
    (image) => image?.quality === "500x500"
  );

  return (
    highQuality?.url ||
    images[images.length - 1]?.url ||
    images[0]?.url ||
    ""
  );
}

export async function searchMusic(
  query: string
): Promise<SearchResult[]> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return [];
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/search/songs?query=${encodeURIComponent(
        cleanQuery
      )}&page=1&limit=20`
    );

    if (!response.ok) {
      throw new Error(
        `JioSaavn search failed: ${response.status}`
      );
    }

    const json = await response.json();

    const songs: JioSong[] =
      json?.data?.results || [];

    if (!Array.isArray(songs)) {
      return [];
    }

    return songs
      .map((song): SearchResult => ({
        id: String(song.id || ""),
        name: song.name || "Unknown Song",
        album: getAlbum(song),
        artist: getArtist(song),
        image: getImage(song),
        downloadUrl: getDownloadUrl(song),
        duration: Number(song.duration) || 0,
      }))
      .filter(
        (song) =>
          Boolean(song.id) &&
          Boolean(song.downloadUrl)
      );
  } catch (error) {
    console.error(
      "JioSaavn search error:",
      error
    );

    return [];
  }
}

export async function fetchArtist(
  artistName: string
): Promise<ArtistResult | null> {
  const cleanName = artistName.trim();

  if (!cleanName || cleanName === "Unknown Artist") {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/artists/by-name?query=${encodeURIComponent(
        cleanName
      )}`
    );

    if (!response.ok) {
      throw new Error(
        `JioSaavn artist lookup failed: ${response.status}`
      );
    }

    const json = await response.json();

    const artist: JioArtistProfile =
      json?.data?.artist ||
      json?.data ||
      json?.result ||
      null;

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
  } catch (error) {
    console.error(
      "JioSaavn artist lookup error:",
      error
    );

    return null;
  }
}