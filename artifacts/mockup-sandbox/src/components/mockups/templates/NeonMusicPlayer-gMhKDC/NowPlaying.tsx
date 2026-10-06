import './fonts.css';
import asset0 from "./assets/mob-04-album.png";

import React from "react";
import { 
  ChevronDown, 
  MoreHorizontal, 
  Heart, 
  Shuffle, 
  SkipBack, 
  Play, 
  SkipForward, 
  Repeat, 
  Mic2, 
  MonitorSpeaker, 
  Share2,
  ListMusic
} from "lucide-react";

export function NowPlaying() {
  return (
    <div 
      className="relative overflow-hidden text-white font-['Outfit'] shadow-2xl selection:bg-white/20"
      style={{ width: "100%", height: "100%", backgroundColor: "#0a0a0c" }}
    >
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 opacity-40 mix-blend-screen transition-transform duration-1000 scale-110"
        style={{
          backgroundImage: `url(${asset0})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(60px)",
        }}
      />
      
      {/* Gradients to blend background into the deep dark UI */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/20 via-[#0a0a0c]/80 to-[#0a0a0c] pointer-events-none" />

      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col h-full px-6 py-12 justify-between">
        
        {/* Top Header */}
        <div className="flex items-center justify-between w-full">
          <button className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ChevronDown size={24} className="opacity-80" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-white/50 mb-0.5">
              Playing from Playlist
            </span>
            <span className="text-xs font-medium tracking-wide opacity-90">
              Midnight Synthwave
            </span>
          </div>
          <button className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors">
            <MoreHorizontal size={24} className="opacity-80" />
          </button>
        </div>

        {/* Artwork */}
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="relative w-[342px] h-[342px] rounded-3xl overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] group">
            <img 
              src={asset0} 
              alt="Album Art" 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            {/* Subtle inner shadow/highlight for glass effect */}
            <div className="absolute inset-0 ring-1 ring-white/10 rounded-3xl pointer-events-none" />
          </div>
        </div>

        {/* Track Info & Controls Area */}
        <div className="w-full flex flex-col gap-6 pb-6">
          
          {/* Title & Like */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold tracking-tight mb-1 truncate max-w-[280px]">
                Neon Resurgence
              </h1>
              <h2 className="text-base text-white/60 font-medium truncate max-w-[280px]">
                Kavinsky, The Midnight
              </h2>
            </div>
            <button className="p-2 hover:scale-110 transition-transform active:scale-95">
              <Heart size={26} className="text-white opacity-80 hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex flex-col gap-2 mt-2">
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer relative group">
              <div className="absolute left-0 top-0 bottom-0 w-[45%] bg-white rounded-full group-hover:bg-[#8b5cf6] transition-colors" />
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-white/50 tracking-wider">
              <span>2:14</span>
              <span>4:58</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between pt-2">
            <button className="p-2 text-white/60 hover:text-white transition-colors active:scale-95">
              <Shuffle size={22} />
            </button>
            <button className="p-3 hover:bg-white/10 rounded-full transition-colors active:scale-95">
              <SkipBack size={32} className="fill-white/20" />
            </button>
            <button className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_8px_32px_-8px_rgba(255,255,255,0.3)]">
              <Play size={28} className="fill-black ml-1" />
            </button>
            <button className="p-3 hover:bg-white/10 rounded-full transition-colors active:scale-95">
              <SkipForward size={32} className="fill-white/20" />
            </button>
            <button className="p-2 text-white/60 hover:text-white transition-colors active:scale-95">
              <Repeat size={22} />
            </button>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-between pt-6 text-white/60">
            <button className="p-2 hover:text-white transition-colors">
              <MonitorSpeaker size={20} />
            </button>
            <div className="flex gap-4">
              <button className="p-2 hover:text-white transition-colors">
                <Share2 size={20} />
              </button>
              <button className="p-2 hover:text-white transition-colors">
                <ListMusic size={20} />
              </button>
            </div>
          </div>
          
        </div>
        
        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/40 rounded-full pointer-events-none" />
      </div>
    </div>
  );
}
