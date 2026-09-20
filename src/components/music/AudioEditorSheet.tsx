import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Scissors, 
  RotateCcw, 
  Check, 
  Music, 
  Disc, 
  RefreshCw,
  Clock,
  Sparkles,
  Trash2
} from 'lucide-react';
import { MusicTrack, AudioAttachmentConfig } from '../../types/index';

export interface AudioEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  track: MusicTrack;
  config: AudioAttachmentConfig;
  onChangeConfig: (newConfig: AudioAttachmentConfig) => void;
  onRemoveTrack: () => void;
  onChangeTrack: () => void;
  mediaUrl?: string;
  mediaType?: 'video' | 'image' | 'carousel';
  hasVideoMedia?: boolean;
}

export const AudioEditorSheet: React.FC<AudioEditorSheetProps> = ({
  isOpen,
  onClose,
  track,
  config,
  onChangeConfig,
  onRemoveTrack,
  onChangeTrack,
  mediaUrl,
  mediaType = 'video',
  hasVideoMedia = true
}) => {
  const totalDuration = Math.max(10, Math.round(track.duration || 30));
  
  // Audio configuration values
  const [startTime, setStartTime] = useState<number>(config.audioStartTime ?? 0);
  const initialClipLength = config.audioEndTime 
    ? Math.max(5, config.audioEndTime - (config.audioStartTime ?? 0))
    : Math.min(30, totalDuration);
  const [clipLength, setClipLength] = useState<number>(initialClipLength);
  const [musicVolume, setMusicVolume] = useState<number>(config.audioVolume ?? 0.8);
  const [originalVolume, setOriginalVolume] = useState<number>(config.originalAudioVolume ?? 1.0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentPlaybackOffset, setCurrentPlaybackOffset] = useState<number>(0);

  // Element refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync state if props change
  useEffect(() => {
    setStartTime(config.audioStartTime ?? 0);
    const length = config.audioEndTime 
      ? Math.max(5, config.audioEndTime - (config.audioStartTime ?? 0))
      : Math.min(30, totalDuration);
    setClipLength(length);
    setMusicVolume(config.audioVolume ?? 0.8);
    setOriginalVolume(config.originalAudioVolume ?? 1.0);
  }, [config, totalDuration]);

  // Audio element setup
  useEffect(() => {
    if (!isOpen) return;

    const audio = new Audio(track.audioUrl);
    audioRef.current = audio;
    audio.volume = musicVolume;
    audio.currentTime = startTime;

    const onTimeUpdate = () => {
      const offset = audio.currentTime - startTime;
      setCurrentPlaybackOffset(Math.max(0, offset));

      // Loop snippet if reached end of segment
      if (audio.currentTime >= startTime + clipLength) {
        audio.currentTime = startTime;
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        }
        audio.play().catch(() => {});
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentPlaybackOffset(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.src = '';
    };
  }, [isOpen, track.audioUrl, startTime, clipLength]);

  // Synchronized volume updates
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = originalVolume;
    }
  }, [originalVolume]);

  // Toggle Synchronized Playback
  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      videoRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = startTime + currentPlaybackOffset;
        audioRef.current.volume = musicVolume;
        audioRef.current.play().catch(() => {});
      }
      if (videoRef.current) {
        videoRef.current.volume = originalVolume;
        videoRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  };

  // Preset clip length chips
  const handlePresetLength = (len: number) => {
    const validLen = Math.min(len, totalDuration);
    setClipLength(validLen);
    const newStart = Math.min(startTime, totalDuration - validLen);
    setStartTime(newStart);
    if (audioRef.current) {
      audioRef.current.currentTime = newStart;
    }
  };

  // Handle start time slider change
  const handleStartTimeChange = (newStart: number) => {
    const maxStart = Math.max(0, totalDuration - clipLength);
    const clamped = Math.min(Math.max(0, newStart), maxStart);
    setStartTime(clamped);
    setCurrentPlaybackOffset(0);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  };

  // Save changes and close
  const handleApply = () => {
    audioRef.current?.pause();
    videoRef.current?.pause();
    setIsPlaying(false);

    onChangeConfig({
      ...config,
      audioId: track.id,
      audioStartTime: startTime,
      audioEndTime: startTime + clipLength,
      audioVolume: musicVolume,
      originalAudioVolume: originalVolume
    });
    onClose();
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full sm:max-w-xl h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 leading-tight">Audio Editor</h2>
              <p className="text-[11px] text-zinc-400 font-medium">Trim segment & balance soundtrack volume</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              videoRef.current?.pause();
              onClose();
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          {/* Track Summary Banner */}
          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0 flex-1 pr-3">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-xs border border-black/5 bg-zinc-900">
                <img
                  src={track.artwork || track.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200'}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
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
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Duration: {formatSeconds(totalDuration)}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={onChangeTrack}
                className="px-3 py-1.5 rounded-full bg-zinc-200/70 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold transition-colors cursor-pointer"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  audioRef.current?.pause();
                  videoRef.current?.pause();
                  onRemoveTrack();
                  onClose();
                }}
                className="p-1.5 rounded-full text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Remove soundtrack"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Synchronized Video Preview (if video exists) */}
          {hasVideoMedia && mediaUrl && (
            <div className="relative w-full max-w-xs mx-auto aspect-[9/16] max-h-56 rounded-2xl overflow-hidden bg-black shadow-md border border-zinc-800 flex items-center justify-center">
              <video
                ref={videoRef}
                src={mediaUrl}
                loop
                playsInline
                className="w-full h-full object-contain"
              />
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-xs flex items-center justify-center text-white transition-transform active:scale-95 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
              </button>
            </div>
          )}

          {/* Synchronized Audio Player Bar (if no video) */}
          {(!hasVideoMedia || !mediaUrl) && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={togglePlay}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold shadow-md flex items-center space-x-2 hover:opacity-95 active:scale-95 transition-all cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Pause Preview</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Test Synchronized Audio</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Clip Duration Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-800 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-pink-600" />
                <span>Audio Clip Duration</span>
              </label>
              <span className="text-xs font-bold text-pink-600 font-mono">
                {clipLength}s
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {[15, 30, 60].map((len) => {
                if (len > totalDuration && len !== 15) return null;
                const isSelected = clipLength === len;
                return (
                  <button
                    key={len}
                    type="button"
                    onClick={() => handlePresetLength(len)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {len}s Clip
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handlePresetLength(totalDuration)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  clipLength === totalDuration
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                Full ({totalDuration}s)
              </button>
            </div>
          </div>

          {/* Visual Waveform & Audio Scrubber */}
          <div className="space-y-2.5 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-700">Audio Timeline Selection</span>
              <span className="font-mono text-zinc-500 font-semibold">
                {formatSeconds(startTime)} — {formatSeconds(startTime + clipLength)}
              </span>
            </div>

            {/* Simulated waveform bars */}
            <div className="relative h-14 bg-zinc-200/80 rounded-xl overflow-hidden flex items-center px-1 space-x-1">
              {Array.from({ length: 42 }).map((_, i) => {
                const ratio = i / 42;
                const trackSec = ratio * totalDuration;
                const isInSelectedRange = trackSec >= startTime && trackSec <= startTime + clipLength;
                const barHeight = Math.sin(i * 0.7) * 40 + 55;

                return (
                  <div
                    key={i}
                    className="flex-1 flex items-center justify-center h-full"
                  >
                    <span
                      className={`w-1 rounded-full transition-colors ${
                        isInSelectedRange
                          ? 'bg-pink-600'
                          : 'bg-zinc-400/50'
                      }`}
                      style={{ height: `${Math.max(15, barHeight)}%` }}
                    />
                  </div>
                );
              })}

              {/* Range Window Indicator */}
              <div
                className="absolute top-0 bottom-0 border-2 border-pink-600 bg-pink-500/15 rounded-lg pointer-events-none transition-all"
                style={{
                  left: `${(startTime / totalDuration) * 100}%`,
                  width: `${(clipLength / totalDuration) * 100}%`
                }}
              />
            </div>

            {/* Range Slider for Start Position */}
            <div>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalDuration - clipLength)}
                step={0.5}
                value={startTime}
                onChange={(e) => handleStartTimeChange(parseFloat(e.target.value))}
                className="w-full accent-pink-600 cursor-pointer h-2 bg-zinc-200 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-zinc-400 font-mono mt-1">
                <span>0:00</span>
                <span>Start: {formatSeconds(startTime)}</span>
                <span>{formatSeconds(totalDuration)}</span>
              </div>
            </div>
          </div>

          {/* Dual Volume Sliders: Soundtrack & Original Video */}
          <div className="space-y-4 pt-1">
            {/* Soundtrack Volume */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 text-zinc-700 font-bold">
                  <Volume2 className="w-4 h-4 text-pink-600" />
                  <span>Soundtrack Volume</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-zinc-600 font-bold">{Math.round(musicVolume * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setMusicVolume(musicVolume > 0 ? 0 : 0.8)}
                    className="text-zinc-400 hover:text-zinc-700 text-[11px] font-semibold"
                  >
                    {musicVolume === 0 ? 'Unmute' : 'Mute'}
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={musicVolume}
                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                className="w-full accent-pink-600 cursor-pointer h-2 bg-zinc-200 rounded-lg appearance-none"
              />
            </div>

            {/* Original Video Volume (Only if video media is present) */}
            {hasVideoMedia && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-zinc-700 font-bold">
                    <Disc className="w-4 h-4 text-indigo-600" />
                    <span>Original Video Audio</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-zinc-600 font-bold">{Math.round(originalVolume * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => setOriginalVolume(originalVolume > 0 ? 0 : 1.0)}
                      className="text-zinc-400 hover:text-zinc-700 text-[11px] font-semibold"
                    >
                      {originalVolume === 0 ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={originalVolume}
                  onChange={(e) => setOriginalVolume(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer h-2 bg-zinc-200 rounded-lg appearance-none"
                />
              </div>
            )}
          </div>

        </div>

        {/* Bottom CTA Footer */}
        <div className="px-5 py-4 border-t border-zinc-100 bg-white flex items-center space-x-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              videoRef.current?.pause();
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:opacity-95 active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Apply Soundtrack</span>
          </button>
        </div>

      </div>
    </div>
  );
};
