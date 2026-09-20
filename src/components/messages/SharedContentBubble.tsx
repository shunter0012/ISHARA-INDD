import React from 'react';
import { SharedContentReference } from '../../types';
import { Film, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface SharedContentBubbleProps {
  sharedContent: SharedContentReference;
  isMe: boolean;
  onSelectReel?: (reelId: string) => void;
  onSelectPost?: (postId: string) => void;
  onSelectUser?: (username: string) => void;
}

export const SharedContentBubble: React.FC<SharedContentBubbleProps> = ({
  sharedContent,
  isMe,
  onSelectReel,
  onSelectPost,
  onSelectUser
}) => {
  if (sharedContent.isAvailable === false) {
    return (
      <div className={`flex items-center space-x-2.5 p-3 rounded-2xl border text-xs ${
        isMe ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-600'
      }`}>
        <AlertCircle className="w-4 h-4 shrink-0 text-zinc-400" />
        <span className="italic">This content is unavailable or has been deleted.</span>
      </div>
    );
  }

  const isReel = sharedContent.type?.toLowerCase() === 'reel';
  const authorUsername = sharedContent.author?.username || sharedContent.authorUsername || 'User';
  const authorAvatar = sharedContent.author?.avatarUrl || sharedContent.authorAvatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${authorUsername}`;

  const handleClick = () => {
    if (isReel && onSelectReel) {
      onSelectReel(sharedContent.id);
    } else if (!isReel && onSelectPost) {
      onSelectPost(sharedContent.id);
    }
  };

  const previewImage = sharedContent.thumbnailUrl || (sharedContent.mediaType === 'image' ? sharedContent.mediaUrl : undefined);

  return (
    <div
      onClick={handleClick}
      className={`group cursor-pointer overflow-hidden rounded-2xl border transition-all duration-150 hover:shadow-md max-w-[260px] sm:max-w-[290px] ${
        isMe 
          ? 'bg-zinc-800/95 border-zinc-700 hover:border-zinc-500' 
          : 'bg-white border-zinc-200 hover:border-zinc-300'
      }`}
    >
      {/* Author Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100/10">
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (authorUsername && onSelectUser) {
              onSelectUser(authorUsername);
            }
          }}
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
        >
          <img
            src={authorAvatar}
            alt=""
            className="w-5 h-5 rounded-full object-cover"
          />
          <span className={`text-xs font-semibold truncate max-w-[130px] ${isMe ? 'text-white' : 'text-zinc-900'}`}>
            @{authorUsername}
          </span>
        </div>

        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
          isReel 
            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        }`}>
          {isReel ? <Film className="w-2.5 h-2.5 mr-1" /> : <ImageIcon className="w-2.5 h-2.5 mr-1" />}
          {isReel ? 'Reel' : 'Post'}
        </span>
      </div>

      {/* Visual Thumbnail */}
      <div className="relative aspect-4/3 bg-zinc-950 overflow-hidden">
        {previewImage ? (
          <img
            src={previewImage}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : sharedContent.mediaUrl ? (
          <video
            src={sharedContent.mediaUrl}
            className="w-full h-full object-cover"
            preload="metadata"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
            {isReel ? <Film className="w-8 h-8 mb-1" /> : <ImageIcon className="w-8 h-8 mb-1" />}
            <span className="text-[11px] font-medium">Shared Media</span>
          </div>
        )}

        {isReel && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
            <div className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white shadow-lg">
              <Film className="w-4 h-4 ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Caption Preview */}
      {sharedContent.caption && (
        <div className="p-2.5">
          <p className={`text-xs line-clamp-2 leading-relaxed ${isMe ? 'text-zinc-300' : 'text-zinc-700'}`}>
            <span className="font-semibold mr-1">@{authorUsername}</span>
            {sharedContent.caption}
          </p>
        </div>
      )}
    </div>
  );
};
