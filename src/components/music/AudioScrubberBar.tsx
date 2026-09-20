import React, { useState, useEffect, useRef } from 'react';
import { 
  MusicTrack, 
  AudioAttachmentConfig 
} from '../../types/index';
import { 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Scissors, 
  Sliders, 
  Trash2, 
  RefreshCw, 
  Check, 
  Sparkles,
  Music
} from 'lucide-react';

interface AudioScrubberBarProps {
  track: MusicTrack;
  config: AudioAttachmentConfig;
  onChangeConfig: (newConfig: AudioAttachmentConfig) => void;
  onRemove: () => void;
  onChangeTrack: () => void;
  hasVideoMedia?: boolean;
}

export const AudioScrubberBar: React.FC<AudioScrubberBarProps> = ({
  track,
  config,
  onChangeConfig,
  onRemove,
  onChangeTrack,
  hasVideoMedia = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingSnippet, setIsPlayingSnippet] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const duration = Math.max(15, Math.round(track.duration || 30));
  const startTime = config.audioStartTime ?? 0;
  const clipLength = config.audioEndTime ? Math.max(5, config.audioEndTime - startTime) : Math.min(30, duration);
  const musicVolume = config.audioVolume ?? 0.8;
  const originalVolume = config.originalAudioVolume ?? 1.0;

  useEffect(() => {
    const audio = new Audio(track.audioUrl);
    audioRef.current = audio;
    audio.volume = musicVolume;

    const handleTimeUpdate = () => {
      const current = audio.currentTime;
      const targetEnd = startTime + clipLength;
      if (current >= targetEnd) {
        audio.currentTime = startTime;
        // Loop snippet
        audio.play().catch(() => {});
      }
    };

    const handleEnded = () => {
      setIsPlayingSnippet(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.src = '';
    };
  }, [track.audioUrl, startTime, clipLength, musicVolume]);

  const togglePlaySnippet = () => {
    if (!audioRef.current) return;
    if (isPlayingSnippet) {
      audioRef.current.pause();
      setIsPlayingSnippet(false);
    } else {
      audioRef.current.currentTime = startTime;
      audioRef.current.volume = musicVolume;
      audioRef.current.play()
        .then(() => setIsPlayingSnippet(true))
        .catch(() => setIsPlayingSnippet(false));
    }
  };

  const handleStartTimeChange = (newStart: number) => {
    const validStart = Math.max(0, Math.min(newStart, duration - clipLength));
    onChangeConfig({
      ...config,
      audioStartTime: validStart,
      audioEndTime: validStart + clipLength
    });
    if (audioRef.current) {
      audioRef.current.currentTime = validStart;
    }
  };

  const handleClipLengthChange = (lengthSec: number) => {
    const validLength = Math.min(lengthSec, duration - startTime);
    onChangeConfig({
      ...config,
      audioEndTime: startTime + validLength
    });
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="bg-gradient-to-br from-pink-50/60 via-purple-50/40 to-blue-50/50 border border-pink-200/80 rounded-2xl p-3.5 shadow-xs transition-all">
      {/* Compact Header Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow-xs shrink-0 border border-black/5 bg-zinc-900 group cursor-pointer" onClick={togglePlaySnippet}>
            <img 
              src={track.coverUrl} 
              alt={track.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
              {isPlayingSnippet ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-zinc-900 truncate">{track.title}</span>
              {track.isOriginal && (
                <span className="text-[9px] px-1.5 py-0.2 bg-purple-100 text-purple-700 font-semibold rounded-full shrink-0">
                  Original
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 truncate">{track.artist}</p>
            <div className="flex items-center space-x-2 mt-0.5 text-[10px] text-zinc-400 font-mono">
              <span>Segment: {formatSeconds(startTime)} - {formatSeconds(startTime + clipLength)} ({clipLength}s)</span>
              <span>•</span>
              <span>Vol: {Math.round(musicVolume * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-1 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1.5 text-xs font-semibold rounded-xl flex items-center space-x-1 transition-colors ${
              isExpanded 
                ? 'bg-zinc-900 text-white shadow-xs' 
                : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
            }`}
            title="Adjust timing and volume"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden sm:inline">{isExpanded ? 'Done' : 'Adjust'}</span>
          </button>

          <button
            type="button"
            onClick={onChangeTrack}
            className="p-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-colors"
            title="Choose different sound"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 bg-white border border-zinc-200 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-xl transition-colors"
            title="Remove music track"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded Segment Trimmer & Volume Mixer */}
      {isExpanded && (
        <div className="mt-3.5 pt-3.5 border-t border-pink-200/60 space-y-3.5 animate-fadeIn">
          {/* Preset Clip Length Pills (15s, 30s, 60s) */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-700 flex items-center space-x-1">
              <Scissors className="w-3.5 h-3.5 text-pink-600" />
              <span>Clip Duration</span>
            </span>

            <div className="flex items-center space-x-1.5">
              {[15, 30, 60].map((len) => (
                <button
                  key={len}
                  type="button"
                  onClick={() => handleClipLengthChange(len)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                    clipLength === len
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xs'
                      : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {len}s
                </button>
              ))}
            </div>
          </div>

          {/* Instagram-Style Waveform Audio Scrubber */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
              <span>Start offset: {formatSeconds(startTime)}</span>
              <span>End: {formatSeconds(startTime + clipLength)}</span>
            </div>

            {/* Stylized Audio Wave Visualizer Bars */}
            <div className="h-8 bg-white rounded-xl border border-pink-200/80 px-2 flex items-center space-x-1 overflow-hidden relative">
              {Array.from({ length: 48 }).map((_, i) => {
                const barPositionSec = (i / 48) * duration;
                const isInsideSelectedClip = barPositionSec >= startTime && barPositionSec <= (startTime + clipLength);
                const barHeight = Math.max(20, Math.sin(i * 0.4) * 40 + Math.cos(i * 0.7) * 35 + 40);

                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-colors ${
                      isInsideSelectedClip 
                        ? 'bg-gradient-to-t from-pink-500 to-purple-600' 
                        : 'bg-zinc-200'
                    }`}
                    style={{ height: `${barHeight}%` }}
                  />
                );
              })}
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, duration - clipLength)}
              step={1}
              value={startTime}
              onChange={(e) => handleStartTimeChange(parseFloat(e.target.value))}
              className="w-full mt-2 accent-pink-600 cursor-pointer"
            />
          </div>

          {/* Audio Volume Controls (Added Audio + Original Audio) */}
          <div className="space-y-2.5 pt-1">
            {/* Added Music Track Volume */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1">
                <span className="flex items-center space-x-1">
                  <Volume2 className="w-3.5 h-3.5 text-pink-600" />
                  <span>Soundtrack Volume</span>
                </span>
                <span className="font-mono text-[10px] text-zinc-500">{Math.round(musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={musicVolume}
                onChange={(e) => onChangeConfig({
                  ...config,
                  audioVolume: parseFloat(e.target.value)
                })}
                className="w-full accent-pink-600 cursor-pointer"
              />
            </div>

            {/* Original Camera / Video Audio (only if video media is uploaded) */}
            {hasVideoMedia && (
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1">
                  <span className="flex items-center space-x-1">
                    <Sliders className="w-3.5 h-3.5 text-purple-600" />
                    <span>Camera / Video Sound</span>
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">{Math.round(originalVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={originalVolume}
                  onChange={(e) => onChangeConfig({
                    ...config,
                    originalAudioVolume: parseFloat(e.target.value)
                  })}
                  className="w-full accent-purple-600 cursor-pointer"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={togglePlaySnippet}
              className="text-xs font-bold text-pink-600 hover:text-pink-700 flex items-center space-x-1.5"
            >
              {isPlayingSnippet ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlayingSnippet ? 'Pause Preview' : 'Test Clip Mix'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
