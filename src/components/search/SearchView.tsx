import React, { useState, useEffect } from 'react';
import { UserPreview, Post, Reel, MusicTrack, Hashtag, SearchTab } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { FollowButton } from '../common/FollowButton';
import { MediaGrid } from '../common/MediaGrid';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { useRealtime } from '../../context/RealtimeContext';
import { Search, Users, Music, Film, Hash, Play, Pause, Sparkles, Grid } from 'lucide-react';

interface SearchViewProps {
  onSelectUser: (username: string) => void;
  onSelectTrack?: (track: MusicTrack) => void;
  onSelectReel?: (reelId: string) => void;
  refreshTrigger?: number;
}

export const SearchView: React.FC<SearchViewProps> = ({
  onSelectUser,
  onSelectTrack,
  onSelectReel,
  refreshTrigger
}) => {
  const { currentTrack, isPlaying, playTrack } = useAudioPlayer();
  const { subscribe } = useRealtime();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('top');
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<UserPreview[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);

  const executeSearch = async (q: string) => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        users: UserPreview[];
        posts: Post[];
        reels: Reel[];
        tracks: MusicTrack[];
        hashtags: Hashtag[];
      }>(`/search?q=${encodeURIComponent(q)}`);

      const demoUsernames = ['elena', 'alex', 'maya'];
      const demoIds = ['user-elena', 'user-alex', 'user-maya'];

      setUsers((res.users || []).filter(u => !demoIds.includes(u.id) && !demoUsernames.includes(u.username.toLowerCase())));
      setPosts((res.posts || []).filter(p => !demoIds.includes(p.userId) && !demoUsernames.includes(p.author?.username?.toLowerCase())));
      setReels((res.reels || []).filter(r => !demoIds.includes(r.userId) && !demoUsernames.includes(r.author?.username?.toLowerCase())));
      setTracks(res.tracks || []);
      setHashtags(res.hashtags || []);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      executeSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, refreshTrigger]);

  useEffect(() => {
    const unsubPost = subscribe('POST_CREATED', () => executeSearch(query));
    const unsubReel = subscribe('REEL_CREATED', () => executeSearch(query));
    return () => {
      unsubPost();
      unsubReel();
    };
  }, [subscribe, query]);

  const tabs: { id: SearchTab; label: string; icon: any }[] = [
    { id: 'top', label: 'Top', icon: Sparkles },
    { id: 'posts', label: 'Posts', icon: Grid },
    { id: 'reels', label: 'Reels', icon: Film },
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'tags', label: 'Tags', icon: Hash },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto pb-20 space-y-6">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E8E]" />
        <input
          type="text"
          placeholder="Search accounts, audio tracks, hashtags, and posts..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-[#EEEEEE] focus:border-[#1A1A1A] rounded-2xl text-xs outline-none shadow-xs transition-colors"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-[#EEEEEE] pb-2 overflow-x-auto no-scrollbar">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-[#1A1A1A] text-white shadow-xs'
                  : 'text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Renderers */}
      {loading ? (
        <div className="text-center py-12 text-xs text-[#8E8E8E]">Searching...</div>
      ) : (
        <div className="space-y-6">
          {/* Top / Accounts View */}
          {(activeTab === 'top' || activeTab === 'accounts') && users.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">Accounts</h4>
              <div className="space-y-2">
                {users.map(u => (
                  <div
                    key={u.id}
                    className="bg-white border border-[#EEEEEE] p-3.5 rounded-2xl flex items-center justify-between shadow-xs hover:border-gray-300 transition-colors"
                  >
                    <div
                      onClick={() => onSelectUser(u.username)}
                      className="flex items-center space-x-3 cursor-pointer min-w-0 flex-1 mr-2"
                    >
                      <img
                        src={u.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${u.username}`}
                        alt={u.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-[#EEEEEE]"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#1A1A1A] truncate">{u.displayName}</p>
                        <p className="text-[11px] text-[#8E8E8E] truncate">@{u.username}</p>
                      </div>
                    </div>
                    <FollowButton targetUserId={u.id} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Posts / Photos & Videos Grid */}
          {(activeTab === 'top' || activeTab === 'posts') && posts.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">Posts & Videos</h4>
              <MediaGrid
                items={posts.map(p => ({
                  id: p.id,
                  mediaUrl: p.mediaUrl || p.carouselItems?.[0]?.mediaUrl || '',
                  thumbnailUrl: p.thumbnailUrl || p.carouselItems?.[0]?.thumbnailUrl,
                  mediaType: p.mediaType === 'video' ? 'video' : 'image',
                  caption: p.caption,
                  likesCount: p.likesCount,
                  commentsCount: p.commentsCount,
                  authorUsername: p.author?.username
                }))}
                aspectRatio="square"
                onItemClick={(item) => {
                  if (item.authorUsername) {
                    onSelectUser(item.authorUsername);
                  }
                }}
              />
            </div>
          )}

          {/* Reels / Media Grid */}
          {(activeTab === 'top' || activeTab === 'reels') && reels.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">Reels</h4>
              <MediaGrid
                items={reels.map(r => ({
                  id: r.id,
                  mediaUrl: r.videoUrl,
                  thumbnailUrl: r.thumbnailUrl,
                  mediaType: 'video',
                  isReel: true,
                  caption: r.caption,
                  likesCount: r.likesCount,
                  commentsCount: r.commentsCount,
                  authorUsername: r.author.username
                }))}
                aspectRatio="square"
                onItemClick={(item) => {
                  if (onSelectReel) {
                    onSelectReel(item.id);
                  } else if (item.authorUsername) {
                    onSelectUser(item.authorUsername);
                  }
                }}
              />
            </div>
          )}

          {/* Audio Tracks */}
          {(activeTab === 'top' || activeTab === 'audio') && tracks.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">Audio Tracks</h4>
              <div className="space-y-2">
                {tracks.map(t => {
                  const isCurrent = currentTrack?.id === t.id && isPlaying;
                  return (
                    <div
                      key={t.id}
                      className="bg-white border border-[#EEEEEE] p-3 rounded-2xl flex items-center justify-between shadow-xs"
                    >
                      <div
                        onClick={() => {
                          if (onSelectTrack) onSelectTrack(t);
                          playTrack(t);
                        }}
                        className="flex items-center space-x-3 min-w-0 cursor-pointer flex-1 mr-2"
                      >
                        <img
                          src={t.coverUrl}
                          alt={t.title}
                          className="w-10 h-10 rounded-xl object-cover border border-[#EEEEEE]"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1A1A1A] truncate">{t.title}</p>
                          <p className="text-[11px] text-[#8E8E8E] truncate">{t.artist}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => playTrack(t)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          isCurrent ? 'bg-[#1A1A1A] text-white' : 'bg-[#F0F0F0] text-[#1A1A1A]'
                        }`}
                      >
                        {isCurrent ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hashtags */}
          {(activeTab === 'top' || activeTab === 'tags') && hashtags.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">Hashtags</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {hashtags.map(h => (
                  <button
                    key={h.name}
                    onClick={() => setQuery(h.name)}
                    className="p-3 bg-white border border-[#EEEEEE] rounded-2xl flex items-center space-x-2.5 text-left hover:border-gray-300 transition-colors shadow-xs"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-[#1A1A1A]">
                      <Hash className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#1A1A1A] truncate">#{h.name}</p>
                      <p className="text-[10px] text-[#8E8E8E]">{h.postsCount} posts</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty Results */}
          {users.length === 0 && posts.length === 0 && reels.length === 0 && tracks.length === 0 && (
            <div className="text-center py-16 text-xs text-[#8E8E8E]">
              No results found for "{query}". Try another search!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
