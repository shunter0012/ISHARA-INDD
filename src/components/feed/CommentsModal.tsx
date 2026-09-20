import React, { useState, useEffect } from 'react';
import { Comment } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { X, Send, Heart, Trash2 } from 'lucide-react';
import { VerifiedBadge } from '../common/VerifiedBadge';

interface CommentsModalProps {
  isOpen: boolean;
  postId: string;
  onClose: () => void;
  onCommentAdded?: () => void;
  onCommentDeleted?: () => void;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({
  isOpen,
  postId,
  onClose,
  onCommentAdded,
  onCommentDeleted
}) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOwnerAdmin =
    user?.role === 'OWNER_ADMIN' ||
    user?.role === 'ADMIN' ||
    user?.username?.toLowerCase() === 'shuv' ||
    user?.id === 'user-shuv';

  const fetchComments = async () => {
    try {
      const res = await apiRequest<{ comments: Comment[] }>(`/posts/${postId}/comments`);
      setComments(res.comments || []);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, postId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ comment: Comment }>(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: newComment.trim() })
      });
      setComments(prev => [...prev, res.comment]);
      setNewComment('');
      onCommentAdded?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    setErrorMsg(null);
    try {
      await apiRequest(`/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE'
      });
      setComments(prev => prev.filter(c => c.id !== commentId));
      onCommentDeleted?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full h-[520px] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#EEEEEE] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-[#1A1A1A]">Comments</h3>
            {comments.length > 0 && (
              <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-semibold">
                {comments.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8E8E8E] hover:text-[#1A1A1A] rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error notification if any */}
        {errorMsg && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-red-600 text-xs flex justify-between items-center">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-32 text-xs text-[#8E8E8E]">
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#8E8E8E]">
              No comments yet. Start the conversation!
            </div>
          ) : (
            comments.map(c => {
              const isCommentLiked = Boolean(c.isLiked);
              const canDelete = Boolean(
                user && (
                  user.id === c.userId || 
                  user.id === c.author?.id || 
                  user.username?.toLowerCase() === c.author?.username?.toLowerCase() || 
                  isOwnerAdmin
                )
              );

              const handleToggleCommentLike = async () => {
                const prevLiked = isCommentLiked;
                const prevCount = c.likesCount || 0;
                const nextLiked = !prevLiked;
                const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

                setComments(prev =>
                  prev.map(item =>
                    item.id === c.id
                      ? { ...item, isLiked: nextLiked, likesCount: nextCount }
                      : item
                  )
                );

                try {
                  const res = await apiRequest<{ isLiked: boolean; likesCount: number }>(
                    `/posts/${postId}/comments/${c.id}/like`,
                    { method: 'POST' }
                  );
                  setComments(prev =>
                    prev.map(item =>
                      item.id === c.id
                        ? { ...item, isLiked: res.isLiked, likesCount: res.likesCount }
                        : item
                    )
                  );
                } catch {
                  setComments(prev =>
                    prev.map(item =>
                      item.id === c.id
                        ? { ...item, isLiked: prevLiked, likesCount: prevCount }
                        : item
                    )
                  );
                }
              };

              return (
                <div key={c.id} className="flex space-x-3 text-xs items-start group">
                  <img
                    src={c.author.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${c.author.username}`}
                    alt={c.author.displayName}
                    className="w-8 h-8 rounded-full object-cover border border-[#EEEEEE] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="bg-[#F9F9F9] p-2.5 rounded-xl">
                      <div className="flex items-center space-x-1.5">
                        <p className="font-bold text-[#1A1A1A] truncate">{c.author.displayName}</p>
                        {c.author.verified && <VerifiedBadge size="xs" />}
                      </div>
                      <p className="text-[#333333] mt-0.5 whitespace-pre-wrap break-words">{c.text}</p>
                    </div>
                    <div className="flex items-center space-x-3 px-1 mt-1 text-[10px] text-[#8E8E8E]">
                      <span>
                        {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {c.likesCount > 0 && (
                        <span className="font-semibold text-zinc-600">
                          {c.likesCount} {c.likesCount === 1 ? 'like' : 'likes'}
                        </span>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          disabled={deletingCommentId === c.id}
                          className="opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 flex items-center space-x-1 cursor-pointer disabled:opacity-50 font-medium px-1.5 py-0.5 rounded hover:bg-red-50"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCommentLike}
                    className="p-1 text-zinc-400 hover:text-[#FF3B30] transition-colors mt-2 shrink-0 active:scale-125 cursor-pointer"
                    title="Like comment"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isCommentLiked ? 'fill-[#FF3B30] text-[#FF3B30]' : 'stroke-[1.75]'
                      }`}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        {user ? (
          <form onSubmit={handleSubmit} className="p-3 border-t border-[#EEEEEE] flex items-center space-x-2 bg-white">
            <input
              type="text"
              placeholder="Add a comment..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              className="flex-1 px-3.5 py-2 bg-[#F5F5F5] border border-transparent focus:border-gray-300 rounded-xl text-xs outline-none"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="p-2 bg-[#1A1A1A] hover:bg-black text-white rounded-xl disabled:opacity-40 transition-opacity cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="p-3 border-t border-[#EEEEEE] text-center text-xs text-[#8E8E8E]">
            Please log in to leave a comment.
          </div>
        )}
      </div>
    </div>
  );
};
