import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { MusicTrack } from '../types/index';
import { globalMediaCoordinator } from '../lib/globalMediaCoordinator';

interface AudioPlayerContextType {
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  playTrack: (track: MusicTrack) => void;
  pauseTrack: () => void;
  closePlayer: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  isFullModalOpen: boolean;
  setIsFullModalOpen: (open: boolean) => void;
  detailTrack: MusicTrack | null;
  setDetailTrack: (track: MusicTrack | null) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [isFullModalOpen, setIsFullModalOpen] = useState(false);
  const [detailTrack, setDetailTrack] = useState<MusicTrack | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      setProgress(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setProgress(0);
      globalMediaCoordinator.pause('audio-player');
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Listen to global media coordinator: if any other media (Reels, Story, Feed Video, etc.) starts playing, pause AudioPlayer!
  useEffect(() => {
    const unsubscribe = globalMediaCoordinator.subscribe(({ activeSource, activeId }) => {
      if (activeSource !== 'audio-player') {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
      }
    });
    return unsubscribe;
  }, []);

  const playTrack = (track: MusicTrack) => {
    if (!audioRef.current) return;
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        globalMediaCoordinator.pause('audio-player', track.id);
      } else {
        globalMediaCoordinator.play('audio-player', track.id);
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      }
      return;
    }

    // New track starting: broadcast so other media pauses
    globalMediaCoordinator.play('audio-player', track.id);
    setCurrentTrack(track);
    audioRef.current.src = track.audioUrl;
    audioRef.current.volume = volume;
    audioRef.current.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {
      setIsPlaying(false);
    });
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      globalMediaCoordinator.pause('audio-player', currentTrack?.id);
    }
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }
    globalMediaCoordinator.pause('audio-player', currentTrack?.id);
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setIsFullModalOpen(false);
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      globalMediaCoordinator.pause('audio-player', currentTrack.id);
    } else {
      globalMediaCoordinator.play('audio-player', currentTrack.id);
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setProgress(seconds);
    }
  };

  const setVolume = (vol: number) => {
    setVolumeState(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        playTrack,
        pauseTrack,
        closePlayer,
        togglePlay,
        seekTo,
        setVolume,
        isFullModalOpen,
        setIsFullModalOpen,
        detailTrack,
        setDetailTrack
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  return context;
};
