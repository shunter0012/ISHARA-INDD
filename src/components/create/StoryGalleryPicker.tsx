import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon,
  Film,
  Clock,
  ChevronDown,
  Check,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Music,
  Camera,
  AlertCircle,
  Sparkles,
  Layers,
  Sliders
} from 'lucide-react';
import { MusicTrack, AudioAttachmentConfig } from '../../types/index';
import { AudioScrubberBar } from '../music/AudioScrubberBar';
import { UniversalMusicPicker } from '../music/UniversalMusicPicker';
import { AudioEditorSheet } from '../music/AudioEditorSheet';
import { LiveCameraModal } from './LiveCameraModal';
import {
  getSavedGalleryItems,
  saveFilesToGallery,
  removeGalleryItem,
  UserGalleryItem
} from '../../lib/userGallery';
import { uploadMediaFile } from '../../lib/upload';
import { apiRequest } from '../../lib/api';

export interface StoryGalleryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryPublished: () => void;
  initialAudioTrack?: MusicTrack | null;
  onSwitchType?: (type: 'post' | 'story' | 'reel') => void;
}

type FilterType = 'all' | 'photos' | 'videos' | 'recents';

export const StoryGalleryPicker: React.FC<StoryGalleryPickerProps> = ({
  isOpen,
  onClose,
  onStoryPublished,
  initialAudioTrack = null,
  onSwitchType
}) => {
  // Step state: 'picker' = device gallery view, 'editor' = story preview & publishing
  const [step, setStep] = useState<'picker' | 'editor'>('picker');

  // Real device gallery items (persisted in IndexedDB)
  const [savedGallery, setSavedGallery] = useState<UserGalleryItem[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);
  const [selectedItem, setSelectedItem] = useState<UserGalleryItem | null>(null);

  // Filter dropdown state
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // File picker input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Error/Permission alert state
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Story Editor state
  const [caption, setCaption] = useState('');
  const [selectedAudio, setSelectedAudio] = useState<MusicTrack | null>(initialAudioTrack || null);
  const [audioConfig, setAudioConfig] = useState<AudioAttachmentConfig>({
    audioId: initialAudioTrack?.id || '',
    audioStartTime: 0,
    audioEndTime: 30,
    audioVolume: 1.0,
    originalAudioVolume: 1.0
  });
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isAudioEditorOpen, setIsAudioEditorOpen] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);

  // Video playback in editor
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Upload/Publish state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishStatus, setPublishStatus] = useState<string>('');

  // Synchronize initial audio if provided
  useEffect(() => {
    if (initialAudioTrack) {
      setSelectedAudio(initialAudioTrack);
      setAudioConfig(prev => ({
        ...prev,
        audioId: initialAudioTrack.id,
        audioEndTime: Math.min(30, initialAudioTrack.duration || 30)
      }));
    }
  }, [initialAudioTrack]);

  // Load real device gallery items from IndexedDB on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingGallery(true);
    setPermissionNotice(null);

    getSavedGalleryItems()
      .then((items) => {
        if (!isMounted) return;
        setSavedGallery(items);
        // Automatically pre-select the most recent media if available and none selected yet
        if (items.length > 0 && !selectedItem) {
          setSelectedItem(items[0]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[StoryGalleryPicker] Could not access local gallery store:', err);
        setPermissionNotice('Device media storage is temporarily unavailable. Use "Add from Device" to select media.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingGallery(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isFilterDropdownOpen]);

  // Handle native device file selection (supporting multiple images and videos)
  const handleDeviceFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setPermissionNotice(null);
    try {
      const addedItems = await saveFilesToGallery(files);
      if (addedItems.length > 0) {
        setSavedGallery(prev => {
          const updated = [...addedItems, ...prev];
          return updated;
        });
        // Select the primary newly chosen device item
        setSelectedItem(addedItems[0]);
      }
    } catch (err: any) {
      console.warn('[StoryGalleryPicker] Error reading device files:', err);
      setPermissionNotice('Could not process selected files. Please check device permissions and try again.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Delete an individual item from local gallery storage
  const handleDeleteItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    try {
      await removeGalleryItem(itemId);
      setSavedGallery(prev => prev.filter(item => item.id !== itemId));
      if (selectedItem?.id === itemId) {
        const remaining = savedGallery.filter(item => item.id !== itemId);
        setSelectedItem(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err) {
      console.warn('[StoryGalleryPicker] Failed to delete item:', err);
    }
  };

  // Clear current story selection
  const handleClearSelection = () => {
    setSelectedItem(null);
  };

  // Filter items based on activeFilter
  const filteredItems = useMemo(() => {
    if (activeFilter === 'photos') {
      return savedGallery.filter(item => item.type === 'image');
    }
    if (activeFilter === 'videos') {
      return savedGallery.filter(item => item.type === 'video');
    }
    if (activeFilter === 'recents') {
      // Items within the last 24 hours or first 12 items
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recents = savedGallery.filter(item => item.timestamp >= oneDayAgo);
      return recents.length > 0 ? recents : savedGallery.slice(0, 12);
    }
    return savedGallery;
  }, [savedGallery, activeFilter]);

  // Counts for filter badges
  const counts = useMemo(() => {
    const photos = savedGallery.filter(item => item.type === 'image').length;
    const videos = savedGallery.filter(item => item.type === 'video').length;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recents = savedGallery.filter(item => item.timestamp >= oneDayAgo).length;
    return {
      all: savedGallery.length,
      photos,
      videos,
      recents: recents > 0 ? recents : Math.min(12, savedGallery.length)
    };
  }, [savedGallery]);

  // Handle capture from camera modal
  const handleCameraCapture = async (file: File) => {
    try {
      const addedItems = await saveFilesToGallery([file]);
      if (addedItems.length > 0) {
        setSavedGallery(prev => [addedItems[0], ...prev]);
        setSelectedItem(addedItems[0]);
      }
    } catch (err) {
      console.warn('Camera capture save failed:', err);
    }
    setIsLiveCameraOpen(false);
  };

  // Video play/pause toggle in editor
  const toggleEditorVideoPlayback = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play().catch(() => {});
      setIsVideoPlaying(true);
    } else {
      previewVideoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  // Publish the Story with permanent media and permanent audio persistence
  const handlePublishStory = async () => {
    if (!selectedItem || isPublishing) return;

    setIsPublishing(true);
    setPublishProgress(10);
    setPublishStatus('Uploading to permanent storage...');

    try {
      // 1. Upload media to permanent storage
      const uploadedUrl = await uploadMediaFile(selectedItem.file, {
        onProgress: (percent) => {
          setPublishProgress(Math.min(85, Math.round(10 + percent * 0.75)));
        }
      });

      setPublishProgress(90);
      setPublishStatus('Publishing story...');

      const isVideo = selectedItem.type === 'video';
      const duration = selectedItem.duration || 15;

      // 2. Create story record with permanent audio binding
      if (isVideo && duration > 60) {
        // Video exceeds 60 seconds: automatically split into 60s story segments
        await apiRequest('/stories/split-video', {
          method: 'POST',
          body: JSON.stringify({
            videoUrl: uploadedUrl,
            caption: caption.trim() || undefined,
            audioId: selectedAudio?.id || undefined,
            audioStartTime: audioConfig.audioStartTime,
            audioEndTime: audioConfig.audioEndTime,
            audioVolume: audioConfig.audioVolume,
            originalAudioVolume: audioConfig.originalAudioVolume
          })
        });
      } else {
        await apiRequest('/stories', {
          method: 'POST',
          body: JSON.stringify({
            mediaType: selectedItem.type,
            mediaUrl: uploadedUrl,
            caption: caption.trim() || undefined,
            duration: isVideo ? duration : undefined,
            audioId: selectedAudio?.id || undefined,
            audioStartTime: audioConfig.audioStartTime,
            audioEndTime: audioConfig.audioEndTime,
            audioVolume: audioConfig.audioVolume,
            originalAudioVolume: audioConfig.originalAudioVolume
          })
        });
      }

      setPublishProgress(100);
      setPublishStatus('Story published successfully!');

      setTimeout(() => {
        setIsPublishing(false);
        onStoryPublished();
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('[StoryGalleryPicker] Publish error:', err);
      setIsPublishing(false);
      setPermissionNotice(err.message || 'Failed to publish story. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="story-creator-modal"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-0 md:p-4 select-none animate-in fade-in duration-200"
    >
      {/* Hidden Device Inputs for Picker & Native Camera */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={handleDeviceFilesSelected}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleDeviceFilesSelected}
      />

      {/* Main Container: Mobile Full-screen & Desktop Elegant Floating Viewport Frame */}
      <div
        className="w-full h-full md:max-w-md md:h-[90vh] md:max-h-[850px] bg-white md:rounded-3xl shadow-2xl border border-zinc-200/80 overflow-hidden flex flex-col relative"
      >
        <AnimatePresence mode="wait">
          {/* ============================================================== */}
          {/* STEP 1: REAL DEVICE GALLERY PICKER */}
          {/* ============================================================== */}
          {step === 'picker' && (
            <motion.div
              key="gallery-picker-step"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col h-full w-full overflow-hidden bg-white"
            >
              {/* Header Bar */}
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-zinc-100 bg-white/95 backdrop-blur-xs shrink-0 z-20">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-zinc-800 hover:text-zinc-600 hover:bg-zinc-100 rounded-full cursor-pointer transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 stroke-[2.2]" />
                </button>

                <div className="flex flex-col items-center">
                  <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-1.5">
                    <span>Add to Story</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#FBAA47] to-[#D91A46]" />
                  </h2>
                  <span className="text-[9px] font-black tracking-widest uppercase text-[#D91A46] mt-0.5">
                    24H EXPIRATION • YOUR STORY
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!selectedItem) {
                      fileInputRef.current?.click();
                      return;
                    }
                    setStep('editor');
                  }}
                  className={`text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center space-x-1 shadow-xs transition-all cursor-pointer ${
                    selectedItem
                      ? 'bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95 shadow-md shadow-pink-500/20 scale-100'
                      : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  <span>Next</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Actions Row */}
              <div className="px-4 py-2.5 flex items-center justify-between bg-zinc-50/70 border-b border-zinc-100 shrink-0">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white text-zinc-900 shadow-xs border border-zinc-200/80 cursor-default"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-[#4870FF]" />
                    <span>Gallery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsLiveCameraOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAudioModalOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
                  >
                    <Music className={`w-3.5 h-3.5 ${selectedAudio ? 'text-[#D91A46]' : 'text-zinc-500'}`} />
                    <span>{selectedAudio ? 'Audio Added' : 'Music'}</span>
                  </button>
                </div>
              </div>

              {/* Gallery Controls Header: Title, Dropdown Filter, Clear, Add from Device */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-100 shrink-0 bg-white z-10">
                {/* Left: Your Gallery & Dropdown Filter */}
                <div className="relative" ref={dropdownRef}>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsFilterDropdownOpen(prev => !prev)}
                      className="flex items-center space-x-1.5 text-xs font-bold text-zinc-900 hover:text-zinc-700 bg-zinc-100/90 hover:bg-zinc-200/80 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <span>
                        {activeFilter === 'all' && `All Media (${counts.all})`}
                        {activeFilter === 'photos' && `Photos (${counts.photos})`}
                        {activeFilter === 'videos' && `Videos (${counts.videos})`}
                        {activeFilter === 'recents' && `Recents (${counts.recents})`}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-zinc-600 transition-transform duration-200 ${
                          isFilterDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Dropdown Menu Popover */}
                  <AnimatePresence>
                    {isFilterDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.16 }}
                        className="absolute top-full left-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-zinc-100 py-1.5 z-30 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter('all');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-zinc-50 cursor-pointer ${
                            activeFilter === 'all' ? 'font-bold text-zinc-900 bg-zinc-50' : 'font-medium text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Layers className="w-3.5 h-3.5 text-[#4870FF]" />
                            <span>All Media</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                            {counts.all}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter('photos');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-zinc-50 cursor-pointer ${
                            activeFilter === 'photos' ? 'font-bold text-zinc-900 bg-zinc-50' : 'font-medium text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Photos</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                            {counts.photos}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter('videos');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-zinc-50 cursor-pointer ${
                            activeFilter === 'videos' ? 'font-bold text-zinc-900 bg-zinc-50' : 'font-medium text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Film className="w-3.5 h-3.5 text-purple-500" />
                            <span>Videos</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                            {counts.videos}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilter('recents');
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-zinc-50 cursor-pointer ${
                            activeFilter === 'recents' ? 'font-bold text-zinc-900 bg-zinc-50' : 'font-medium text-zinc-600'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span>Recents</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                            {counts.recents}
                          </span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right: Clear & Add from Device */}
                <div className="flex items-center space-x-2">
                  {selectedItem && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 px-2.5 py-1 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#4870FF] to-[#3B62F0] hover:from-[#3B62F0] hover:to-[#2A52E0] px-3 py-1.5 rounded-full shadow-xs hover:shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Add from Device</span>
                  </button>
                </div>
              </div>

              {/* Optional Alert / Notice */}
              {permissionNotice && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-900 text-xs flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{permissionNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPermissionNotice(null)}
                    className="text-amber-700 font-bold hover:text-amber-900 p-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Selected Count Indicator Banner */}
              {selectedItem && (
                <div className="px-4 py-1.5 bg-gradient-to-r from-blue-50/70 to-purple-50/70 border-b border-blue-100/50 flex items-center justify-between text-[11px] shrink-0">
                  <span className="font-semibold text-zinc-700 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#4870FF]" />
                    <span>
                      1 {selectedItem.type === 'video' ? 'video' : 'photo'} selected for Story
                      {selectedItem.durationFormatted ? ` (${selectedItem.durationFormatted})` : ''}
                    </span>
                  </span>
                  <span className="text-[#4870FF] font-bold">Ready</span>
                </div>
              )}

              {/* 3-Column Real Media Gallery Grid */}
              <div className="flex-1 overflow-y-auto p-3.5 overscroll-contain">
                {isLoadingGallery ? (
                  <div className="flex flex-col items-center justify-center h-48 space-y-2 text-zinc-400">
                    <div className="w-6 h-6 border-2 border-zinc-300 border-t-[#4870FF] rounded-full animate-spin" />
                    <span className="text-xs font-medium">Loading your gallery...</span>
                  </div>
                ) : filteredItems.length === 0 ? (
                  /* Clean, High-Contrast Empty State */
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4 my-auto">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                      <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-zinc-900">Your Gallery is Empty</h3>
                      <p className="text-xs text-zinc-500 max-w-[240px]">
                        Choose photos or videos from your device to preview and share to your Story.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center space-x-2 text-xs font-bold text-white bg-gradient-to-r from-[#4870FF] to-[#3B62F0] px-5 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Choose Photos or Videos</span>
                    </button>
                  </div>
                ) : (
                  /* 3-Column Responsive Grid with Rounded Thumbnails */
                  <div className="grid grid-cols-3 gap-2.5">
                    {filteredItems.map((item) => {
                      const isSelected = selectedItem?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItem(item)}
                          className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer group shadow-xs transition-all duration-200 select-none bg-zinc-100 ${
                            isSelected
                              ? 'ring-3 ring-[#4870FF] ring-offset-2 scale-[0.98]'
                              : 'hover:opacity-95 hover:shadow-md'
                          }`}
                        >
                          {/* Real Thumbnail Display */}
                          {item.type === 'video' ? (
                            <img
                              src={item.thumbnailUrl || item.url}
                              alt={item.name}
                              className="w-full h-full object-cover pointer-events-none"
                              loading="lazy"
                            />
                          ) : (
                            <img
                              src={item.url}
                              alt={item.name}
                              className="w-full h-full object-cover pointer-events-none"
                              loading="lazy"
                            />
                          )}

                          {/* Top-Right Selection Indicator Checkmark */}
                          <div className="absolute top-2 right-2 pointer-events-none z-10">
                            {isSelected ? (
                              <motion.div
                                initial={{ scale: 0.6 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                                className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#4870FF] to-[#A60F93] text-white ring-2 ring-white shadow-md flex items-center justify-center"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </motion.div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-white/80 bg-black/20 backdrop-blur-xs shadow-xs" />
                            )}
                          </div>

                          {/* Bottom-Right Video Duration Badge */}
                          {item.type === 'video' && (
                            <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 shadow-xs z-10 pointer-events-none">
                              <Film className="w-2.5 h-2.5 text-white/90" />
                              <span>{item.durationFormatted || '0:15'}</span>
                            </div>
                          )}

                          {/* Top-Left Delete Item Button */}
                          <button
                            type="button"
                            onClick={(e) => handleDeleteItem(e, item.id)}
                            className="absolute top-2 left-2 w-5 h-5 rounded-full bg-black/55 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer shadow-xs"
                            title="Remove from gallery"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Format Switcher Bar (Post, Story, Reel) */}
              {onSwitchType && (
                <div className="p-3 bg-white border-t border-zinc-100 shrink-0 flex items-center justify-center">
                  <div className="inline-flex p-1 bg-zinc-100/90 rounded-full text-xs font-bold text-zinc-500">
                    <button
                      type="button"
                      onClick={() => onSwitchType('post')}
                      className="px-4 py-1.5 rounded-full hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      Post
                    </button>
                    <button
                      type="button"
                      className="px-4 py-1.5 rounded-full bg-white text-zinc-900 shadow-xs cursor-default font-extrabold"
                    >
                      Story
                    </button>
                    <button
                      type="button"
                      onClick={() => onSwitchType('reel')}
                      className="px-4 py-1.5 rounded-full hover:text-zinc-900 transition-colors cursor-pointer"
                    >
                      Reel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: REAL STORY PREVIEW & EDITOR */}
          {/* ============================================================== */}
          {step === 'editor' && selectedItem && (
            <motion.div
              key="story-editor-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col h-full w-full overflow-hidden bg-zinc-950 text-white"
            >
              {/* Top Navigation Bar */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md shrink-0 z-20">
                <button
                  type="button"
                  onClick={() => setStep('picker')}
                  className="flex items-center space-x-1 text-zinc-300 hover:text-white p-1 rounded-full cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
                  <span className="text-xs font-semibold">Gallery</span>
                </button>

                <div className="flex flex-col items-center">
                  <h3 className="text-xs font-bold text-white tracking-wide uppercase">Story Preview</h3>
                  <span className="text-[9px] text-[#FBAA47] font-semibold">
                    {selectedItem.type === 'video' ? 'Vertical Video' : 'Photo Story'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={handlePublishStory}
                  className="text-white text-xs font-bold px-4 py-1.5 rounded-full bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95 shadow-md shadow-pink-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isPublishing ? 'Sharing...' : 'Share'}
                </button>
              </div>

              {/* Main Vertical Story Stage */}
              <div className="flex-1 relative flex items-center justify-center p-3 overflow-hidden bg-black">
                <div
                  className="relative w-full h-full max-w-[340px] max-h-[580px] rounded-2xl overflow-hidden bg-zinc-900 shadow-2xl flex items-center justify-center border border-zinc-800"
                >
                  {selectedItem.type === 'video' ? (
                    <div
                      className="relative w-full h-full cursor-pointer group flex items-center justify-center"
                      onClick={toggleEditorVideoPlayback}
                    >
                      <video
                        ref={previewVideoRef}
                        src={selectedItem.url}
                        playsInline
                        autoPlay
                        loop
                        muted={isVideoMuted}
                        className="w-full h-full object-cover"
                        onPlay={() => setIsVideoPlaying(true)}
                        onPause={() => setIsVideoPlaying(false)}
                      />

                      {/* Video Play/Pause Overlay Indicator */}
                      <AnimatePresence>
                        {!isVideoPlaying && (
                          <motion.div
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.7, opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none"
                          >
                            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xl">
                              <Play className="w-7 h-7 fill-white translate-x-0.5" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Video Top Controls: Mute Toggle & Duration */}
                      <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsVideoMuted(prev => !prev);
                          }}
                          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-xs text-white flex items-center justify-center hover:bg-black/80 transition-colors cursor-pointer"
                        >
                          {isVideoMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      </div>

                      {selectedItem.durationFormatted && (
                        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1">
                          <Film className="w-3 h-3" />
                          <span>{selectedItem.durationFormatted}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <img
                      src={selectedItem.url}
                      alt="Story preview"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {/* Text / Caption Sticker Overlay */}
                  <div className="absolute bottom-4 inset-x-3 z-10">
                    <input
                      type="text"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Add a caption or sticker..."
                      className="w-full bg-black/50 backdrop-blur-md border border-white/20 text-white placeholder-white/60 text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-white/50 focus:bg-black/70 transition-all shadow-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Music / Soundtrack Bar */}
              <div className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 space-y-2">
                {selectedAudio ? (
                  <div className="space-y-2">
                    <AudioScrubberBar
                      track={selectedAudio}
                      config={audioConfig}
                      onChangeConfig={setAudioConfig}
                      onRemove={() => setSelectedAudio(null)}
                      onChangeTrack={() => setIsAudioModalOpen(true)}
                      hasVideoMedia={selectedItem.type === 'video'}
                    />
                    <button
                      type="button"
                      onClick={() => setIsAudioEditorOpen(true)}
                      className="w-full py-2 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700/60 flex items-center justify-center space-x-2 text-xs font-bold text-zinc-200 hover:text-white transition-colors cursor-pointer shadow-xs"
                    >
                      <Sliders className="w-3.5 h-3.5 text-pink-500" />
                      <span>Audio Editor & Volume Mixer</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAudioModalOpen(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 flex items-center justify-between text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-2">
                      <Music className="w-4 h-4 text-[#D91A46]" />
                      <span className="font-semibold">Add Music / Soundtrack</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 bg-zinc-700/60 px-2 py-0.5 rounded-full">
                      Browse
                    </span>
                  </button>
                )}

                {/* Big Share CTA */}
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={handlePublishStory}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95 text-white font-bold text-xs tracking-wide uppercase shadow-lg shadow-pink-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isPublishing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{publishStatus || `Uploading (${publishProgress}%)...`}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Share to Your Story</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Universal Music Picker */}
      {isAudioModalOpen && (
        <UniversalMusicPicker
          isOpen={isAudioModalOpen}
          onClose={() => setIsAudioModalOpen(false)}
          selectedAudioId={selectedAudio?.id}
          contentType="story"
          onSelectTrack={(track, initialConfig) => {
            setSelectedAudio(track);
            setAudioConfig(prev => ({
              ...prev,
              audioId: track.id,
              audioStartTime: initialConfig?.audioStartTime ?? 0,
              audioEndTime: initialConfig?.audioEndTime ?? Math.min(30, track.duration || 30),
              audioVolume: initialConfig?.audioVolume ?? 1.0,
              originalAudioVolume: initialConfig?.originalAudioVolume ?? 1.0
            }));
            setIsAudioModalOpen(false);
          }}
          onOpenEditor={(track) => {
            setSelectedAudio(track);
            setAudioConfig(prev => ({
              ...prev,
              audioId: track.id,
              audioStartTime: 0,
              audioEndTime: Math.min(30, track.duration || 30),
              audioVolume: 1.0,
              originalAudioVolume: 1.0
            }));
            setIsAudioModalOpen(false);
            setIsAudioEditorOpen(true);
          }}
          onTrackCreated={(track) => {
            setSelectedAudio(track);
            setAudioConfig(prev => ({
              ...prev,
              audioId: track.id,
              audioStartTime: 0,
              audioEndTime: Math.min(30, track.duration || 30),
              audioVolume: 1.0,
              originalAudioVolume: 1.0
            }));
            setIsAudioModalOpen(false);
            setIsAudioEditorOpen(true);
          }}
        />
      )}

      {/* Audio Editor Sheet (Segment Trimming & Synchronized Volume Mixing) */}
      {isAudioEditorOpen && selectedAudio && (
        <AudioEditorSheet
          isOpen={isAudioEditorOpen}
          onClose={() => setIsAudioEditorOpen(false)}
          track={selectedAudio}
          config={audioConfig}
          onChangeConfig={setAudioConfig}
          onRemoveTrack={() => {
            setSelectedAudio(null);
            setAudioConfig(prev => ({ ...prev, audioId: '' }));
          }}
          onChangeTrack={() => {
            setIsAudioEditorOpen(false);
            setIsAudioModalOpen(true);
          }}
          mediaUrl={selectedItem?.url}
          mediaType={selectedItem?.type === 'video' ? 'video' : 'image'}
          hasVideoMedia={selectedItem?.type === 'video'}
        />
      )}

      {/* Live Camera Modal */}
      {isLiveCameraOpen && (
        <LiveCameraModal
          isOpen={isLiveCameraOpen}
          onClose={() => setIsLiveCameraOpen(false)}
          onCapture={handleCameraCapture}
          onFallbackToNative={() => {
            setIsLiveCameraOpen(false);
            cameraInputRef.current?.click();
          }}
        />
      )}
    </div>
  );
};
