import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Search, 
  Upload, 
  Play, 
  Pause, 
  Check, 
  Music, 
  Sparkles, 
  Flame, 
  Bookmark, 
  Volume2, 
  Disc, 
  AlertCircle,
  Loader2,
  FileAudio,
  Plus,
  ShieldCheck,
  ChevronRight,
  Info,
  Clock,
  Radio
} from 'lucide-react';
import { MusicTrack } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { uploadMediaFile } from '../../lib/upload';
import { apiRequest } from '../../lib/api';

interface AudioUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAudioId?: string;
  onSelectTrack: (track: MusicTrack | null) => void;
  onTrackCreated?: (track: MusicTrack) => void;
}

type AudioTab = 'all' | 'trending' | 'saved' | 'original';

export const AudioUploadModal: React.FC<AudioUploadModalProps> = ({
  isOpen,
  onClose,
  selectedAudioId,
  onSelectTrack,
  onTrackCreated
}) => {
  const { user } = useAuth();

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<AudioTab>('all');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Audio Playback Preview
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Upload Form State
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioDurationFormatted, setAudioDurationFormatted] = useState<string>('0:00');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Original');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch available tracks based on current tab and query
  const fetchTracks = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (activeTab !== 'all') queryParams.append('tab', activeTab);
      if (searchQuery.trim()) queryParams.append('q', searchQuery.trim());

      const url = `/tracks?${queryParams.toString()}`;
      const res = await apiRequest<{ tracks: MusicTrack[] }>(url);
      if (res && Array.isArray(res.tracks)) {
        setTracks(res.tracks);
      }
    } catch (err) {
      console.warn('[AudioUploadModal] Failed to fetch tracks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTracks();
      setShowUploadForm(false);
      setUploadError(null);
    } else {
      stopAudioPreview();
    }
  }, [isOpen, activeTab]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchTracks();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const stopAudioPreview = () => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = '';
    }
    setPlayingTrackId(null);
  };

  const togglePlayPreview = (track: MusicTrack, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (playingTrackId === track.id) {
      stopAudioPreview();
      return;
    }

    if (!audioPreviewRef.current) {
      audioPreviewRef.current = new Audio();
    }

    audioPreviewRef.current.src = track.audioUrl;
    audioPreviewRef.current.play()
      .then(() => {
        setPlayingTrackId(track.id);
        // Record play on server
        apiRequest(`/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {});
      })
      .catch((err) => {
        console.warn('Audio preview playback error:', err);
        setPlayingTrackId(null);
      });

    audioPreviewRef.current.onended = () => {
      setPlayingTrackId(null);
    };
  };

  // Toggle Save / Bookmark track
  const handleToggleSave = async (track: MusicTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSaved = !track.isSaved;

    // Optimistic UI update
    setTracks(prev => prev.map(t => {
      if (t.id === track.id) {
        return {
          ...t,
          isSaved: newSaved,
          saveCount: (t.saveCount || 0) + (newSaved ? 1 : -1)
        };
      }
      return t;
    }));

    try {
      await apiRequest(`/tracks/${track.id}/save`, { method: 'POST' });
    } catch (err) {
      console.warn('Failed to save audio track:', err);
    }
  };

  // Handle local audio file selection
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate type
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name);
    if (!isAudio) {
      setUploadError('Please select a valid audio file (.mp3, .wav, .m4a, .aac, .ogg).');
      return;
    }

    setAudioFile(file);

    // Auto-generate clean title from filename
    const cleanName = file.name
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/^[0-9]+[_\s-]*/, '') // remove track numbers
      .replace(/[_-]+/g, ' ') // replace dashes/underscores with space
      .trim();

    setTitle(cleanName || 'Original Sound');
    setArtist(user?.displayName || user?.username || 'Creator');

    // Probe duration
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      const dur = Math.round(audio.duration || 0);
      setAudioDuration(dur);
      const m = Math.floor(dur / 60);
      const s = dur % 60;
      setAudioDurationFormatted(`${m}:${s < 10 ? '0' : ''}${s}`);
      URL.revokeObjectURL(objectUrl);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };

    // Default aesthetic cover
    const coverColors = [
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop&q=80'
    ];
    setCoverUrl(coverColors[Math.floor(Math.random() * coverColors.length)]);
    setRightsConfirmed(false);
    setShowUploadForm(true);
  };

  // Handle Cover Art File Selection
  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadMediaFile(file);
      if (url) setCoverUrl(url);
    } catch {
      // Fallback
    }
  };

  // Submit and upload audio
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile) {
      setUploadError('Please select an audio file first.');
      return;
    }
    if (!title.trim()) {
      setUploadError('Please provide an audio title.');
      return;
    }
    if (!rightsConfirmed) {
      setUploadError('Please certify that you own or have permission to distribute this audio.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Upload audio file to permanent storage
      const uploadedAudioUrl = await uploadMediaFile(audioFile);
      if (!uploadedAudioUrl) {
        throw new Error('Audio file upload failed.');
      }

      // 2. Register track in Music collection
      const res = await apiRequest<{ track: MusicTrack }>('/tracks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim() || user?.displayName || user?.username || 'Creator',
          description: description.trim(),
          genre,
          audioUrl: uploadedAudioUrl,
          coverUrl: coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80',
          duration: audioDuration || 30,
          fileSize: audioFile.size,
          mimeType: audioFile.type || 'audio/mpeg',
          isOriginal: true,
          visibility
        })
      });

      if (!res?.track) {
        throw new Error('Failed to register soundtrack.');
      }

      const newTrack = res.track;

      // Update state and call callbacks
      setTracks(prev => [newTrack, ...prev]);
      onTrackCreated?.(newTrack);
      onSelectTrack(newTrack);

      // Clean up and close
      stopAudioPreview();
      onClose();
    } catch (err: any) {
      console.error('[AudioUploadModal] Upload error:', err);
      setUploadError(err.message || 'Failed to upload audio. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const formatSeconds = (sec?: number) => {
    if (!sec) return '0:30';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
        className="hidden"
        onChange={handleAudioFileChange}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverFileChange}
      />

      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-zinc-900 leading-tight">Audio / Music</h3>
              <p className="text-[10px] text-zinc-400">Discover and attach soundtrack to your post</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopAudioPreview();
              onClose();
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Drawer Mode */}
        {showUploadForm ? (
          <form onSubmit={handleUploadSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <span className="text-xs font-bold text-zinc-800 flex items-center space-x-1.5">
                <FileAudio className="w-4 h-4 text-pink-600" />
                <span>Upload Sound & Publish to ISHARA</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowUploadForm(false);
                  setAudioFile(null);
                }}
                className="text-[11px] text-zinc-500 hover:text-zinc-800 font-medium"
              >
                Back to Library
              </button>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Audio File Summary Card */}
            <div className="flex items-center space-x-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
              <div 
                onClick={() => coverInputRef.current?.click()}
                className="w-14 h-14 rounded-xl bg-pink-100 overflow-hidden shrink-0 relative group cursor-pointer border border-black/5 shadow-xs"
                title="Change Cover Image"
              >
                <img src={coverUrl} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition-opacity">
                  Change
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-zinc-900 truncate">{audioFile?.name}</p>
                <p className="text-[11px] text-zinc-400 font-mono">
                  {audioDurationFormatted} • {((audioFile?.size || 0) / (1024 * 1024)).toFixed(1)} MB
                </p>
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center space-x-1 mt-0.5">
                  <Check className="w-3 h-3" />
                  <span>Ready to publish</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-pink-600 hover:underline shrink-0"
              >
                Replace File
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Audio Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Neon City Sunset"
                  className="w-full text-xs font-medium px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Artist / Creator *
                  </label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="Your artist name"
                    className="w-full text-xs font-medium px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Genre / Mood
                  </label>
                  <select
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full text-xs font-medium px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-500"
                  >
                    <option value="Original">Original Sound</option>
                    <option value="Ambient Lo-Fi">Ambient Lo-Fi</option>
                    <option value="Synthwave">Synthwave</option>
                    <option value="Acoustic">Acoustic</option>
                    <option value="Electronic">Electronic</option>
                    <option value="Cinematic">Cinematic</option>
                    <option value="Hip-Hop">Hip-Hop</option>
                    <option value="Pop">Pop</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Description / Story (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell creators how to use this sound..."
                  className="w-full text-xs font-medium px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              {/* Visibility Setting */}
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Track Visibility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('PUBLIC')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center space-x-1.5 transition-colors ${
                      visibility === 'PUBLIC'
                        ? 'bg-zinc-900 border-zinc-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Public (Discoverable)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility('PRIVATE')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center space-x-1.5 transition-colors ${
                      visibility === 'PRIVATE'
                        ? 'bg-zinc-900 border-zinc-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <span>Private (Only Me)</span>
                  </button>
                </div>
              </div>

              {/* Copyright / Ownership Declaration */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(e) => setRightsConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-pink-600 focus:ring-pink-500"
                  />
                  <div className="text-[11px] text-amber-900 leading-snug">
                    <span className="font-bold flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      <span>Ownership & Distribution Rights</span>
                    </span>
                    <span className="text-amber-800">
                      I confirm that I own this audio or have legitimate rights/permission to share it on ISHARA.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isUploading || !rightsConfirmed}
              className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-xs rounded-2xl shadow-md flex items-center justify-center space-x-2 transition-all disabled:opacity-50 cursor-pointer active:scale-98"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading & Storing Permanently...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload & Use This Sound</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Normal Instagram-style Discovery View */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search Bar + Upload CTA */}
            <div className="p-3.5 border-b border-zinc-100 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search audio, artists, genres..."
                  className="w-full pl-9.5 pr-4 py-2 bg-zinc-100/90 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-pink-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Upload Your Audio Button */}
              <div className="flex items-center justify-between bg-gradient-to-r from-pink-50/80 to-purple-50/80 p-2.5 rounded-2xl border border-pink-100">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white text-pink-600 shadow-xs flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-900">Upload Your Own Audio</p>
                    <p className="text-[10px] text-zinc-500">Publish sounds for anyone to use</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[11px] font-bold rounded-xl shadow-xs active:scale-95 transition-transform"
                >
                  Upload
                </button>
              </div>

              {/* Instagram-Style Audio Category Tabs */}
              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'all'
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>For You</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('trending')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'trending'
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Trending</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('saved')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'saved'
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('original')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'original'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Original Audio</span>
                </button>
              </div>
            </div>

            {/* Track Listing */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-2 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-pink-600" />
                  <p className="text-xs">Finding sounds...</p>
                </div>
              ) : tracks.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-2 text-center text-zinc-400 px-4">
                  <Music className="w-8 h-8 stroke-1 text-zinc-300" />
                  <p className="text-xs font-bold text-zinc-700">No sounds found</p>
                  <p className="text-[11px] text-zinc-400 max-w-xs">
                    {activeTab === 'saved' 
                      ? 'You have not saved any audio tracks yet. Tap the bookmark icon to save sounds.'
                      : 'Try a different search keyword or upload your own audio above!'}
                  </p>
                </div>
              ) : (
                tracks.map((track, idx) => {
                  const isPlaying = playingTrackId === track.id;
                  const isSelected = selectedAudioId === track.id;

                  return (
                    <div
                      key={track.id}
                      onClick={() => {
                        stopAudioPreview();
                        onSelectTrack(track);
                        onClose();
                      }}
                      className={`group p-2.5 rounded-2xl flex items-center justify-between border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-pink-50/70 border-pink-300 shadow-xs'
                          : 'bg-white hover:bg-zinc-50/90 border-zinc-100'
                      }`}
                    >
                      {/* Left side: Cover + Title + Metadata */}
                      <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                        {/* Cover Image with Animated Soundwaves when Playing */}
                        <div 
                          onClick={(e) => togglePlayPreview(track, e)}
                          className="relative w-12 h-12 rounded-xl overflow-hidden shadow-2xs shrink-0 border border-black/5 bg-zinc-900"
                        >
                          <img
                            src={track.coverUrl}
                            alt={track.title}
                            className={`w-full h-full object-cover transition-transform ${isPlaying ? 'scale-105' : ''}`}
                          />
                          <div className={`absolute inset-0 bg-black/40 flex items-center justify-center text-white ${
                            isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          } transition-opacity`}>
                            {isPlaying ? (
                              <Pause className="w-5 h-5 fill-white" />
                            ) : (
                              <Play className="w-5 h-5 fill-white ml-0.5" />
                            )}
                          </div>

                          {/* Equalizer animation bar overlay when playing */}
                          {isPlaying && (
                            <div className="absolute bottom-1 left-2 right-2 flex items-end justify-center space-x-0.5 h-3">
                              <span className="w-1 bg-pink-400 rounded-full animate-bounce" style={{ height: '70%', animationDelay: '0ms' }} />
                              <span className="w-1 bg-pink-400 rounded-full animate-bounce" style={{ height: '100%', animationDelay: '150ms' }} />
                              <span className="w-1 bg-pink-400 rounded-full animate-bounce" style={{ height: '40%', animationDelay: '300ms' }} />
                            </div>
                          )}
                        </div>

                        {/* Title & Artist info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h4 className="text-xs font-bold text-zinc-900 truncate group-hover:text-pink-600 transition-colors">
                              {track.title}
                            </h4>
                            {track.featured && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold rounded-full shrink-0">
                                Featured
                              </span>
                            )}
                            {track.isOriginal && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-purple-100 text-purple-700 font-medium rounded-full shrink-0">
                                Original
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{track.artist}</p>

                          <div className="flex items-center space-x-2 mt-1 text-[10px] text-zinc-400">
                            {track.usageCount ? (
                              <span>{track.usageCount} {track.usageCount === 1 ? 'post' : 'posts'}</span>
                            ) : (
                              <span>Original sound</span>
                            )}
                            <span>•</span>
                            <span className="font-mono">{formatSeconds(track.duration)}</span>
                            {track.genre && (
                              <>
                                <span>•</span>
                                <span className="text-zinc-500">{track.genre}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Save button & Select button */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {/* Bookmark / Save */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleSave(track, e)}
                          className={`p-2 rounded-xl transition-colors ${
                            track.isSaved 
                              ? 'text-pink-600 bg-pink-50' 
                              : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                          }`}
                          title={track.isSaved ? 'Saved to collection' : 'Save audio'}
                        >
                          <Bookmark className={`w-4 h-4 ${track.isSaved ? 'fill-pink-600' : ''}`} />
                        </button>

                        {/* Select Button */}
                        <button
                          type="button"
                          onClick={() => {
                            stopAudioPreview();
                            onSelectTrack(track);
                            onClose();
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-transform active:scale-95 ${
                            isSelected
                              ? 'bg-pink-600 text-white shadow-xs'
                              : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Use'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
