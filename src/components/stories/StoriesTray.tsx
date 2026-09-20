import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Story } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { apiRequest } from '../../lib/api';
import { Plus, Eye, X, Image as ImageIcon, Film } from 'lucide-react';

interface StoriesTrayProps {
  onSelectStory: (story: Story, stories?: Story[], index?: number) => void;
  onOpenCreateStory: (initialType?: 'post' | 'story' | 'reel') => void;
  refreshTrigger?: number;
  viewedStoryIds?: Set<string>;
  onStoryViewed?: (storyId: string) => void;
}

export const StoriesTray: React.FC<StoriesTrayProps> = ({
  onSelectStory,
  onOpenCreateStory,
  refreshTrigger,
  viewedStoryIds
}) => {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const [stories, setStories] = useState<Story[]>([]);
  const [showStoryActionSheet, setShowStoryActionSheet] = useState(false);

  const fetchStories = useCallback(async () => {
    try {
      const res = await apiRequest<{ stories: Story[] }>('/stories');
      setStories(res.stories || []);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchStories();
  }, [fetchStories, refreshTrigger]);

  useEffect(() => {
    const unsubCreated = subscribe('STORY_CREATED', (evt) => {
      if (evt?.story) {
        setStories(prev => {
          if (prev.some(s => s.id === evt.story.id)) return prev;
          return [evt.story, ...prev];
        });
      }
    });

    const unsubDeleted = subscribe('STORY_DELETED', (evt) => {
      if (evt?.storyId) {
        setStories(prev => prev.filter(s => s.id !== evt.storyId));
      }
    });

    const unsubLiked = subscribe('STORY_LIKED', (evt) => {
      if (evt?.storyId) {
        setStories(prev => prev.map(s => {
          if (s.id === evt.storyId) {
            return {
              ...s,
              isLiked: evt.userId === user?.id ? evt.isLiked : s.isLiked,
              likesCount: evt.likesCount ?? s.likesCount
            };
          }
          return s;
        }));
      }
    });

    return () => {
      unsubCreated();
      unsubDeleted();
      unsubLiked();
    };
  }, [subscribe, user?.id]);

  // Group current user's stories
  const myStories = useMemo(() => {
    if (!user) return [];
    return stories.filter(s => (
      s.userId === user.id || 
      s.author?.id === user.id || 
      s.author?.username?.toLowerCase() === user.username?.toLowerCase()
    ));
  }, [stories, user]);

  const myHasUnwatched = useMemo(() => {
    return myStories.some(s => !s.isViewed && !(viewedStoryIds?.has(s.id)));
  }, [myStories, viewedStoryIds]);

  // Group other users' stories by unique author
  const otherStoryGroups = useMemo(() => {
    const groups: {
      author: Story['author'];
      stories: Story[];
      hasUnwatched: boolean;
    }[] = [];
    const seenAuthors = new Set<string>();

    for (const story of stories) {
      const isMine = user && (
        story.userId === user.id || 
        story.author?.id === user.id || 
        story.author?.username?.toLowerCase() === user.username?.toLowerCase()
      );
      if (isMine) continue;

      const authorKey = story.author?.id || story.author?.username || story.userId;
      if (!seenAuthors.has(authorKey)) {
        seenAuthors.add(authorKey);
        const authorStories = stories.filter(s => {
          const key = s.author?.id || s.author?.username || s.userId;
          return key === authorKey;
        });

        // Highlight becomes normal as soon as all stories of this author are watched
        const hasUnwatched = authorStories.some(s => !s.isViewed && !(viewedStoryIds?.has(s.id)));

        groups.push({
          author: story.author,
          stories: authorStories,
          hasUnwatched
        });
      }
    }

    return groups;
  }, [stories, user, viewedStoryIds]);

  const handleMyStoryClick = () => {
    if (myStories.length > 0) {
      setShowStoryActionSheet(true);
    } else {
      onOpenCreateStory('story');
    }
  };

  return (
    <div className="w-full bg-white border-b border-gray-100 py-2.5 px-3 overflow-x-auto no-scrollbar flex items-center space-x-3.5 select-none">
      {/* Create / Your Story */}
      <div 
        onClick={handleMyStoryClick}
        className="flex flex-col items-center cursor-pointer shrink-0 group"
      >
        <div className="relative">
          <div className={
            myStories.length > 0
              ? (myHasUnwatched
                  ? "p-[2.5px] rounded-full bg-gradient-to-tr from-[#FBAA47] via-[#D91A46] to-[#A60F93] transition-transform"
                  : "p-[1.5px] rounded-full bg-gray-300 transition-transform")
              : "p-0.5 rounded-full"
          }>
            <div className="p-[2px] bg-white rounded-full">
              <img
                src={user?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${user?.username || 'me'}`}
                alt="Your Story"
                className="w-[58px] h-[58px] rounded-full object-cover"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCreateStory('story');
            }}
            title="Add to story"
            className="absolute bottom-0 right-0 w-5 h-5 bg-[#D91A46] text-white rounded-full flex items-center justify-center border-2 border-white shadow-xs hover:scale-105 active:scale-95 transition-transform"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
          </button>
        </div>
        <span className="text-[11px] font-normal text-black max-w-[68px] truncate text-center mt-1">
          Your story
        </span>
      </div>

      {/* Other Authors' Stories */}
      {otherStoryGroups.map((group) => (
        <div
          key={group.author?.id || group.author?.username}
          onClick={() => {
            const firstUnwatched = group.stories.find(s => !s.isViewed && !(viewedStoryIds?.has(s.id))) || group.stories[0];
            const targetIdx = group.stories.indexOf(firstUnwatched);
            onSelectStory(firstUnwatched, group.stories, targetIdx);
          }}
          className="flex flex-col items-center cursor-pointer shrink-0 group"
        >
          {/* Highlighted ring if any unwatched stories exist, becomes normal when watched */}
          <div className={
            group.hasUnwatched
              ? "p-[2.5px] rounded-full bg-gradient-to-tr from-[#FBAA47] via-[#D91A46] to-[#A60F93] transition-all duration-300"
              : "p-[1.5px] rounded-full bg-gray-300 transition-all duration-300"
          }>
            <div className="p-[2px] bg-white rounded-full">
              <img
                src={group.author?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${group.author?.username || 'user'}`}
                alt={group.author?.username || group.author?.displayName || 'User'}
                className="w-[58px] h-[58px] rounded-full object-cover"
              />
            </div>
          </div>
          <span className="text-[11px] font-normal text-black max-w-[68px] truncate text-center mt-1">
            {group.author?.username || (group.author?.displayName ? group.author.displayName.split(' ')[0] : 'user')}
          </span>
        </div>
      ))}
      {/* Story Profile Icon Upload / View Action Sheet */}
      {showStoryActionSheet && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowStoryActionSheet(false)}
        >
          <div 
            className="w-full sm:max-w-xs bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-4 sm:hidden" />
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#FBAA47] via-[#D91A46] to-[#A60F93]">
                  <img
                    src={user?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${user?.username || 'me'}`}
                    alt="Profile"
                    className="w-10 h-10 rounded-full object-cover border border-white"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">{user?.displayName || user?.username}</h3>
                  <p className="text-[11px] text-zinc-500">Your Story & Posts</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowStoryActionSheet(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                id="story-tray-upload-story-action-btn"
                type="button"
                onClick={() => {
                  setShowStoryActionSheet(false);
                  onOpenCreateStory('story');
                }}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95 active:scale-98 text-white text-xs font-bold rounded-2xl flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add to Story (24h)</span>
              </button>

              <button
                id="story-tray-upload-post-action-btn"
                type="button"
                onClick={() => {
                  setShowStoryActionSheet(false);
                  onOpenCreateStory('post');
                }}
                className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 active:scale-98 text-zinc-800 text-xs font-semibold rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-zinc-600" />
                <span>New Feed Post / Reel</span>
              </button>

              <button
                id="story-tray-view-story-action-btn"
                type="button"
                onClick={() => {
                  setShowStoryActionSheet(false);
                  const targetStory = myStories.find(s => !s.isViewed && !(viewedStoryIds?.has(s.id))) || myStories[0];
                  const targetIdx = myStories.indexOf(targetStory);
                  onSelectStory(targetStory, myStories, targetIdx);
                }}
                className="w-full py-2.5 px-4 border border-zinc-200 hover:bg-zinc-50 active:scale-98 text-zinc-700 text-xs font-medium rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4 text-zinc-500" />
                <span>View Your Story</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
