import React from 'react';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Music, 
  Share2, 
  Sparkles,
  Disc3
} from 'lucide-react';

export const FullPlayerModal: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    togglePlay,
    seekTo,
    setVolume,
    isFullModalOpen,
    setIsFullModalOpen
  } = useAudioPlayer();

  if (!isFullModalOpen || !currentTrack) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#181818] text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-white/10 flex flex-col items-center space-y-5">
        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-widest text-zinc-400 uppercase flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Now Playing</span>
          </span>
          <button
            onClick={() => setIsFullModalOpen(false)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cover Art with Vinyl Spin animation */}
        <div className="relative w-56 h-56 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.title}
            className={`w-full h-full object-cover ${isPlaying ? 'scale-105' : 'scale-100'} transition-transform duration-700`}
          />
        </div>

        {/* Track Title & Artist */}
        <div className="w-full text-center space-y-1">
          <h3 className="text-lg font-extrabold text-white truncate">{currentTrack.title}</h3>
          <p className="text-xs text-zinc-400 font-medium truncate">{currentTrack.artist}</p>
        </div>

        {/* Progress Bar & Timing */}
        <div className="w-full space-y-1.5">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={progress}
            onChange={e => seekTo(parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Media Controls */}
        <div className="flex items-center justify-center space-x-6">
          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 ml-1 fill-black" />}
          </button>
        </div>

        {/* Volume Slider */}
        <div className="w-full flex items-center space-x-3 pt-2">
          {volume === 0 ? (
            <VolumeX className="w-4 h-4 text-zinc-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-zinc-400" />
          )}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-300"
          />
        </div>
      </div>
    </div>
  );
};
