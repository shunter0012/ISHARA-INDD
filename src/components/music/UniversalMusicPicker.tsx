import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Clock,
  Radio,
  Sliders,
  Share2,
  ArrowRight,
  SlidersHorizontal,
  CheckCircle2
} from 'lucide-react';
import { MusicTrack, AudioAttachmentConfig } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { uploadMediaFile } from '../../lib/upload';
import { apiRequest } from '../../lib/api';
import { globalMediaCoordinator } from '../../lib/globalMediaCoordinator';

export type MusicTab = 'for-you' | 'trending' | 'saved' | 'original' | 'recent';

export interface UniversalMusicPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAudioId?: string;
  onSelectTrack: (track: MusicTrack, initialConfig?: Partial<AudioAttachmentConfig>) => void;
  onOpenEditor?: (track: MusicTrack) => void;
  onTrackCreated?: (track: MusicTrack) => void;
  title?: string;
  contentType?: 'feed' | 'reel' | 'story' | 'carousel';
}

export const UniversalMusicPicker: React.FC<UniversalMusicPickerProps> = ({
  isOpen,
  onClose,
  selectedAudioId,
  onSelectTrack,
  onOpenEditor,
  onTrackCreated,
  title = 'Soundtrack & Audio',
  contentType = 'feed'
}) => {
  const { user } = useAuth();

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<MusicTab>('for-you');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [genres, setGenres] = useState<Array<{ name: string; count: number }>>([
    { name: 'All', count: 0 },
    { name: 'Lo-Fi', count: 0 },
    { name: 'Synthwave', count: 0 },
    { name: 'Acoustic', count: 0 },
    { name: 'Electronic', count: 0 },
    { name: 'Ambient', count: 0 },
    { name: 'Pop', count: 0 },
    { name: 'Cinematic', count: 0 }
  ]);

  // Data & Search
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Single-Audio Preview Engine (Guaranteed only 1 audio plays at a time)
  const [previewTrack, setPreviewTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Device Audio Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTitle, setImportTitle] = useState('');
  const [importArtist, setImportArtist] = useState('');
  const [importGenre, setImportGenre] = useState('Original');
  const [importDuration, setImportDuration] = useState<number>(30);
  const [importRightsConfirmed, setImportRightsConfirmed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch Genres on mount
  useEffect(() => {
    apiRequest<{ genres: Array<{ name: string; count: number }> }>('/tracks/meta/genres')
      .then(res => {
        if (res?.genres && res.genres.length > 0) {
          setGenres(res.genres);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Tracks based on tab, genre, and search query
  const fetchTracks = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (activeTab === 'recent') {
        const res = await apiRequest<{ tracks: MusicTrack[] }>('/tracks/meta/recent');
        if (res?.tracks) {
          setTracks(res.tracks);
          setIsLoading(false);
          return;
        }
      }

      const params = new URLSearchParams();
      params.append('tab', activeTab);
      if (selectedGenre !== 'All') {
        params.append('genre', selectedGenre);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }
      params.append('limit', '50');

      const res = await apiRequest<{ tracks: MusicTrack[]; total: number }>(`/tracks?${params.toString()}`);
      if (res && Array.isArray(res.tracks)) {
        setTracks(res.tracks);
      } else {
        setTracks([]);
      }
    } catch (err: any) {
      console.warn('[UniversalMusicPicker] Failed to fetch tracks:', err);
      setErrorMessage('Unable to load tracks. Please check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTracks();
    } else {
      stopPreview();
    }
  }, [isOpen, activeTab, selectedGenre]);

  // Debounce search query
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchTracks();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Listen to global media coordinator: if another source starts playing, stop preview
  useEffect(() => {
    const unsubscribe = globalMediaCoordinator.subscribe(({ activeSource }) => {
      if (activeSource !== 'preview') {
        stopPreview();
      }
    });
    return unsubscribe;
  }, []);

  // Handle single audio preview instance
  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    globalMediaCoordinator.pause('preview');
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleTogglePlay = (track: MusicTrack, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (previewTrack?.id === track.id && isPlaying) {
      // Pause
      if (audioRef.current) {
        audioRef.current.pause();
      }
      globalMediaCoordinator.pause('preview', track.id);
      setIsPlaying(false);
      return;
    }

    if (previewTrack?.id === track.id && !isPlaying && audioRef.current) {
      // Resume
      globalMediaCoordinator.play('preview', track.id);
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    // New track preview: cleanly stop previous and initialize fresh
    stopPreview();
    setPreviewTrack(track);

    const audio = new Audio(track.audioUrl);
    audioRef.current = audio;
    audio.volume = 0.85;

    audio.onloadedmetadata = () => {
      setPreviewDuration(audio.duration || track.duration || 30);
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      globalMediaCoordinator.pause('preview', track.id);
    };

    globalMediaCoordinator.play('preview', track.id);
    audio.play()
      .then(() => {
        setIsPlaying(true);
        // Record play signal
        apiRequest(`/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {});
      })
      .catch((err) => {
        console.warn('[Audio Preview Error]', err);
        setIsPlaying(false);
      });
  };

  // Toggle Save/Bookmark
  const handleToggleSave = async (track: MusicTrack, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await apiRequest<{ isSaved: boolean; saveCount: number }>(`/tracks/${track.id}/save`, {
        method: 'POST'
      });
      // Optimistically update local list
      setTracks(prev => prev.map(t => {
        if (t.id === track.id) {
          return {
            ...t,
            isSaved: res.isSaved,
            saveCount: res.saveCount
          };
        }
        return t;
      }));
      if (previewTrack?.id === track.id) {
        setPreviewTrack(prev => prev ? { ...prev, isSaved: res.isSaved, saveCount: res.saveCount } : null);
      }
    } catch (err) {
      console.warn('[Save Track Error]', err);
    }
  };

  // Choose / Use Track
  const handleUseTrack = (track: MusicTrack, e?: React.MouseEvent) => {
    e?.stopPropagation();
    stopPreview();
    onSelectTrack(track, {
      audioId: track.id,
      audioStartTime: 0,
      audioEndTime: Math.min(30, Math.round(track.duration || 30)),
      audioVolume: 0.8,
      originalAudioVolume: 1.0
    });
    if (onOpenEditor) {
      onOpenEditor(track);
    } else {
      onClose();
    }
  };

  // Handle local audio file selection for import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)) {
      setImportError('Please select a valid audio file (.mp3, .m4a, .wav, .aac).');
      return;
    }

    setImportFile(file);
    setImportError(null);

    // Auto-detect title from filename
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setImportTitle(cleanName);
    setImportArtist(user?.displayName || user?.username || 'Creator');

    // Extract exact duration via HTML5 Audio
    const testAudio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    testAudio.src = objectUrl;
    testAudio.onloadedmetadata = () => {
      setImportDuration(Math.max(1, Math.round(testAudio.duration || 30)));
      URL.revokeObjectURL(objectUrl);
    };
    testAudio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
  };

  // Submit device audio import
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setImportError('Please choose an audio file from your device.');
      return;
    }
    if (!importTitle.trim()) {
      setImportError('Please enter a track title.');
      return;
    }
    if (!importRightsConfirmed) {
      setImportError('Please confirm you have the rights to use and distribute this audio.');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      // 1. Upload audio file to permanent storage
      const uploadedUrl = await uploadMediaFile(importFile);
      if (!uploadedUrl) {
        throw new Error('Failed to upload audio file to server storage.');
      }

      // 2. Register track in ISHARA catalog
      const newTrackRes = await apiRequest<{ track: MusicTrack }>('/tracks', {
        method: 'POST',
        body: JSON.stringify({
          title: importTitle.trim(),
          artist: importArtist.trim() || user?.displayName || 'Creator',
          duration: importDuration,
          audioUrl: uploadedUrl,
          storagePath: uploadedUrl,
          mimeType: importFile.type || 'audio/mpeg',
          fileSize: importFile.size,
          genre: importGenre,
          isOriginal: true,
          visibility: 'PUBLIC'
        })
      });

      if (newTrackRes?.track) {
        const created = newTrackRes.track;
        if (onTrackCreated) onTrackCreated(created);
        // Select newly imported audio directly
        handleUseTrack(created);
        setShowImportModal(false);
      }
    } catch (err: any) {
      setImportError(err.message || 'Failed to import audio.');
    } finally {
      setIsImporting(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      {/* Container - Bottom Sheet on mobile, Elegant Modal on Desktop */}
      <div className="w-full sm:max-w-xl h-full sm:h-[86vh] sm:max-h-[720px] bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 animate-in slide-in-from-bottom-5 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 leading-tight">{title}</h2>
              <p className="text-[11px] text-zinc-400 font-medium">
                {contentType === 'reel' ? 'Reels Sound Library' : contentType === 'story' ? 'Story Soundtrack' : 'Music & Audio'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-600" />
              <span>Import Audio</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-5 pt-3 pb-2 shrink-0 bg-white">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs, artists, genres, or albums..."
              className="w-full pl-10 pr-9 py-2 bg-zinc-100/90 focus:bg-white text-xs text-zinc-900 placeholder-zinc-400 rounded-xl border border-transparent focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 text-zinc-400 hover:text-zinc-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Categories / Genres Chips Bar */}
        <div className="px-5 py-2 shrink-0 border-b border-zinc-100 flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          {genres.map(g => (
            <button
              key={g.name}
              type="button"
              onClick={() => setSelectedGenre(g.name)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedGenre === g.name
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('for-you')}
              className={`py-2.5 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'for-you'
                  ? 'border-pink-600 text-pink-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>For You</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('trending')}
              className={`py-2.5 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'trending'
                  ? 'border-pink-600 text-pink-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Trending</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`py-2.5 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'saved'
                  ? 'border-pink-600 text-pink-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Saved</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('original')}
              className={`py-2.5 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'original'
                  ? 'border-pink-600 text-pink-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              <span>Original</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recent')}
              className={`py-2.5 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'recent'
                  ? 'border-pink-600 text-pink-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Recently Used</span>
            </button>
          </div>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 p-2 sm:p-3">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-400 space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-pink-600" />
              <p className="text-xs font-medium">Loading soundtrack catalog...</p>
            </div>
          ) : errorMessage ? (
            <div className="py-16 text-center px-4">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-xs text-zinc-700 font-medium mb-3">{errorMessage}</p>
              <button
                type="button"
                onClick={fetchTracks}
                className="px-4 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-800 rounded-full"
              >
                Retry
              </button>
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-20 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
                <Music className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-800">No tracks found</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                {searchQuery
                  ? `No matching audio for "${searchQuery}". Try different keywords or genres.`
                  : activeTab === 'saved'
                  ? 'You haven\'t saved any audio tracks yet. Click the bookmark icon next to any song to save it.'
                  : activeTab === 'recent'
                  ? 'No recently used tracks yet. Pick any sound to attach to your post or reel!'
                  : 'Check back soon or import your own audio file!'}
              </p>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="mt-4 px-4 py-2 bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold rounded-full shadow-xs hover:opacity-95 transition-opacity"
              >
                Import Audio from Device
              </button>
            </div>
          ) : (
            tracks.map((track) => {
              const isCurrentPlaying = previewTrack?.id === track.id && isPlaying;
              const isSelected = selectedAudioId === track.id;

              return (
                <div
                  key={track.id}
                  onClick={() => handleTogglePlay(track)}
                  className={`group p-2.5 sm:p-3 rounded-2xl flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected 
                      ? 'bg-pink-50/80 border border-pink-200' 
                      : isCurrentPlaying 
                      ? 'bg-zinc-50' 
                      : 'hover:bg-zinc-50'
                  }`}
                >
                  {/* Left: Album Artwork + Play indicator */}
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-xs bg-zinc-100 border border-black/5">
                      <img
                        src={track.artwork || track.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200'}
                        alt={track.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      {/* Play overlay button */}
                      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                        isCurrentPlaying ? 'bg-black/40 opacity-100' : 'bg-black/30 opacity-0 group-hover:opacity-100'
                      }`}>
                        {isCurrentPlaying ? (
                          <Pause className="w-5 h-5 fill-white text-white" />
                        ) : (
                          <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                        )}
                      </div>

                      {/* Mini audio equalizer wave bars if playing */}
                      {isCurrentPlaying && (
                        <div className="absolute bottom-1 right-1 flex items-end space-x-0.5 h-3 px-1 py-0.5 bg-black/70 rounded">
                          <span className="w-0.5 h-full bg-pink-400 animate-pulse" />
                          <span className="w-0.5 h-2/3 bg-pink-400 animate-pulse delay-75" />
                          <span className="w-0.5 h-4/5 bg-pink-400 animate-pulse delay-150" />
                        </div>
                      )}
                    </div>

                    {/* Middle: Title, Artist, Album, Duration */}
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-zinc-900 truncate">
                          {track.title}
                        </span>
                        {track.isOriginal && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-purple-50 text-purple-700 font-semibold rounded-full border border-purple-200/60 shrink-0">
                            Original
                          </span>
                        )}
                        {track.featured && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-amber-50 text-amber-700 font-semibold rounded-full border border-amber-200/60 shrink-0">
                            Featured
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-zinc-500 truncate">
                        <span className="font-medium truncate">{track.artist}</span>
                        <span>•</span>
                        <span className="font-mono shrink-0">{formatSeconds(track.duration || 30)}</span>
                        {track.genre && (
                          <>
                            <span>•</span>
                            <span className="text-[10px] text-zinc-400 shrink-0">{track.genre}</span>
                          </>
                        )}
                      </div>

                      {/* Usage and Trending indicator */}
                      <div className="flex items-center space-x-2 mt-1">
                        {(track.usageCount || 0) > 0 && (
                          <span className="text-[10px] font-semibold text-zinc-400">
                            {track.usageCount} {track.usageCount === 1 ? 'post' : 'posts'}
                          </span>
                        )}
                        {track.licensing && (
                          <span className="text-[9px] text-zinc-400">
                            {track.licensing}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions: Save, Play, and Use Button */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {/* Bookmark / Save */}
                    <button
                      type="button"
                      title={track.isSaved ? 'Remove from Saved' : 'Save audio'}
                      onClick={(e) => handleToggleSave(track, e)}
                      className={`p-2 rounded-full transition-colors cursor-pointer ${
                        track.isSaved
                          ? 'text-pink-600 bg-pink-50 hover:bg-pink-100'
                          : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <Bookmark className={`w-4 h-4 ${track.isSaved ? 'fill-pink-600' : ''}`} />
                    </button>

                    {/* Preview Play / Pause */}
                    <button
                      type="button"
                      title={isCurrentPlaying ? 'Pause' : 'Preview'}
                      onClick={(e) => handleTogglePlay(track, e)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        isCurrentPlaying
                          ? 'bg-zinc-900 text-white shadow-xs'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {isCurrentPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-white" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </button>

                    {/* Use / Select Audio Button */}
                    <button
                      type="button"
                      onClick={(e) => handleUseTrack(track, e)}
                      className="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-indigo-600 hover:opacity-95 active:scale-95 text-white text-xs font-bold rounded-full shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Use</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Compact Mini Audio Player (Bottom bar when track preview is active) */}
        {previewTrack && (
          <div className="border-t border-zinc-200 bg-white/95 backdrop-blur-md px-4 py-3 shrink-0 flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-3 min-w-0 flex-1 pr-3">
              <div 
                className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 shadow-xs cursor-pointer"
                onClick={() => handleTogglePlay(previewTrack)}
              >
                <img
                  src={previewTrack.artwork || previewTrack.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200'}
                  alt={previewTrack.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <p className="text-xs font-bold text-zinc-900 truncate">
                    {previewTrack.title}
                  </p>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {formatSeconds(currentTime)} / {formatSeconds(previewDuration || previewTrack.duration || 30)}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 truncate">
                  {previewTrack.artist}
                </p>
                {/* Progress bar */}
                <div className="w-full h-1 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-pink-600 rounded-full transition-all duration-100"
                    style={{
                      width: `${previewDuration > 0 ? (currentTime / previewDuration) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={stopPreview}
                title="Dismiss player"
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={(e) => handleUseTrack(previewTrack, e)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold rounded-full shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <span>Use Audio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Device Audio Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-zinc-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Import Audio from Device</h3>
                  <p className="text-[11px] text-zinc-500">Upload an original sound or licensed track</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {importError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-3.5">
              {/* File Picker */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`p-4 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-colors ${
                  importFile 
                    ? 'border-emerald-300 bg-emerald-50/50' 
                    : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {importFile ? (
                  <div className="flex items-center justify-center space-x-2 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span className="text-xs font-semibold truncate max-w-xs">{importFile.name}</span>
                    <span className="text-[10px] text-emerald-600 font-mono">({formatSeconds(importDuration)})</span>
                  </div>
                ) : (
                  <div>
                    <FileAudio className="w-7 h-7 text-zinc-400 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-zinc-700">Choose Audio File</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">MP3, M4A, WAV, AAC (up to 50MB)</p>
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div>
                <label className="text-[11px] font-bold text-zinc-700 block mb-1">Title</label>
                <input
                  type="text"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder="Soundtrack Title"
                  className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-700 block mb-1">Artist / Creator</label>
                <input
                  type="text"
                  value={importArtist}
                  onChange={(e) => setImportArtist(e.target.value)}
                  placeholder="Artist name"
                  className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              {/* Rights confirmation */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-start space-x-2.5">
                <input
                  type="checkbox"
                  id="rights-confirm"
                  checked={importRightsConfirmed}
                  onChange={(e) => setImportRightsConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                />
                <label htmlFor="rights-confirm" className="text-[11px] text-zinc-600 leading-tight cursor-pointer">
                  I confirm that I own or hold valid licenses to use and distribute this audio on ISHARA without copyright violation.
                </label>
              </div>

              {/* Buttons */}
              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importFile || !importTitle.trim() || !importRightsConfirmed}
                  className="flex-1 py-2.5 bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 flex items-center justify-center space-x-1.5"
                >
                  {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isImporting ? 'Uploading...' : 'Import & Use'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
