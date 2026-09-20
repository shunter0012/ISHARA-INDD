import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, RefreshCw, Circle, Square, Camera, Video, AlertCircle } from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallbackToNative?: () => void;
}

export const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  onFallbackToNative
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);

  // Stop camera streams
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    stopStream();
    setPermissionError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasPermission(false);
      setPermissionError('Camera API is not supported in this browser. Please use native camera.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: mode === 'video'
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasPermission(true);
    } catch (err: any) {
      console.warn('[LiveCamera] Camera access error:', err);
      setHasPermission(false);
      setPermissionError(err.message || 'Camera permission denied or camera unavailable.');
    }
  }, [facingMode, mode, stopStream]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  // Recording timer
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordDuration(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // Capture still photo
  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if front camera for natural mirroring
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopStream();
      onCapture(file);
      onClose();
    }, 'image/jpeg', 0.95);
  };

  // Toggle video recording
  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      if (!streamRef.current) return;
      recordedChunksRef.current = [];

      try {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : 'video/webm';

        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const file = new File([blob], `video_${Date.now()}.${ext}`, { type: mimeType });
          stopStream();
          onCapture(file);
          onClose();
        };

        recorder.start(1000); // 1-second chunks
        setIsRecording(true);
      } catch (err: any) {
        console.error('[LiveCamera] Failed to start video recording:', err);
      }
    }
  };

  const handleShutter = () => {
    if (mode === 'photo') {
      takePhoto();
    } else {
      toggleRecording();
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden animate-fadeIn">
      {/* Flash effect overlay */}
      {flashEffect && <div className="absolute inset-0 bg-white z-50 transition-opacity duration-200" />}

      {/* Top Controls Bar */}
      <div className="relative z-20 px-4 pt-4 pb-2 flex items-center justify-between text-white bg-gradient-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={() => {
            stopStream();
            onClose();
          }}
          className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          title="Close Camera"
        >
          <X className="w-6 h-6" />
        </button>

        {isRecording && (
          <div className="flex items-center space-x-2 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white" />
            <span>REC {formatTimer(recordDuration)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          title="Switch Camera"
        >
          <RefreshCw className="w-6 h-6" />
        </button>
      </div>

      {/* Viewfinder Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-zinc-950">
        {hasPermission === false ? (
          <div className="p-6 text-center max-w-sm mx-auto text-white space-y-4">
            <div className="w-16 h-16 rounded-full bg-zinc-800 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold">Camera Access</h3>
            <p className="text-xs text-zinc-400">
              {permissionError || 'Could not connect to live camera stream. You can open your device native camera directly.'}
            </p>
            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
                onFallbackToNative?.();
              }}
              className="w-full py-3 bg-[#4870FF] hover:bg-[#3B62F0] text-white font-bold text-sm rounded-xl transition-colors shadow-md"
            >
              Open Device Camera
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        )}
      </div>

      {/* Bottom Actions & Mode Selector */}
      <div className="relative z-20 pb-8 pt-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center space-y-4">
        {/* Mode Selector (Photo vs Video) */}
        {!isRecording && (
          <div className="flex items-center space-x-6 text-xs font-bold tracking-wider uppercase">
            <button
              type="button"
              onClick={() => setMode('photo')}
              className={`pb-1 transition-colors flex items-center space-x-1.5 ${
                mode === 'photo' ? 'text-white border-b-2 border-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('video')}
              className={`pb-1 transition-colors flex items-center space-x-1.5 ${
                mode === 'video' ? 'text-white border-b-2 border-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video</span>
            </button>
          </div>
        )}

        {/* Shutter Button */}
        <div className="flex items-center justify-center w-full px-6">
          <button
            type="button"
            onClick={handleShutter}
            disabled={hasPermission === false}
            className={`w-20 h-20 rounded-full border-4 p-1.5 flex items-center justify-center transition-all transform active:scale-95 disabled:opacity-40 cursor-pointer ${
              mode === 'video'
                ? isRecording
                  ? 'border-red-500 bg-red-500/20'
                  : 'border-white bg-transparent'
                : 'border-white bg-transparent hover:border-zinc-300'
            }`}
          >
            {mode === 'video' ? (
              isRecording ? (
                <div className="w-7 h-7 bg-red-600 rounded-md" />
              ) : (
                <div className="w-14 h-14 bg-red-600 rounded-full" />
              )
            ) : (
              <div className="w-14 h-14 bg-white rounded-full transition-transform active:scale-90" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
