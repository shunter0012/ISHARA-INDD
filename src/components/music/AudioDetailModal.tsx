import React, { useState, useEffect } from 'react';
import { MusicTrack, Post, Reel } from '../../types/index';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { MediaGrid } from '../common/MediaGrid';
import { apiRequest } from '../../lib/api';
import { 
  X, 
  Play, 
  Pause, 
  Music, 
  Bookmark, 
  Share2, 
  Flag, 
  Sparkles, 
  Plus, 
  Volume2, 
  Check, 
  AlertCircle,
  Radio,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

interface AudioDetailModalProps {
  track: MusicTrack | null;
  onClose: () => void;
  onSelectUser: (username: string) => void;
  onSelectReel?: (reelId: string) => void;
  onUseAudio?: (track: MusicTrack) => void;
}

export const AudioDetailModal: React.FC<AudioDetailModalProps> = ({
  track,
  onClose,
  onSelectUser,
  onSelectReel,
  onUseAudio
}) => {
  const { currentTrack, isPlaying, playTrack, progress, duration, seekTo } = useAudioPlayer();
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [relatedReels, setRelatedReels] = useState<Reel[]>([]);
  const [isSaved, setIsSaved] = useState(track?.isSaved || false);
  const [saveCount, setSaveCount] = useState(track?.saveCount || 0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Reporting Dialog State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('COPYRIGHT');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  useEffect(() => {
    if (!track) return;
    setIsSaved(track.isSaved || false);
    setSaveCount(track.saveCount || 0);

    const fetchUsage = async () => {
      try {
        const postsRes = await apiRequest<{ posts: Post[] }>('/posts');
        const reelsRes = await apiRequest<{ reels: Reel[] }>('/reels');

        setRelatedPosts(postsRes.posts.filter(p => p.audio?.id === track.id || p.audioId === track.id));
        setRelatedReels(reelsRes.reels.filter(r => r.audio?.id === track.id || r.audioId === track.id));
      } catch {
        // Ignore
      }
    };
    fetchUsage();
  }, [track]);

  if (!track) return null;

  const isCurrentPlaying = currentTrack?.id === track.id && isPlaying;

  const handleToggleSave = async () => {
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);
    setSaveCount(prev => prev + (nextSaved ? 1 : -1));

    try {
      await apiRequest(`/tracks/${track.id}/save`, { method: 'POST' });
    } catch (err) {
      console.warn('Failed to toggle save:', err);
    }
  };

  const handleShare = () => {
    const audioUrl = `${window.location.origin}/#audio-${track.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(audioUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReport(true);
    try {
      await apiRequest(`/tracks/${track.id}/report`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reportReason,
          details: reportDetails.trim()
        })
      });
      setReportSubmitted(true);
      setTimeout(() => {
        setIsReportOpen(false);
        setReportSubmitted(false);
      }, 1500);
    } catch (err) {
      console.warn('Report submission failed:', err);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const totalUses = relatedPosts.length + relatedReels.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-zinc-100 overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
              <Music className="w-3.5 h-3.5 text-pink-600" />
              <span>Original Audio</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Main Hero Card */}
          <div className="bg-gradient-to-b from-zinc-50 to-zinc-100/70 p-4 rounded-3xl border border-zinc-200/80 space-y-4 shadow-xs">
            <div className="flex items-center space-x-4">
              {/* Rotating Cover with Play Button */}
              <div className="relative group shrink-0 w-24 h-24 rounded-2xl overflow-hidden shadow-md border border-black/10 bg-zinc-900">
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  className={`w-full h-full object-cover transition-transform duration-500 ${isCurrentPlaying ? 'scale-105' : ''}`}
                />
                <button
                  onClick={() => playTrack(track)}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center text-white cursor-pointer hover:bg-black/50 transition-colors"
                >
                  {isCurrentPlaying ? (
                    <Pause className="w-8 h-8 fill-white" />
                  ) : (
                    <Play className="w-8 h-8 fill-white ml-1" />
                  )}
                </button>
              </div>

              {/* Metadata & Creator */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <h3 className="text-base font-extrabold text-zinc-900 truncate">{track.title}</h3>
                  {track.featured && (
                    <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full shrink-0">
                      Featured
                    </span>
                  )}
                </div>

                <div 
                  onClick={() => {
                    if (track.creatorUsername) {
                      onClose();
                      onSelectUser(track.creatorUsername);
                    }
                  }}
                  className={`flex items-center space-x-1.5 mt-0.5 ${track.creatorUsername ? 'cursor-pointer hover:underline' : ''}`}
                >
                  <p className="text-xs font-semibold text-zinc-700 truncate">{track.artist}</p>
                  {track.isOriginal && (
                    <span className="text-[9px] px-1.5 py-0.2 bg-purple-100 text-purple-700 font-medium rounded-full shrink-0">
                      Original Audio
                    </span>
                  )}
                </div>

                {/* Stats Row */}
                <div className="flex items-center space-x-3 mt-2 text-[11px] text-zinc-500 font-medium">
                  <span className="font-bold text-zinc-800">
                    {totalUses > 0 ? `${totalUses} posts & reels` : 'Original Soundtrack'}
                  </span>
                  <span>•</span>
                  <span>{formatSeconds(track.duration)}</span>
                  {track.genre && (
                    <>
                      <span>•</span>
                      <span className="px-2 py-0.5 bg-white border border-zinc-200 text-zinc-600 rounded-md text-[10px]">
                        {track.genre}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Live Playback Scrubber if playing this track */}
            {isCurrentPlaying && (
              <div className="pt-2 border-t border-zinc-200/80 space-y-1 animate-fadeIn">
                <input
                  type="range"
                  min={0}
                  max={duration || track.duration || 30}
                  step={0.5}
                  value={progress}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-300 rounded-lg appearance-none cursor-pointer accent-pink-600"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                  <span>{formatSeconds(progress)}</span>
                  <span>{formatSeconds(duration || track.duration || 30)}</span>
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex items-center space-x-2 pt-1">
              {/* Primary "Use Audio" CTA */}
              <button
                onClick={() => {
                  onClose();
                  onUseAudio?.(track);
                }}
                className="flex-1 py-2.5 bg-zinc-900 hover:bg-black active:scale-98 text-white font-bold text-xs rounded-2xl shadow-sm flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Use Audio</span>
              </button>

              {/* Save / Bookmark Button */}
              <button
                onClick={handleToggleSave}
                className={`p-2.5 rounded-2xl border transition-colors flex items-center space-x-1 text-xs font-bold ${
                  isSaved
                    ? 'bg-pink-50 border-pink-200 text-pink-600'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
                title={isSaved ? 'Remove from Saved' : 'Save Audio'}
              >
                <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-pink-600' : ''}`} />
                <span className="text-[11px] hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
              </button>

              {/* Share Button */}
              <button
                onClick={handleShare}
                className="p-2.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-2xl transition-colors relative"
                title="Share Sound link"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                {copiedLink && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-0.5 rounded-md whitespace-nowrap">
                    Link copied!
                  </span>
                )}
              </button>

              {/* Report Button */}
              <button
                onClick={() => setIsReportOpen(true)}
                className="p-2.5 bg-white border border-zinc-200 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-colors"
                title="Report Sound"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Posts & Reels Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Videos & Posts Using This Sound
              </h4>
              <span className="text-[11px] text-zinc-400">{totalUses} media</span>
            </div>

            {totalUses === 0 ? (
              <div className="py-12 px-4 text-center rounded-3xl bg-zinc-50 border border-dashed border-zinc-200 space-y-2">
                <Music className="w-8 h-8 text-zinc-300 mx-auto" />
                <p className="text-xs font-bold text-zinc-700">No posts have used this sound yet</p>
                <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
                  Be the first creator to create a Post or Reel with this sound!
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onUseAudio?.(track);
                  }}
                  className="mt-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Video</span>
                </button>
              </div>
            ) : (
              <MediaGrid
                items={[
                  ...relatedReels.map(reel => ({
                    id: reel.id,
                    mediaUrl: reel.videoUrl,
                    thumbnailUrl: reel.thumbnailUrl || reel.author.avatarUrl,
                    mediaType: 'video' as const,
                    isReel: true,
                    caption: reel.caption,
                    likesCount: reel.likesCount,
                    commentsCount: reel.commentsCount,
                    authorUsername: reel.author.username
                  })),
                  ...relatedPosts.map(post => ({
                    id: post.id,
                    mediaUrl: post.mediaUrl,
                    thumbnailUrl: post.thumbnailUrl,
                    mediaType: post.mediaType,
                    caption: post.caption,
                    likesCount: post.likesCount,
                    commentsCount: post.commentsCount,
                    authorUsername: post.author.username
                  }))
                ]}
                aspectRatio="square"
                onItemClick={(item) => {
                  onClose();
                  if ((item.isReel || item.mediaType === 'video') && onSelectReel) {
                    onSelectReel(item.id);
                  } else if (item.authorUsername) {
                    onSelectUser(item.authorUsername);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Report Dialog Overlay */}
        {isReportOpen && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs z-20 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-zinc-200 animate-scaleUp">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-zinc-900 flex items-center space-x-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span>Report Audio Track</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsReportOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {reportSubmitted ? (
                <div className="py-6 text-center text-emerald-600 text-xs font-bold space-y-1">
                  <Check className="w-8 h-8 mx-auto" />
                  <p>Report submitted to ISHARA moderation.</p>
                </div>
              ) : (
                <form onSubmit={handleReportSubmit} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Reason for Report
                    </label>
                    <select
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full text-xs font-medium px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      <option value="COPYRIGHT">Copyright / Intellectual Property Infringement</option>
                      <option value="INAPPROPRIATE">Inappropriate / Harmful Content</option>
                      <option value="SPAM">Spam or Misleading Audio</option>
                      <option value="OTHER">Other Reason</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Additional Details
                    </label>
                    <textarea
                      rows={3}
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      placeholder="Please describe why this sound should be reviewed..."
                      className="w-full text-xs font-medium p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsReportOpen(false)}
                      className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingReport}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      Submit Report
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
