import React, { createContext, useContext, useState, useCallback } from 'react';

interface VideoPlaybackContextType {
  activeVideoId: string | null;
  setActiveVideoId: React.Dispatch<React.SetStateAction<string | null>>;
  isGlobalMuted: boolean;
  toggleGlobalMute: () => void;
}

const VideoPlaybackContext = createContext<VideoPlaybackContextType | undefined>(undefined);

export const VideoPlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isGlobalMuted, setIsGlobalMuted] = useState<boolean>(true);

  const toggleGlobalMute = useCallback(() => {
    setIsGlobalMuted(prev => !prev);
  }, []);

  return (
    <VideoPlaybackContext.Provider
      value={{
        activeVideoId,
        setActiveVideoId,
        isGlobalMuted,
        toggleGlobalMute
      }}
    >
      {children}
    </VideoPlaybackContext.Provider>
  );
};

export const useVideoPlayback = () => {
  const context = useContext(VideoPlaybackContext);
  if (!context) throw new Error('useVideoPlayback must be used within a VideoPlaybackProvider');
  return context;
};
