import React, { useState, useEffect, useRef } from 'react';
import { MusicTrack, CarouselItem, Post, Reel } from '../../types/index';
import { apiRequest } from '../../lib/api';
import { savePostToFirestore, saveReelToFirestore } from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';
import { extractVideoThumbnail, uploadMediaFile, uploadDataUrl } from '../../lib/upload';
import { 
  validateVideoFile, 
  getVideoFileDuration, 
  formatDuration, 
  VIDEO_LIMITS, 
  VideoValidationResult,
  probeMediaMetadata,
  MediaMetadataInfo
} from '../../lib/videoLimits';
import { 
  X, 
  Image as ImageIcon, 
  Film, 
  Clock, 
  Music, 
  UploadCloud, 
  Check,
  FileVideo,
  FileImage,
  RefreshCw,
  Trash2,
  Megaphone,
  Layers,
  AlertTriangle,
  ArrowRight,
  Scissors,
  Plus,
  Camera,
  Wand2,
  ChevronDown,
  ArrowLeft,
  Sparkles,
  FolderPlus,
  Sliders
} from 'lucide-react';
import { LiveCameraModal } from './LiveCameraModal';
import { UniversalMusicPicker } from '../music/UniversalMusicPicker';
import { AudioEditorSheet } from '../music/AudioEditorSheet';
import { AudioScrubberBar } from '../music/AudioScrubberBar';
import { StoryGalleryPicker } from './StoryGalleryPicker';
import { AudioAttachmentConfig } from '../../types/index';
import { getSavedGalleryItems, saveFilesToGallery, removeGalleryItem, clearAllGalleryItems, UserGalleryItem } from '../../lib/userGallery';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (createdType?: 'post' | 'carousel' | 'reel' | 'story') => void;
  initialType?: 'post' | 'carousel' | 'reel' | 'story';
  initialAudioTrack?: MusicTrack | null;
}

interface CarouselUploadItem {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: 'image' | 'video';
  duration?: number;
  formattedDuration?: string;
}

export const CreateModal: React.FC<CreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialType,
  initialAudioTrack
}) => {
  const { user } = useAuth();
  const [type, setType] = useState<'post' | 'carousel' | 'reel' | 'story'>('post');

  useEffect(() => {
    if (isOpen && initialType) {
      setType(initialType);
    }
  }, [isOpen, initialType]);
  
  // Single file state (Feed Post, Reel, Story)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [fileDurationFormatted, setFileDurationFormatted] = useState<string | null>(null);
  const [detectedMeta, setDetectedMeta] = useState<MediaMetadataInfo | null>(null);

  // Carousel files state (Carousel tab)
  const [carouselItems, setCarouselItems] = useState<CarouselUploadItem[]>([]);
  const [activeCarouselPreviewIdx, setActiveCarouselPreviewIdx] = useState<number>(0);

  // Validation Warnings & Modals
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [reelExceededModal, setReelExceededModal] = useState<{
    duration: number;
    formatted: string;
  } | null>(null);
  const [storySplitPrompt, setStorySplitPrompt] = useState<{
    duration: number;
    formatted: string;
    segmentCount: number;
  } | null>(null);

  const [caption, setCaption] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [audioConfig, setAudioConfig] = useState<AudioAttachmentConfig>({
    audioId: '',
    audioStartTime: 0,
    audioEndTime: 30,
    audioVolume: 0.8,
    originalAudioVolume: 1.0
  });

  useEffect(() => {
    if (isOpen && initialAudioTrack) {
      setSelectedTrack(initialAudioTrack);
      setSelectedAudioId(initialAudioTrack.id);
      setAudioConfig({
        audioId: initialAudioTrack.id,
        audioStartTime: 0,
        audioEndTime: Math.min(30, initialAudioTrack.duration || 30),
        audioVolume: 0.8,
        originalAudioVolume: 1.0
      });
    }
  }, [isOpen, initialAudioTrack]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sponsored Ad option for Reels
  const [publishAsAd, setPublishAsAd] = useState(false);
  const [adSponsorName, setAdSponsorName] = useState('');
  const [adTargetUrl, setAdTargetUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const carouselInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Mobile Upload Tab State
  const [mobileStep, setMobileStep] = useState<'picker' | 'details'>('picker');
  const [isMusicModalOpen, setIsMusicModalOpen] = useState(false);
  const [isAudioEditorOpen, setIsAudioEditorOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [savedGallery, setSavedGallery] = useState<UserGalleryItem[]>([]);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Load user's actual device gallery items from local IndexedDB
  useEffect(() => {
    if (isOpen) {
      setMobileStep('picker');
      if (initialType) {
        setType(initialType);
      }
      setIsLoadingGallery(true);

      getSavedGalleryItems()
        .then((items) => {
          setSavedGallery(items);
          if (items.length > 0 && !selectedFile) {
            const first = items[0];
            setSelectedMediaId(first.id);
            handleSingleFile(first.file);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingGallery(false));
    }
  }, [isOpen, initialType]);

  // Handle files selected directly from user's device gallery picker
  const handleGalleryFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems = await saveFilesToGallery(files);
    if (newItems.length > 0) {
      setSavedGallery((prev) => [...newItems, ...prev.filter((p) => !newItems.some((n) => n.id === p.id))]);
      const first = newItems[0];
      setSelectedMediaId(first.id);
      await handleSingleFile(first.file);
    }
  };

  // Handle capture directly from live camera modal
  const handleCameraCapture = async (file: File) => {
    setIsCameraOpen(false);
    const newItems = await saveFilesToGallery([file]);
    if (newItems.length > 0) {
      setSavedGallery((prev) => [...newItems, ...prev]);
      setSelectedMediaId(newItems[0].id);
    }
    await handleSingleFile(file);
    setMobileStep('details');
  };

  useEffect(() => {
    if (isOpen) {
      const fetchTracks = async () => {
        try {
          const res = await apiRequest<{ tracks: MusicTrack[] }>('/tracks');
          setTracks(res.tracks || []);
        } catch {
          // Ignore
        }
      };
      fetchTracks();
    }
  }, [isOpen]);

  // Clean up single object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Clean up carousel object URLs
  useEffect(() => {
    return () => {
      carouselItems.forEach(item => {
        if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [carouselItems]);

  if (!isOpen) return null;

  const clearSelectedFile = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileDuration(null);
    setFileDurationFormatted(null);
    setDetectedMeta(null);
    setValidationWarning(null);
    setReelExceededModal(null);
    setStorySplitPrompt(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearCarouselItems = () => {
    carouselItems.forEach(item => {
      if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    setCarouselItems([]);
    setActiveCarouselPreviewIdx(0);
    if (carouselInputRef.current) {
      carouselInputRef.current.value = '';
    }
  };

  // Handle single file selection (Feed, Reel, Story)
  const handleSingleFile = async (file: File) => {
    if (!file) return;

    setSubmitError(null);
    setValidationWarning(null);
    setReelExceededModal(null);
    setStorySplitPrompt(null);

    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);

    if (type === 'reel' && !isVideo) {
      setSubmitError('Reels require a video file from your device (MP4, WEBM, MOV).');
      return;
    }

    if (!isImage && !isVideo) {
      setSubmitError('Please select a valid image or video file from your device.');
      return;
    }

    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setPreviewUrl(objUrl);
    setMediaType(isVideo ? 'video' : 'image');

    // Auto-detect photo vs video, duration, MIME type, file size, orientation, resolution, then apply validation
    probeMediaMetadata(file).then(meta => {
      setDetectedMeta(meta);
      if (meta.mediaType === 'video') {
        setMediaType('video');
        if (meta.duration && meta.duration > 0) {
          const formatted = meta.durationFormatted || formatDuration(meta.duration);
          setFileDuration(meta.duration);
          setFileDurationFormatted(formatted);

          // 1. REELS LIMIT: Max 15 minutes (900 seconds)
          if (type === 'reel') {
            if (meta.duration > VIDEO_LIMITS.REEL_MAX_SECONDS) {
              setReelExceededModal({
                duration: meta.duration,
                formatted: formatted || 'longer than 15 minutes'
              });
            }
          }

          // 2. STORY LIMIT: 60 seconds segment
          if (type === 'story') {
            if (meta.duration > VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS) {
              const segmentCount = Math.ceil(meta.duration / VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS);
              setStorySplitPrompt({
                duration: meta.duration,
                formatted: formatted || 'longer than 60s',
                segmentCount
              });
            }
          }

          // 3. FEED POST LIMIT: 60 minutes
          if (type === 'post') {
            if (meta.duration > VIDEO_LIMITS.FEED_MAX_SECONDS) {
              setSubmitError(
                `This video is ${formatted} long, which exceeds the maximum limit of ${VIDEO_LIMITS.FEED_MAX_LABEL} for Feed Posts. Please choose a video under 60 minutes.`
              );
            }
          }
        }
      } else {
        setMediaType('image');
        setFileDuration(null);
        setFileDurationFormatted(null);
      }
    }).catch(err => {
      console.warn('Client-side media probe notice:', err);
    });
  };

  // Switch an oversized Reel to a standard Feed Post
  const handleSwitchToFeedPost = () => {
    setType('post');
    setReelExceededModal(null);
    setValidationWarning(
      `Switched to Feed Post! Your ${fileDurationFormatted || 'video'} video will be published in full length (Feed Posts support up to 60 minutes).`
    );
  };

  // Handle Carousel Multi-file selection
  const handleCarouselFiles = async (files: FileList | File[]) => {
    setSubmitError(null);
    const newItems: CarouselUploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);

      if (!isImage && !isVideo) continue;

      if (isVideo) {
        setUploadProgress(`Validating "${file.name}"...`);
        const duration = await getVideoFileDuration(file);
        setUploadProgress('');

        // Strict Carousel Rule: Each individual video inside a carousel can be up to 60 seconds
        if (duration > VIDEO_LIMITS.CAROUSEL_ITEM_MAX_SECONDS) {
          const formatted = formatDuration(duration);
          setSubmitError(
            `Video "${file.name}" is ${formatted} long. Videos inside carousel posts cannot exceed 60 seconds. Rejecting video rather than silently trimming. Please select a clip up to 60 seconds or share it as a standard Feed Post (supports up to 60 minutes).`
          );
          return;
        }

        newItems.push({
          id: `item-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          mediaType: 'video',
          duration,
          formattedDuration: formatDuration(duration)
        });
      } else {
        newItems.push({
          id: `item-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          mediaType: 'image'
        });
      }
    }

    const merged = [...carouselItems, ...newItems].slice(0, 10);
    if (merged.length > 10) {
      setValidationWarning('Carousels support up to 10 photos or videos. Additional files were omitted.');
    }
    setCarouselItems(merged);
  };

  const removeCarouselItem = (idx: number) => {
    const item = carouselItems[idx];
    if (item?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
    const updated = carouselItems.filter((_, i) => i !== idx);
    setCarouselItems(updated);
    if (activeCarouselPreviewIdx >= updated.length) {
      setActiveCarouselPreviewIdx(Math.max(0, updated.length - 1));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (type === 'carousel') {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleCarouselFiles(files);
      }
    } else {
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleSingleFile(file);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitError(null);

    // 1. Carousel Validation
    if (type === 'carousel') {
      if (carouselItems.length < 2) {
        setSubmitError('Please select at least 2 photos or videos for a carousel post (up to 10 items).');
        return;
      }
    } else if (type === 'reel') {
      if (!selectedFile) {
        setSubmitError('Please select a video file from your device to publish a reel.');
        return;
      }
      if (mediaType !== 'video') {
        setSubmitError('Reels require a video format (MP4, WebM, MOV).');
        return;
      }
      if (fileDuration && fileDuration > VIDEO_LIMITS.REEL_MAX_SECONDS) {
        setReelExceededModal({
          duration: fileDuration,
          formatted: fileDurationFormatted || `${Math.round(fileDuration)}s`
        });
        return;
      }
    } else if (type === 'story') {
      if (!selectedFile) {
        setSubmitError('Please select a photo or video to share in your story.');
        return;
      }
    } else {
      // Feed Post
      if (!selectedFile && !caption.trim()) {
        setSubmitError('Please add a photo, video, or write a caption to publish your post.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // -------------------------------------------------------------
      // SUBMIT CAROUSEL POST
      // -------------------------------------------------------------
      if (type === 'carousel') {
        const uploadedCarouselItems: CarouselItem[] = [];
        
        for (let i = 0; i < carouselItems.length; i++) {
          const item = carouselItems[i];
          setUploadProgress(`Uploading item ${i + 1} of ${carouselItems.length}...`);
          
          const uploadedUrl = await uploadMediaFile(item.file, {
            onProgress: (pct) => {
              setUploadProgress(`Uploading item ${i + 1} of ${carouselItems.length}: ${pct}%`);
            }
          });
          if (!uploadedUrl) {
            throw new Error(`Failed to upload carousel item "${item.file.name}".`);
          }

          let thumbUrl: string | undefined = undefined;
          if (item.mediaType === 'video') {
            try {
              const thumbData = await extractVideoThumbnail(item.file);
              if (thumbData) {
                thumbUrl = await uploadDataUrl(thumbData, 'thumb');
              }
            } catch {
              // Ignore thumbnail error
            }
          }

          uploadedCarouselItems.push({
            id: `carousel-item-${i}`,
            mediaUrl: uploadedUrl,
            mediaType: item.mediaType,
            thumbnailUrl: thumbUrl,
            duration: item.duration,
            originalName: item.file.name
          });
        }

        setUploadProgress('Publishing Carousel Post...');
        const postRes = await apiRequest<{ post: Post }>('/posts', {
          method: 'POST',
          body: JSON.stringify({
            caption: caption.trim(),
            mediaType: 'carousel',
            mediaUrl: uploadedCarouselItems[0].mediaUrl,
            thumbnailUrl: uploadedCarouselItems[0].thumbnailUrl,
            carouselItems: uploadedCarouselItems,
            audioId: selectedAudioId || undefined,
            audioStartTime: selectedAudioId ? audioConfig.audioStartTime : undefined,
            audioEndTime: selectedAudioId ? audioConfig.audioEndTime : undefined,
            audioVolume: selectedAudioId ? audioConfig.audioVolume : undefined,
            originalAudioVolume: selectedAudioId ? audioConfig.originalAudioVolume : undefined
          })
        });

        if (postRes?.post) {
          savePostToFirestore(postRes.post).catch(() => {});
        }

        clearCarouselItems();
      }

      // -------------------------------------------------------------
      // SUBMIT STORY (with user-confirmed splitting if > 60s)
      // -------------------------------------------------------------
      else if (type === 'story') {
        if (!selectedFile) {
          setSubmitError('Please select a photo or video from your gallery to share in your story.');
          return;
        }

        const isVideo = selectedFile.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(selectedFile.name);
        const effectiveMediaType: 'video' | 'image' = isVideo ? 'video' : 'image';

        setUploadProgress(isVideo ? 'Uploading story video...' : 'Uploading story photo...');
        const uploadedUrl = await uploadMediaFile(selectedFile, {
          onProgress: (pct) => {
            setUploadProgress(`Uploading story: ${pct}%`);
          }
        });
        if (!uploadedUrl) {
          throw new Error('Failed to upload story media to storage.');
        }

        if (effectiveMediaType === 'video' && fileDuration && fileDuration > VIDEO_LIMITS.STORY_SEGMENT_MAX_SECONDS) {
          // Call splitting endpoint with seamless fallback to direct publication
          setUploadProgress(`Splitting into ${Math.ceil(fileDuration / 60)} 60-second segments...`);
          try {
            await apiRequest('/stories/split-video', {
              method: 'POST',
              body: JSON.stringify({
                videoUrl: uploadedUrl,
                caption: caption.trim() || undefined
              })
            });
          } catch (splitErr) {
            console.warn('Video splitting failed, publishing directly as single story:', splitErr);
            await apiRequest('/stories', {
              method: 'POST',
              body: JSON.stringify({
                mediaUrl: uploadedUrl,
                mediaType: 'video',
                caption: caption.trim() || undefined,
                audioId: selectedAudioId || undefined,
                audioStartTime: selectedAudioId ? audioConfig.audioStartTime : undefined,
                audioEndTime: selectedAudioId ? audioConfig.audioEndTime : undefined,
                audioVolume: selectedAudioId ? audioConfig.audioVolume : undefined,
                originalAudioVolume: selectedAudioId ? audioConfig.originalAudioVolume : undefined
              })
            });
          }
        } else {
          setUploadProgress('Publishing story...');
          await apiRequest('/stories', {
            method: 'POST',
            body: JSON.stringify({
              mediaUrl: uploadedUrl,
              mediaType: effectiveMediaType,
              caption: caption.trim() || undefined,
              audioId: selectedAudioId || undefined,
              audioStartTime: selectedAudioId ? audioConfig.audioStartTime : undefined,
              audioEndTime: selectedAudioId ? audioConfig.audioEndTime : undefined,
              audioVolume: selectedAudioId ? audioConfig.audioVolume : undefined,
              originalAudioVolume: selectedAudioId ? audioConfig.originalAudioVolume : undefined
            })
          });
        }

        clearSelectedFile();
      }

      // -------------------------------------------------------------
      // SUBMIT REEL
      // -------------------------------------------------------------
      else if (type === 'reel') {
        setUploadProgress('Uploading video to permanent storage...');
        const uploadedUrl = await uploadMediaFile(selectedFile!, {
          onProgress: (pct) => {
            setUploadProgress(`Uploading reel: ${pct}% (resumable)`);
          }
        });
        if (!uploadedUrl) {
          throw new Error('Video upload failed.');
        }

        setUploadProgress('Generating poster image...');
        let extractedThumbUrl: string | undefined = undefined;
        try {
          const thumbData = await extractVideoThumbnail(selectedFile!);
          if (thumbData) {
            extractedThumbUrl = await uploadDataUrl(thumbData, 'thumb');
          }
        } catch {
          // Ignore
        }

        setUploadProgress('Publishing Reel...');
        const reelRes = await apiRequest<{ reel: Reel }>('/reels', {
          method: 'POST',
          body: JSON.stringify({
            videoUrl: uploadedUrl,
            thumbnailUrl: extractedThumbUrl,
            caption: caption.trim(),
            audioId: selectedAudioId || undefined,
            audioStartTime: selectedAudioId ? audioConfig.audioStartTime : undefined,
            audioEndTime: selectedAudioId ? audioConfig.audioEndTime : undefined,
            audioVolume: selectedAudioId ? audioConfig.audioVolume : undefined,
            originalAudioVolume: selectedAudioId ? audioConfig.originalAudioVolume : undefined
          })
        });

        if (reelRes?.reel) {
          saveReelToFirestore(reelRes.reel).catch(() => {});
        }

        if (publishAsAd) {
          try {
            await apiRequest('/ads', {
              method: 'POST',
              body: JSON.stringify({
                title: caption.trim() || 'Featured Reel',
                sponsorName: adSponsorName.trim() || user?.displayName || user?.username || 'Sponsored',
                sponsorAvatarUrl: user?.avatarUrl,
                mediaUrl: uploadedUrl,
                thumbnailUrl: extractedThumbUrl,
                mediaType: 'video',
                placement: 'reels',
                targetUrl: adTargetUrl.trim() || 'https://ishara.social',
                ctaText: 'Learn More',
                isActive: true
              })
            });
          } catch (adErr) {
            console.warn('Failed to publish as ad campaign, but reel was published:', adErr);
          }
        }

        clearSelectedFile();
      }

      // -------------------------------------------------------------
      // SUBMIT STANDARD FEED POST (up to 60 minutes)
      // -------------------------------------------------------------
      else {
        let uploadedUrl = '';
        let extractedThumbUrl: string | undefined = undefined;
        const isFileVideo = selectedFile 
          ? (selectedFile.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(selectedFile.name))
          : false;
        const effectiveMediaType = isFileVideo ? 'video' : (mediaType === 'video' ? 'video' : 'image');

        if (selectedFile) {
          setUploadProgress('Uploading to permanent storage...');
          uploadedUrl = await uploadMediaFile(selectedFile, {
            onProgress: (pct) => {
              setUploadProgress(`Uploading ${effectiveMediaType === 'video' ? 'video' : 'media'}: ${pct}% (resumable)`);
            }
          });
          if (!uploadedUrl) {
            throw new Error('Media upload failed.');
          }

          if (effectiveMediaType === 'video') {
            try {
              setUploadProgress('Generating video poster...');
              const thumbData = await extractVideoThumbnail(selectedFile);
              if (thumbData) {
                extractedThumbUrl = await uploadDataUrl(thumbData, 'thumb');
              }
            } catch {
              // Ignore
            }
          }
        } else if (previewUrl && !previewUrl.startsWith('blob:')) {
          uploadedUrl = previewUrl;
        }

        setUploadProgress('Publishing Feed Post...');
        const postRes = await apiRequest<{ post: Post }>('/posts', {
          method: 'POST',
          body: JSON.stringify({
            mediaUrl: uploadedUrl || undefined,
            thumbnailUrl: extractedThumbUrl,
            mediaType: selectedFile ? effectiveMediaType : (mediaType || 'image'),
            caption: caption.trim(),
            audioId: selectedAudioId || undefined,
            audioStartTime: selectedAudioId ? audioConfig.audioStartTime : undefined,
            audioEndTime: selectedAudioId ? audioConfig.audioEndTime : undefined,
            audioVolume: selectedAudioId ? audioConfig.audioVolume : undefined,
            originalAudioVolume: selectedAudioId ? audioConfig.originalAudioVolume : undefined
          })
        });

        if (postRes?.post) {
          savePostToFirestore(postRes.post).catch(() => {});
        }

        clearSelectedFile();
      }

      setCaption('');
      setSelectedAudioId('');
      setSelectedTrack(null);
      setSubmitError(null);
      onCreated(type);
      onClose();
    } catch (err: any) {
      console.error('[Publish Error]', err);
      const errMsg = err?.data?.error || err?.message || err?.error || 'Failed to publish content. Please check video length and retry.';
      setSubmitError(errMsg);
    } finally {
      setIsSubmitting(false);
      setUploadProgress('');
    }
  };

  if ((type as string) === 'story') {
    return (
      <StoryGalleryPicker
        isOpen={isOpen}
        onClose={onClose}
        initialAudioTrack={initialAudioTrack}
        onStoryPublished={() => {
          onCreated('story');
          onClose();
        }}
        onSwitchType={(newType) => {
          if (newType === 'story') return;
          setType(newType);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="hidden md:flex bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex-col shadow-2xl border border-gray-100 overflow-hidden relative">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#1A1A1A]">Create New Content</h3>
            <p className="text-[11px] text-[#8E8E8E]">Direct media upload with verified length limits</p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="p-3 border-b border-[#EEEEEE] bg-gray-50/60 grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setType('post');
              setSubmitError(null);
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center sm:space-x-1.5 space-y-0.5 sm:space-y-0 transition-colors ${
              type === 'post' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'bg-white border border-[#EEEEEE] text-[#666666] hover:bg-gray-50'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="truncate">Feed Post</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setType('carousel');
              setSubmitError(null);
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center sm:space-x-1.5 space-y-0.5 sm:space-y-0 transition-colors ${
              type === 'carousel' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'bg-white border border-[#EEEEEE] text-[#666666] hover:bg-gray-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="truncate">Carousel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setType('reel');
              setSubmitError(null);
              if (selectedFile && !selectedFile.type.startsWith('video/')) {
                clearSelectedFile();
              }
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center sm:space-x-1.5 space-y-0.5 sm:space-y-0 transition-colors ${
              type === 'reel' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'bg-white border border-[#EEEEEE] text-[#666666] hover:bg-gray-50'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span className="truncate">Reel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setType('story');
              setSubmitError(null);
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center sm:space-x-1.5 space-y-0.5 sm:space-y-0 transition-colors ${
              type === 'story' ? 'bg-[#1A1A1A] text-white shadow-xs' : 'bg-white border border-[#EEEEEE] text-[#666666] hover:bg-gray-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="truncate">24h Story</span>
          </button>
        </div>

        {/* Reel Duration Exceeded Modal / Alert */}
        {reelExceededModal && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 text-amber-900 space-y-2 animate-in fade-in">
            <div className="flex items-start space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-bold text-amber-950">
                  Video exceeds Reel duration limit ({reelExceededModal.formatted})
                </p>
                <p className="text-amber-800 mt-0.5">
                  Reels support videos up to 15 minutes. You can publish this video in its original full length as a standard Feed Post (Feed Posts support videos up to 60 minutes).
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={clearSelectedFile}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 text-xs font-medium rounded-xl hover:bg-amber-100 transition-colors cursor-pointer"
              >
                Choose Shorter Video
              </button>
              <button
                type="button"
                onClick={handleSwitchToFeedPost}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <span>Publish as Feed Post instead</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Story Video Split Prompt */}
        {storySplitPrompt && (
          <div className="p-4 bg-indigo-50 border-b border-indigo-200 text-indigo-900 space-y-2 animate-in fade-in">
            <div className="flex items-start space-x-2.5">
              <Scissors className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-bold text-indigo-950">
                  Video will be split into {storySplitPrompt.segmentCount} Story segments ({storySplitPrompt.formatted})
                </p>
                <p className="text-indigo-800 mt-0.5">
                  Stories are played in 60-second segments. We will split your video into {storySplitPrompt.segmentCount} sequential parts with zero quality loss.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setType('post');
                  setStorySplitPrompt(null);
                }}
                className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-800 text-xs font-medium rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                Publish as Feed Post instead
              </button>
              <button
                type="button"
                onClick={() => setStorySplitPrompt(null)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1 transition-colors cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm & Split into {storySplitPrompt.segmentCount} Segments</span>
              </button>
            </div>
          </div>
        )}

        {/* Validation Warning Alert */}
        {validationWarning && (
          <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{validationWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setValidationWarning(null)}
              className="text-blue-500 hover:text-blue-700 font-bold ml-2 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          
          {/* CAROUSEL UPLOAD MODE */}
          {type === 'carousel' ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700">
                  Carousel Media ({carouselItems.length}/10 items)
                </label>
                <span className="text-[10px] text-gray-500">
                  Videos: Max 60 seconds each
                </span>
              </div>

              <input
                type="file"
                ref={carouselInputRef}
                multiple
                accept="image/*,video/*"
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleCarouselFiles(e.target.files);
                  }
                }}
                className="hidden"
              />

              {carouselItems.length === 0 ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => carouselInputRef.current?.click()}
                  className={`w-full py-6 px-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center bg-zinc-50/60 hover:bg-zinc-50 ${
                    isDragging 
                      ? 'border-black bg-zinc-100/80 ring-2 ring-black/5' 
                      : 'border-zinc-200/90 hover:border-zinc-300 shadow-2xs'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-white shadow-xs border border-zinc-200/80 flex items-center justify-center text-zinc-800 mb-2.5">
                    <Layers className="w-5 h-5 text-zinc-700" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-900">
                    Select 2 to 10 photos or videos
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Drag & drop or browse from your device
                  </p>
                  <button
                    type="button"
                    className="mt-3 px-3.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-xl hover:bg-black transition-colors shadow-2xs cursor-pointer"
                  >
                    Select Files
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Active Preview (Slidable Carousel) */}
                  <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-black/5 flex flex-col items-center justify-center max-h-64">
                    <div
                      className="w-full max-h-60 flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar select-none touch-pan-x"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (el && el.clientWidth > 0) {
                          const idx = Math.round(el.scrollLeft / el.clientWidth);
                          if (idx !== activeCarouselPreviewIdx && idx >= 0 && idx < carouselItems.length) {
                            setActiveCarouselPreviewIdx(idx);
                          }
                        }
                      }}
                    >
                      {carouselItems.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="w-full h-60 flex-shrink-0 snap-center snap-always flex items-center justify-center p-1"
                        >
                          {item.mediaType === 'video' ? (
                            <video
                              src={item.previewUrl}
                              controls
                              muted
                              loop
                              className="max-h-56 w-full object-contain rounded-xl"
                            />
                          ) : (
                            <img
                              src={item.previewUrl}
                              alt={`Preview ${idx + 1}`}
                              className="max-h-56 w-full object-contain rounded-xl"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-xl text-white text-[10px] font-medium flex items-center space-x-1.5 shadow-md pointer-events-none">
                      <span>Item {activeCarouselPreviewIdx + 1} of {carouselItems.length}</span>
                      {carouselItems[activeCarouselPreviewIdx]?.formattedDuration && (
                        <span className="text-amber-300 font-bold">({carouselItems[activeCarouselPreviewIdx].formattedDuration})</span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Strip */}
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                    {carouselItems.map((item, idx) => (
                      <div
                        key={item.id}
                        onClick={() => setActiveCarouselPreviewIdx(idx)}
                        className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                          idx === activeCarouselPreviewIdx ? 'border-black ring-2 ring-black/20' : 'border-gray-200 opacity-80 hover:opacity-100'
                        }`}
                      >
                        {item.mediaType === 'video' ? (
                          <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-white text-[10px]">
                            <Film className="w-4 h-4" />
                          </div>
                        ) : (
                          <img src={item.previewUrl} alt="Thumb" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCarouselItem(idx);
                          }}
                          className="absolute top-0.5 right-0.5 p-0.5 bg-black/70 hover:bg-red-600 text-white rounded-full transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {carouselItems.length < 10 && (
                      <button
                        type="button"
                        onClick={() => carouselInputRef.current?.click()}
                        className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-black flex flex-col items-center justify-center text-gray-500 hover:text-black shrink-0 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4 mb-0.5" />
                        <span className="text-[9px] font-semibold">Add</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* SINGLE FILE UPLOAD (Feed Post, Reel, Story) */
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-zinc-800">
                  {type === 'reel' ? 'Reel Video' : type === 'story' ? 'Story Media' : 'Media'}
                </label>
                {selectedFile && (
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center space-x-1">
                    <Check className="w-3 h-3" />
                    <span>Selected</span>
                  </span>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept={type === 'reel' ? 'video/mp4,video/webm,video/quicktime,video/*' : 'image/*,video/*'}
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleGalleryFilesSelected(e.target.files);
                  }
                }}
                className="hidden"
              />

              {!previewUrl ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-6 px-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center text-center bg-zinc-50/60 hover:bg-zinc-50 ${
                    isDragging 
                      ? 'border-black bg-zinc-100/80 ring-2 ring-black/5' 
                      : 'border-zinc-200/90 hover:border-zinc-300 shadow-2xs'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-white shadow-xs border border-zinc-200/80 flex items-center justify-center text-zinc-800 mb-2.5">
                    <UploadCloud className="w-5 h-5 text-zinc-700" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-900">
                    Choose from device or drag & drop
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {type === 'reel' ? 'Supports MP4, MOV, WEBM video' : 'Supports photos & videos'}
                  </p>
                  <button
                    type="button"
                    className="mt-3 px-3.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-xl hover:bg-black transition-colors shadow-2xs cursor-pointer"
                  >
                    Select File
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-black/5 flex flex-col items-center justify-center max-h-72">
                    {mediaType === 'video' ? (
                      <video
                        src={previewUrl}
                        controls
                        muted
                        loop
                        className="max-h-64 w-full object-contain rounded-xl"
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Device preview"
                        className="max-h-64 w-full object-contain rounded-xl"
                      />
                    )}

                    {/* Quick actions on preview */}
                    <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 bg-black/70 backdrop-blur-md px-2 py-1 rounded-xl text-white text-[11px] shadow-md">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                        title="Change file"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button
                        type="button"
                        onClick={clearSelectedFile}
                        className="p-1 hover:bg-red-500/40 text-red-300 hover:text-red-100 rounded-lg transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Auto-detected metadata chips */}
                  <div className="p-2.5 bg-zinc-50 border border-zinc-200/90 rounded-xl flex flex-wrap items-center gap-2 text-[11px] text-zinc-700">
                    <span className="font-semibold text-zinc-900 flex items-center space-x-1">
                      {mediaType === 'video' ? (
                        <>
                          <FileVideo className="w-3.5 h-3.5 text-sky-600" />
                          <span>Video</span>
                        </>
                      ) : (
                        <>
                          <FileImage className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Photo</span>
                        </>
                      )}
                    </span>
                    {detectedMeta?.durationFormatted && (
                      <span className="bg-amber-50 text-amber-900 border border-amber-200/80 px-2 py-0.5 rounded-md font-medium">
                        {detectedMeta.durationFormatted}
                      </span>
                    )}
                    {detectedMeta?.resolution && (
                      <span className="bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded-md">
                        {detectedMeta.resolution} {detectedMeta.orientation ? `(${detectedMeta.orientation})` : ''}
                      </span>
                    )}
                    {selectedFile && (
                      <span className="text-zinc-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    )}
                    {detectedMeta?.mimeType && (
                      <span className="text-zinc-400 text-[10px]">
                        {detectedMeta.mimeType}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Caption / Thoughts
            </label>
            <textarea
              rows={3}
              placeholder="Write a caption, mention friends, #vibes #creativity..."
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-black resize-none"
            />
          </div>

          {/* Audio Soundtrack Tagging */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1.5">
                <Music className="w-3.5 h-3.5 text-pink-600" />
                <span>Audio / Music Soundtrack</span>
              </label>
              {!selectedAudioId && (
                <button
                  type="button"
                  onClick={() => setIsMusicModalOpen(true)}
                  className="text-[11px] font-bold text-pink-600 hover:text-pink-700 flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Choose Sound</span>
                </button>
              )}
            </div>

            {(() => {
              const activeTrack = selectedTrack || tracks.find(t => t.id === selectedAudioId);
              if (activeTrack) {
                return (
                  <div className="space-y-2">
                    <AudioScrubberBar
                      track={activeTrack}
                      config={audioConfig}
                      onChangeConfig={setAudioConfig}
                      onRemove={() => {
                        setSelectedAudioId('');
                        setSelectedTrack(null);
                      }}
                      onChangeTrack={() => setIsMusicModalOpen(true)}
                      hasVideoMedia={mediaType === 'video' || !!selectedFile?.type.startsWith('video/')}
                    />
                    <button
                      type="button"
                      onClick={() => setIsAudioEditorOpen(true)}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-pink-50 to-indigo-50 hover:from-pink-100 hover:to-indigo-100 border border-pink-200/60 flex items-center justify-center space-x-2 text-xs font-bold text-zinc-800 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Sliders className="w-3.5 h-3.5 text-pink-600" />
                      <span>Full Audio Editor & Volume Balance</span>
                    </button>
                  </div>
                );
              }

              return (
                <div
                  onClick={() => setIsMusicModalOpen(true)}
                  className="p-3 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-pink-50 text-pink-600 group-hover:bg-pink-100 flex items-center justify-center transition-colors">
                      <Music className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900">Add Music / Original Audio</p>
                      <p className="text-[10px] text-zinc-500">Trending tracks, lo-fi, synthwave & custom sounds</p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </div>
              );
            })()}
          </div>

          {/* Sponsored Ad Option for Reels */}
          {type === 'reel' && (
            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={publishAsAd}
                  onChange={e => setPublishAsAd(e.target.checked)}
                  className="rounded text-black focus:ring-black h-4 w-4"
                />
                <span className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-amber-500" />
                  <span>Publish & Promote as Sponsored Ad in Reels Feed</span>
                </span>
              </label>

              {publishAsAd && (
                <div className="pt-2 border-t border-zinc-200 space-y-2.5 animate-in fade-in">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Sponsor / Brand Name</label>
                    <input
                      type="text"
                      value={adSponsorName}
                      onChange={e => setAdSponsorName(e.target.value)}
                      placeholder={user?.displayName || 'Brand Name'}
                      className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Call to Action Target Link</label>
                    <input
                      type="url"
                      value={adTargetUrl}
                      onChange={e => setAdTargetUrl(e.target.value)}
                      placeholder="https://yourbrand.com/offer"
                      className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-black"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Banner with Retry/Dismiss */}
          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-700 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{submitError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* 1-Click Action to switch to Feed Post if Reel limit was exceeded */}
              {type === 'reel' && (submitError.includes('exceeds the Reel limit') || submitError.includes('Feed Post')) && (
                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setType('post');
                      setSubmitError(null);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs transition-colors"
                  >
                    Switch to Feed Post (Supports up to 60 min)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-between">
            {uploadProgress ? (
              <span className="text-xs text-gray-600 font-medium animate-pulse flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                <span>{uploadProgress}</span>
              </span>
            ) : <span />}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting || 
                  (type === 'carousel' && carouselItems.length < 2) ||
                  (type !== 'post' && type !== 'carousel' && !selectedFile) || 
                  (type === 'post' && !selectedFile && caption.trim().length === 0)
                }
                className="px-5 py-2.5 text-xs font-bold bg-[#1A1A1A] hover:bg-black text-white rounded-xl shadow-xs disabled:opacity-40 transition-all flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>
                  {isSubmitting 
                    ? (uploadProgress || 'Processing...') 
                    : type === 'carousel' 
                    ? `Share Carousel (${carouselItems.length})` 
                    : type === 'reel' 
                    ? 'Share Reel' 
                    : type === 'story' 
                    ? (storySplitPrompt ? `Split & Share Story` : 'Share Story')
                    : 'Share Post'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ============================================================== */}
      {/* MOBILE INTERFACE: Exact Layout from User Image */}
      {/* ============================================================== */}
      <div className="flex md:hidden fixed inset-0 z-50 bg-white flex-col h-full w-full overflow-hidden select-none">
        {/* Hidden Device Camera Input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSingleFile(file);
          }}
        />

        {mobileStep === 'picker' ? (
          <div className="flex flex-col h-full w-full relative">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-100">
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-zinc-900 hover:text-zinc-600 rounded-full cursor-pointer"
              >
                <X className="w-6 h-6 stroke-[2]" />
              </button>

              <div className="flex flex-col items-center">
                <h2 className="text-base font-extrabold text-zinc-900 tracking-tight">
                  {type === 'story' ? 'Add to Story' : type === 'reel' ? 'Create Reel' : 'Create Post'}
                </h2>
                <div className="flex items-center space-x-1 mt-0.5">
                  <span className={`text-[9px] font-black tracking-widest uppercase ${type === 'story' ? 'text-[#D91A46]' : 'text-[#4870FF]'}`}>
                    {type === 'story' ? '24H EXPIRATION • YOUR STORY' : type === 'reel' ? 'VERTICAL VIDEO • MAX 15M' : 'SHARE YOUR VIBE'}
                  </span>
                  <span className={`w-3 h-0.5 rounded-full inline-block ${type === 'story' ? 'bg-[#D91A46]' : 'bg-[#4870FF]'}`} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!selectedFile && !previewUrl) {
                    fileInputRef.current?.click();
                    return;
                  }
                  setMobileStep('details');
                }}
                className={`text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center space-x-1 shadow-xs transition-colors cursor-pointer ${
                  type === 'story' ? 'bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95' : 'bg-[#4870FF] hover:bg-[#3B62F0]'
                }`}
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Top 3 Quick Actions Row */}
            <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-zinc-100 bg-white">
              {/* 1. Gallery */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center cursor-pointer group"
              >
                <div className="w-13 h-13 rounded-2xl bg-sky-50 group-hover:bg-sky-100 text-[#0284C7] flex items-center justify-center transition-colors">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-700 mt-1">Gallery</span>
              </button>

              {/* 2. Camera */}
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="flex flex-col items-center cursor-pointer group"
              >
                <div className="w-13 h-13 rounded-2xl bg-cyan-50 group-hover:bg-cyan-100 text-[#00ACC1] flex items-center justify-center transition-colors">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-700 mt-1">Camera</span>
              </button>

              {/* 3. Music */}
              <button
                type="button"
                onClick={() => setIsMusicModalOpen(true)}
                className="flex flex-col items-center cursor-pointer group"
              >
                <div className="w-13 h-13 rounded-2xl bg-pink-50 group-hover:bg-pink-100 text-[#DB2777] flex items-center justify-center transition-colors relative">
                  <Music className="w-6 h-6" />
                  {selectedAudioId && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-pink-500" />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-zinc-700 mt-1">Music</span>
              </button>
            </div>

            {/* Gallery Section Header */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-100 bg-white">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 font-bold text-zinc-900 text-sm cursor-pointer hover:text-black transition-colors"
              >
                <span>Your Gallery</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  ({savedGallery.length} {savedGallery.length === 1 ? 'item' : 'items'})
                </span>
                <ChevronDown className="w-4 h-4 text-zinc-600" />
              </div>
              <div className="flex items-center space-x-2">
                {savedGallery.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await clearAllGalleryItems();
                      setSavedGallery([]);
                      clearSelectedFile();
                      setSelectedMediaId(null);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-red-500 font-semibold px-2 py-1 rounded-md transition-colors cursor-pointer"
                    title="Clear gallery items"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#4870FF] font-bold hover:underline flex items-center space-x-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add from Device</span>
                </button>
              </div>
            </div>

            {/* 3-Column Media Grid (User Gallery Only) */}
            <div className="flex-1 overflow-y-auto pb-24">
              {savedGallery.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center py-20 px-6 text-center cursor-pointer hover:bg-zinc-50 transition-colors"
                >
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#4870FF] flex items-center justify-center mb-3 shadow-xs">
                    <ImageIcon className="w-8 h-8 stroke-[1.8]" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900">Your Gallery is Empty</h4>
                  <p className="text-xs text-zinc-500 max-w-xs mt-1.5 leading-relaxed">
                    Tap below to choose photos or videos from your device to start posting.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="mt-4 px-5 py-2.5 bg-[#4870FF] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>Open Phone Gallery</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5 bg-zinc-100">
                  {/* Render Actual User Saved Gallery Items from Device Only */}
                  {savedGallery.map((item) => {
                    const isSelected = selectedMediaId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedMediaId(item.id);
                          handleSingleFile(item.file);
                        }}
                        className="relative aspect-square bg-zinc-200 cursor-pointer overflow-hidden group"
                      >
                        <img
                          src={item.thumbnailUrl || item.url}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          onError={(e) => {
                            // Immediately hide and remove broken or corrupted images
                            (e.currentTarget as HTMLElement).style.display = 'none';
                            removeGalleryItem(item.id);
                            setSavedGallery(prev => prev.filter(g => g.id !== item.id));
                          }}
                        />

                        {/* Top-Left Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeGalleryItem(item.id);
                            setSavedGallery(prev => prev.filter(g => g.id !== item.id));
                            if (selectedMediaId === item.id) {
                              clearSelectedFile();
                              setSelectedMediaId(null);
                            }
                          }}
                          title="Remove item"
                          className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer shadow-xs z-10"
                        >
                          <X className="w-3 h-3 stroke-[2.5]" />
                        </button>

                        {/* Top-Right Selection Check Circle */}
                        <div className="absolute top-1.5 right-1.5 z-10">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-[#4870FF] text-white ring-2 ring-white shadow-xs'
                                : 'bg-black/30 border border-white/80'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>

                        {/* Bottom-Right Duration for Video */}
                        {item.type === 'video' && item.durationFormatted && (
                          <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-sm flex items-center space-x-1">
                            <Film className="w-2.5 h-2.5" />
                            <span>{item.durationFormatted}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Direct 1-Tap Story Share Button when in Story mode with selected file */}
            {type === 'story' && (selectedFile || previewUrl) && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-full px-8 max-w-xs">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={(e) => {
                    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                    handleSubmit(fakeEvent);
                  }}
                  className="w-full py-3 px-5 bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95 active:scale-98 text-white text-xs font-bold rounded-full flex items-center justify-center space-x-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                      <span>{uploadProgress || 'Sharing Story...'}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>Share to Your Story</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Bottom Floating Pill Navigation */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
              <div className="bg-white/95 backdrop-blur-md px-1.5 py-1 rounded-full shadow-xl border border-zinc-200/80 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    setType('post');
                    setSubmitError(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    type === 'post'
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>POST</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('story');
                    setSubmitError(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    type === 'story'
                      ? 'bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>STORY</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('reel');
                    setSubmitError(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    type === 'reel'
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>REEL</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Post Details Screen on Mobile */
          <div className="flex flex-col h-full w-full">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-100">
              <button
                type="button"
                onClick={() => setMobileStep('picker')}
                className="p-1 text-zinc-900 hover:text-zinc-600 rounded-full cursor-pointer flex items-center space-x-1"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-xs font-semibold">Back</span>
              </button>

              <h3 className="text-sm font-bold text-zinc-900">
                {type === 'story' ? 'New Story' : type === 'reel' ? 'New Reel' : 'New Post'}
              </h3>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={(e) => {
                  const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                  handleSubmit(fakeEvent);
                }}
                className={`text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center space-x-1 shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                  type === 'story' ? 'bg-gradient-to-r from-[#FBAA47] via-[#D91A46] to-[#A60F93] hover:opacity-95' : 'bg-[#4870FF] hover:bg-[#3B62F0]'
                }`}
              >
                {isSubmitting && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                <span>
                  {isSubmitting
                    ? 'Sharing...'
                    : type === 'story'
                    ? 'Share Story'
                    : type === 'reel'
                    ? 'Share Reel'
                    : 'Share Post'}
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
              {/* Media Preview Thumbnail & Caption Input */}
              <div className="flex space-x-3">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <textarea
                    placeholder="Write a caption... #vibes"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={3}
                    className="w-full text-xs text-zinc-800 placeholder-zinc-400 border border-zinc-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#4870FF] resize-none"
                  />
                </div>
              </div>

              {/* Music Selection Section */}
              {(() => {
                const activeTrack = selectedTrack || tracks.find(t => t.id === selectedAudioId);
                if (activeTrack) {
                  return (
                    <div className="space-y-2">
                      <AudioScrubberBar
                        track={activeTrack}
                        config={audioConfig}
                        onChangeConfig={setAudioConfig}
                        onRemove={() => {
                          setSelectedAudioId('');
                          setSelectedTrack(null);
                        }}
                        onChangeTrack={() => setIsMusicModalOpen(true)}
                        hasVideoMedia={type === 'reel' || mediaType === 'video' || !!selectedFile?.type.startsWith('video/')}
                      />
                      <button
                        type="button"
                        onClick={() => setIsAudioEditorOpen(true)}
                        className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-pink-50 to-indigo-50 hover:from-pink-100 hover:to-indigo-100 border border-pink-200/60 flex items-center justify-center space-x-2 text-xs font-bold text-zinc-800 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Sliders className="w-3.5 h-3.5 text-pink-600" />
                        <span>Full Audio Editor & Volume Balance</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    onClick={() => setIsMusicModalOpen(true)}
                    className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between cursor-pointer hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center">
                        <Music className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-800">Add Music / Audio</p>
                        <p className="text-[10px] text-zinc-400">Choose from trending sounds or upload MP3</p>
                      </div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  </div>
                );
              })()}

              {/* Format selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-700">Posting Format</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('post')}
                    className={`p-2 rounded-xl border text-xs font-bold text-center transition-all ${
                      type === 'post'
                        ? 'border-[#4870FF] bg-blue-50/70 text-[#4870FF]'
                        : 'border-zinc-200 text-zinc-600'
                    }`}
                  >
                    Feed Post
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('story')}
                    className={`p-2 rounded-xl border text-xs font-bold text-center transition-all ${
                      type === 'story'
                        ? 'border-[#D91A46] bg-pink-50/70 text-[#D91A46]'
                        : 'border-zinc-200 text-zinc-600'
                    }`}
                  >
                    Story (24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('reel')}
                    className={`p-2 rounded-xl border text-xs font-bold text-center transition-all ${
                      type === 'reel'
                        ? 'border-[#4870FF] bg-blue-50/70 text-[#4870FF]'
                        : 'border-zinc-200 text-zinc-600'
                    }`}
                  >
                    Reel
                  </button>
                </div>
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Universal Music Picker */}
        <UniversalMusicPicker
          isOpen={isMusicModalOpen}
          onClose={() => setIsMusicModalOpen(false)}
          selectedAudioId={selectedAudioId}
          contentType={type === 'post' ? 'feed' : type}
          onSelectTrack={(track, initialConfig) => {
            setSelectedTrack(track);
            setSelectedAudioId(track.id);
            setTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
            setAudioConfig({
              audioId: track.id,
              audioStartTime: initialConfig?.audioStartTime ?? 0,
              audioEndTime: initialConfig?.audioEndTime ?? Math.min(30, track.duration || 30),
              audioVolume: initialConfig?.audioVolume ?? 0.8,
              originalAudioVolume: initialConfig?.originalAudioVolume ?? 1.0
            });
            setIsMusicModalOpen(false);
          }}
          onOpenEditor={(track) => {
            setSelectedTrack(track);
            setSelectedAudioId(track.id);
            setTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
            setAudioConfig({
              audioId: track.id,
              audioStartTime: 0,
              audioEndTime: Math.min(30, track.duration || 30),
              audioVolume: 0.8,
              originalAudioVolume: 1.0
            });
            setIsMusicModalOpen(false);
            setIsAudioEditorOpen(true);
          }}
          onTrackCreated={(track) => {
            setTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
            setSelectedTrack(track);
            setSelectedAudioId(track.id);
            setAudioConfig({
              audioId: track.id,
              audioStartTime: 0,
              audioEndTime: Math.min(30, track.duration || 30),
              audioVolume: 0.8,
              originalAudioVolume: 1.0
            });
            setIsMusicModalOpen(false);
            setIsAudioEditorOpen(true);
          }}
        />

        {/* Audio Editor Sheet (Segment Trimming & Synchronized Volume Mixing) */}
        {isAudioEditorOpen && (selectedTrack || tracks.find(t => t.id === selectedAudioId)) && (
          <AudioEditorSheet
            isOpen={isAudioEditorOpen}
            onClose={() => setIsAudioEditorOpen(false)}
            track={selectedTrack || tracks.find(t => t.id === selectedAudioId)!}
            config={audioConfig}
            onChangeConfig={setAudioConfig}
            onRemoveTrack={() => {
              setSelectedAudioId('');
              setSelectedTrack(null);
            }}
            onChangeTrack={() => {
              setIsAudioEditorOpen(false);
              setIsMusicModalOpen(true);
            }}
            mediaUrl={previewUrl || carouselItems[0]?.previewUrl || undefined}
            mediaType={type === 'carousel' ? 'carousel' : (mediaType === 'video' ? 'video' : 'image')}
            hasVideoMedia={type === 'reel' || mediaType === 'video' || carouselItems.some(i => i.mediaType === 'video')}
          />
        )}

        {/* Live Device Camera Modal (Direct Camera Viewfinder, Front/Back, Photo/Video) */}
        <LiveCameraModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handleCameraCapture}
          onFallbackToNative={() => {
            setIsCameraOpen(false);
            cameraInputRef.current?.click();
          }}
        />
      </div>
    </div>
  );
};
