import type { CSSProperties } from 'react';
import {
  AudioLines,
  Clock3,
  Disc3,
  Download,
  Heart,
  Home,
  Library as LibraryIcon,
  ListMusic,
  Mic2,
  Music2,
  Settings,
  TrendingUp,
} from 'lucide-react';
import type { Preferences } from '@/lib/library';
import type { Page } from '../../core/voidCore';

export const defaults: Preferences = {
  theme: 'system',
  autoplay: false,
  volume: 0.72,
  muted: false,
  shuffle: false,
  repeat: 'off',
};

export const greetings = [
  'Still awake?',
  'The night is quiet.',
  'Before the world wakes.',
  'Good morning.',
  'A good morning starts here.',
  'Good to have you here.',
  'Good afternoon.',
  'Settle into the afternoon.',
  'A little room to listen.',
  'Evening, take your time.',
  'Let the day soften.',
  'The evening is yours.',
];

// `compact` marks the pages that stay visible when the sidebar is collapsed to icons.
export const navItems: {
  id: Page;
  label: string;
  icon: typeof Home;
  group: 'listen' | 'collection';
  compact: boolean;
}[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'listen', compact: true },
  { id: 'trending', label: 'Trending', icon: TrendingUp, group: 'listen', compact: true },
  { id: 'recent', label: 'Recently played', icon: Clock3, group: 'listen', compact: true },
  { id: 'songs', label: 'Songs', icon: Music2, group: 'collection', compact: true },
  { id: 'albums', label: 'Albums', icon: Disc3, group: 'collection', compact: false },
  { id: 'artists', label: 'Artists', icon: Mic2, group: 'collection', compact: false },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, group: 'collection', compact: true },
  { id: 'favorites', label: 'Favorites', icon: Heart, group: 'collection', compact: true },
  { id: 'queue', label: 'Queue', icon: AudioLines, group: 'collection', compact: false },
  { id: 'downloads', label: 'Downloads', icon: Download, group: 'collection', compact: true },
];

// Mobile bottom bar: five primary destinations. Library is the one hub for the collection views
// (albums, artists, playlists, recently played, queue) that stay individually routable.
export const mobileNavItems: { id: Page | 'library'; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'songs', label: 'Music', icon: Music2 },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Pages that the Library hub owns, so its tab stays lit while browsing inside the collection.
export const LIBRARY_PAGES: Page[] = [
  'downloads',
  'favorites',
  'albums',
  'artists',
  'playlists',
  'recent',
  'queue',
];

export const pathFor = (page: Page) => (page === 'home' ? '/' : `/${page}`);

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—:—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

// Elapsed time reads 0:00 at the start of a song instead of a dash.
export const formatElapsed = (seconds: number) =>
  !Number.isFinite(seconds) || seconds <= 0 ? '0:00' : formatTime(seconds);

export const compactBytes = (bytes: number) =>
  bytes > 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

export const countLabel = (count: number, one: string) =>
  `${count} ${count === 1 ? one : `${one}s`}`;

export const rangeStyle = (fraction: number) =>
  ({
    '--p': `${Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100}%`,
  }) as CSSProperties;

export const hueOf = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return hash;
};

// Presentation only: a calm mood line for each two-hour block, matching the greetings above.
export const moods = [
  'Late hours, low volume',
  'Quiet, close, nocturnal',
  'Soft light before sunrise',
  'Slow start, warm cup',
  'Bright, easy, unhurried',
  'Clear head, open window',
  'Midday, easy and warm',
  'Slow afternoon light',
  'Golden hour, low glare',
  'Warm, slow, low light',
  'Dim lamps, deep listening',
  'Last light, long songs',
];

export const moodLabelFor = (hour: number) =>
  hour < 5 || hour >= 18
    ? 'Tonight’s mood'
    : hour < 12
      ? 'This morning’s mood'
      : 'This afternoon’s mood';
