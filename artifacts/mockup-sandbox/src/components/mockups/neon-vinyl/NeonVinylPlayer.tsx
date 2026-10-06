import { useEffect, useState } from "react";
import {
  ChevronDown,
  MoreHorizontal,
  Heart,
  Shuffle,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Repeat,
  Mic2,
  MonitorSpeaker,
  Share2,
  ListMusic,
  Check,
} from "lucide-react";
import albumArt from "../templates/NeonMusicPlayer-gMhKDC/assets/mob-04-album.png";
import "./NeonVinylPlayer.css";

const playlist = [
  { title: "Neon Resurgence", artist: "Kavinsky, The Midnight", duration: 298 },
  { title: "Glass Horizon", artist: "FM-84, Ollie Wride", duration: 264 },
  { title: "Afterglow Protocol", artist: "Timecop1983", duration: 321 },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function NeonVinylPlayer() {
  const [trackIndex, setTrackIndex] = useState(0);
  const [elapsed, setElapsed] = useState(134);
  const [playing, setPlaying] = useState(true);
  const [liked, setLiked] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const track = playlist[trackIndex];
  const progress = elapsed / track.duration;
  const circumference = 2 * Math.PI * 168;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        if (current >= track.duration) {
          if (repeat) return 0;
          setPlaying(false);
          return track.duration;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, repeat, track.duration]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2100);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changeTrack = (direction: number) => {
    setTrackIndex((current) => {
      const next = shuffle && direction > 0
        ? (current + 2) % playlist.length
        : (current + direction + playlist.length) % playlist.length;
      return next;
    });
    setElapsed(0);
    setPlaying(true);
  };

  const togglePlay = () => setPlaying((value) => !value);

  const shareTrack = async () => {
    try {
      await navigator.clipboard.writeText(`${track.title} — ${track.artist}`);
      setNotice("Track details copied");
    } catch {
      setNotice("Now playing: " + track.title);
    }
  };

  return (
    <main className="neon-vinyl-player relative isolate flex h-full min-h-[100dvh] w-full flex-col overflow-hidden text-white selection:bg-fuchsia-300/30">
      <div
        className="pointer-events-none absolute inset-0 z-0 scale-110 opacity-40 mix-blend-screen blur-[66px]"
        style={{ backgroundImage: `url(${albumArt})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/20 via-[#090b10]/75 to-[#090b10]" />

      <div className="relative z-10 mx-auto flex h-full min-h-[100dvh] w-full max-w-[520px] flex-col px-6 pb-5 pt-7 sm:px-9 sm:pt-9">
        <header className={`flex shrink-0 items-center justify-between transition-opacity duration-300 ${compact ? "opacity-60" : ""}`}>
          <button
            type="button"
            aria-label={compact ? "Expand player" : "Compact player"}
            onClick={() => setCompact((value) => !value)}
            className="rounded-full p-2 -ml-2 text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronDown size={22} className={`transition-transform ${compact ? "rotate-180" : ""}`} />
          </button>
          <div className="flex flex-col items-center leading-tight">
            <span className="mb-1 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/45">Playing from playlist</span>
            <span className="text-[12px] font-medium tracking-[0.08em] text-white/90">Midnight Synthwave</span>
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="More player options"
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-full p-2 -mr-2 text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <MoreHorizontal size={22} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#171821]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                <button onClick={() => { setNotice("Added to your listening history"); setMenuOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-xs text-white/80 hover:bg-white/10">Listening history</button>
                <button onClick={() => { setQueueOpen((value) => !value); setMenuOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left text-xs text-white/80 hover:bg-white/10">Open queue</button>
              </div>
            )}
          </div>
        </header>

        <section className="relative flex min-h-0 flex-1 items-center justify-center py-5 sm:py-7" aria-label="Album artwork and playback progress">
          <div className="relative aspect-square w-[min(84vw,390px)] max-h-full">
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 360 360" aria-label={`${Math.round(progress * 100)} percent played`} role="img">
              <defs>
                <linearGradient id="vinyl-progress-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#b66cff" />
                  <stop offset="100%" stopColor="#56e2cf" />
                </linearGradient>
              </defs>
              <circle cx="180" cy="180" r="168" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="8" />
              <circle
                className="vinyl-progress"
                cx="180"
                cy="180"
                r="168"
                fill="none"
                stroke="url(#vinyl-progress-gradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                transform="rotate(-90 180 180)"
              />
            </svg>

            <div className="vinyl-rim absolute left-1/2 top-1/2 aspect-square w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full p-[7px]">
              <div className="relative h-full w-full overflow-hidden rounded-full bg-[#11131a]">
                <img src={albumArt} alt="Neon Resurgence album artwork" className="h-full w-full rounded-full object-cover" />
                <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
                <button
                  type="button"
                  aria-label={playing ? "Pause track" : "Play track"}
                  onClick={togglePlay}
                  className={`absolute left-1/2 top-1/2 flex h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/95 text-[#13131a] shadow-[0_8px_38px_rgba(0,0,0,.45)] backdrop-blur-md transition duration-300 hover:scale-110 active:scale-95 ${playing ? "vinyl-play-pulse" : ""}`}
                >
                  {playing ? <Pause size={25} fill="currentColor" strokeWidth={1.5} /> : <Play size={27} fill="currentColor" strokeWidth={1.5} className="ml-1" />}
                </button>
              </div>
            </div>

            <span className="absolute bottom-[2%] left-[8%] rounded-full bg-[#090b10]/65 px-2 py-1 font-mono text-[10px] tracking-wide text-white/75 backdrop-blur-md sm:text-[11px]">{formatTime(elapsed)}</span>
            <span className="absolute bottom-[2%] right-[8%] rounded-full bg-[#090b10]/65 px-2 py-1 font-mono text-[10px] tracking-wide text-white/55 backdrop-blur-md sm:text-[11px]">{formatTime(track.duration)}</span>

            {queueOpen && (
              <div className="absolute left-1/2 top-1/2 z-20 w-[min(82vw,300px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-[#12131b]/95 p-4 shadow-2xl backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">Up next</span>
                  <button onClick={() => setQueueOpen(false)} aria-label="Close queue" className="text-white/50 hover:text-white"><span className="text-lg leading-none">×</span></button>
                </div>
                {playlist.map((item, index) => (
                  <button
                    key={item.title}
                    onClick={() => { setTrackIndex(index); setElapsed(0); setPlaying(true); setQueueOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left ${index === trackIndex ? "bg-white/[.08]" : "hover:bg-white/[.06]"}`}
                  >
                    <span className="w-4 text-center text-[10px] text-teal-200">{index === trackIndex ? "♫" : `0${index + 1}`}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-white/90">{item.title}</span>
                    {index === trackIndex && <span className="text-[9px] uppercase tracking-widest text-white/40">Playing</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={`relative shrink-0 transition-transform duration-300 ${compact ? "translate-y-1" : ""}`} aria-label="Track controls">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[23px] font-semibold leading-tight tracking-[-0.035em] sm:text-[26px]">{track.title}</h1>
              <h2 className="mt-1 truncate text-[13px] font-medium tracking-[0.015em] text-white/55">{track.artist}</h2>
            </div>
            <button type="button" aria-label={liked ? "Unlike track" : "Like track"} onClick={() => setLiked((value) => !value)} className={`shrink-0 rounded-full p-2 transition hover:scale-110 active:scale-95 ${liked ? "text-[#ff79a9]" : "text-white/65 hover:text-white"}`}>
              <Heart size={23} fill={liked ? "currentColor" : "none"} strokeWidth={1.7} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-start gap-5 text-white/55">
            <button type="button" aria-label="Toggle shuffle" onClick={() => setShuffle((value) => !value)} className={`rounded-md p-1 transition hover:text-white ${shuffle ? "text-[#72e5d5]" : ""}`}>
              <Shuffle size={17} strokeWidth={1.8} />
            </button>
            <button type="button" aria-label="Previous track" onClick={() => changeTrack(-1)} className="rounded-md p-1 transition hover:text-white active:scale-90">
              <SkipBack size={20} fill="currentColor" strokeWidth={1.6} />
            </button>
            <button type="button" aria-label="Next track" onClick={() => changeTrack(1)} className="rounded-md p-1 transition hover:text-white active:scale-90">
              <SkipForward size={20} fill="currentColor" strokeWidth={1.6} />
            </button>
            <button type="button" aria-label="Toggle repeat" onClick={() => setRepeat((value) => !value)} className={`relative rounded-md p-1 transition hover:text-white ${repeat ? "text-[#72e5d5]" : ""}`}>
              <Repeat size={18} strokeWidth={1.8} />
              {repeat && <span className="absolute -right-1 -top-1 h-1 w-1 rounded-full bg-[#72e5d5]" />}
            </button>
          </div>

          <div className={`mt-5 flex items-center justify-between border-t border-white/[.08] pt-3 text-white/45 transition-opacity ${compact ? "opacity-50" : ""}`}>
            <div className="relative">
              <button type="button" aria-label="Audio output" onClick={() => setDeviceOpen((value) => !value)} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[10px] tracking-wide transition hover:bg-white/[.07] hover:text-white/80">
                <MonitorSpeaker size={16} /><span>Living room speaker</span>
              </button>
              {deviceOpen && (
                <div className="absolute bottom-10 left-0 z-30 w-48 rounded-xl border border-white/10 bg-[#171821]/95 p-2 shadow-xl backdrop-blur-xl">
                  <div className="mb-1 px-2 py-1 text-[9px] uppercase tracking-[.2em] text-white/40">Listening on</div>
                  <button onClick={() => { setNotice("Connected to this device"); setDeviceOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs text-white/80 hover:bg-white/10">This device <Check size={13} className="text-teal-200" /></button>
                  <button onClick={() => { setNotice("Living room speaker selected"); setDeviceOpen(false); }} className="w-full rounded-lg px-2 py-2 text-left text-xs text-white/65 hover:bg-white/10">Living room speaker</button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Lyrics" onClick={() => setNotice("Lyrics are not available for this track")} className="rounded-md p-1.5 transition hover:text-white"><Mic2 size={16} /></button>
              <button type="button" aria-label="Share track" onClick={shareTrack} className="rounded-md p-1.5 transition hover:text-white"><Share2 size={16} /></button>
              <button type="button" aria-label={queueOpen ? "Close queue" : "Open queue"} onClick={() => setQueueOpen((value) => !value)} className={`rounded-md p-1.5 transition hover:text-white ${queueOpen ? "text-teal-200" : ""}`}><ListMusic size={17} /></button>
            </div>
          </div>
        </section>

        {notice && <div role="status" className="absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-[#22242c]/95 px-4 py-2 text-xs text-white/85 shadow-xl backdrop-blur-lg">{notice}</div>}
        <div className="pointer-events-none absolute bottom-1 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-white/30 sm:hidden" />
      </div>
    </main>
  );
}
