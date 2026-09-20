import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { Message } from '../../types';
import { globalMediaCoordinator } from '../../lib/globalMediaCoordinator';

interface VoiceMessageBubbleProps {
  message?: Message;
  audioUrl?: string;
  isMe: boolean;
  createdAt?: string;
  duration?: number;
}

export const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({ 
  message, 
  audioUrl: directAudioUrl, 
  isMe,
  duration: initialDuration 
}) => {
  const audioUrl = message?.mediaUrl || directAudioUrl || '';
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(message?.voiceDuration || initialDuration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Listen to global media coordinator
  useEffect(() => {
    const unsubscribe = globalMediaCoordinator.subscribe(({ activeSource, activeId }) => {
      const myId = message?.id || audioUrl;
      if (activeSource !== 'voice-note' || (activeId && activeId !== myId)) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
      }
    });
    return unsubscribe;
  }, [message?.id, audioUrl]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      globalMediaCoordinator.pause('voice-note', message?.id || audioUrl);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      globalMediaCoordinator.pause('voice-note', message?.id || audioUrl);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, [audioUrl, message?.id]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    const myId = message?.id || audioUrl;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      globalMediaCoordinator.pause('voice-note', myId);
    } else {
      globalMediaCoordinator.play('voice-note', myId);
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Audio playback error:', err);
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !duration) return;
    const seekTime = (parseFloat(e.target.value) / 100) * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`flex items-center space-x-3 py-1 px-1 min-w-[200px] max-w-[280px]`}>
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs transition-transform active:scale-95 ${
          isMe 
            ? 'bg-white text-zinc-900 hover:bg-zinc-100' 
            : 'bg-[#1A1A1A] text-white hover:bg-black'
        }`}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-1 mb-1">
          <Volume2 className={`w-3 h-3 ${isMe ? 'text-zinc-300' : 'text-zinc-500'}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isMe ? 'text-zinc-200' : 'text-zinc-600'}`}>
            Voice Note
          </span>
        </div>

        {/* Timeline slider */}
        <div className="relative flex items-center h-4">
          <input
            type="range"
            min="0"
            max="100"
            value={progressPercent}
            onChange={handleSeek}
            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
              isMe ? 'bg-zinc-700 accent-white' : 'bg-zinc-200 accent-[#1A1A1A]'
            }`}
          />
        </div>

        <div className="flex justify-between items-center text-[10px] font-mono mt-0.5">
          <span className={isMe ? 'text-zinc-300' : 'text-zinc-500'}>
            {formatTime(currentTime)}
          </span>
          <span className={isMe ? 'text-zinc-300' : 'text-zinc-500'}>
            {duration > 0 ? formatTime(duration) : '0:00'}
          </span>
        </div>
      </div>
    </div>
  );
};
