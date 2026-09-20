import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoice: (audioUrl: string, duration: number) => Promise<void>;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSendVoice, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setError('Could not access microphone. Please check permissions.');
      setIsRecording(false);
    }
  };

  useEffect(() => {
    startRecording();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleStopAndSend = async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    setIsUploading(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const finalDuration = recordingTime;

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
        });

        // Release mic
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        const formData = new FormData();
        const extension = mediaRecorderRef.current?.mimeType.includes('mp4') ? 'mp4' : 'webm';
        formData.append('file', audioBlob, `voice-message-${Date.now()}.${extension}`);

        const token = localStorage.getItem('ishara_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers,
          body: formData
        });

        if (!uploadRes.ok) throw new Error('Failed to upload audio recording');
        const data = await uploadRes.json();

        await onSendVoice(data.url, finalDuration);
      } catch (err: any) {
        setError(err.message || 'Failed to send voice recording');
        setIsUploading(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onCancel();
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  if (error) {
    return (
      <div className="flex items-center justify-between p-2.5 bg-red-50 border border-red-200 rounded-2xl w-full">
        <span className="text-xs text-red-600 font-medium">{error}</span>
        <button
          onClick={handleCancel}
          className="text-xs font-bold text-red-700 hover:text-red-900 ml-3 px-2 py-1 bg-red-100 rounded-lg"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full bg-zinc-900 text-white px-4 py-2 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center space-x-3">
        {/* Pulsing indicator */}
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <span className="text-xs font-bold tracking-wider uppercase text-zinc-400">Recording</span>
        </div>

        <span className="font-mono text-xs font-bold text-white">
          {formatTime(recordingTime)}
        </span>
      </div>

      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isUploading}
          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
          title="Cancel recording"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleStopAndSend}
          disabled={isUploading || recordingTime < 1}
          className="px-3 py-1.5 bg-white text-zinc-900 hover:bg-zinc-100 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-all disabled:opacity-40 active:scale-95"
          title="Send voice note"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
