import React, { useState, useEffect } from 'react';
import { Post, Story, MusicTrack } from '../../types/index';
import { StoriesTray } from '../stories/StoriesTray';
import { PostCard } from './PostCard';
import { StoryViewer } from '../stories/StoryViewer';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { apiRequest } from '../../lib/api';
import { fetchPostsFromFirestore } from '../../lib/firestoreService';
import { Loader2, Sparkles } from 'lucide-react';

interface FeedViewProps {
  onSelectUser: (username: string) => void;
  onSelectTrack?: (track: MusicTrack) => void;
  onOpenCreate: (initialType?: 'post' | 'carousel' | 'reel' | 'story') => void;
  refreshTrigger?: number;
}

export const FeedView: React.FC<FeedViewProps> = ({
  onSelectUser,
  onSelectTrack,
  onOpenCreate,
  refreshTrigger
}) => {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [storiesList, setStoriesList] = useState<Story[]>([]);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number>(0);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());

  const handleStoryViewed = (storyId: string) => {
    setViewedStoryIds(prev => {
      const next = new Set(prev);
      next.add(storyId);
      return next;
    });
    setStoriesList(prev => prev.map(s => s.id === storyId ? { ...s, isViewed: true } : s));
  };

  const handleStoryLiked = (storyId: string, isLiked: boolean, likesCount: number) => {
    setStoriesList(prev => prev.map(s => s.id === storyId ? { ...s, isLiked, likesCount } : s));
  };

  const fetchFeed = async () => {
    try {
      // Prioritize direct Firestore client SDK query
      const cloudPosts = await fetchPostsFromFirestore(30);
      if (cloudPosts && cloudPosts.length > 0) {
        setPosts(cloudPosts);
      } else {
        const res = await apiRequest<{ posts: Post[] }>('/posts');
        setPosts(res.posts || []);
      }
    } catch {
      try {
        const res = await apiRequest<{ posts: Post[] }>('/posts');
        setPosts(res.posts || []);
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [user?.id, refreshTrigger]);

  // Subscribe to real-time post creations and deletions across tabs/clients
  useEffect(() => {
    const unsubDelete = subscribe('POST_DELETED', (evt) => {
      if (evt?.postId) {
        setPosts(prev => prev.filter(p => p.id !== evt.postId));
      }
    });

    const unsubCreate = subscribe('POST_CREATED', (evt) => {
      if (evt?.post) {
        setPosts(prev => {
          if (prev.some(p => p.id === evt.post.id)) return prev;
          return [evt.post, ...prev];
        });
      }
    });

    return () => {
      unsubDelete();
      unsubCreate();
    };
  }, [subscribe]);

  const handlePostDeleted = (deletedPostId: string) => {
    setPosts(prev => prev.filter(p => p.id !== deletedPostId));
  };

  return (
    <div className="w-full max-w-xl mx-auto pb-16">
      {/* Stories Carousel Tray */}
      <StoriesTray
        refreshTrigger={refreshTrigger}
        viewedStoryIds={viewedStoryIds}
        onStoryViewed={handleStoryViewed}
        onSelectStory={(story, stories, index) => {
          setActiveStory(story);
          setStoriesList(stories || [story]);
          setActiveStoryIndex(index ?? 0);
        }}
        onOpenCreateStory={(type) => onOpenCreate(type || 'story')}
      />

      {/* Feed Posts */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#1A1A1A]" />
          <p className="text-xs text-[#8E8E8E]">Loading your personalized feed...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-2xl p-8 text-center shadow-xs">
          <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-[#1A1A1A]">No posts yet</h4>
          <p className="text-xs text-[#8E8E8E] mt-1 mb-4">Be the first to share photos, videos, or music with the community!</p>
          <button
            onClick={() => onOpenCreate('post')}
            className="px-4 py-2 bg-[#1A1A1A] text-white text-xs font-semibold rounded-xl cursor-pointer"
          >
            Create First Post
          </button>
        </div>
      ) : (
        <div>
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onSelectUser={onSelectUser}
              onSelectTrack={onSelectTrack}
              onPostDeleted={handlePostDeleted}
            />
          ))}
        </div>
      )}

      {/* Story Viewer Modal */}
      {activeStory && (
        <StoryViewer
          story={activeStory}
          stories={storiesList}
          currentIndex={activeStoryIndex}
          onNavigate={(nextIndex) => {
            if (storiesList[nextIndex]) {
              setActiveStoryIndex(nextIndex);
              setActiveStory(storiesList[nextIndex]);
            }
          }}
          onStoryViewed={handleStoryViewed}
          onStoryLiked={handleStoryLiked}
          onClose={() => {
            setActiveStory(null);
            setStoriesList([]);
          }}
          onSelectUser={onSelectUser}
        />
      )}
    </div>
  );
};
