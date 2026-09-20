import React, { useState, useEffect } from 'react';
import { UserPreview, MusicTrack } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { FollowButton } from '../common/FollowButton';
import { apiRequest } from '../../lib/api';
import { Play, Pause, Music, Sparkles } from 'lucide-react';

interface RightSidebarProps {
  onSelectUser: (username: string) => void;
  onSelectTrack?: (track: MusicTrack) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  onSelectUser,
  onSelectTrack
}) => {
  const { user } = useAuth();
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();
  const [suggestions, setSuggestions] = useState<UserPreview[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<MusicTrack[]>([]);

  useEffect(() => {
    const fetchSidebarData = async () => {
      try {
        const searchRes = await apiRequest<{ users: UserPreview[]; tracks: MusicTrack[] }>('/search');
        if (searchRes.users) {
          const demoUsernames = ['elena', 'alex', 'maya'];
          const demoIds = ['user-elena', 'user-alex', 'user-maya'];
          setSuggestions(
            searchRes.users
              .filter(u => u.id !== user?.id && !demoIds.includes(u.id) && !demoUsernames.includes(u.username.toLowerCase()))
              .slice(0, 4)
          );
        }
        if (searchRes.tracks) {
          setTrendingTracks(searchRes.tracks.slice(0, 3));
        }
      } catch {
        // Ignore
      }
    };
    fetchSidebarData();
  }, [user]);

  return (
    <aside className="hidden lg:block w-80 shrink-0 p-4 space-y-6">
      {/* Current User Card */}
      {user && (
        <div 
          onClick={() => onSelectUser(user.username)}
          className="bg-white border border-[#EEEEEE] p-3.5 rounded-2xl flex items-center justify-between cursor-pointer hover:border-gray-300 transition-colors shadow-xs"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src={user.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${user.username}`}
              alt={user.displayName}
              className="w-11 h-11 rounded-full object-cover border border-[#EEEEEE]"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#1A1A1A] truncate">{user.displayName}</p>
              <p className="text-[11px] text-[#8E8E8E] truncate">@{user.username}</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[#1A1A1A] hover:underline shrink-0">
            Profile
          </span>
        </div>
      )}

      {/* Suggested For You */}
      {suggestions.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Suggested for you</span>
            </span>
          </div>

          <div className="space-y-2.5">
            {suggestions.map(s => (
              <div key={s.id} className="flex items-center justify-between py-1">
                <div 
                  onClick={() => onSelectUser(s.username)}
                  className="flex items-center space-x-2.5 min-w-0 cursor-pointer group flex-1 mr-2"
                >
                  <img
                    src={s.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${s.username}`}
                    alt={s.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-[#EEEEEE]"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1A1A1A] group-hover:underline truncate">
                      {s.displayName}
                    </p>
                    <p className="text-[11px] text-[#8E8E8E] truncate">@{s.username}</p>
                  </div>
                </div>
                <FollowButton targetUserId={s.id} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trending Audio */}
      {trendingTracks.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] p-4 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider flex items-center space-x-1.5">
              <Music className="w-3.5 h-3.5 text-blue-500" />
              <span>Trending Audio</span>
            </span>
          </div>

          <div className="space-y-2.5">
            {trendingTracks.map(t => {
              const isCurrentPlaying = currentTrack?.id === t.id && isPlaying;
              return (
                <div 
                  key={t.id} 
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-[#F9F9F9] transition-colors"
                >
                  <div 
                    onClick={() => onSelectTrack?.(t)}
                    className="flex items-center space-x-2.5 min-w-0 cursor-pointer flex-1 mr-2"
                  >
                    <img
                      src={t.coverUrl}
                      alt={t.title}
                      className="w-9 h-9 rounded-lg object-cover border border-[#EEEEEE]"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1A1A1A] truncate">{t.title}</p>
                      <p className="text-[11px] text-[#8E8E8E] truncate">{t.artist}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => playTrack(t)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      isCurrentPlaying ? 'bg-[#1A1A1A] text-white' : 'bg-[#F0F0F0] text-[#1A1A1A] hover:bg-[#E0E0E0]'
                    }`}
                  >
                    {isCurrentPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-[11px] text-[#8E8E8E] leading-relaxed space-y-2 px-1">
        <p>© 2026 ISHARA SOCIAL • CREATIVE PLATFORM</p>
      </div>
    </aside>
  );
};
