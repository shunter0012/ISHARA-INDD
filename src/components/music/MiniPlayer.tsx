import React from 'react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { Play, Pause, X, Maximize2, Music } from 'lucide-react';

export const MiniPlayer: React.FC = () => {
  const { 
    currentTrack, 
    isPlaying, 
    togglePlay, 
    closePlayer, 
    progress, 
    duration, 
    setIsFullModalOpen 
  } = useAudioPlayer();

  if (!currentTrack) return null;

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const handleCut = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    closePlayer();
  };

  return (
    <div 
      id="global-mini-player"
      className="fixed bottom-16 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white/95 backdrop-blur-md border border-[#EEEEEE] rounded-2xl shadow-xl z-50 p-2.5 overflow-hidden animate-in slide-in-from-bottom-5"
    >
      {/* Progress top line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100">
        <div 
          className="h-full bg-[#1A1A1A] transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div 
          onClick={() => setIsFullModalOpen(true)}
          className="flex items-center space-x-2.5 min-w-0 cursor-pointer flex-1"
        >
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.title}
            className="w-10 h-10 rounded-xl object-cover border border-[#EEEEEE] shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#1A1A1A] truncate">{currentTrack.title}</p>
            <p className="text-[10px] text-[#8E8E8E] truncate">{currentTrack.artist}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
          <button
            id="mini-player-play-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="w-8 h-8 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          <button
            id="mini-player-expand-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullModalOpen(true);
            }}
            className="p-1.5 text-[#666666] hover:text-[#1A1A1A] hover:bg-gray-100 rounded-lg cursor-pointer"
            title="Expand Player"
            aria-label="Expand Player"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Cut / Close Button */}
          <button
            id="mini-player-cut-btn"
            type="button"
            onClick={handleCut}
            className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-red-50 text-zinc-600 hover:text-red-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Cut / Close Player"
            aria-label="Cut / Close Player"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>
      </div>
    </div>
  );
};
