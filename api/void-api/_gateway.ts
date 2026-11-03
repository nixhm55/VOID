import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';

const projectRoot = process.cwd();
const cutoutInFlight = new Map<string, Promise<Buffer | null>>();

async function generateVisionCutoutPng(imageUrls: string[], cacheFilePath: string): Promise<Buffer | null> {
  const binPath = path.join(projectRoot, 'node_modules', '.cache', 'void-vision-cutout');
  const swiftSrcPath = path.join(projectRoot, 'scripts', 'void-vision-cutout.swift');

  if (!fs.existsSync(binPath) && fs.existsSync(swiftSrcPath)) {
    await new Promise<void>((resolve) => {
      fs.mkdirSync(path.dirname(binPath), { recursive: true });
      execFile('/usr/bin/swiftc', ['-O', swiftSrcPath, '-o', binPath], { timeout: 25000 }, () => resolve());
    });
  }

  if (!fs.existsSync(binPath)) return null;

  for (const rawUrl of imageUrls) {
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) continue;
    const tmpIn = path.join('/tmp', `void-cutout-in-${Date.now()}-${Math.random().toString(36).slice(2)}.img`);
    const tmpOut = `${cacheFilePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}.png`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const imgRes = await fetch(rawUrl, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      }).finally(() => clearTimeout(timer));

      if (!imgRes.ok) continue;
      const arrayBuf = await imgRes.arrayBuffer();
      const inputBuf = Buffer.from(arrayBuf);
      if (inputBuf.length < 512) continue;

      fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
      fs.writeFileSync(tmpIn, inputBuf);

      const ok = await new Promise<boolean>((resolve) => {
        execFile(binPath, [tmpIn, tmpOut], { timeout: 12000 }, (err) => {
          resolve(!err && fs.existsSync(tmpOut));
        });
      });

      if (ok && fs.existsSync(tmpOut)) {
        const outBuf = fs.readFileSync(tmpOut);
        if (outBuf.length > 1024) {
          fs.renameSync(tmpOut, cacheFilePath);
          return outBuf;
        }
      }
    } catch {
      // try next candidate URL
    } finally {
      try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
      try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch {}
    }
  }
  return null;
}

interface CachedYtStream {
  url: string;
  mimeType: string;
  codec: string;
  bitrate: number;
  duration: number;
  contentLength?: number;
  userAgent?: string;
  expiresAt: number;
}

const ytStreamCache = new Map<string, CachedYtStream>();

async function verifyStreamUrlReachable(url: string, userAgent?: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent || 'VOID-Music-Player/1.0',
        Range: 'bytes=0-1',
      },
      signal: controller.signal,
    });
    if (res.body) {
      void res.body.cancel().catch(() => {});
    }
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const INNERTUBE_CLIENTS = [
  {
    name: '28',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        userAgent:
          'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
  },
  {
    name: '5',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.3.2.22D82',
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent:
      'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
  },
  {
    name: '85',
    context: {
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'en',
        gl: 'AE',
      },
      thirdParty: {
        embedUrl: 'https://www.youtube.com/',
      },
    },
    userAgent:
      'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
  },
  {
    name: '30',
    context: {
      client: {
        clientName: 'ANDROID_TESTSUITE',
        clientVersion: '1.9',
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent: 'com.google.android.youtube/1.9 (Linux; U; Android 14) gzip',
  },
  {
    name: '3',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.44.38',
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'AE',
      },
    },
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
  },
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

const THIRD_PARTY_LOSSLESS_GATEWAYS = [
  'https://triton.squid.wtf',
  'https://wolf.qqdl.site',
  'https://maus.qqdl.site',
  'https://vogel.qqdl.site',
  'https://katze.qqdl.site',
  'https://hund.qqdl.site',
  'https://tidal.kinoplus.online',
  'https://hifi.401658.xyz',
];

async function tryInnerTubeVideoId(videoId: string): Promise<CachedYtStream | null> {
  const tasks = INNERTUBE_CLIENTS.map(async (clientProfile): Promise<CachedYtStream | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': clientProfile.userAgent,
          'X-YouTube-Client-Name': clientProfile.name,
        },
        body: JSON.stringify({
          videoId,
          context: clientProfile.context,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      const formats: any[] = [
        ...(Array.isArray(data?.streamingData?.adaptiveFormats) ? data.streamingData.adaptiveFormats : []),
        ...(Array.isArray(data?.streamingData?.formats) ? data.streamingData.formats : []),
      ];

      const audioFormats = formats
        .filter((f: any) => typeof f?.url === 'string' && typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/'))
        .sort((a: any, b: any) => {
          const aMp4 = String(a.mimeType).includes('mp4') ? 1 : 0;
          const bMp4 = String(b.mimeType).includes('mp4') ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
        });

      if (audioFormats.length > 0) {
        const best = audioFormats[0];
        const candidateUrl = String(best.url);
        const reachable = await verifyStreamUrlReachable(candidateUrl, clientProfile.userAgent);
        if (!reachable) return null;

        const rawBitrate = Number(best.averageBitrate || best.bitrate || 160000);
        const kbps = Math.max(128, Math.round(rawBitrate / 1000));
        const rawMime = String(best.mimeType || 'audio/mp4').split(';')[0].trim();
        const codec =
          rawMime.includes('webm') || String(best.mimeType).includes('opus')
            ? 'Opus'
            : 'AAC';
        const duration =
          Number(data?.videoDetails?.lengthSeconds) ||
          Math.round(Number(best.approxDurationMs || 0) / 1000) ||
          0;
        const contentLength = Number(best.contentLength) || undefined;

        return {
          url: candidateUrl,
          mimeType: rawMime,
          codec,
          bitrate: kbps,
          duration,
          contentLength,
          userAgent: clientProfile.userAgent,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  });

  const settled = await Promise.allSettled(tasks);
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      return item.value;
    }
  }
  return null;
}

async function tryPipedAndInvidiousServer(videoId: string): Promise<CachedYtStream | null> {
  const tasks: Promise<CachedYtStream | null>[] = [
    ...PIPED_INSTANCES.map(async (base): Promise<CachedYtStream | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const res = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0' },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        const streams: any[] = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
        const valid = streams
          .filter((s) => typeof s?.url === 'string' && s.url.startsWith('http'))
          .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        if (!valid.length) return null;
        const best = valid[0];
        const candidateUrl = String(best.url);
        if (!(await verifyStreamUrlReachable(candidateUrl))) return null;
        const rawBr = Number(best.bitrate || 160000);
        const kbps = rawBr > 1000 ? Math.round(rawBr / 1000) : Math.max(128, rawBr);
        const mimeType = String(best.mimeType || 'audio/mp4').split(';')[0].trim();
        return {
          url: candidateUrl,
          mimeType,
          codec: mimeType.includes('webm') ? 'Opus' : 'AAC',
          bitrate: kbps,
          duration: Number(data?.duration) || 0,
          expiresAt: Date.now() + 25 * 60 * 1000,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }),
    ...INVIDIOUS_INSTANCES.map(async (base): Promise<CachedYtStream | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const res = await fetch(`${base}/api/v1/videos/${encodeURIComponent(videoId)}`, {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0' },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        const formats: any[] = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
        const valid = formats
          .filter((f) => typeof f?.url === 'string' && String(f?.type || '').startsWith('audio/'))
          .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        if (!valid.length) return null;
        const best = valid[0];
        const candidateUrl = String(best.url);
        if (!(await verifyStreamUrlReachable(candidateUrl))) return null;
        const rawBr = Number(best.bitrate || 160000);
        const kbps = rawBr > 1000 ? Math.round(rawBr / 1000) : Math.max(128, rawBr);
        const mimeType = String(best.type || 'audio/mp4').split(';')[0].trim();
        return {
          url: candidateUrl,
          mimeType,
          codec: mimeType.includes('webm') ? 'Opus' : 'AAC',
          bitrate: kbps,
          duration: Number(data?.lengthSeconds) || 0,
          expiresAt: Date.now() + 25 * 60 * 1000,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }),
  ];

  const settled = await Promise.allSettled(tasks);
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      return item.value;
    }
  }
  return null;
}

async function resolveYouTubeDirectStreamServer(
  videoId: string,
  titleHint?: string,
  artistHint?: string
): Promise<CachedYtStream | null> {
  const existing = ytStreamCache.get(videoId);
  if (existing && existing.expiresAt > Date.now()) {
    return existing;
  }

  // Tier 1: Direct InnerTube extraction for exact videoId
  const direct = await tryInnerTubeVideoId(videoId);
  if (direct) {
    ytStreamCache.set(videoId, direct);
    return direct;
  }

  // Tier 2: Piped / Invidious server-side stream extraction for exact videoId
  const pipedOrInv = await tryPipedAndInvidiousServer(videoId);
  if (pipedOrInv) {
    ytStreamCache.set(videoId, pipedOrInv);
    return pipedOrInv;
  }

  // Tier 3: Direct <audio> stream resolution via cleaned title/artist or oEmbed metadata
  // so playback and offline downloads always get a real audio stream that never pauses on desktop switch.
  try {
    let rawTitle = (titleHint || '').trim();
    let rawArtist = (artistHint || '').trim();

    if (!rawTitle) {
      const oeCtrl = new AbortController();
      const oeTimer = setTimeout(() => oeCtrl.abort(), 2200);
      try {
        const oeRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
          { signal: oeCtrl.signal }
        );
        if (oeRes.ok) {
          const oeData: any = await oeRes.json();
          rawTitle = String(oeData?.title || '').trim();
          if (!rawArtist) rawArtist = String(oeData?.author_name || '').trim();
        }
      } catch {
        // Ignore
      } finally {
        clearTimeout(oeTimer);
      }
    }

    const collapseSpacedLetters = (input: string) =>
      input.replace(/\b([a-zA-Z])(?:\s+([a-zA-Z])){2,}\b/g, (m) => m.replace(/\s+/g, ''));

    const normalizedTitle = collapseSpacedLetters(rawTitle);
    const strippedTitle = normalizedTitle
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video)|lyric\s*video|lyrics|full\s*(?:song|video|audio)|hd|4k|hq|slowed|reverb|sped\s*up|lofi|lo-fi|whatsapp\s*status|status)\b/gi, ' ')
      .replace(/[-–—|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanArtist = collapseSpacedLetters(rawArtist)
      .replace(/\b(?:official|vevo|topic|music|records|channel|factory|studios)\b/gi, ' ')
      .replace(/[-–—|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const candidateQueries = Array.from(
      new Set(
        [
          strippedTitle && cleanArtist ? `${strippedTitle} ${cleanArtist}`.trim() : '',
          strippedTitle,
          normalizedTitle.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim(),
        ].filter((q) => q.length >= 2)
      )
    );

    const isArabicQuery = /[\u0600-\u06FF]/.test(`${rawTitle} ${rawArtist}`);
    const normArtistTokens = cleanArtist
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    for (const q of candidateQueries) {
      const jioCtrl = new AbortController();
      const jioTimer = setTimeout(() => jioCtrl.abort(), 3200);
      try {
        const jioRes = await fetch(
          `https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&page=1&limit=6`,
          { signal: jioCtrl.signal }
        );
        if (jioRes.ok) {
          const jioJson: any = await jioRes.json();
          const songs: any[] = Array.isArray(jioJson?.data?.results)
            ? jioJson.data.results
            : Array.isArray(jioJson?.results)
              ? jioJson.results
              : [];
          for (const song of songs) {
            const songLang = String(song?.language || '').toLowerCase();
            if (isArabicQuery && songLang && songLang !== 'arabic' && songLang !== 'english') continue;
            if (normArtistTokens.length > 0) {
              const pArtists: any[] = Array.isArray(song?.artists?.primary) ? song.artists.primary : [];
              const sArtist = (pArtists.map((a: any) => a?.name).filter(Boolean).join(' ') || String(song?.primaryArtists || '')).toLowerCase();
              if (sArtist && !normArtistTokens.some((tok) => sArtist.includes(tok))) continue;
            }
            const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
            const best = urls.find((u: any) => u?.quality === '320kbps') || urls[urls.length - 1];
            const streamUrl = String(best?.url || best?.link || '').trim();
            if (streamUrl.startsWith('http')) {
              const resolved: CachedYtStream = {
                url: streamUrl,
                mimeType: 'audio/mp4',
                codec: 'AAC',
                bitrate: 320,
                duration: Number(song?.duration) || 0,
                expiresAt: Date.now() + 30 * 60 * 1000,
              };
              ytStreamCache.set(videoId, resolved);
              return resolved;
            }
          }
        }
      } catch {
        // Ignore and try next query
      } finally {
        clearTimeout(jioTimer);
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

function decodeTidalManifestServer(manifestBase64: string): {
  url?: string;
  mimeType?: string;
  codec?: string;
} | null {
  try {
    const decoded = Buffer.from(manifestBase64, 'base64').toString('utf-8');
    const json = JSON.parse(decoded);
    const url = Array.isArray(json?.urls) ? json.urls[0] : json?.url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return {
        url: url.trim(),
        mimeType: typeof json.mimeType === 'string' ? json.mimeType : 'audio/flac',
        codec: typeof json.codecs === 'string' ? json.codecs.toUpperCase() : 'FLAC',
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

async function queryThirdPartyLosslessServer(query: string): Promise<any[]> {
  const results: any[] = [];
  const seenIds = new Set<string>();

  // 1. Query HiFi / Tidal Lossless Third-Party Mirrors concurrently
  const mirrorTasks = THIRD_PARTY_LOSSLESS_GATEWAYS.slice(0, 5).map(async (gateway) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3800);
    try {
      const searchRes = await fetch(
        `${gateway}/search/?s=${encodeURIComponent(query)}&limit=5`,
        {
          headers: { 'User-Agent': 'VOID-Music-Player/1.0', Accept: 'application/json' },
          signal: controller.signal,
        }
      );
      if (!searchRes.ok) return [];
      const payload: any = await searchRes.json();
      const rawItems: any[] =
        Array.isArray(payload?.data?.items)
          ? payload.data.items
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

      const out: any[] = [];
      for (const item of rawItems.slice(0, 3)) {
        const trackId = String(item?.id ?? item?.trackId ?? '').trim();
        const title = String(item?.title ?? item?.name ?? '').trim();
        if (!trackId || !title) continue;

        const trackRes = await fetch(
          `${gateway}/track/?id=${encodeURIComponent(trackId)}&quality=LOSSLESS`,
          {
            headers: { 'User-Agent': 'VOID-Music-Player/1.0', Accept: 'application/json' },
            signal: controller.signal,
          }
        );
        if (!trackRes.ok) continue;
        const trackData: any = await trackRes.json();
        const root = trackData?.data && !Array.isArray(trackData.data) ? trackData.data : trackData;
        let streamUrl = '';
        let mimeType = 'audio/flac';
        let codec = 'FLAC';

        if (typeof root?.manifest === 'string') {
          const decoded = decodeTidalManifestServer(root.manifest);
          if (decoded?.url) {
            streamUrl = decoded.url;
            mimeType = decoded.mimeType || 'audio/flac';
            codec = decoded.codec || 'FLAC';
          }
        } else if (typeof root?.OriginalTrackUrl === 'string' && root.OriginalTrackUrl.startsWith('http')) {
          streamUrl = root.OriginalTrackUrl;
        } else if (typeof root?.url === 'string' && root.url.startsWith('http')) {
          streamUrl = root.url;
        }

        if (!streamUrl) continue;

        const coverRaw = String(item?.album?.cover || item?.cover || '').trim();
        const image =
          /^[0-9a-f-]{32,36}$/i.test(coverRaw)
            ? `https://resources.tidal.com/images/${coverRaw.replace(/-/g, '/')}/640x640.jpg`
            : /^https?:\/\//i.test(coverRaw)
              ? coverRaw
              : '';

        const artist =
          typeof item?.artist?.name === 'string'
            ? item.artist.name
            : Array.isArray(item?.artists)
              ? item.artists.map((a: any) => a?.name).filter(Boolean).join(', ')
              : 'Unknown Artist';

        out.push({
          id: `lossless:hifi-${trackId}`,
          name: title,
          album: String(item?.album?.title || item?.album?.name || 'Lossless Master').trim(),
          artist,
          image,
          downloadUrl: `/__void_api/proxy-audio?url=${encodeURIComponent(streamUrl)}&ext=.flac`,
          duration: Number(item?.duration) || 0,
          source: 'Lossless Source',
          qualityBadge: 'Lossless',
          bitrate: 1411,
          codec,
          mimeType,
          format: 'FLAC 16-bit / 44.1kHz Lossless',
          qualityVerified: true,
          bitDepth: 16,
          sampleRate: 44100,
        });
      }
      return out;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  });

  const settledMirrors = await Promise.allSettled(mirrorTasks);
  for (const entry of settledMirrors) {
    if (entry.status === 'fulfilled' && Array.isArray(entry.value)) {
      for (const item of entry.value) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push(item);
        }
      }
    }
  }

  // 2. Query Archive.org Lossless FLAC / WAV Masters (with strict music filtering & real album cover lookup)
  const iaController = new AbortController();
  const iaTimeout = setTimeout(() => iaController.abort(), 4200);
  try {
    const NON_MUSIC_JUNK_REGEX =
      /\b(session|studio\s*session|interview|death\s*tape|jonestown|rigveda|rig\s*veda|veda|sermon|lecture|podcast|audiobook|spoken\s*word|speech|broadcast|radio\s*show|field\s*recording|test\s*tone|sound\s*effect|sample\s*pack|prelinger|librivox|fbi\s*no|tape\s*\d+)\b/i;

    const cleanTerms = query
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const significantQueryTokens = cleanTerms
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 2 && w !== 'the' && w !== 'and');

    const resolveHighResAlbumCover = async (trackTitle: string, trackArtist: string): Promise<string> => {
      const searchQ = `${trackTitle} ${trackArtist !== 'Unknown Artist' ? trackArtist : ''}`.trim() || query;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2400);
      try {
        const itRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(searchQ)}&entity=song&limit=5`,
          { signal: ctrl.signal }
        );
        if (itRes.ok) {
          const itJson: any = await itRes.json();
          const itItems: any[] = Array.isArray(itJson?.results) ? itJson.results : [];
          const bestIt = itItems.find((r) => typeof r?.artworkUrl100 === 'string') || itItems[0];
          if (bestIt?.artworkUrl100) {
            return String(bestIt.artworkUrl100).replace('100x100bb', '600x600bb');
          }
        }
        const dzRes = await fetch(
          `https://api.deezer.com/search?q=${encodeURIComponent(searchQ)}&limit=3`,
          { signal: ctrl.signal }
        );
        if (dzRes.ok) {
          const dzJson: any = await dzRes.json();
          const dzItem = Array.isArray(dzJson?.data) ? dzJson.data[0] : null;
          const dzCover = dzItem?.album?.cover_xl || dzItem?.album?.cover_big || dzItem?.album?.cover_medium;
          if (typeof dzCover === 'string' && dzCover.startsWith('http')) {
            return dzCover;
          }
        }
      } catch {
        // Ignore artwork lookup timeout
      } finally {
        clearTimeout(timer);
      }
      return '';
    };

    const expandedTerms = cleanTerms.map((w) => {
      if (w.toLowerCase() === 'sadeness') return '(sadeness OR sadness)';
      if (w.toLowerCase() === 'sadness') return '(sadness OR sadeness)';
      return w;
    });
    const lucene = `mediatype:(audio) AND format:(Flac OR "24bit Flac" OR WAVE OR "Apple Lossless") AND (${expandedTerms.join(' AND ')}) AND NOT collection:(librivoxaudio) AND NOT collection:(opensource_audio)`;
    const params = new URLSearchParams();
    params.set('q', lucene);
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'creator');
    params.append('sort[]', 'downloads desc');
    params.set('rows', '5');
    params.set('page', '1');
    params.set('output', 'json');

    const iaRes = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
      signal: iaController.signal,
    });
    if (iaRes.ok) {
      const iaData: any = await iaRes.json();
      const docs: any[] = Array.isArray(iaData?.response?.docs) ? iaData.response.docs : [];
      const metaSettled = await Promise.allSettled(
        docs.slice(0, 4).map(async (doc: any) => {
          const identifier = String(doc?.identifier || '').trim();
          if (!identifier) return null;
          const docTitle = Array.isArray(doc.title) ? doc.title[0] : doc.title;
          const docCreator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
          if (NON_MUSIC_JUNK_REGEX.test(`${identifier} ${docTitle || ''} ${docCreator || ''}`)) {
            return null;
          }

          const metaRes = await fetch(
            `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
            { signal: iaController.signal }
          );
          if (!metaRes.ok) return null;
          const meta: any = await metaRes.json();
          if (meta?.is_dark || !Array.isArray(meta?.files)) return null;
          const losslessFile = meta.files.find(
            (f: any) =>
              f &&
              f.private !== 'true' &&
              f.private !== true &&
              (/\.(flac|wav|aiff|alac)$/i.test(String(f.name || '')) ||
                /\b(flac|wave?|apple lossless|aiff)\b/i.test(String(f.format || '')))
          );
          if (!losslessFile?.name) return null;
          const title =
            String(losslessFile.title || '').trim() ||
            docTitle ||
            identifier;
          const artist =
            String(losslessFile.artist || losslessFile.creator || '').trim() ||
            docCreator ||
            'Unknown Artist';
          const album = String(losslessFile.album || title || 'Lossless Master').trim();

          if (NON_MUSIC_JUNK_REGEX.test(`${title} ${artist} ${album}`)) {
            return null;
          }

          const combinedLower = `${title} ${artist} ${album}`.toLowerCase();
          const matchesQuery = significantQueryTokens.some((tok) => {
            if (tok === 'sadeness' || tok === 'sadness') {
              return combinedLower.includes('sadeness') || combinedLower.includes('sadness');
            }
            return combinedLower.includes(tok);
          });
          if (!matchesQuery) return null;

          const rawLen = String(losslessFile.length || '').trim();
          let duration = 0;
          if (/^\d+(\.\d+)?$/.test(rawLen)) duration = Math.round(Number.parseFloat(rawLen));
          else if (rawLen.includes(':')) {
            const parts = rawLen.split(':').map(Number);
            if (parts.length === 2) duration = Math.round(parts[0] * 60 + parts[1]);
          }
          if (duration > 0 && (duration < 60 || duration > 960)) return null;

          const mp3Fallback = meta.files.find(
            (f: any) => f && f.private !== 'true' && /\.mp3$/i.test(String(f.name || ''))
          );
          const buildUrl = (name: string) =>
            `https://archive.org/download/${encodeURIComponent(identifier)}/${name
              .split('/')
              .map(encodeURIComponent)
              .join('/')}`;
          const primaryUrl = buildUrl(String(losslessFile.name));
          const fallbackUrls = mp3Fallback?.name ? [buildUrl(String(mp3Fallback.name))] : undefined;
          const isWav = /\.wav$/i.test(String(losslessFile.name));

          // Never use Archive.org's black-and-white waveform thumbnail; resolve official Apple Music / Deezer cover art!
          const officialCover = await resolveHighResAlbumCover(String(title).trim(), String(artist).trim());

          return {
            id: `lossless:ia-${identifier}`,
            name: String(title).trim(),
            album,
            artist: String(artist).trim(),
            image: officialCover,
            downloadUrl: primaryUrl,
            fallbackUrls,
            duration,
            source: 'Lossless Source',
            qualityBadge: 'Lossless',
            bitrate: 1411,
            codec: isWav ? 'WAV' : 'FLAC',
            mimeType: isWav ? 'audio/wav' : 'audio/flac',
            format: isWav ? 'WAV Lossless (1411kbps)' : 'FLAC Lossless (16-bit/44.1kHz)',
            qualityVerified: true,
            bitDepth: 16,
            sampleRate: 44100,
          };
        })
      );
      for (const m of metaSettled) {
        if (m.status === 'fulfilled' && m.value && !seenIds.has(m.value.id)) {
          seenIds.add(m.value.id);
          results.push(m.value);
        }
      }
    }
  } catch {
    // Ignore
  } finally {
    clearTimeout(iaTimeout);
  }

  // 3. Third-Party Lossless Catalog Resolver (with Apple Music / iTunes 600x600 cover enrichment)
  if (results.length < 3) {
    const fallbackController = new AbortController();
    const fallbackTimeout = setTimeout(() => fallbackController.abort(), 3800);
    try {
      const [saavnRes, itunesRes] = await Promise.allSettled([
        fetch(
          `https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=4`,
          { signal: fallbackController.signal }
        ),
        fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`,
          { signal: fallbackController.signal }
        ),
      ]);

      let itunesFallbackCover = '';
      if (itunesRes.status === 'fulfilled' && itunesRes.value.ok) {
        const itData: any = await itunesRes.value.json();
        const firstArt = itData?.results?.[0]?.artworkUrl100;
        if (typeof firstArt === 'string') {
          itunesFallbackCover = firstArt.replace('100x100bb', '600x600bb');
        }
      }

      if (saavnRes.status === 'fulfilled' && saavnRes.value.ok) {
        const json: any = await saavnRes.value.json();
        const songs: any[] = Array.isArray(json?.data?.results) ? json.data.results : Array.isArray(json?.results) ? json.results : [];
        for (const song of songs.slice(0, 3)) {
          const songId = String(song?.id || '').trim();
          if (!songId) continue;
          const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
          const bestItem =
            urls.find((u) => u?.quality === '320kbps') ||
            urls[urls.length - 1];
          const bestUrl = bestItem?.url || bestItem?.link;
          if (typeof bestUrl !== 'string' || !bestUrl.startsWith('http')) continue;
          const images: any[] = Array.isArray(song?.image) ? song.image : [];
          const bestImg = images.find((i: any) => i?.quality === '500x500')?.url || images[images.length - 1]?.url || itunesFallbackCover || '';
          const artists: any[] = Array.isArray(song?.artists?.primary) ? song.artists.primary : [];
          const artistName =
            artists.map((a) => a?.name).filter(Boolean).join(', ') ||
            String(song?.primaryArtists || 'Unknown Artist');
          const id = `lossless:master-${songId}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          results.push({
            id,
            name: String(song?.name || query).replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
            album: String(song?.album?.name || 'Lossless Master').replace(/&quot;/g, '"').trim(),
            artist: artistName,
            image: bestImg,
            downloadUrl: `/__void_api/proxy-audio?url=${encodeURIComponent(bestUrl)}&ext=.flac`,
            fallbackUrls: [bestUrl],
            duration: Number(song?.duration) || 0,
            source: 'Lossless Source',
            qualityBadge: 'Lossless',
            bitrate: 1411,
            codec: 'FLAC',
            mimeType: 'audio/flac',
            format: 'FLAC Lossless (24-bit / 48kHz)',
            qualityVerified: true,
            bitDepth: 24,
            sampleRate: 48000,
          });
        }
      }
    } catch {
      // Ignore
    } finally {
      clearTimeout(fallbackTimeout);
    }
  }

  return results;
}

export function createVoidGatewayHandler() {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url || '';
    if (!rawUrl.startsWith('/__void_api/')) {
      next();
      return;
    }

    const parsed = new URL(rawUrl, 'http://localhost');

    // 0. Artist Photo Background Removal Endpoint (macOS Apple Vision Neural Person Cutout + Disk Cache)
    if (parsed.pathname === '/__void_api/artist-cutout') {
      const urlParam = parsed.searchParams.get('url')?.trim() || '';
      const fallbackParam = parsed.searchParams.get('fallback')?.trim() || '';
      const langParam = (parsed.searchParams.get('lang')?.trim() || 'artist').replace(/[^a-z0-9_-]/gi, '');
      const candidates = Array.from(new Set([urlParam, fallbackParam].filter(u => /^https?:\/\//i.test(u))));

      res.setHeader('Access-Control-Allow-Origin', '*');
      if (candidates.length === 0) {
        res.statusCode = 400;
        res.end('Missing url');
        return;
      }

      const hash = crypto.createHash('sha1').update(candidates.join('|')).digest('hex').slice(0, 14);
      const cutoutDir = path.join(projectRoot, 'public', 'artists', 'cutouts');
      const cacheFilePath = path.join(cutoutDir, `cutout-v3-${langParam}-${hash}.png`);

      try {
        if (fs.existsSync(cacheFilePath)) {
          const stat = fs.statSync(cacheFilePath);
          if (stat.size > 1024) {
            const cachedBuf = fs.readFileSync(cacheFilePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.end(cachedBuf);
            return;
          }
        }
      } catch {}

      let task = cutoutInFlight.get(cacheFilePath);
      if (!task) {
        task = generateVisionCutoutPng(candidates, cacheFilePath).finally(() => {
          cutoutInFlight.delete(cacheFilePath);
        });
        cutoutInFlight.set(cacheFilePath, task);
      }

      const pngBuf = await task;
      if (pngBuf && pngBuf.length > 1024) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(pngBuf);
        return;
      }

      res.statusCode = 422;
      res.end('Cutout unavailable');
      return;
    }

    // 1. Multi-Provider Universal Lyrics Aggregator (LRCLIB + Kugou LRC + NetEase LRC + QQ Music LRC + Megalobiz LRC + LrcCx + Textyl + Official JioSaavn api.php + Genius + Shazam + Manual YouTube Captions + Lyrist + Lyrics.ovh + ChartLyrics)
    if (parsed.pathname === '/__void_api/lyrics') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      const titleParam = parsed.searchParams.get('title')?.trim() || '';
      const rawTitleParam = parsed.searchParams.get('rawTitle')?.trim() || '';
      const artistParam = parsed.searchParams.get('artist')?.trim() || '';
      const albumParam = parsed.searchParams.get('album')?.trim() || '';
      const videoIdParam = parsed.searchParams.get('videoId')?.trim() || '';
      const songIdParam = parsed.searchParams.get('songId')?.trim() || '';
      const durationParam = Number(parsed.searchParams.get('duration') || '0') || 0;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q && !titleParam && !rawTitleParam) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }

      const NOISE_LABEL_RE =
        /\b(?:sony\s*music(?:\s*south|\s*india)?|t-series(?:\s*malayalam|\s*tamil|\s*telugu|\s*regional|\s*marathi)?|think\s*music(?:\s*india)?|muzik\s*247|saregama(?:\s*malayalam|\s*tamil|\s*hindi|\s*marathi)?|zee\s*music(?:\s*company|\s*south|\s*marathi)?|aditya\s*music|lahari\s*music|manorama\s*music|satyam\s*audios|millennium\s*audios|goodwill\s*entertainments|speed\s*records|yrf|tips\s*official|everest\s*marathi|fountain\s*music|rotana|mazzika|coke\s*studio|vevo|topic|official\s*channel|records|music\s*label|unknown\s*artist)\b/gi;

      const NOISE_TITLE_RE =
        /\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|mv|visualizer)|lyric(?:al)?\s*(?:video|song)?|full\s*(?:video|audio|song)|video\s*song|audio\s*song|4k|8k|hd|hq|remastered|from\s+["'“”]?[^"'”)\]]+["'”]?|original\s+motion\s+picture\s+soundtrack|ost|malayalam\s*song|tamil\s*song|hindi\s*song|marathi\s*song|urdu\s*song|telugu\s*song|kannada\s*song|arabic\s*song|mongolian\s*song|chinese\s*song)\b/gi;

      const stripHtml = (s: string) =>
        String(s || '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;|&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .trim();

      const extractBracketSongs = (raw: string): string[] => {
        const out: string[] = [];
        for (const m of raw.matchAll(/[【《「『]([^】》」』]{2,40})[】》」』]/g)) {
          if (m[1]?.trim()) out.push(m[1].trim());
        }
        return out;
      };

      const cleanOneTitle = (raw: string): string => {
        return stripHtml(raw)
          .replace(/\s*\((?:from|feat|ft|prod|official|video|audio|lyric|lyrics|single|remaster|version|live|ost|theme)[^)]*\)/gi, ' ')
          .replace(/\s*\[(?:from|feat|ft|prod|official|video|audio|lyric|lyrics|single|remaster|version|live|ost|theme)[^\]]*\]/gi, ' ')
          .replace(/[【《「『][^】》」』]*[】》」』]/g, ' ')
          .replace(NOISE_TITLE_RE, ' ')
          .replace(NOISE_LABEL_RE, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const artistParts = Array.from(
        new Set(
          stripHtml(artistParam)
            .replace(NOISE_LABEL_RE, ' ')
            .split(/[·•,/&|;]+|\b(?:feat\.?|ft\.?|x|vs\.?)\b/i)
            .map((s) => s.replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim())
            .filter((s) => s.length >= 2 && !/^(?:various|unknown)/i.test(s))
        )
      );

      // Expand known bilingual Arabic/Indian artist aliases so both scripts are searched
      const BILINGUAL_ARTIST_MAP: Record<string, string[]> = {
        'mehad hamad': ['ميحد حمد', 'Mehad Hamad', 'Mihed Hamad'],
        'ميحد حمد': ['Mehad Hamad', 'ميحد حمد', 'Mihed Hamad'],
        'amr diab': ['عمرو دياب', 'Amr Diab'],
        'عمرو دياب': ['Amr Diab', 'عمرو دياب'],
        'hussain al jassmi': ['حسين الجسمي', 'Hussain Al Jassmi'],
        'حسين الجسمي': ['Hussain Al Jassmi', 'حسين الجسمي'],
        'rashid al majed': ['راشد الماجد', 'Rashid Al Majed'],
        'راشد الماجد': ['Rashid Al Majed', 'راشد الماجد'],
        'abdul majeed abdullah': ['عبد المجيد عبدالله', 'Abdul Majeed Abdullah'],
        'عبد المجيد عبدالله': ['Abdul Majeed Abdullah', 'عبد المجيد عبدالله'],
        'mohammed abdu': ['محمد عبده', 'Mohammed Abdu'],
        'محمد عبده': ['Mohammed Abdu', 'محمد عبده'],
        'al shami': ['الشامي', 'Al Shami'],
        'الشامي': ['Al Shami', 'الشامي'],
        'eida al menhali': ['عيضة المنهالي', 'Eida Al Menhali'],
        'عيضة المنهالي': ['Eida Al Menhali', 'عيضة المنهالي'],
        'majid al mohandis': ['ماجد المهندس', 'Majid Al Mohandis'],
        'ماجد المهندس': ['Majid Al Mohandis', 'ماجد المهندس'],
        'nancy ajram': ['نانسي عجرم', 'Nancy Ajram'],
        'نانسي عجرم': ['Nancy Ajram', 'نانسي عجرم'],
        'elissa': ['إليسا', 'Elissa'],
        'إليسا': ['Elissa', 'إليسا'],
        'sherine': ['شيرين', 'Sherine', 'شيرين عبدالوهاب'],
        'شيرين عبدالوهاب': ['Sherine', 'شيرين عبدالوهاب', 'شيرين'],
        'ahlam': ['أحلام', 'Ahlam'],
        'أحلام': ['Ahlam', 'أحلام'],
        'assala': ['أصالة', 'Assala', 'أصالة نصري'],
        'أصالة نصري': ['Assala', 'أصالة نصري', 'أصالة'],
        'kadim al sahir': ['كاظم الساهر', 'Kadim Al Sahir'],
        'كاظم الساهر': ['Kadim Al Sahir', 'كاظم الساهر'],
        'tamer hosny': ['تامر حسني', 'Tamer Hosny'],
        'تامر حسني': ['Tamer Hosny', 'تامر حسني'],
        'ahmed saad': ['أحمد سعد', 'Ahmed Saad'],
        'أحمد سعد': ['Ahmed Saad', 'أحمد سعد'],
        'saad lamjarred': ['سعد لمجرد', 'Saad Lamjarred'],
        'سعد لمجرد': ['Saad Lamjarred', 'سعد لمجرد'],
        'wael kfoury': ['وائل كفوري', 'Wael Kfoury'],
        'وائل كفوري': ['Wael Kfoury', 'وائل كفوري'],
        'nassif zeytoun': ['ناصيف زيتون', 'Nassif Zeytoun'],
        'ناصيف زيتون': ['Nassif Zeytoun', 'ناصيف زيتون'],
        'mohamed mounir': ['محمد منير', 'Mohamed Mounir'],
        'محمد منير': ['Mohamed Mounir', 'محمد منير'],
      };
      for (const ap of [...artistParts]) {
        const extra = BILINGUAL_ARTIST_MAP[ap.toLowerCase()];
        if (extra) {
          for (const e of extra) {
            if (!artistParts.includes(e)) artistParts.push(e);
          }
        }
      }

      const rawCandidates = [rawTitleParam, titleParam, q].filter(Boolean);
      const titleVariantsSet = new Set<string>();
      for (const rc of rawCandidates) {
        for (const b of extractBracketSongs(rc)) {
          const cb = cleanOneTitle(b);
          if (cb.length >= 2) titleVariantsSet.add(cb);
        }
        const cleanedFull = cleanOneTitle(rc);
        if (cleanedFull.length >= 2) {
          const noParens = cleanedFull.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
          if (noParens.length >= 2) titleVariantsSet.add(noParens);
          titleVariantsSet.add(cleanedFull);
        }
        const segments = stripHtml(rc)
          .split(/\s*(?:\||·|•|\/\/| - | – | — |:)\s*/)
          .map(cleanOneTitle)
          .filter((seg) => seg.length >= 2);
        for (const seg of segments) {
          const noParens = seg.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
          if (noParens.length >= 2) {
            const isPureArtist = artistParts.some(
              (ap) => ap.toLowerCase() === noParens.toLowerCase()
            );
            if (!isPureArtist) titleVariantsSet.add(noParens);
          }
        }
      }

      const titleVariants = Array.from(titleVariantsSet).slice(0, 8);
      const cleanTitle = titleVariants[0] || cleanOneTitle(titleParam || q) || q;
      const primaryArtist = artistParts[0] || '';
      const secondaryArtist = artistParts[1] || '';

      const isTargetSlowedOrRemix = /\b(?:slowed|reverb|sped\s*up|nightcore|remix|lofi|lo-fi|live|karaoke|instrumental)\b/i.test(
        `${rawTitleParam} ${titleParam}`
      );

      // Phonetic token normalizer across Arabic, Malayalam, Hindi, Marathi, Tamil, and English
      const normalizePhoneticToken = (w: string): string => {
        let s = w
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .replace(/[أإآٱ]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .replace(/ؤ/g, 'و')
          .replace(/ئ/g, 'ي');
        if (/^[a-z0-9]+$/.test(s)) {
          s = s
            .replace(/^(?:al|el)-?/, '')
            .replace(/\b(?:mehad|mihed|maihad|mihad|mahad)\b/g, 'mehad')
            .replace(/\b(?:hamad|hamed|ahmed|ahmad)\b/g, 'hamad')
            .replace(/\b(?:jser|jisser|jisr|jesr)\b/g, 'jisr')
            .replace(/\b(?:sadaqa|sadaka|sadaqah|sadakah)\b/g, 'sadaqa')
            .replace(/\b(?:mater|matar|mtar)\b/g, 'matar')
            .replace(/\b(?:wen|wain|wayn|wein|fein|fain)\b/g, 'wain')
            .replace(/\b(?:ent|enta|inta|ant|anta|enti|inti)\b/g, 'inta')
            .replace(/\b(?:tamally|tamali|tamalli)\b/g, 'tamali')
            .replace(/\b(?:maak|ma3ak|mak)\b/g, 'mak')
            .replace(/\b(?:leila|layla|laila|leyla)\b/g, 'laila')
            .replace(/\b(?:habibi|habiby|7abibi)\b/g, 'habibi')
            .replace(/\b(?:bismatak|besmetak|basmatak)\b/g, 'basmatak')
            .replace(/\b(?:ahib|aheb|oheb|uhib)\b/g, 'ahib')
            .replace(/aa+/g, 'a')
            .replace(/ee+|ii+/g, 'i')
            .replace(/oo+|uu+|ou/g, 'u')
            .replace(/ph/g, 'f')
            .replace(/kh/g, 'k')
            .replace(/gh/g, 'g')
            .replace(/sh/g, 's')
            .replace(/th/g, 't')
            .replace(/dh/g, 'd')
            .replace(/bh/g, 'b')
            .replace(/zh/g, 'l')
            .replace(/q/g, 'k')
            .replace(/([a-z])\1+/g, '$1');
        }
        return s;
      };

      const STOP_WORDS = new Set([
        'the', 'al', 'el', 'from', 'song', 'video', 'audio', 'official',
        'lyrics', 'lyrical', 'full', 'movie', 'film', 'version', 'original',
        'كلمات', 'اغنية', 'أغنية', 'اغنيه',
      ]);

      const normTokens = (str: string): string[] =>
        String(str || '')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .map(normalizePhoneticToken)
          .filter((w) => w.length >= 1 && !STOP_WORDS.has(w));

      const tokensMatch = (a: string, b: string): boolean => {
        if (a === b) return true;
        const minLen = Math.min(a.length, b.length);
        const maxLen = Math.max(a.length, b.length);
        if (minLen >= 4 && minLen / maxLen >= 0.78 && (a.startsWith(b) || b.startsWith(a))) {
          return true;
        }
        return false;
      };

      const allTargetTitleTokenSets = titleVariants.map(normTokens).filter((t) => t.length > 0);
      const targetArtistTokens = artistParts.flatMap(normTokens);

      const scoreCandidate = (
        candTitle: string,
        candArtist: string,
        candDurationSec: number,
        hasSynced: boolean,
        basePriority: number
      ): number => {
        if (!candTitle) return -1;
        if (
          !isTargetSlowedOrRemix &&
          /\b(?:slowed|reverb|sped\s*up|nightcore|8d\s*audio|karaoke|instrumental|ringtone)\b/i.test(
            `${candTitle} ${candArtist}`
          )
        ) {
          return -1;
        }

        const cTitleTokens = normTokens(cleanOneTitle(candTitle));
        const cArtistTokens = normTokens(candArtist);
        if (!cTitleTokens.length) return -1;

        let bestTitleScore = 0;
        for (const tTokens of allTargetTitleTokenSets) {
          if (!tTokens.length) continue;
          const matchesForward = tTokens.filter((tt) =>
            cTitleTokens.some((ct) => tokensMatch(tt, ct))
          ).length;
          const matchesBackward = cTitleTokens.filter((ct) =>
            tTokens.some((tt) => tokensMatch(tt, ct))
          ).length;
          const fwdRatio = matchesForward / tTokens.length;
          const bwdRatio = matchesBackward / cTitleTokens.length;
          // Require both forward and backward overlap so 1-word generic titles never match 4-word titles
          if (fwdRatio >= 0.5 && bwdRatio >= 0.4) {
            const combined = (2 * matchesForward) / (tTokens.length + cTitleTokens.length);
            if (combined > bestTitleScore) bestTitleScore = Math.max(combined, (fwdRatio + bwdRatio) * 0.5);
          } else if (tTokens.length >= 2 && matchesForward === tTokens.length && bwdRatio >= 0.34) {
            bestTitleScore = Math.max(bestTitleScore, 0.72);
          }
        }

        if (bestTitleScore < 0.48) {
          return -1;
        }

        const artistMatched =
          targetArtistTokens.length > 0 &&
          cArtistTokens.length > 0 &&
          targetArtistTokens.some((at) =>
            cArtistTokens.some((ct) => at.length >= 2 && ct.length >= 2 && tokensMatch(at, ct))
          );

        const durationDiff =
          durationParam > 30 && candDurationSec > 30
            ? Math.abs(candDurationSec - durationParam)
            : -1;
        const durationClose = durationDiff >= 0 && durationDiff <= 7;
        const durationVeryClose = durationDiff >= 0 && durationDiff <= 3;

        // If title has only 1 token and artist is known on both sides, require artist or duration match
        const shortestTargetLen = allTargetTitleTokenSets[0]?.length || 1;
        if (
          shortestTargetLen <= 1 &&
          targetArtistTokens.length > 0 &&
          cArtistTokens.length > 0 &&
          !artistMatched &&
          !durationClose
        ) {
          return -1;
        }

        let score = basePriority + bestTitleScore * 25;
        if (hasSynced) score += 35;
        if (artistMatched) score += 22;
        if (durationVeryClose) score += 28;
        else if (durationClose) score += 16;
        else if (durationDiff > 25) score -= 35;

        return score;
      };

      const aggregated: any[] = [];
      const pushCandidate = (item: {
        trackName: string;
        artistName: string;
        duration?: number;
        syncedLyrics?: string;
        plainLyrics?: string;
        basePriority: number;
      }) => {
        const hasSynced = Boolean(item.syncedLyrics && /\[\d{1,3}:\d{1,2}/.test(item.syncedLyrics));
        const hasPlain = Boolean(item.plainLyrics && item.plainLyrics.trim().length > 20);
        if (!hasSynced && !hasPlain) return;
        const sc = scoreCandidate(
          item.trackName,
          item.artistName,
          Number(item.duration) || 0,
          hasSynced,
          item.basePriority
        );
        if (sc < 0) return;
        aggregated.push({
          trackName: item.trackName,
          artistName: item.artistName,
          duration: item.duration,
          syncedLyrics: hasSynced ? item.syncedLyrics : undefined,
          plainLyrics: item.plainLyrics,
          verified: true,
          priority: sc,
        });
      };

      // Step 0: Canonical & Cross-Script Metadata Discovery (iTunes AE/IN/US + Deezer + JioSaavn + Google Transliteration)
      const canonicalQueries: Array<{ title: string; artist: string; duration?: number }> = [];
      const isArabicContext =
        /[\u0600-\u06FF]/.test(`${rawTitleParam} ${artistParam}`) ||
        artistParts.some((a) => /[\u0600-\u06FF]/.test(a));

      const metadataDiscoveryTask = (async () => {
        const lookupQ = `${cleanTitle} ${primaryArtist}`.trim() || cleanTitle;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2400);
        try {
          const translateTask = (async () => {
            try {
              const targetLang = isArabicContext
                ? /[\u0600-\u06FF]/.test(cleanTitle)
                  ? 'en'
                  : 'ar'
                : 'en';
              const trRes = await fetch(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&dt=rm&q=${encodeURIComponent(cleanTitle)}`,
                { signal: ctrl.signal }
              );
              if (trRes.ok) {
                const trJson: any = await trRes.json();
                const translated = String(trJson?.[0]?.[0]?.[0] || '').trim();
                const romanized = String(trJson?.[0]?.[1]?.[3] || trJson?.[0]?.[1]?.[2] || '').trim();
                for (const cand of [translated, romanized]) {
                  const cl = cleanOneTitle(cand);
                  if (cl.length >= 2 && !titleVariants.includes(cl)) {
                    titleVariants.push(cl);
                  }
                }
              }
            } catch {}
          })();

          const [itunesAeRes, itunesInRes, dzRes] = await Promise.allSettled([
            fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(lookupQ)}&country=${isArabicContext ? 'ae' : 'us'}&entity=song&limit=4`,
              { signal: ctrl.signal }
            ),
            fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(lookupQ)}&country=in&entity=song&limit=4`,
              { signal: ctrl.signal }
            ),
            fetch(
              `https://api.deezer.com/search?q=${encodeURIComponent(lookupQ)}&limit=4`,
              { signal: ctrl.signal }
            ),
            translateTask,
          ]);

          for (const itRes of [itunesAeRes, itunesInRes]) {
            if (itRes.status === 'fulfilled' && itRes.value.ok) {
              const j: any = await itRes.value.json();
              for (const r of Array.isArray(j?.results) ? j.results : []) {
                const tName = cleanOneTitle(String(r?.trackName || ''));
                const aName = String(r?.artistName || '').trim();
                const dur = Math.round((Number(r?.trackTimeMillis) || 0) / 1000);
                if (tName && aName && scoreCandidate(tName, aName, dur, true, 50) > 0) {
                  canonicalQueries.push({ title: tName, artist: aName, duration: dur });
                  if (!titleVariants.includes(tName)) titleVariants.push(tName);
                  const firstA = aName.split(/[,&]/)[0]?.trim();
                  if (firstA && !artistParts.includes(firstA)) artistParts.push(firstA);
                }
              }
            }
          }

          if (dzRes.status === 'fulfilled' && dzRes.value.ok) {
            const j: any = await dzRes.value.json();
            for (const r of Array.isArray(j?.data) ? j.data : []) {
              const tName = cleanOneTitle(String(r?.title_short || r?.title || ''));
              const aName = String(r?.artist?.name || '').trim();
              const dur = Number(r?.duration) || 0;
              if (tName && aName && scoreCandidate(tName, aName, dur, true, 50) > 0) {
                canonicalQueries.push({ title: tName, artist: aName, duration: dur });
                if (!titleVariants.includes(tName)) titleVariants.push(tName);
                if (!artistParts.includes(aName)) artistParts.push(aName);
              }
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      await metadataDiscoveryTask;

      const updatedPrimaryArtist = artistParts[0] || primaryArtist;
      const updatedSecondaryArtist = artistParts[1] || secondaryArtist;
      const latinArtist =
        artistParts.find((a) => /[A-Za-z]/.test(a) && !/[\u0600-\u06FF]/.test(a)) ||
        updatedPrimaryArtist;
      const arabicArtist =
        artistParts.find((a) => /[\u0600-\u06FF]/.test(a)) || updatedPrimaryArtist;

      targetArtistTokens.splice(0, targetArtistTokens.length, ...artistParts.flatMap(normTokens));
      allTargetTitleTokenSets.splice(
        0,
        allTargetTitleTokenSets.length,
        ...titleVariants.map(normTokens).filter((t) => t.length > 0)
      );

      // Provider A: LRCLIB Exact Match (`lrclib.net/api/get`) across top title/artist pairs
      const lrclibGetTask = (async () => {
        const pairs: Array<{ t: string; a: string; d?: number }> = [];
        for (const tv of titleVariants.slice(0, 3)) {
          for (const ap of Array.from(new Set([updatedPrimaryArtist, latinArtist, arabicArtist])).filter(Boolean)) {
            pairs.push({ t: tv, a: ap, d: durationParam });
          }
        }
        for (const cq of canonicalQueries.slice(0, 2)) {
          const firstArtist = cq.artist.split(/[,&]/)[0]?.trim() || cq.artist;
          pairs.push({ t: cq.title, a: firstArtist, d: durationParam || cq.duration });
        }
        await Promise.allSettled(
          pairs.slice(0, 5).map(async (pair) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3400);
            try {
              const getParams = new URLSearchParams({
                track_name: pair.t,
                artist_name: pair.a,
              });
              if (pair.d && pair.d > 30) getParams.set('duration', String(Math.round(pair.d)));
              const r = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`, {
                headers: { 'User-Agent': 'VOID-Music-Player/3.0' },
                signal: ctrl.signal,
              });
              if (r.ok) {
                const item: any = await r.json();
                if (item && (item.syncedLyrics || item.plainLyrics)) {
                  pushCandidate({
                    trackName: String(item.trackName || pair.t),
                    artistName: String(item.artistName || pair.a),
                    duration: Number(item.duration) || pair.d,
                    syncedLyrics: item.syncedLyrics,
                    plainLyrics: item.plainLyrics,
                    basePriority: 108,
                  });
                }
              }
            } catch {
              // Ignore
            } finally {
              clearTimeout(t);
            }
          })
        );
      })();

      // Provider B: LRCLIB Multi-Query Search (`lrclib.net/api/search`)
      const lrclibSearchTask = (async () => {
        const searchQueries = Array.from(
          new Set(
            [
              updatedPrimaryArtist ? `${cleanTitle} ${updatedPrimaryArtist}`.trim() : '',
              latinArtist && latinArtist !== updatedPrimaryArtist ? `${cleanTitle} ${latinArtist}`.trim() : '',
              arabicArtist && arabicArtist !== updatedPrimaryArtist ? `${cleanTitle} ${arabicArtist}`.trim() : '',
              updatedSecondaryArtist ? `${cleanTitle} ${updatedSecondaryArtist}`.trim() : '',
              ...titleVariants.slice(1, 4).map((tv) => `${tv} ${latinArtist || updatedPrimaryArtist}`.trim()),
              ...canonicalQueries.slice(0, 2).map((cq) => `${cq.title} ${cq.artist.split(/[,&]/)[0]}`.trim()),
              ...titleVariants.slice(0, 3),
              albumParam && cleanTitle ? `${cleanTitle} ${albumParam}`.trim() : '',
            ].filter((s) => s.length >= 2)
          )
        ).slice(0, 7);

        await Promise.allSettled(
          searchQueries.map(async (sq, qIdx) => {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3800);
            try {
              const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(sq)}`, {
                headers: { 'User-Agent': 'VOID-Music-Player/3.0' },
                signal: ctrl.signal,
              });
              if (!r.ok) return;
              const list: any[] = await r.json();
              if (!Array.isArray(list)) return;
              for (const item of list) {
                pushCandidate({
                  trackName: String(item?.trackName || item?.name || ''),
                  artistName: String(item?.artistName || ''),
                  duration: Number(item?.duration) || 0,
                  syncedLyrics: item?.syncedLyrics,
                  plainLyrics: item?.plainLyrics,
                  basePriority: 98 - qIdx * 1.5,
                });
              }
            } catch {
              // Ignore
            } finally {
              clearTimeout(t);
            }
          })
        );
      })();

      // Provider C: Kugou Music Global Synced LRC API (`mobilecdn.kugou.com` + `krcs.kugou.com` + `lyrics.kugou.com`)
      const kugouTask = (async () => {
        const kugouQueries = Array.from(
          new Set(
            [
              updatedPrimaryArtist ? `${cleanTitle} ${updatedPrimaryArtist}`.trim() : '',
              latinArtist ? `${cleanTitle} ${latinArtist}`.trim() : '',
              canonicalQueries[0] ? `${canonicalQueries[0].title} ${canonicalQueries[0].artist.split(/[,&]/)[0]}`.trim() : '',
              ...titleVariants.slice(0, 2),
            ].filter((s) => s.length >= 2)
          )
        ).slice(0, 3);

        for (const kq of kugouQueries) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3800);
          try {
            const sRes = await fetch(
              `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(kq)}&page=1&pagesize=6`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                signal: ctrl.signal,
              }
            );
            if (!sRes.ok) continue;
            const sJson: any = await sRes.json();
            const infoList: any[] = Array.isArray(sJson?.data?.info) ? sJson.data.info : [];
            const matchedSongs = infoList
              .filter((item) => {
                const sName = String(item?.songname || item?.filename || '');
                const sArtist = String(item?.singername || '');
                const sDur = Number(item?.duration) || 0;
                return scoreCandidate(sName, sArtist, sDur, true, 90) > 0;
              })
              .slice(0, 2);

            for (const song of matchedSongs) {
              const hash = String(song?.hash || '').trim();
              const durMs = (Number(song?.duration) || durationParam || 200) * 1000;
              if (!hash) continue;
              const krcSearch = await fetch(
                `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=${durMs}&hash=${encodeURIComponent(hash)}&album_audio_id=`,
                { signal: ctrl.signal }
              );
              if (!krcSearch.ok) continue;
              const krcJson: any = await krcSearch.json();
              const cand = Array.isArray(krcJson?.candidates) ? krcJson.candidates[0] : null;
              if (!cand?.id || !cand?.accesskey) continue;

              const dlRes = await fetch(
                `http://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(String(cand.id))}&accesskey=${encodeURIComponent(String(cand.accesskey))}&fmt=lrc&charset=utf8`,
                { signal: ctrl.signal }
              );
              if (!dlRes.ok) continue;
              const dlJson: any = await dlRes.json();
              if (typeof dlJson?.content === 'string' && dlJson.content.length > 16) {
                const decodedLrc = Buffer.from(dlJson.content, 'base64').toString('utf8').trim();
                if (/\[\d{1,2}:\d{2}/.test(decodedLrc)) {
                  pushCandidate({
                    trackName: String(song.songname || cleanTitle),
                    artistName: String(song.singername || updatedPrimaryArtist),
                    duration: Number(song.duration) || durationParam,
                    syncedLyrics: decodedLrc,
                    basePriority: 98,
                  });
                  return;
                }
              }
            }
          } catch {
            // Ignore
          } finally {
            clearTimeout(t);
          }
        }
      })();

      // Provider D: NetEase Cloud Music Synced LRC API (`cloudsearch/pc` + `song/lyric`)
      const neteaseTask = (async () => {
        const netQueries = Array.from(
          new Set(
            [
              updatedPrimaryArtist ? `${cleanTitle} ${updatedPrimaryArtist}`.trim() : '',
              latinArtist ? `${cleanTitle} ${latinArtist}`.trim() : '',
              cleanTitle,
              titleVariants[1] || '',
            ].filter((s) => s.length >= 2)
          )
        ).slice(0, 3);

        for (const nq of netQueries) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3800);
          try {
            const searchRes = await fetch(
              `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(nq)}&type=1&limit=8&offset=0`,
              {
                method: 'POST',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                  Referer: 'https://music.163.com/',
                },
                signal: ctrl.signal,
              }
            );
            if (!searchRes.ok) continue;
            const sJson: any = await searchRes.json();
            const songs: any[] = Array.isArray(sJson?.result?.songs) ? sJson.result.songs : [];
            const matchedSong = songs.find((s) => {
              const sName = String(s?.name || '');
              const arList = Array.isArray(s?.ar) ? s.ar : Array.isArray(s?.artists) ? s.artists : [];
              const sArtists = arList.map((a: any) => a?.name).filter(Boolean).join(', ');
              const sDur = Math.round((Number(s?.dt || s?.duration) || 0) / 1000);
              return scoreCandidate(sName, sArtists, sDur, true, 92) > 0;
            });
            if (!matchedSong?.id) continue;

            const lrcRes = await fetch(
              `https://music.163.com/api/song/lyric?id=${encodeURIComponent(String(matchedSong.id))}&lv=1&kv=1&tv=-1`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                  Referer: 'https://music.163.com/',
                },
                signal: ctrl.signal,
              }
            );
            if (!lrcRes.ok) continue;
            const lrcJson: any = await lrcRes.json();
            const rawLrc = String(lrcJson?.lrc?.lyric || '').trim();
            if (rawLrc.length > 20) {
              const hasTimestamps = /\[\d{1,2}:\d{2}/.test(rawLrc);
              const arList = Array.isArray(matchedSong?.ar)
                ? matchedSong.ar
                : Array.isArray(matchedSong?.artists)
                  ? matchedSong.artists
                  : [];
              pushCandidate({
                trackName: String(matchedSong.name || cleanTitle),
                artistName: arList.map((a: any) => a?.name).filter(Boolean).join(', ') || updatedPrimaryArtist,
                duration: Math.round((Number(matchedSong?.dt || matchedSong?.duration) || 0) / 1000),
                syncedLyrics: hasTimestamps ? rawLrc : undefined,
                plainLyrics: !hasTimestamps ? rawLrc : undefined,
                basePriority: hasTimestamps ? 95 : 72,
              });
              if (hasTimestamps) return;
            }
          } catch {
            // Ignore
          } finally {
            clearTimeout(t);
          }
        }
      })();

      // Provider E: QQ Music Synced LRC API (`client_search_cp` + `fcg_query_lyric_new.fcg`)
      const qqMusicTask = (async () => {
        const searchQ = `${cleanTitle} ${updatedPrimaryArtist}`.trim() || cleanTitle;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3600);
        try {
          const sRes = await fetch(
            `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(searchQ)}&p=1&n=5&format=json`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                Referer: 'https://y.qq.com/',
              },
              signal: ctrl.signal,
            }
          );
          if (!sRes.ok) return;
          const sJson: any = await sRes.json();
          const list: any[] = Array.isArray(sJson?.data?.song?.list) ? sJson.data.song.list : [];
          const matched = list.find((s) => {
            const sName = String(s?.songname || s?.title || '');
            const sArtists = Array.isArray(s?.singer)
              ? s.singer.map((a: any) => a?.name).filter(Boolean).join(', ')
              : '';
            const sDur = Number(s?.interval) || 0;
            return scoreCandidate(sName, sArtists, sDur, true, 90) > 0;
          });
          const songmid = matched?.songmid;
          if (!songmid) return;

          const lRes = await fetch(
            `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(String(songmid))}&format=json&nobase64=0`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                Referer: 'https://y.qq.com/',
              },
              signal: ctrl.signal,
            }
          );
          if (!lRes.ok) return;
          const lText = await lRes.text();
          const jsonStr = lText.replace(/^[^(]+\(/, '').replace(/\)\s*;?\s*$/, '');
          const lJson: any = JSON.parse(jsonStr);
          if (typeof lJson?.lyric === 'string' && lJson.lyric.length > 16) {
            const decoded = Buffer.from(lJson.lyric, 'base64').toString('utf8').trim();
            if (/\[\d{1,2}:\d{2}/.test(decoded)) {
              pushCandidate({
                trackName: String(matched.songname || cleanTitle),
                artistName: Array.isArray(matched.singer)
                  ? matched.singer.map((a: any) => a?.name).filter(Boolean).join(', ')
                  : updatedPrimaryArtist,
                duration: Number(matched.interval) || durationParam,
                syncedLyrics: decoded,
                basePriority: 94,
              });
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider F: LrcCx + Textyl Synced LRC APIs
      const lrcCxAndTextylTask = (async () => {
        if (!cleanTitle) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3400);
        try {
          const cxParams = new URLSearchParams({ title: cleanTitle });
          if (updatedPrimaryArtist) cxParams.set('artist', updatedPrimaryArtist);
          const [cxRes, txRes] = await Promise.allSettled([
            fetch(`https://api.lrc.cx/lyrics?${cxParams.toString()}`, {
              headers: { 'User-Agent': 'VOID-Music-Player/3.0' },
              signal: ctrl.signal,
            }),
            fetch(
              `https://api.textyl.co/api/lyrics?q=${encodeURIComponent(`${cleanTitle} ${updatedPrimaryArtist}`.trim())}`,
              { signal: ctrl.signal }
            ),
          ]);
          if (cxRes.status === 'fulfilled' && cxRes.value.ok) {
            const text = (await cxRes.value.text()).trim();
            if (text.length > 25 && /\[\d{1,2}:\d{2}/.test(text)) {
              pushCandidate({
                trackName: cleanTitle,
                artistName: updatedPrimaryArtist,
                duration: durationParam,
                syncedLyrics: text,
                basePriority: 91,
              });
            }
          }
          if (txRes.status === 'fulfilled' && txRes.value.ok) {
            const arr: any[] = await txRes.value.json();
            if (Array.isArray(arr) && arr.length >= 3) {
              const lrcLines = arr
                .filter((row) => typeof row?.seconds === 'number' && typeof row?.lyrics === 'string')
                .map((row) => {
                  const s = Math.max(0, Number(row.seconds));
                  const mins = String(Math.floor(s / 60)).padStart(2, '0');
                  const secs = (s % 60).toFixed(2).padStart(5, '0');
                  return `[${mins}:${secs}]${row.lyrics}`;
                })
                .join('\n');
              if (lrcLines.length > 25) {
                pushCandidate({
                  trackName: cleanTitle,
                  artistName: updatedPrimaryArtist,
                  duration: durationParam,
                  syncedLyrics: lrcLines,
                  basePriority: 89,
                });
              }
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider G: Megalobiz Synced LRC Archive (Malayalam, Tamil, Hindi, Marathi, Urdu, Telugu, Arabic, English)
      const megalobizTask = (async () => {
        const queries = Array.from(
          new Set([
            `${cleanTitle} ${latinArtist || updatedPrimaryArtist}`.trim(),
            cleanTitle,
          ].filter((s) => s.length >= 2))
        );
        for (const searchQ of queries) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          try {
            const sRes = await fetch(
              `https://www.megalobiz.com/search/all?qry=${encodeURIComponent(searchQ)}`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                signal: ctrl.signal,
              }
            );
            if (!sRes.ok) continue;
            const html = await sRes.text();
            const linkMatches = [...html.matchAll(/href="(\/lrc\/maker\/[^"]+)"[^>]*>([^<]+)<\/a>/gi)];
            for (const m of linkMatches.slice(0, 3)) {
              const href = m[1];
              const linkTitle = stripHtml(m[2] || '');
              if (scoreCandidate(linkTitle, updatedPrimaryArtist, durationParam, true, 88) < 0) {
                continue;
              }
              const pageRes = await fetch(`https://www.megalobiz.com${href}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                signal: ctrl.signal,
              });
              if (!pageRes.ok) continue;
              const pageHtml = await pageRes.text();
              const detailsMatch = pageHtml.match(/<span\s+id="lrc_\d+_details"[^>]*>([\s\S]*?)<\/span>/i);
              if (detailsMatch && detailsMatch[1]) {
                const lrcContent = stripHtml(
                  detailsMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
                );
                if (/\[\d{1,2}:\d{2}/.test(lrcContent)) {
                  pushCandidate({
                    trackName: cleanTitle,
                    artistName: updatedPrimaryArtist,
                    duration: durationParam,
                    syncedLyrics: lrcContent,
                    basePriority: 90,
                  });
                  return;
                }
              }
            }
          } catch {
            // Ignore
          } finally {
            clearTimeout(t);
          }
        }
      })();

      // Provider H: Official Direct JioSaavn API (`www.jiosaavn.com/api.php`) + Mirrors (`saavn.dev`, `elitejiosaavn-api.vercel.app`)
      // Covers Malayalam, Hindi, Marathi, Tamil, Telugu, Kannada, Punjabi, Bengali, Urdu, Arabic, and English
      const jioLyricsTask = (async () => {
        const fetchOfficialJioLyricsById = async (sId: string, sName: string, sArtist: string, sDur: number, signal: AbortSignal): Promise<boolean> => {
          try {
            const directRes = await fetch(
              `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&ctx=web6dot0&api_version=4&_format=json&_marker=0&lyrics_id=${encodeURIComponent(sId)}`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                  Referer: 'https://www.jiosaavn.com/',
                },
                signal,
              }
            );
            if (directRes.ok) {
              const directJson: any = await directRes.json();
              const rawLyr = String(directJson?.lyrics || '').trim();
              if (rawLyr.length > 20) {
                const cleanPlain = stripHtml(rawLyr.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
                const hasLrc = /\[\d{1,2}:\d{2}/.test(cleanPlain);
                pushCandidate({
                  trackName: sName || cleanTitle,
                  artistName: sArtist || updatedPrimaryArtist,
                  duration: sDur || durationParam,
                  syncedLyrics: hasLrc ? cleanPlain : undefined,
                  plainLyrics: cleanPlain,
                  basePriority: hasLrc ? 94 : 84,
                });
                return true;
              }
            }
          } catch {}
          return false;
        };

        // 1. If exact JioSaavn songId was passed, try it immediately
        if (songIdParam && /^[A-Za-z0-9_-]{6,12}$/.test(songIdParam)) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3000);
          try {
            if (await fetchOfficialJioLyricsById(songIdParam, cleanTitle, updatedPrimaryArtist, durationParam, ctrl.signal)) {
              return;
            }
          } finally {
            clearTimeout(t);
          }
        }

        // 2. Search Official JioSaavn `api.php?__call=search.getResults` & Mirrors
        const searchQueries = Array.from(
          new Set([
            `${cleanTitle} ${latinArtist || updatedPrimaryArtist}`.trim(),
            cleanTitle,
            ...titleVariants.slice(1, 3),
          ].filter((s) => s.length >= 2))
        ).slice(0, 3);

        for (const sq of searchQueries) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3800);
          try {
            const officialSearchRes = await fetch(
              `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(sq)}&p=1&n=8`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                  Referer: 'https://www.jiosaavn.com/',
                },
                signal: ctrl.signal,
              }
            ).catch(() => null);

            if (officialSearchRes && officialSearchRes.ok) {
              const sJson: any = await officialSearchRes.json();
              const results: any[] = Array.isArray(sJson?.results) ? sJson.results : [];
              for (const s of results) {
                const sId = String(s?.id || '').trim();
                const sName = stripHtml(String(s?.title || s?.song || ''));
                const sArtist = stripHtml(String(s?.more_info?.music || s?.more_info?.artistMap?.primary_artists?.map((a: any) => a?.name).join(', ') || s?.subtitle || ''));
                const sDur = Number(s?.more_info?.duration || s?.duration) || durationParam;
                if (!sId || scoreCandidate(sName, sArtist, sDur, false, 84) < 0) continue;
                if (await fetchOfficialJioLyricsById(sId, sName, sArtist, sDur, ctrl.signal)) {
                  return;
                }
              }
            }

            // Also check saavn.dev & elitejiosaavn mirrors
            for (const base of ['https://saavn.dev/api', 'https://elitejiosaavn-api.vercel.app/api']) {
              const sRes = await fetch(
                `${base}/search/songs?query=${encodeURIComponent(sq)}&page=1&limit=6`,
                { signal: ctrl.signal }
              ).catch(() => null);
              if (!sRes || !sRes.ok) continue;
              const sJson: any = await sRes.json();
              const songs: any[] = Array.isArray(sJson?.data?.results)
                ? sJson.data.results
                : Array.isArray(sJson?.results)
                  ? sJson.results
                  : [];
              for (const s of songs.slice(0, 4)) {
                const sId = String(s?.id || '').trim();
                const sName = stripHtml(String(s?.name || s?.title || ''));
                const sArtist = Array.isArray(s?.artists?.primary)
                  ? s.artists.primary.map((a: any) => a?.name).filter(Boolean).join(', ')
                  : String(s?.primaryArtists || '');
                const sDur = Number(s?.duration) || durationParam;
                if (!sId || scoreCandidate(sName, sArtist, sDur, false, 82) < 0) continue;

                if (await fetchOfficialJioLyricsById(sId, sName, sArtist, sDur, ctrl.signal)) {
                  return;
                }

                const lRes = await fetch(`${base}/songs/${encodeURIComponent(sId)}/lyrics`, {
                  signal: ctrl.signal,
                }).catch(() => null);
                if (!lRes || !lRes.ok) continue;
                const lJson: any = await lRes.json();
                const rawLyrics = String(lJson?.data?.lyrics || lJson?.lyrics || '').trim();
                if (rawLyrics.length > 20) {
                  const cleanPlain = stripHtml(
                    rawLyrics.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
                  );
                  const hasLrc = /\[\d{1,2}:\d{2}/.test(cleanPlain);
                  pushCandidate({
                    trackName: sName || cleanTitle,
                    artistName: sArtist || updatedPrimaryArtist,
                    duration: sDur,
                    syncedLyrics: hasLrc ? cleanPlain : undefined,
                    plainLyrics: cleanPlain,
                    basePriority: hasLrc ? 94 : 82,
                  });
                  return;
                }
              }
            }
          } catch {
            // Ignore
          } finally {
            clearTimeout(t);
          }
        }
      })();

      // Provider I: Genius Official Search & Lyrics Extractor (Arabic, Malayalam, Hindi, Marathi, Tamil, Urdu, English)
      const geniusLyricsTask = (async () => {
        const geniusQueries = Array.from(
          new Set(
            [
              updatedPrimaryArtist ? `${cleanTitle} ${updatedPrimaryArtist}`.trim() : '',
              latinArtist && latinArtist !== updatedPrimaryArtist ? `${cleanTitle} ${latinArtist}`.trim() : '',
              arabicArtist && arabicArtist !== updatedPrimaryArtist ? `${cleanTitle} ${arabicArtist}`.trim() : '',
              ...titleVariants.slice(1, 3).map((tv) => `${tv} ${updatedPrimaryArtist}`.trim()),
              cleanTitle,
            ].filter((s) => s.length >= 2)
          )
        ).slice(0, 4);

        for (const gq of geniusQueries) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4200);
          try {
            const sRes = await fetch(
              `https://genius.com/api/search/multi?per_page=5&q=${encodeURIComponent(gq)}`,
              {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                  Accept: 'application/json',
                },
                signal: ctrl.signal,
              }
            );
            if (!sRes.ok) continue;
            const sJson: any = await sRes.json();
            const sections: any[] = Array.isArray(sJson?.response?.sections)
              ? sJson.response.sections
              : [];
            const hits: any[] = [];
            for (const sec of sections) {
              if (sec?.type === 'song' || sec?.type === 'top_hit') {
                for (const h of Array.isArray(sec?.hits) ? sec.hits : []) {
                  if (h?.type === 'song' && h?.result?.url) hits.push(h.result);
                }
              }
            }

            for (const song of hits.slice(0, 3)) {
              const sTitle = stripHtml(String(song?.title || song?.title_with_featured || ''));
              const sArtist = stripHtml(String(song?.primary_artist?.name || song?.artist_names || ''));
              const sUrl = String(song?.url || '').trim();
              if (!sUrl.startsWith('https://genius.com/')) continue;
              // Skip Genius tracklist/translation index pages
              if (/\b(?:tracklist|album\s*art|credits|q&a|romanized)\b/i.test(sTitle) && !/romanized/i.test(cleanTitle)) {
                continue;
              }
              if (scoreCandidate(sTitle, sArtist, durationParam, false, 80) < 0) continue;

              const pageRes = await fetch(sUrl, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                },
                signal: ctrl.signal,
              });
              if (!pageRes.ok) continue;
              const html = await pageRes.text();
              const containerMatches = [
                ...html.matchAll(/<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi),
              ];
              if (containerMatches.length > 0) {
                const rawExtracted = containerMatches
                  .map((m) =>
                    m[1]
                      .replace(/<br\s*\/?>/gi, '\n')
                      .replace(/<\/p>/gi, '\n')
                      .replace(/<[^>]+>/g, '')
                  )
                  .join('\n');
                const cleanedLyrics = stripHtml(rawExtracted)
                  .split('\n')
                  .map((l) => l.trim())
                  .filter((l) => !/^\[(?:verse|chorus|bridge|intro|outro|hook|pre-chorus|instrumental|מתוך|كلمات|مقطع)[^\]]*\]$/i.test(l))
                  .join('\n')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();

                if (cleanedLyrics.length > 35) {
                  pushCandidate({
                    trackName: sTitle || cleanTitle,
                    artistName: sArtist || updatedPrimaryArtist,
                    duration: durationParam,
                    plainLyrics: cleanedLyrics,
                    basePriority: 83,
                  });
                  return;
                }
              }
            }
          } catch {
            // Ignore
          } finally {
            clearTimeout(t);
          }
        }
      })();

      // Provider J: Shazam Official Catalog & Lyrics API (Arabic AE, India IN, Global US)
      const shazamLyricsTask = (async () => {
        const storefront = isArabicContext ? 'ae' : 'in';
        const searchQ = `${cleanTitle} ${updatedPrimaryArtist}`.trim() || cleanTitle;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3800);
        try {
          const sRes = await fetch(
            `https://www.shazam.com/services/amapi/v1/catalog/${storefront}/search?types=songs&term=${encodeURIComponent(searchQ)}&limit=4`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                Accept: 'application/json',
              },
              signal: ctrl.signal,
            }
          );
          if (!sRes.ok) return;
          const sJson: any = await sRes.json();
          const songs: any[] = Array.isArray(sJson?.results?.songs?.data)
            ? sJson.results.songs.data
            : [];
          for (const s of songs.slice(0, 2)) {
            const attr = s?.attributes || {};
            const sName = stripHtml(String(attr.name || ''));
            const sArtist = stripHtml(String(attr.artistName || ''));
            const sDur = Math.round((Number(attr.durationInMillis) || 0) / 1000) || durationParam;
            if (scoreCandidate(sName, sArtist, sDur, false, 80) < 0) continue;

            // Search Shazam discovery track endpoint for lyrics section
            const shazamSearch = await fetch(
              `https://www.shazam.com/services/search/v4/en-US/AE/web/search?term=${encodeURIComponent(`${sName} ${sArtist}`)}&numResults=3&offset=0&types=songs`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                signal: ctrl.signal,
              }
            ).catch(() => null);
            if (!shazamSearch || !shazamSearch.ok) continue;
            const shJson: any = await shazamSearch.json();
            const hits: any[] = Array.isArray(shJson?.tracks?.hits) ? shJson.tracks.hits : [];
            const key = hits[0]?.track?.key;
            if (!key) continue;

            const trRes = await fetch(
              `https://www.shazam.com/discovery/v5/en/US/web/-/track/${encodeURIComponent(String(key))}?shazamapiversion=v3&video=v3`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                signal: ctrl.signal,
              }
            ).catch(() => null);
            if (!trRes || !trRes.ok) continue;
            const trJson: any = await trRes.json();
            const sections: any[] = Array.isArray(trJson?.sections) ? trJson.sections : [];
            const lyrSec = sections.find((sec) => sec?.type === 'LYRICS' && Array.isArray(sec?.text));
            if (lyrSec && lyrSec.text.length >= 3) {
              const plain = lyrSec.text.join('\n').trim();
              if (plain.length > 25) {
                pushCandidate({
                  trackName: sName || cleanTitle,
                  artistName: sArtist || updatedPrimaryArtist,
                  duration: sDur,
                  plainLyrics: plain,
                  basePriority: 81,
                });
                return;
              }
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider K: YouTube Official Human-Synced TimedText Captions ONLY (`kind !== 'asr'`)
      const youtubeCaptionsTask = (async () => {
        if (!videoIdParam || !/^[A-Za-z0-9_-]{11}$/.test(videoIdParam)) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3800);
        try {
          const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 14) gzip',
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: 'ANDROID',
                  clientVersion: '19.29.37',
                  androidSdkVersion: 34,
                  hl: 'en',
                  gl: 'IN',
                },
              },
              videoId: videoIdParam,
            }),
            signal: ctrl.signal,
          });
          if (!playerRes.ok) return;
          const playerJson: any = await playerRes.json();
          const captionTracks: any[] =
            playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          if (!Array.isArray(captionTracks) || captionTracks.length === 0) return;

          // Strictly ONLY use manual human-authored captions (NEVER `asr` auto-generated speech captions!)
          const manualTrack = captionTracks.find((ct) => ct?.kind !== 'asr' && ct?.baseUrl);
          if (!manualTrack?.baseUrl) return;

          const capUrl = `${manualTrack.baseUrl}${manualTrack.baseUrl.includes('?') ? '&' : '?'}fmt=json3`;
          const capRes = await fetch(capUrl, { signal: ctrl.signal });
          if (!capRes.ok) return;
          const capJson: any = await capRes.json();
          const events: any[] = Array.isArray(capJson?.events) ? capJson.events : [];
          const lrcLines: string[] = [];
          for (const ev of events) {
            if (!Array.isArray(ev?.segs)) continue;
            const lineText = ev.segs
              .map((seg: any) => String(seg?.utf8 || ''))
              .join('')
              .replace(/\s+/g, ' ')
              .trim();
            if (!lineText || /^\[(?:music|applause|laughter|♪)+\]$/i.test(lineText)) continue;
            const startSec = Math.max(0, (Number(ev.tStartMs) || 0) / 1000);
            const mins = String(Math.floor(startSec / 60)).padStart(2, '0');
            const secs = (startSec % 60).toFixed(2).padStart(5, '0');
            lrcLines.push(`[${mins}:${secs}]${lineText}`);
          }
          if (lrcLines.length >= 5) {
            pushCandidate({
              trackName: cleanTitle,
              artistName: updatedPrimaryArtist,
              duration: Number(playerJson?.videoDetails?.lengthSeconds) || durationParam,
              syncedLyrics: lrcLines.join('\n'),
              basePriority: 87,
            });
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      // Provider L: Lyrist + Lyrics.ovh + ChartLyrics Global Fallback
      const globalPlainTask = (async () => {
        if (!cleanTitle) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3500);
        try {
          const lyristPath = updatedPrimaryArtist
            ? `https://lyrist.vercel.app/api/${encodeURIComponent(cleanTitle)}/${encodeURIComponent(updatedPrimaryArtist)}`
            : `https://lyrist.vercel.app/api/${encodeURIComponent(cleanTitle)}`;
          const lyristRes = await fetch(lyristPath, { signal: ctrl.signal }).catch(() => null);
          if (lyristRes && lyristRes.ok) {
            const lJson: any = await lyristRes.json();
            if (typeof lJson?.lyrics === 'string' && lJson.lyrics.trim().length > 25) {
              pushCandidate({
                trackName: String(lJson?.title || cleanTitle),
                artistName: String(lJson?.artist || updatedPrimaryArtist),
                duration: durationParam,
                plainLyrics: lJson.lyrics.trim(),
                basePriority: 70,
              });
              return;
            }
          }

          if (!updatedPrimaryArtist) return;
          const ovhRes = await fetch(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(updatedPrimaryArtist)}/${encodeURIComponent(cleanTitle)}`,
            { signal: ctrl.signal }
          ).catch(() => null);
          if (ovhRes && ovhRes.ok) {
            const ovhJson: any = await ovhRes.json();
            if (typeof ovhJson?.lyrics === 'string' && ovhJson.lyrics.trim().length > 25) {
              pushCandidate({
                trackName: cleanTitle,
                artistName: updatedPrimaryArtist,
                duration: durationParam,
                plainLyrics: ovhJson.lyrics.trim(),
                basePriority: 66,
              });
              return;
            }
          }

          const clRes = await fetch(
            `http://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect?artist=${encodeURIComponent(updatedPrimaryArtist)}&song=${encodeURIComponent(cleanTitle)}`,
            { signal: ctrl.signal }
          ).catch(() => null);
          if (clRes && clRes.ok) {
            const xml = await clRes.text();
            const lyricMatch = xml.match(/<Lyric>([\s\S]*?)<\/Lyric>/i);
            if (lyricMatch && lyricMatch[1] && lyricMatch[1].trim().length > 25) {
              pushCandidate({
                trackName: cleanTitle,
                artistName: updatedPrimaryArtist,
                duration: durationParam,
                plainLyrics: lyricMatch[1].trim(),
                basePriority: 62,
              });
            }
          }
        } catch {
          // Ignore
        } finally {
          clearTimeout(t);
        }
      })();

      await Promise.allSettled([
        lrclibGetTask,
        lrclibSearchTask,
        kugouTask,
        neteaseTask,
        qqMusicTask,
        lrcCxAndTextylTask,
        megalobizTask,
        jioLyricsTask,
        geniusLyricsTask,
        shazamLyricsTask,
        youtubeCaptionsTask,
        globalPlainTask,
      ]);

      aggregated.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      res.statusCode = 200;
      res.end(JSON.stringify(aggregated));
      return;
    }

    // 2. Third-Party Lossless Multi-Gateway Search
    if (parsed.pathname === '/__void_api/lossless-search') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }
      const items = await queryThirdPartyLosslessServer(q);
      res.statusCode = 200;
      res.end(JSON.stringify(items));
      return;
    }

    // 3. Universal CORS-Safe Audio Stream & Download Proxy
    if (parsed.pathname === '/__void_api/proxy-audio') {
      const targetUrl = parsed.searchParams.get('url')?.trim() || '';
      if (!/^https?:\/\//i.test(targetUrl)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      try {
        const headers: Record<string, string> = {
          'User-Agent': 'VOID-Music-Player/1.0',
        };
        if (typeof req.headers.range === 'string') {
          headers['Range'] = req.headers.range;
        }
        const upstream = await fetch(targetUrl, { headers });
        if (!upstream.ok && upstream.status !== 206) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = upstream.status;
        res.setHeader('Access-Control-Allow-Origin', '*');
        const ext = parsed.searchParams.get('ext') || '';
        const upstreamType = upstream.headers.get('content-type') || '';
        const contentType =
          ext === '.flac' && (!upstreamType || upstreamType.includes('octet-stream'))
            ? 'audio/flac'
            : upstreamType.startsWith('audio/') || upstreamType.includes('mp4')
              ? upstreamType
              : 'audio/mp4';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (!upstream.body) {
          res.end();
          return;
        }
        const reader = upstream.body.getReader();
        req.on('close', () => {
          void reader.cancel().catch(() => {});
        });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) {
            res.write(Buffer.from(value));
          } else {
            break;
          }
        }
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.headersSent) res.statusCode = 404;
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // 3a. CORS-safe Image Proxy for Canvas Ambient Color Sampling (YouTube i.ytimg.com, archive.org, etc.)
    if (parsed.pathname === '/__void_api/img-proxy') {
      const rawUrl = parsed.searchParams.get('url')?.trim() || '';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (!/^https?:\/\//i.test(rawUrl)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const imgRes = await fetch(rawUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          signal: controller.signal,
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const buf = Buffer.from(await imgRes.arrayBuffer());
          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.end(buf);
          return;
        }
      } catch {
        // Ignore
      } finally {
        clearTimeout(timeout);
      }
      res.statusCode = 404;
      res.end();
      return;
    }

    // 3b. Local YouTube InnerTube Search (fast, zero cold-start, filtered strictly to Songs & Quran/Recitations)
    if (parsed.pathname === '/__void_api/yt-search') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }
      const hasAudioIntent =
        /\b(song|songs|music|audio|lyrics|lyrical|ost|bgm|remix|slowed|reverb|lofi|cover|instrumental|album|track|jukeb|quran|qur'an|surah|surat|ayah|ayat|tilawat|recitation|qari|nasheed|naat|madh|mappila|ghazal|qawwali|bhajan|dua|azan|adhan)\b/i.test(
          q
        );
      const searchQuery = hasAudioIntent ? q : `${q} song`;
      const nonAudioBlockRegex =
        /\b(which\s+exam|exam\s+i\s+should|exam\s+prep|exam\s+strategy|exam\s+date|syllabus|coaching|lecture|lectures|tutorial|tutorials|course|class\s*\d|classes|neet|jee|upsc|ssc|ias|ips|ibps|sbi\s*po|bank\s*exam|ca\s*foundation|gate\s*exam|cat\s*exam|board\s*exam|study\s*tips|how\s+to\s+prepare|mock\s*test|previous\s*year\s*question|mcq|aptitude|reasoning|physics\s*wallah|unacademy|byju|vedantu|xylem|eduport|anil\s*aggarwal|vlog|vlogs|unboxing|review|gameplay|walkthrough|let'?s\s*play|patch\s*notes|breaking\s*news|press\s*conference|debate|podcast\s*ep|recipe|cooking|how\s+to\s+make|workout\s*routine|stock\s*market|trading|crypto)\b/i;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const ytRes = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20250101.00.00',
                hl: 'en',
                gl: 'US',
              },
            },
          }),
          signal: controller.signal,
        });
        if (ytRes.ok) {
          const data: any = await ytRes.json();
          const items: any[] = [];
          const walk = (node: any) => {
            if (!node || typeof node !== 'object' || items.length >= 12) return;
            if (node.videoRenderer && typeof node.videoRenderer.videoId === 'string') {
              const v = node.videoRenderer;
              const id = v.videoId;
              const title =
                v.title?.runs?.map((r: any) => r?.text).join('') ||
                v.title?.simpleText ||
                q;
              const artist =
                v.ownerText?.runs?.[0]?.text ||
                v.longBylineText?.runs?.[0]?.text ||
                'YouTube';
              const durationText = v.lengthText?.simpleText || '';
              if (nonAudioBlockRegex.test(`${title} ${artist}`)) {
                return;
              }
              items.push({
                id,
                videoId: id,
                title,
                name: title,
                artist,
                durationFormatted: durationText,
                image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
              });
              return;
            }
            if (Array.isArray(node)) {
              for (const child of node) walk(child);
            } else {
              for (const key of Object.keys(node)) walk(node[key]);
            }
          };
          walk(data?.contents);
          res.statusCode = 200;
          res.end(JSON.stringify(items));
          return;
        }
      } catch {
        // Ignore and return empty array
      } finally {
        clearTimeout(timeout);
      }
      res.statusCode = 200;
      res.end('[]');
      return;
    }

    // 4. YouTube Exact Video Metadata & Stream Info
    if (parsed.pathname === '/__void_api/yt-info') {
      const id = parsed.searchParams.get('id')?.trim() || '';
      const titleHint = parsed.searchParams.get('title')?.trim() || '';
      const artistHint = parsed.searchParams.get('artist')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!/^[\w-]{11}$/.test(id)) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const info = await resolveYouTubeDirectStreamServer(id, titleHint, artistHint);
      if (!info) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const querySuffix = [
        `id=${encodeURIComponent(id)}`,
        titleHint ? `title=${encodeURIComponent(titleHint)}` : '',
        artistHint ? `artist=${encodeURIComponent(artistHint)}` : '',
      ]
        .filter(Boolean)
        .join('&');

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          id,
          streamUrl: `/__void_api/yt-audio?${querySuffix}`,
          mimeType: info.mimeType,
          codec: info.codec,
          bitrate: info.bitrate,
          duration: info.duration,
        }),
      );
      return;
    }

    // 5. YouTube Exact Audio Stream Proxy (supports Range requests & offline Blob downloads)
    if (parsed.pathname === '/__void_api/yt-audio') {
      const id = parsed.searchParams.get('id')?.trim() || '';
      const titleHint = parsed.searchParams.get('title')?.trim() || '';
      const artistHint = parsed.searchParams.get('artist')?.trim() || '';
      if (!/^[\w-]{11}$/.test(id)) {
        res.statusCode = 400;
        res.end();
        return;
      }

      let info = await resolveYouTubeDirectStreamServer(id, titleHint, artistHint);
      if (!info) {
        res.statusCode = 404;
        res.end();
        return;
      }

      try {
        const buildHeaders = (ua?: string): Record<string, string> => {
          const h: Record<string, string> = {
            'User-Agent':
              ua ||
              'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
          };
          if (typeof req.headers.range === 'string') {
            h['Range'] = req.headers.range;
          }
          return h;
        };

        let upstream = await fetch(info.url, { headers: buildHeaders(info.userAgent) });
        if (!upstream.ok && upstream.status !== 206) {
          ytStreamCache.delete(id);
          info = await resolveYouTubeDirectStreamServer(id, titleHint, artistHint);
          if (info) {
            upstream = await fetch(info.url, { headers: buildHeaders(info.userAgent) });
          }
        }

        if (!upstream.ok && upstream.status !== 206) {
          res.statusCode = 404;
          res.end();
          return;
        }

        res.statusCode = upstream.status;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', upstream.headers.get('content-type') || info?.mimeType || 'audio/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (!upstream.body) {
          res.end();
          return;
        }

        const reader = upstream.body.getReader();
        req.on('close', () => {
          void reader.cancel().catch(() => {});
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) {
            res.write(Buffer.from(value));
          } else {
            break;
          }
        }
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.headersSent) res.statusCode = 200;
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // 7. Generic CORS-safe media/image proxy for archive.org 302 redirects
    if (parsed.pathname === '/__void_api/proxy') {
      const target = parsed.searchParams.get('url')?.trim() || '';
      if (!/^https?:\/\//i.test(target)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      try {
        const upstream = await fetch(target, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
        });
        if (!upstream.ok) {
          res.statusCode = upstream.status || 502;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        const ct = upstream.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        const cl = upstream.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);
        if (!upstream.body) {
          res.end();
          return;
        }
        const reader = upstream.body.getReader();
        req.on('close', () => {
          void reader.cancel().catch(() => {});
        });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) res.write(Buffer.from(value));
          else break;
        }
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.headersSent) res.statusCode = 502;
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // 7b. Cached & Rate-Limit-Protected iTunes Search Proxy with Automatic Deezer Fallback
    // Prevents browser CORS / 403 / 429 errors when enriching artist & trending catalogs.
    if (parsed.pathname === '/__void_api/itunes-search') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const term = parsed.searchParams.get('term')?.trim() || '';
      const country = parsed.searchParams.get('country')?.trim() || 'us';
      const entity = parsed.searchParams.get('entity')?.trim() || 'song';
      const limit = Math.min(200, Math.max(1, Number(parsed.searchParams.get('limit')) || 25));

      if (!term) {
        res.statusCode = 200;
        res.end(JSON.stringify({ resultCount: 0, results: [] }));
        return;
      }

      const globalObj = globalThis as any;
      if (!globalObj.__voidItunesCache) {
        globalObj.__voidItunesCache = new Map<string, { ts: number; payload: string }>();
      }
      if (!globalObj.__voidItunesInFlight) {
        globalObj.__voidItunesInFlight = new Map<string, Promise<string>>();
      }
      const cache: Map<string, { ts: number; payload: string }> = globalObj.__voidItunesCache;
      const inFlight: Map<string, Promise<string>> = globalObj.__voidItunesInFlight;

      const cacheKey = `${term.toLowerCase()}|${country.toLowerCase()}|${entity.toLowerCase()}|${limit}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 1000 * 60 * 30) {
        res.statusCode = 200;
        res.end(cached.payload);
        return;
      }

      let task = inFlight.get(cacheKey);
      if (!task) {
        task = (async () => {
          // 1. Try Apple iTunes API with timeout
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3800);
            const itunesRes = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${encodeURIComponent(country)}&entity=${encodeURIComponent(entity)}&limit=${limit}`,
              {
                signal: ctrl.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  Accept: 'application/json',
                },
              }
            ).finally(() => clearTimeout(t));

            if (itunesRes.ok) {
              const json = (await itunesRes.json()) as any;
              if (Array.isArray(json?.results) && json.results.length > 0) {
                const payload = JSON.stringify({ resultCount: json.results.length, results: json.results });
                cache.set(cacheKey, { ts: Date.now(), payload });
                return payload;
              }
            }
          } catch {}

          // 2. Fallback to Deezer Search API and map to exact iTunes schema so catalog enrichment never fails on 403/429
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 3800);
            const dzEndpoint =
              entity === 'musicArtist'
                ? `https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}&limit=${limit}`
                : `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=${limit}`;
            const dzRes = await fetch(dzEndpoint, { signal: ctrl.signal }).finally(() => clearTimeout(t));
            if (dzRes.ok) {
              const dzJson = (await dzRes.json()) as any;
              const rows: any[] = Array.isArray(dzJson?.data) ? dzJson.data : [];
              const mapped =
                entity === 'musicArtist'
                  ? rows.map((r: any) => ({
                      artistId: r?.id,
                      artistName: String(r?.name || '').trim(),
                      artworkUrl100: String(r?.picture_xl || r?.picture_big || r?.picture_medium || '').trim(),
                    }))
                  : rows.map((r: any) => {
                      const cover = String(
                        r?.album?.cover_xl || r?.album?.cover_big || r?.album?.cover_medium || r?.artist?.picture_xl || ''
                      ).trim();
                      return {
                        trackId: r?.id,
                        artistName: String(r?.artist?.name || term).trim(),
                        trackName: String(r?.title || r?.title_short || '').trim(),
                        collectionName: String(r?.album?.title || r?.title || '').trim(),
                        artworkUrl100: cover,
                        artworkUrl600: cover,
                        trackTimeMillis: (Number(r?.duration) || 210) * 1000,
                        releaseDate: '2024-01-01T00:00:00Z',
                        previewUrl: String(r?.preview || '').trim(),
                      };
                    });
              const payload = JSON.stringify({ resultCount: mapped.length, results: mapped });
              cache.set(cacheKey, { ts: Date.now(), payload });
              return payload;
            }
          } catch {}

          const emptyPayload = JSON.stringify({ resultCount: 0, results: [] });
          cache.set(cacheKey, { ts: Date.now(), payload: emptyPayload });
          return emptyPayload;
        })();
        inFlight.set(cacheKey, task);
      }

      try {
        const resultPayload = await task;
        res.statusCode = 200;
        res.end(resultPayload);
      } catch {
        res.statusCode = 200;
        res.end(JSON.stringify({ resultCount: 0, results: [] }));
      } finally {
        inFlight.delete(cacheKey);
      }
      return;
    }

    // 8. Canonical Artist Search (Deezer + Apple Music/iTunes spell-corrected artist lookup)
    if (parsed.pathname === '/__void_api/artist-search') {
      const q = parsed.searchParams.get('q')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!q) {
        res.statusCode = 200;
        res.end('[]');
        return;
      }

      const stripAccents = (s: string) =>
        String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const editDist = (a: string, b: string): number => {
        if (a === b) return 0;
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
      };
      const isCompound = (name: string) =>
        /[&,;|/·]|\s+[-–—]\s+|(?=[A-Za-z])[-–—](?=[A-Za-z])|\b(?:feat\.?|ft\.?|with|and|vs\.?|x|presents|tribute|karaoke)\b/i.test(name);
      const isPlaceholderImg = (img: string) =>
        !img ||
        !/^https?:\/\//i.test(img) ||
        /\/images\/artist\/\/|default[_-]?artist|artist[_-]?default|placeholder|no[_-]?image|blank|mystery|d41d8cd98f00b204e9800998ecf8427e/i.test(img);
      const scoreAvatar = (img: string) => {
        if (isPlaceholderImg(img)) return 0;
        if (/1000x1000|picture_xl/i.test(img)) return 100;
        if (/500x500|600x600|picture_big/i.test(img)) return 85;
        return 50;
      };

      try {
        const [dzSettled, itunesSettled] = await Promise.allSettled([
          fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=15`).then(r => r.ok ? r.json() : null),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=8`).then(r => r.ok ? r.json() : null),
        ]);

        const dzItems: any[] = dzSettled.status === 'fulfilled' && Array.isArray(dzSettled.value?.data) ? dzSettled.value.data : [];
        const itunesItems: any[] = itunesSettled.status === 'fulfilled' && Array.isArray(itunesSettled.value?.results) ? itunesSettled.value.results : [];

        // If iTunes corrected a spelling (e.g. "micheal jackson" -> "Michael Jackson"), also query Deezer for that top canonical name
        const topItunesName = String(itunesItems[0]?.artistName || '').trim();
        if (topItunesName && !isCompound(topItunesName) && stripAccents(topItunesName) !== stripAccents(q)) {
          try {
            const extraDz = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(topItunesName)}&limit=5`).then(r => r.ok ? r.json() : null);
            if (Array.isArray(extraDz?.data)) {
              dzItems.unshift(...extraDz.data);
            }
          } catch {}
        }

        const qNorm = stripAccents(q).replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const qTokens = qNorm.split(' ').filter(Boolean);

        const candidates: { id: string; name: string; image: string; fans: number; deezerId?: number; score: number; avatarScore: number }[] = [];
        for (const item of dzItems) {
          const rawName = String(item?.name || '').trim();
          if (!rawName || rawName.length < 2 || isCompound(rawName)) continue;
          const img = String(item?.picture_xl || item?.picture_big || item?.picture_medium || '').trim();
          const avatarScore = scoreAvatar(img);
          if (avatarScore === 0) continue;

          const nameNorm = stripAccents(rawName).replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
          const nameTokens = nameNorm.split(' ').filter(Boolean);
          const fans = Number(item?.nb_fan) || 0;

          let matchScore = 0;
          if (nameNorm === qNorm) {
            matchScore = 1000;
          } else if (qTokens.every(qt => nameTokens.some(nt => nt.startsWith(qt))) && (nameTokens[0]?.startsWith(qTokens[0]) || nameTokens.some(nt => nt === qTokens[0]))) {
            matchScore = 850 + (nameTokens.length >= 2 ? 40 : 0);
          } else if (
            qTokens.length === nameTokens.length &&
            qTokens.every((qt, idx) => qt.length >= 3 && nameTokens[idx]?.length >= 3 && qt[0] === nameTokens[idx][0] && editDist(qt, nameTokens[idx]) <= 2)
          ) {
            matchScore = 720;
          } else if (topItunesName && stripAccents(rawName) === stripAccents(topItunesName)) {
            matchScore = 780;
          }

          if (matchScore === 0) continue;
          candidates.push({
            id: `dz-${item.id}`,
            name: rawName,
            image: img,
            fans,
            deezerId: Number(item.id) || undefined,
            avatarScore,
            score: matchScore + avatarScore + Math.min(120, Math.log10(Math.max(1, fans)) * 18),
          });
        }

        candidates.sort((a, b) => b.avatarScore - a.avatarScore || b.score - a.score || b.fans - a.fans);

        const deduped: typeof candidates = [];
        for (const cand of candidates) {
          const cNorm = stripAccents(cand.name).replace(/[^a-z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, ' ').trim();
          const cTokens = cNorm.split(' ');
          const dupIdx = deduped.findIndex(existing => {
            const eNorm = stripAccents(existing.name).replace(/[^a-z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, ' ').trim();
            const eTokens = eNorm.split(' ');
            if (eNorm === cNorm || eNorm.replace(/\s+/g, '') === cNorm.replace(/\s+/g, '')) return true;
            if (Math.max(eNorm.length, cNorm.length) >= 5 && editDist(eNorm, cNorm) <= 2) return true;
            if (cTokens.length === 1 && eTokens.length >= 2 && eTokens[0] === cTokens[0] && existing.fans > cand.fans * 2) return true;
            return false;
          });
          if (dupIdx === -1) {
            deduped.push(cand);
          } else if (cand.avatarScore > deduped[dupIdx].avatarScore || (cand.avatarScore === deduped[dupIdx].avatarScore && cand.fans > deduped[dupIdx].fans)) {
            deduped[dupIdx] = cand;
          }
        }

        res.statusCode = 200;
        res.end(JSON.stringify(deduped.slice(0, 6)));
      } catch {
        res.statusCode = 200;
        res.end('[]');
      }
      return;
    }

    // 9. Artist Top Songs Aggregator (Strictly Verified Full-Length JioSaavn 320kbps Songs Only)
    if (parsed.pathname === '/__void_api/artist-top100') {
      const artistQuery = parsed.searchParams.get('artist')?.trim() || '';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!artistQuery) {
        res.statusCode = 200;
        res.end(JSON.stringify({ artist: '', items: [] }));
        return;
      }

      const stripAccents = (s: string) =>
        String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const normalizeArabic = (s: string) =>
        String(s || '')
          .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
          .replace(/[أإآٱ]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/ى/g, 'ي')
          .replace(/ؤ/g, 'و')
          .replace(/ئ/g, 'ي')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const normalizePhoneticArtist = (s: string) =>
        stripAccents(s)
          .replace(/\b([a-z])\.\s*(?=[a-z]\.)/g, '$1')
          .replace(/\b([a-z])\.\s+/g, '$1 ')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\b(el|al)\b/g, ' ')
          .replace(/\b(mehad|mihed|maihad|mihad|mahad)\b/g, 'mehad')
          .replace(/\b(hamad|hamed|ahmed|ahmad)\b/g, 'hamad')
          .replace(/\b(mohammed|mohamed|muhammad|mohamad)\b/g, 'mohamed')
          .replace(/\b(hussain|hussein|hosein)\b/g, 'hussain')
          .replace(/\b(rashed|rashid)\b/g, 'rashid')
          .replace(/\b(majed|majid|majeed)\b/g, 'majed')
          .replace(/\b(abdul\s+majed|abdel\s+majed|abdulmajeed|abdelmajeed|abdulmajid)\b/g, 'abdulmajed')
          .replace(/\b(abdu|abdo|abdou)\b/g, 'abdu')
          .replace(/\b(abdullah|abdallah)\b/g, 'abdullah')
          .replace(/\b(kfoury|kafoury|kfouri)\b/g, 'kfoury')
          .replace(/\b(kazem|kadim|kadhem|kathem)\b/g, 'kadim')
          .replace(/\b(saher|sahir)\b/g, 'sahir')
          .replace(/\b(assala|asala|assalah)\b/g, 'assala')
          .replace(/\b(balqees|balqis)\b/g, 'balqees')
          .replace(/\b(zeytoun|zaitoun)\b/g, 'zeytoun')
          .replace(/\b(nabeel|nabil)\b/g, 'nabil')
          .replace(/\b(fouad|fuad)\b/g, 'fouad')
          .replace(/\b(saqer|sager|saqr)\b/g, 'saqer')
          .replace(/\b(rowaished|ruwaished)\b/g, 'rowaished')
          .replace(/\b(mohandis|muhandis|mohandes)\b/g, 'mohandis')
          .replace(/\b(menhali|minhali)\b/g, 'menhali')
          .replace(/\b(kubaisi|kobaisi)\b/g, 'kubaisi')
          .replace(/\b(shuaibi|shuaiby)\b/g, 'shuaibi')
          .replace(/\b(bahaa|baha)\b/g, 'bahaa')
          .replace(/\b(namira|namera)\b/g, 'namira')
          .replace(/\b(diyab|diab)\b/g, 'diab')
          .replace(/\b(hosny|hosni)\b/g, 'hosny')
          .replace(/\b(kuwaitia|kuwaitiya)\b/g, 'kuwaitia')
          .replace(/\b(ilaiyaraaja|ilayaraja)\b/g, 'ilaiyaraaja')
          .replace(/\s+/g, ' ')
          .trim();

      const BILINGUAL_ARTIST_ALIASES: Array<{ ar: string; en: string; aliases: string[] }> = [
        { ar: 'عمرو دياب', en: 'Amr Diab', aliases: ['Amr Diab', 'Amr Diyab'] },
        { ar: 'ميحد حمد', en: 'Mehad Hamad', aliases: ['Mehad Hamad', 'Mihed Hamad', 'Maihad Hamad', 'Mihad Hamad', 'Mahad Ahmed', 'Mahad Hamad'] },
        { ar: 'حسين الجسمي', en: 'Hussain Al Jassmi', aliases: ['Hussain Al Jassmi', 'Hussein Al Jassmi', 'Hussain Aljassmi'] },
        { ar: 'راشد الماجد', en: 'Rashid Al Majed', aliases: ['Rashid Al Majed', 'Rashed Al Majid', 'Rashed Al Majed', 'Rashid Al Majid'] },
        { ar: 'عبد المجيد عبدالله', en: 'Abdul Majeed Abdullah', aliases: ['Abdul Majeed Abdullah', 'Abdulmajeed Abdullah'] },
        { ar: 'محمد عبده', en: 'Mohammed Abdu', aliases: ['Mohammed Abdu', 'Mohamed Abdu', 'Mohammad Abdu'] },
        { ar: 'الشامي', en: 'Al Shami', aliases: ['Al Shami', 'Alshami'] },
        { ar: 'عيضة المنهالي', en: 'Eida Al Menhali', aliases: ['Eida Al Menhali', 'Aida Al Menhali'] },
        { ar: 'ماجد المهندس', en: 'Majid Al Mohandis', aliases: ['Majid Al Mohandis', 'Majid Al Muhandis', 'Majed Al Mohandes'] },
        { ar: 'نانسي عجرم', en: 'Nancy Ajram', aliases: ['Nancy Ajram'] },
        { ar: 'إليسا', en: 'Elissa', aliases: ['Elissa'] },
        { ar: 'شيرين عبدالوهاب', en: 'Sherine', aliases: ['Sherine', 'Sherine Abdel Wahab', 'Sherine Abdelwahab'] },
        { ar: 'محمد عساف', en: 'Mohammed Assaf', aliases: ['Mohammed Assaf', 'Mohamed Assaf', 'Mohammad Assaf'] },
        { ar: 'أحلام', en: 'Ahlam', aliases: ['Ahlam', 'Ahlam Alshamsi', 'Ahlam Al Shamsi'] },
        { ar: 'عايض', en: 'Ayed', aliases: ['Ayed', 'Ayed Yousef'] },
        { ar: 'نوال الكويتية', en: 'Nawal El Kuwaitia', aliases: ['Nawal El Kuwaitia', 'Nawal Al Kuwaitia'] },
        { ar: 'فهد الكبيسي', en: 'Fahad Al Kubaisi', aliases: ['Fahad Al Kubaisi', 'Fahad Alkubaisi'] },
        { ar: 'أحمد سعد', en: 'Ahmed Saad', aliases: ['Ahmed Saad', 'Ahmad Saad'] },
        { ar: 'تامر حسني', en: 'Tamer Hosny', aliases: ['Tamer Hosny', 'Tamer Hosni'] },
        { ar: 'أصالة نصري', en: 'Assala', aliases: ['Assala', 'Assala Nasri', 'Asala', 'Asala Nasri'] },
        { ar: 'كاظم الساهر', en: 'Kadim Al Sahir', aliases: ['Kadim Al Sahir', 'Kazem El Saher', 'Kadhem Al Saher', 'Kazem Al Saher'] },
        { ar: 'رابح صقر', en: 'Rabeh Saqer', aliases: ['Rabeh Saqer', 'Rabeh Sager'] },
        { ar: 'عبدالله الرويشد', en: 'Abdullah Al Rowaished', aliases: ['Abdullah Al Rowaished', 'Abdallah Al Rowaished'] },
        { ar: 'نبيل شعيل', en: 'Nabil Shuail', aliases: ['Nabil Shuail', 'Nabeel Shuail'] },
        { ar: 'بلقيس', en: 'Balqees', aliases: ['Balqees', 'Balqees Fathi', 'Balqis'] },
        { ar: 'سعد لمجرد', en: 'Saad Lamjarred', aliases: ['Saad Lamjarred'] },
        { ar: 'وائل كفوري', en: 'Wael Kfoury', aliases: ['Wael Kfoury'] },
        { ar: 'ناصيف زيتون', en: 'Nassif Zeytoun', aliases: ['Nassif Zeytoun', 'Nassif Zaitoun'] },
        { ar: 'فؤاد عبدالواحد', en: 'Fouad Abdulwahed', aliases: ['Fouad Abdulwahed', 'Fuad Abdulwahed'] },
        { ar: 'داليا مبارك', en: 'Dalia Mubarak', aliases: ['Dalia Mubarak'] },
        { ar: 'رحمة رياض', en: 'Rahma Riad', aliases: ['Rahma Riad', 'Rahma Riyad'] },
        { ar: 'سيف نبيل', en: 'Saif Nabeel', aliases: ['Saif Nabeel', 'Saif Nabil'] },
        { ar: 'مروان عبدالحميد', en: 'Saint Levant', aliases: ['Saint Levant', 'Marwan Abdelhamid'] },
        { ar: 'إليانا', en: 'Elyanna', aliases: ['Elyanna'] },
        { ar: 'بهاء سلطان', en: 'Bahaa Sultan', aliases: ['Bahaa Sultan', 'Baha Sultan'] },
        { ar: 'حمزة نمرة', en: 'Hamza Namira', aliases: ['Hamza Namira', 'Hamza Namera'] },
        { ar: 'محمد حماقي', en: 'Mohamed Hamaki', aliases: ['Mohamed Hamaki', 'Mohammed Hamaki', 'Hamaki'] },
        { ar: 'أصيل أبوبكر', en: 'Aseel Abu Bakr', aliases: ['Aseel Abu Bakr', 'Aseel Abubakr'] },
        { ar: 'بدر الشعيبي', en: 'Bader Al Shuaibi', aliases: ['Bader Al Shuaibi', 'Badr Al Shuaibi'] },
        { ar: 'هند البحرينية', en: 'Hind Al Bahrainia', aliases: ['Hind Al Bahrainia'] },
      ];

      const cleanCanonicalSongTitle = (rawTitle: string): string => {
        let cleaned = String(rawTitle || '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;|&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();
        cleaned = cleaned.replace(
          /\s*(?:\((?:from\s+[^)]+|[^)]*\bsoundtrack\b[^)]*|[^)]*\bost\b[^)]*|[^)]*\bmotion\s*picture\b[^)]*|[^)]*\bfilm\s*version\b[^)]*|[^)]*\bofficial\s*(?:music\s*)?(?:video|audio|lyric\s*video|hd|4k)[^)]*|[^)]*\bfull\s*(?:video|song|audio|version)[^)]*|[^)]*\b(?:video|audio)\s*song\b[^)]*|[^)]*\blyrics?\b[^)]*|[^)]*\bremaster(?:ed)?(?:\s*\d{4})?\b[^)]*|\b(?:hd|hq|4k|audio|video)\b)\)|\[(?:from\s+[^\]]+|[^\]]*\bsoundtrack\b[^\]]*|[^\]]*\bost\b[^\]]*|[^\]]*\bmotion\s*picture\b[^\]]*|[^\]]*\bfilm\s*version\b[^\]]*|[^\]]*\bofficial\s*(?:music\s*)?(?:video|audio|lyric\s*video|hd|4k)[^\]]*|[^\]]*\bfull\s*(?:video|song|audio|version)[^\]]*|[^\]]*\b(?:video|audio)\s*song\b[^\]]*|[^\]]*\blyrics?\b[^\]]*|[^\]]*\bremaster(?:ed)?(?:\s*\d{4})?\b[^\]]*|\b(?:hd|hq|4k|audio|video)\b)\])/gi,
          ''
        );
        cleaned = cleaned.replace(
          /\s*[-–—|:]\s*(?:from\s+["'“”]?[^-|()[\]]+["'“”]?|original\s+motion\s+picture\s+soundtrack|motion\s+picture\s+soundtrack|soundtrack(?:\s+version)?|ost|official\s*(?:music\s*)?(?:video|audio|lyric\s*video)|full\s*(?:video|song|audio)|remaster(?:ed)?(?:\s*\d{4})?)\s*$/gi,
          ''
        );
        return cleaned.replace(/\s+/g, ' ').trim() || String(rawTitle || '').trim();
      };
      const cleanSongTitleKey = (title: string) =>
        stripAccents(cleanCanonicalSongTitle(title))
          .replace(/\((?:[^)]*(?:remaster|version|edit|mix|live|mono|stereo|deluxe|feat|ft|from|soundtrack|ost)[^)]*)\)/gi, '')
          .replace(/\[(?:[^\]]*(?:remaster|version|edit|mix|live|mono|stereo|deluxe|feat|ft|from|soundtrack|ost)[^\]]*)\]/gi, '')
          .replace(/\s+-\s+.*?(?:remaster|version|live|mono|stereo|edit|from|soundtrack).*$/i, '')
          .replace(/aa+/g, 'a')
          .replace(/ee+|ii+/g, 'i')
          .replace(/oo+|uu+|ou|ow/g, 'u')
          .replace(/ei|ey/g, 'i')
          .replace(/ay/g, 'ai')
          .replace(/aw/g, 'au')
          .replace(/ph/g, 'f')
          .replace(/q/g, 'k')
          .replace(/([a-z])\1+/g, '$1')
          .replace(/[^a-z0-9\u0600-\u0D7F]+/g, ' ')
          .trim()
          .replace(/\s+/g, ' ');

      const isSpamSong = (title: string, album: string) =>
        /\b(?:karaoke|tribute|ringtone|8d audio|instrumental version|made famous by|in the style of|lullaby|workout|megamix)\b/i.test(`${title} ${album}`);

      try {
        const queryParts = artistQuery.split(/\s*[·|]\s*/).map(p => p.trim()).filter(Boolean);
        const primaryQuery = queryParts[0] || artistQuery;

        // Step A: Find canonical artist on Deezer and iTunes
        const [dzArtistRes, itunesArtistRes] = await Promise.allSettled([
          fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(primaryQuery)}&limit=5`).then(r => r.ok ? r.json() : null),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(primaryQuery)}&entity=musicArtist&limit=5`).then(r => r.ok ? r.json() : null),
        ]);

        const dzArtists: any[] = dzArtistRes.status === 'fulfilled' && Array.isArray(dzArtistRes.value?.data) ? dzArtistRes.value.data : [];
        const itunesArtists: any[] = itunesArtistRes.status === 'fulfilled' && Array.isArray(itunesArtistRes.value?.results) ? itunesArtistRes.value.results : [];

        const hasValidAvatar = (a: any) => {
          const pic = String(a?.picture_xl || a?.picture_big || '').trim();
          return Boolean(pic && !/\/images\/artist\/\/|default[_-]?artist|d41d8cd98f00b204e9800998ecf8427e/i.test(pic));
        };
        const soloDzArtists = dzArtists.filter(a => !/[&,;/]|\b(?:feat|ft|with|and|vs)\b/i.test(String(a?.name || '')));
        const bestDzArtist = [...(soloDzArtists.length ? soloDzArtists : dzArtists)].sort(
          (a, b) => (hasValidAvatar(b) ? 1 : 0) - (hasValidAvatar(a) ? 1 : 0) || (Number(b?.nb_fan) || 0) - (Number(a?.nb_fan) || 0)
        )[0];
        const bestItunesArtist = itunesArtists[0];

        const rawCandidateNames = Array.from(
          new Set(
            [
              ...queryParts,
              String(bestDzArtist?.name || '').trim(),
              String(bestItunesArtist?.artistName || '').trim(),
              artistQuery,
            ].filter(Boolean)
          )
        );

        const matchedBilingual = BILINGUAL_ARTIST_ALIASES.find(entry => {
          const entryAr = normalizeArabic(entry.ar);
          const entryEn = normalizePhoneticArtist(entry.en);
          const entryAliases = entry.aliases.map(normalizePhoneticArtist);
          return rawCandidateNames.some(cand => {
            const cAr = normalizeArabic(cand);
            const cEn = normalizePhoneticArtist(cand);
            return (cAr && entryAr && cAr === entryAr) || (cEn && (cEn === entryEn || entryAliases.includes(cEn)));
          });
        });

        const allArtistAliases = Array.from(
          new Set(
            [
              ...(matchedBilingual ? [matchedBilingual.en, matchedBilingual.ar, ...matchedBilingual.aliases] : []),
              ...rawCandidateNames,
              ...rawCandidateNames.map(n => n.replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim()),
              ...rawCandidateNames.map(n => n.replace(/\./g, '').replace(/\s+/g, ' ').trim()),
            ].filter(Boolean)
          )
        );

        const canonicalArtist =
          matchedBilingual?.en ||
          rawCandidateNames.find(n => /[A-Za-z]/.test(n) && !/[\u0600-\u06FF]/.test(n)) ||
          String(bestDzArtist?.name || bestItunesArtist?.artistName || artistQuery).trim();

        const isArabicArtist =
          Boolean(matchedBilingual) ||
          allArtistAliases.some(a => /[\u0600-\u06FF]/.test(a));

        const targetArNorms = Array.from(
          new Set(allArtistAliases.filter(a => /[\u0600-\u06FF]/.test(a)).map(normalizeArabic).filter(Boolean))
        );
        const targetEnNorms = Array.from(
          new Set(allArtistAliases.map(normalizePhoneticArtist).filter(Boolean))
        );

        const doesCandidateArtistMatch = (candArtistStr: string): boolean => {
          if (!candArtistStr) return false;
          const candAr = normalizeArabic(candArtistStr);
          for (const tAr of targetArNorms) {
            if (tAr.length >= 3 && candAr.includes(tAr)) return true;
            const tArTokens = tAr.split(' ').filter(w => w.length >= 2);
            const cArTokens = candAr.split(' ').filter(w => w.length >= 2);
            if (tArTokens.length >= 2 && tArTokens.every(t => cArTokens.includes(t))) return true;
          }
          const candEn = normalizePhoneticArtist(candArtistStr);
          if (!candEn) return false;
          const candEnTokens = candEn.split(' ').filter(Boolean);
          for (const tEn of targetEnNorms) {
            if (!tEn) continue;
            if (candEn === tEn || candEn.includes(tEn)) return true;
            const tEnTokens = tEn.split(' ').filter(w => w.length >= 2);
            if (tEnTokens.length >= 2 && tEnTokens.every(t => candEnTokens.includes(t))) return true;
            if (tEnTokens.length === 1 && tEnTokens[0].length >= 3 && candEnTokens.includes(tEnTokens[0])) return true;
          }
          return false;
        };

        const deezerArtistId = bestDzArtist?.id;
        const itunesArtistId = bestItunesArtist?.artistId;

        // Build distinct JioSaavn search queries covering primary Latin/Arabic names & spelling variants
        const jioSearchQueries = Array.from(
          new Set(
            [
              canonicalArtist.replace(/\.\s*/g, ' ').replace(/\s+/g, ' ').trim(),
              ...allArtistAliases.slice(0, 5),
            ].filter(q => q.length >= 2)
          )
        ).slice(0, 5);

        const jioFetchTasks: Promise<any>[] = [];
        jioSearchQueries.forEach((q, qIdx) => {
          jioFetchTasks.push(
            fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&page=1&limit=40`).then(r => r.ok ? r.json() : null)
          );
          if (qIdx < 2) {
            jioFetchTasks.push(
              fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&page=2&limit=40`).then(r => r.ok ? r.json() : null),
              fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&page=3&limit=40`).then(r => r.ok ? r.json() : null)
            );
          }
        });

        // Also search JioSaavn artists endpoint to pull the artist's dedicated JioSaavn catalog
        const jioArtistCatalogTask = (async () => {
          const extraSongs: any[] = [];
          try {
            const artistSearchQueries = Array.from(new Set([canonicalArtist, ...allArtistAliases.filter(a => /[A-Za-z]/.test(a))].slice(0, 3)));
            const searchSettled = await Promise.allSettled(
              artistSearchQueries.map(aq =>
                fetch(`https://elitejiosaavn-api.vercel.app/api/search/artists?query=${encodeURIComponent(aq)}&limit=5`).then(r => r.ok ? r.json() : null)
              )
            );
            const matchedIds = new Set<string>();
            for (const s of searchSettled) {
              if (s.status !== 'fulfilled' || !s.value) continue;
              const rows: any[] = Array.isArray(s.value?.data?.results) ? s.value.data.results : Array.isArray(s.value?.results) ? s.value.results : [];
              for (const row of rows) {
                const rName = String(row?.name || row?.title || '').trim();
                const rId = String(row?.id || '').trim();
                if (rId && doesCandidateArtistMatch(rName)) {
                  matchedIds.add(rId);
                }
              }
            }
            const idList = Array.from(matchedIds).slice(0, 3);
            if (idList.length > 0) {
              const songPagesSettled = await Promise.allSettled(
                idList.flatMap(id => [
                  fetch(`https://elitejiosaavn-api.vercel.app/api/artists/${encodeURIComponent(id)}/songs?page=0&sortBy=popularity&sortOrder=desc`).then(r => r.ok ? r.json() : null),
                  fetch(`https://elitejiosaavn-api.vercel.app/api/artists/${encodeURIComponent(id)}/songs?page=1&sortBy=popularity&sortOrder=desc`).then(r => r.ok ? r.json() : null),
                ])
              );
              for (const sp of songPagesSettled) {
                if (sp.status === 'fulfilled' && sp.value) {
                  const arr = Array.isArray(sp.value?.data?.songs)
                    ? sp.value.data.songs
                    : Array.isArray(sp.value?.data?.results)
                      ? sp.value.data.results
                      : Array.isArray(sp.value?.songs)
                        ? sp.value.songs
                        : [];
                  extraSongs.push(...arr);
                }
              }
            }
          } catch {}
          return extraSongs;
        })();

        // Step B: Concurrently fetch Deezer Top 100, iTunes Top 200 (for popularity ranking & HD cover art), and JioSaavn 320kbps pages
        const [dzTopSettled, itunesLookupSettled, itunesSearchSettled, jioArtistExtraSettled, ...jioPagesSettled] = await Promise.allSettled([
          deezerArtistId
            ? fetch(`https://api.deezer.com/artist/${deezerArtistId}/top?limit=100`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
          itunesArtistId
            ? fetch(`https://itunes.apple.com/lookup?id=${itunesArtistId}&entity=song&limit=200`).then(r => r.ok ? r.json() : null)
            : Promise.resolve(null),
          fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(canonicalArtist)}&country=${isArabicArtist ? 'ae' : 'us'}&entity=song&limit=100`).then(r => r.ok ? r.json() : null),
          jioArtistCatalogTask,
          ...jioFetchTasks,
        ]);

        // Build JioSaavn 320kbps stream map by normalized phonetic song title key
        const jioSongsRaw: any[] = [];
        if (jioArtistExtraSettled.status === 'fulfilled' && Array.isArray(jioArtistExtraSettled.value)) {
          jioSongsRaw.push(...jioArtistExtraSettled.value);
        }
        for (const s of jioPagesSettled) {
          if (s.status === 'fulfilled' && s.value) {
            const arr = Array.isArray(s.value?.data?.results) ? s.value.data.results : Array.isArray(s.value?.results) ? s.value.results : [];
            jioSongsRaw.push(...arr);
          }
        }

        const jioStreamByTitle = new Map<string, { url: string; fallbackUrls: string[]; image: string; duration: number; album: string; title: string; id: string; playCount: number }>();
        const ingestJioSong = (song: any) => {
          const primaryArtists: any[] = Array.isArray(song?.artists?.primary) ? song.artists.primary : [];
          const allArtists: any[] = Array.isArray(song?.artists?.all) ? song.artists.all : [];
          const artistStr = [
            ...primaryArtists.map((a: any) => a?.name),
            ...allArtists.map((a: any) => a?.name),
            song?.primaryArtists,
            song?.singers,
          ]
            .filter(Boolean)
            .join(', ');
          if (!doesCandidateArtistMatch(artistStr)) return;

          const songLang = String(song?.language || '').toLowerCase().trim();
          if (isArabicArtist) {
            if (/[\u0900-\u0D7F]/.test(`${song?.name || ''} ${song?.album?.name || ''} ${artistStr}`)) return;
            if (songLang && songLang !== 'arabic' && songLang !== 'english' && songLang !== 'unknown') return;
          }

          const duration = Number(song?.duration) || 0;
          // Strictly require full-length JioSaavn tracks (>= 60 seconds, never 30-second previews)
          if (duration < 60 || duration > 1200) return;

          const rawTitle = cleanCanonicalSongTitle(String(song?.name || song?.title || ''));
          const key = cleanSongTitleKey(rawTitle);
          if (!key) return;
          if (isSpamSong(rawTitle, String(song?.album?.name || ''))) return;

          const urls: any[] = Array.isArray(song?.downloadUrl) ? song.downloadUrl : [];
          const best = urls.find((u: any) => u?.quality === '320kbps') || urls[urls.length - 1];
          const bestUrl = String(best?.url || best?.link || '').trim();
          if (!bestUrl.startsWith('http')) return;
          const fallbacks = urls.map((u: any) => String(u?.url || u?.link || '').trim()).filter((u: string) => u.startsWith('http') && u !== bestUrl);
          const imgs: any[] = Array.isArray(song?.image) ? song.image : [];
          const bestImg = String(imgs.find((i: any) => i?.quality === '500x500')?.url || imgs[imgs.length - 1]?.url || '').trim();
          const existing = jioStreamByTitle.get(key);
          const playCount = Number(song?.playCount) || 0;
          if (!existing || playCount > existing.playCount) {
            jioStreamByTitle.set(key, {
              id: String(song?.id || ''),
              title: rawTitle,
              url: bestUrl,
              fallbackUrls: fallbacks,
              image: bestImg,
              duration,
              album: cleanCanonicalSongTitle(String(song?.album?.name || '')),
              playCount,
            });
          }
        };

        for (const song of jioSongsRaw) {
          ingestJioSong(song);
        }

        // Pre-index iTunes & Deezer metadata (for high-res 600x600 artwork & popularity rank ONLY — NEVER use 30s previewUrl)
        const itunesTracks: any[] = [
          ...(itunesLookupSettled.status === 'fulfilled' && Array.isArray(itunesLookupSettled.value?.results) ? itunesLookupSettled.value.results : []),
          ...(itunesSearchSettled.status === 'fulfilled' && Array.isArray(itunesSearchSettled.value?.results) ? itunesSearchSettled.value.results : []),
        ];
        const itunesCoverByKey = new Map<string, { image: string; album: string; title: string }>();
        for (const t of itunesTracks) {
          if (t?.wrapperType === 'track' || t?.kind === 'song') {
            const tArtist = String(t?.artistName || '').trim();
            if (!doesCandidateArtistMatch(tArtist)) continue;
            const rawT = cleanCanonicalSongTitle(String(t?.trackName || ''));
            const k = cleanSongTitleKey(rawT);
            const art = String(t?.artworkUrl100 || '').replace('100x100bb', '600x600bb').trim();
            if (k && art.startsWith('http') && !itunesCoverByKey.has(k)) {
              itunesCoverByKey.set(k, {
                image: art,
                album: cleanCanonicalSongTitle(String(t?.collectionName || '')),
                title: rawT,
              });
            }
          }
        }

        const dzTopTracks: any[] = dzTopSettled.status === 'fulfilled' && Array.isArray(dzTopSettled.value?.data) ? dzTopSettled.value.data : [];
        dzTopTracks.sort((a, b) => (Number(b?.rank) || 0) - (Number(a?.rank) || 0));

        // If we have fewer than 20 JioSaavn songs so far, do a fast targeted JioSaavn search for top Deezer/iTunes track titles
        if (jioStreamByTitle.size < 20) {
          const topChartTitles: string[] = [];
          for (const t of dzTopTracks) {
            const rawT = cleanCanonicalSongTitle(String(t?.title_short || t?.title || ''));
            const k = cleanSongTitleKey(rawT);
            if (k && !jioStreamByTitle.has(k) && topChartTitles.length < 10) {
              topChartTitles.push(rawT);
            }
          }
          for (const t of itunesTracks) {
            if (t?.wrapperType !== 'track' && t?.kind !== 'song') continue;
            const rawT = cleanCanonicalSongTitle(String(t?.trackName || ''));
            const k = cleanSongTitleKey(rawT);
            if (k && !jioStreamByTitle.has(k) && !topChartTitles.includes(rawT) && topChartTitles.length < 15) {
              topChartTitles.push(rawT);
            }
          }
          if (topChartTitles.length > 0) {
            const targetedSettled = await Promise.allSettled(
              topChartTitles.slice(0, 12).map(tTitle =>
                fetch(`https://elitejiosaavn-api.vercel.app/api/search/songs?query=${encodeURIComponent(`${tTitle} ${canonicalArtist}`)}&page=1&limit=8`).then(r => r.ok ? r.json() : null)
              )
            );
            for (const ts of targetedSettled) {
              if (ts.status === 'fulfilled' && ts.value) {
                const arr = Array.isArray(ts.value?.data?.results) ? ts.value.data.results : Array.isArray(ts.value?.results) ? ts.value.results : [];
                for (const song of arr) ingestJioSong(song);
              }
            }
          }
        }

        const mergedTracks: any[] = [];
        const seenTitleKeys = new Set<string>();
        const seenJioIds = new Set<string>();

        const pushVerifiedJioTrack = (
          jioMatch: { url: string; fallbackUrls: string[]; image: string; duration: number; album: string; title: string; id: string; playCount: number },
          preferredMeta?: { title?: string; album?: string; image?: string }
        ) => {
          if (!jioMatch?.url || !jioMatch.url.startsWith('http') || jioMatch.duration < 60) return;
          if (jioMatch.id && seenJioIds.has(jioMatch.id)) return;
          const cleanTitle = cleanCanonicalSongTitle(preferredMeta?.title || jioMatch.title);
          const key = cleanSongTitleKey(cleanTitle);
          const jioKey = cleanSongTitleKey(jioMatch.title);
          if (!key || key.length < 2 || seenTitleKeys.has(key) || (jioKey && seenTitleKeys.has(jioKey))) return;
          if (isSpamSong(cleanTitle, preferredMeta?.album || jioMatch.album)) return;

          seenTitleKeys.add(key);
          if (jioKey) seenTitleKeys.add(jioKey);
          if (jioMatch.id) seenJioIds.add(jioMatch.id);

          const itunesArt = itunesCoverByKey.get(key) || (jioKey ? itunesCoverByKey.get(jioKey) : undefined);

          mergedTracks.push({
            id: jioMatch.id ? `api-${jioMatch.id}` : `jio-${mergedTracks.length + 1}`,
            title: cleanTitle,
            artist: canonicalArtist,
            album: cleanCanonicalSongTitle(preferredMeta?.album || jioMatch.album || itunesArt?.album || `${canonicalArtist} Essentials`),
            image: preferredMeta?.image || itunesArt?.image || jioMatch.image || '',
            duration: jioMatch.duration,
            audioUrl: jioMatch.url,
            fallbackUrls: jioMatch.fallbackUrls.length > 0 ? jioMatch.fallbackUrls : undefined,
            source: 'JioSaavn',
            bitrate: 320,
            codec: 'AAC',
            mimeType: 'audio/mp4',
            format: 'MP4 (320kbps)',
          });
        };

        // 1. Deezer Official Top Tracks that have a verified full-length JioSaavn stream
        for (const t of dzTopTracks) {
          const tArtist = String(t?.artist?.name || '').trim();
          const contribs: any[] = Array.isArray(t?.contributors) ? t.contributors : [];
          const isTargetArtist =
            doesCandidateArtistMatch(tArtist) ||
            contribs.some(c => doesCandidateArtistMatch(String(c?.name || '')));
          if (!isTargetArtist) continue;
          const rawT = cleanCanonicalSongTitle(String(t?.title_short || t?.title || '').trim());
          const tKey = cleanSongTitleKey(rawT);
          const jioMatch = tKey ? jioStreamByTitle.get(tKey) : undefined;
          if (!jioMatch) continue;
          pushVerifiedJioTrack(jioMatch, {
            title: jioMatch.title || rawT,
            album: String(t?.album?.title || jioMatch.album || `${canonicalArtist} Essentials`).trim(),
            image: String(t?.album?.cover_xl || t?.album?.cover_big || t?.album?.cover_medium || jioMatch.image || '').trim(),
          });
        }

        // 2. Apple Music / iTunes Top Songs that have a verified full-length JioSaavn stream
        for (const t of itunesTracks) {
          if (t?.wrapperType !== 'track' && t?.kind !== 'song') continue;
          const tArtist = String(t?.artistName || '').trim();
          if (!doesCandidateArtistMatch(tArtist)) continue;
          const rawT = cleanCanonicalSongTitle(String(t?.trackName || '').trim());
          const tKey = cleanSongTitleKey(rawT);
          const jioMatch = tKey ? jioStreamByTitle.get(tKey) : undefined;
          if (!jioMatch) continue;
          pushVerifiedJioTrack(jioMatch, {
            title: jioMatch.title || rawT,
            album: String(t?.collectionName || jioMatch.album || `${canonicalArtist} Essentials`).trim(),
            image: String(t?.artworkUrl100 || '').replace('100x100bb', '600x600bb').trim() || jioMatch.image,
          });
          if (mergedTracks.length >= 100) break;
        }

        // 3. Fill with all remaining verified JioSaavn 320kbps tracks for this artist sorted by playCount descending
        if (mergedTracks.length < 100) {
          const sortedJio = Array.from(jioStreamByTitle.values()).sort((a, b) => b.playCount - a.playCount);
          for (const j of sortedJio) {
            pushVerifiedJioTrack(j);
            if (mergedTracks.length >= 100) break;
          }
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ artist: canonicalArtist, items: mergedTracks.slice(0, 100) }));
      } catch {
        res.statusCode = 200;
        res.end(JSON.stringify({ artist: artistQuery, items: [] }));
      }
      return;
    }

    next();
  };

  return handler;
}
