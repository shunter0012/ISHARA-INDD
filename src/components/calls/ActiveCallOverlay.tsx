import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useCall } from '../../context/CallContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Volume2, 
  VolumeX, 
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  X,
  Activity,
  ChevronDown,
  ChevronUp,
  FlipHorizontal
} from 'lucide-react';

export const ActiveCallOverlay: React.FC = () => {
  const { user } = useAuth();
  const { 
    activeCall, 
    callStatus,
    localStream,
    remoteStream,
    isMuted,
    isVideoEnabled,
    isSpeakerMuted,
    peerMediaState,
    callDuration,
    permissionError,
    errorMessage,
    diagnostics,
    answerCall, 
    declineCall,
    endCall, 
    toggleMute, 
    toggleVideo, 
    toggleSpeaker,
    switchCamera,
    clearPermissionError,
    clearErrorMessage
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);

  // Attach local stream to local preview
  useEffect(() => {
    if (localVideoRef.current) {
      if (localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      } else {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [localStream, callStatus]);

  // Handle remote media playback and autoplay restrictions
  const startRemotePlayback = useCallback(async () => {
    if (!remoteStream) return;

    // 1. Audio playback (dedicated <audio> element handles all audio for voice and video calls)
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = isSpeakerMuted;
      try {
        await remoteAudioRef.current.play();
        setAutoplayBlocked(false);
      } catch (err: any) {
        console.warn('[WebRTC] Remote audio autoplay blocked:', err);
        setAutoplayBlocked(true);
      }
    }

    // 2. Video playback (video element stays muted so video plays instantly without browser restrictions)
    if (activeCall?.type === 'video' && remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.muted = true;
      try {
        await remoteVideoRef.current.play();
      } catch (err: any) {
        console.warn('[WebRTC] Remote video playback error:', err);
      }
    }
  }, [remoteStream, activeCall?.type, isSpeakerMuted]);

  useEffect(() => {
    startRemotePlayback();
  }, [startRemotePlayback]);

  // Handle manual unblocking of autoplay via user gesture
  const handleUnblockAudio = async () => {
    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = isSpeakerMuted;
        await remoteAudioRef.current.play();
      }
      if (remoteVideoRef.current) {
        await remoteVideoRef.current.play().catch(() => {});
      }
      setAutoplayBlocked(false);
    } catch (err) {
      console.error('[WebRTC] Failed to start playback on user gesture:', err);
    }
  };

  // Format call duration MM:SS or HH:MM:SS
  const formatDuration = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hours > 0) {
      return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const isIncoming = Boolean(user?.id && activeCall?.receiverId === user.id && (callStatus === 'ringing' || activeCall?.status === 'ringing'));
  const isOutgoing = Boolean(user?.id && activeCall?.callerId === user.id && (callStatus === 'calling' || callStatus === 'ringing' || activeCall?.status === 'calling'));
  const isConnecting = callStatus === 'connecting';
  const isConnected = callStatus === 'connected';
  const isReconnecting = callStatus === 'reconnecting';
  const isEnded = callStatus === 'ended' || callStatus === 'declined' || callStatus === 'missed' || callStatus === 'busy' || callStatus === 'failed' || callStatus === 'cancelled';

  const peer = activeCall
    ? (user?.id && activeCall.callerId === user.id ? activeCall.receiver : activeCall.caller)
    : undefined;

  // Render Permission Error Modal if browser denied access
  if (permissionError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl p-6 text-white shadow-2xl space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-base">{permissionError.title}</h3>
                <p className="text-xs text-zinc-400 capitalize">{permissionError.device} permission required</p>
              </div>
            </div>
            <button 
              onClick={clearPermissionError}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-800/60 p-3.5 rounded-xl border border-white/5">
            {permissionError.message}
          </p>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              onClick={clearPermissionError}
              className="px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Error Notification if initiated call was blocked (e.g. busy, private)
  if (!activeCall && errorMessage) {
    return (
      <div className="fixed top-6 right-6 z-50 max-w-sm bg-zinc-900 border border-red-500/30 text-white p-4 rounded-2xl shadow-xl flex items-start space-x-3 animate-in slide-in-from-top">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium">{errorMessage}</p>
        </div>
        <button 
          onClick={clearErrorMessage}
          className="text-zinc-400 hover:text-white p-1 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // If no active call, render nothing
  if (!activeCall) {
    return null;
  }

  return (
    <div id="active-call-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-lg animate-in fade-in">
      {/* Hidden audio element for remote audio streams across all call types */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        muted={isSpeakerMuted} 
      />

      <div className="relative w-full max-w-md h-[92vh] max-h-[740px] bg-zinc-950 text-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 flex flex-col justify-between">
        
        {/* Reconnecting Banner */}
        {isReconnecting && (
          <div className="absolute top-0 inset-x-0 z-30 bg-amber-500/90 text-black text-xs font-semibold py-1.5 px-4 text-center backdrop-blur-sm animate-pulse">
            Reconnecting to peer... Please check your network connection.
          </div>
        )}

        {/* Autoplay blocked banner / button per WebRTC guidelines */}
        {autoplayBlocked && isConnected && (
          <div className="absolute top-14 inset-x-4 z-40 animate-in slide-in-from-top">
            <button
              id="call-enable-audio-button"
              onClick={handleUnblockAudio}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-2xl shadow-2xl flex items-center justify-center space-x-2 border border-emerald-400/40 cursor-pointer transition transform active:scale-95"
            >
              <Volume2 className="w-5 h-5 animate-pulse" />
              <span>Tap to enable audio & video</span>
            </button>
          </div>
        )}

        {/* Video stream layers (when type is video) */}
        {activeCall.type === 'video' && (
          <div className="absolute inset-0 z-0 bg-zinc-900 overflow-hidden">
            {/* Always mounted remote video element - mirrored for natural video transmission */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              muted={true}
              onLoadedMetadata={() => {
                remoteVideoRef.current?.play().catch(() => {});
              }}
              onCanPlay={() => {
                remoteVideoRef.current?.play().catch(() => {});
              }}
              onPause={() => {
                if (isConnected && remoteStream && peerMediaState.isVideoEnabled) {
                  remoteVideoRef.current?.play().catch(() => {});
                }
              }}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isMirrored ? '-scale-x-100' : ''
              } ${
                (isConnected || callStatus === 'connecting') && remoteStream && peerMediaState.isVideoEnabled
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Peer profile and name state (shown when peer camera is off, muted, or connecting) */}
            {(!isConnected || !remoteStream || !peerMediaState.isVideoEnabled) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 space-y-4 p-6">
                <div className="relative">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-zinc-700/80 shadow-2xl ring-4 ring-white/10">
                    <img
                      src={peer?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${peer?.username || 'peer'}`}
                      alt={peer?.displayName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {peerMediaState.isMuted && (
                    <div className="absolute -bottom-1 -right-1 p-2 bg-zinc-900 border-2 border-zinc-700 rounded-full text-zinc-300 shadow-md">
                      <MicOff className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="text-center space-y-1">
                  <h4 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {peer?.displayName || peer?.username || 'User'}
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    @{peer?.username || 'user'}
                  </p>
                </div>
              </div>
            )}

            {/* Local Video Stream Picture-in-Picture (always mounted & mirrored) */}
            <div 
              className={`absolute top-16 right-4 z-20 w-28 h-40 sm:w-32 sm:h-48 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black transition-opacity duration-300 ${
                (isConnected || isConnecting || isOutgoing) && localStream && isVideoEnabled
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover ${isMirrored ? '-scale-x-100' : ''}`}
              />
              <div className="absolute bottom-1 left-2 text-[10px] text-white/70 font-medium">You</div>
            </div>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="relative z-10 p-4 sm:p-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-white/10 backdrop-blur-md border border-white/10 text-zinc-300">
              {activeCall.type === 'video' ? 'Video Call' : 'Voice Call'}
            </span>
            {isConnected && (
              <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{formatDuration(callDuration)}</span>
              </span>
            )}

            {/* Mirror Toggle for Video Call */}
            {activeCall.type === 'video' && (
              <button
                id="toggle-mirror-video-btn"
                onClick={() => setIsMirrored(prev => !prev)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium flex items-center space-x-1 transition cursor-pointer border ${
                  isMirrored 
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs' 
                    : 'bg-white/5 text-zinc-400 hover:text-white border-white/10'
                }`}
                title={isMirrored ? 'Mirrored Video Transmission: Active' : 'Normal Video Transmission'}
              >
                <FlipHorizontal className="w-3 h-3" />
                <span>{isMirrored ? 'Mirrored' : 'Normal'}</span>
              </button>
            )}

            {/* Diagnostics toggle button */}
            <button
              id="call-diagnostics-toggle"
              onClick={() => setShowDiagnostics(prev => !prev)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium flex items-center space-x-1 transition cursor-pointer border ${
                showDiagnostics 
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' 
                  : 'bg-white/5 text-zinc-400 hover:text-white border-white/10'
              }`}
              title="Toggle WebRTC Diagnostics"
            >
              <Activity className="w-3 h-3" />
              <span>Stats</span>
              {showDiagnostics ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          </div>

          {/* End Call header dismiss button */}
          <button 
            id="call-header-close-button"
            onClick={() => endCall('ended', 'Closed by user')}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer"
            title="End Call"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Diagnostics HUD (collapsible) */}
        {showDiagnostics && (
          <div className="relative z-20 mx-4 p-3 bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-xl text-left font-mono text-[11px] space-y-1.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-zinc-400 pb-1 border-b border-white/10">
              <span className="font-semibold text-white flex items-center space-x-1">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span>WebRTC Pipeline Status</span>
              </span>
              <span className="text-[10px] uppercase text-zinc-500">{diagnostics.signalingState}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-300">
              <div>
                <span className="text-zinc-500">Peer: </span>
                <span className={diagnostics.connectionState === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
                  {diagnostics.connectionState}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">ICE: </span>
                <span className={diagnostics.iceConnectionState === 'connected' || diagnostics.iceConnectionState === 'completed' ? 'text-emerald-400' : 'text-amber-400'}>
                  {diagnostics.iceConnectionState}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Local: </span>
                <span>Mic {diagnostics.localAudio ? '🟢' : '🔴'} Cam {diagnostics.localVideo ? '🟢' : '⚪'}</span>
              </div>
              <div>
                <span className="text-zinc-500">Remote: </span>
                <span>Audio {diagnostics.remoteAudio ? '🟢' : '🔴'} Video {diagnostics.remoteVideo ? '🟢' : '⚪'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Center Content (Avatar, caller details, and calling state) */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center space-y-5">
          {/* Avatar with dynamic states (shown for audio calls, and pre-connect video calls) */}
          {(activeCall.type === 'audio' || !isConnected) && (
            <div className="relative flex items-center justify-center">
              {/* Animated pulsating halo rings */}
              {(isOutgoing || isIncoming || isConnecting) && (
                <div className="absolute inset-0 -m-4 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
              )}
              {(isOutgoing || isIncoming) && (
                <div className="absolute inset-0 -m-8 rounded-full bg-emerald-500/10 animate-pulse" />
              )}

              <div className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 shadow-2xl transition-all ${
                isConnected 
                  ? 'border-emerald-500/80 ring-4 ring-emerald-500/20' 
                  : isReconnecting
                    ? 'border-amber-500'
                    : 'border-white/30'
              }`}>
                <img
                  src={peer?.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${peer?.username || 'ishara'}`}
                  alt={peer?.displayName}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Mute indicator on avatar without disruptive text banner */}
              {isConnected && peerMediaState.isMuted && (
                <div 
                  className="absolute bottom-0 right-1 p-1.5 bg-zinc-900 border-2 border-zinc-700 rounded-full text-zinc-400 shadow-md"
                  title="Microphone muted"
                >
                  <MicOff className="w-3.5 h-3.5" />
                </div>
              )}

              {/* Call Type Pill Badge */}
              <div className="absolute -bottom-2 right-1/2 translate-x-1/2 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-[10px] font-semibold text-zinc-300 shadow-md">
                {activeCall.type === 'video' ? 'Camera' : 'Voice'}
              </div>
            </div>
          )}

          {/* Peer Names and Status */}
          <div className="space-y-1 max-w-xs">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate drop-shadow-md">
              {peer?.displayName || peer?.username || 'User'}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 drop-shadow">
              @{peer?.username || 'user'}
            </p>

            {/* Status indicator line */}
            <div className="pt-2">
              {isIncoming ? (
                <p className="text-sm font-medium text-emerald-400 animate-pulse">
                  Incoming {activeCall.type === 'video' ? 'video' : 'voice'} call...
                </p>
              ) : isOutgoing ? (
                <p className="text-sm font-medium text-zinc-300">
                  {callStatus === 'ringing' ? 'Ringing...' : 'Calling...'}
                </p>
              ) : isConnecting ? (
                <p className="text-sm font-medium text-blue-400 animate-pulse">
                  Connecting media stream...
                </p>
              ) : isConnected ? (
                <div className="flex items-center justify-center space-x-2 text-xs text-zinc-400">
                  <span className="flex items-center space-x-1.5 text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Connected</span>
                  </span>
                </div>
              ) : isEnded ? (
                <p className="text-sm font-medium text-red-400">
                  {callStatus === 'declined' 
                    ? 'Call Declined' 
                    : callStatus === 'busy' 
                      ? 'User Busy' 
                      : callStatus === 'missed' 
                        ? 'No Answer' 
                        : 'Call Ended'}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Bottom Actions Control Bar */}
        <div className="relative z-10 p-6 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent">
          {/* 1. Incoming Call Screen: Accept & Decline buttons */}
          {isIncoming ? (
            <div className="flex items-center justify-around max-w-xs mx-auto pt-2">
              {/* Decline Button */}
              <button
                id="call-decline-button"
                onClick={declineCall}
                className="flex flex-col items-center space-y-2 group cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all">
                  <PhoneOff className="w-7 h-7" />
                </div>
                <span className="text-xs font-semibold text-zinc-400 group-hover:text-white transition">Decline</span>
              </button>

              {/* Accept Button */}
              <button
                id="call-accept-button"
                onClick={answerCall}
                className="flex flex-col items-center space-y-2 group cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all animate-bounce">
                  <Phone className="w-7 h-7" />
                </div>
                <span className="text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 transition">Accept</span>
              </button>
            </div>
          ) : isOutgoing || isConnecting ? (
            /* 2. Outgoing Dialing / Connecting: Cancel button */
            <div className="flex flex-col items-center justify-center space-y-3">
              <button
                id="call-cancel-button"
                onClick={() => endCall('cancelled', 'Cancelled by caller')}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title="Cancel Call"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs text-zinc-400 font-medium">Cancel Call</span>
            </div>
          ) : isConnected || isReconnecting ? (
            /* 3. Connected Call In-Progress Controls */
            <div className="flex items-center justify-center space-x-3 sm:space-x-4 bg-zinc-900/90 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl">
              {/* Microphone Mute Toggle */}
              <button
                id="call-mute-button"
                onClick={toggleMute}
                className={`p-3.5 rounded-xl transition-all cursor-pointer ${
                  isMuted 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Video Camera Toggle (for video calls) */}
              {activeCall.type === 'video' && (
                <button
                  id="call-camera-button"
                  onClick={toggleVideo}
                  className={`p-3.5 rounded-xl transition-all cursor-pointer ${
                    !isVideoEnabled 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                >
                  {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              )}

              {/* Switch Camera (Front/Back) if video call */}
              {activeCall.type === 'video' && (
                <button
                  id="call-switch-camera-button"
                  onClick={switchCamera}
                  className="p-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                  title="Switch Camera"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}

              {/* Speaker Output Toggle */}
              <button
                id="call-speaker-button"
                onClick={toggleSpeaker}
                className={`p-3.5 rounded-xl transition-all cursor-pointer ${
                  isSpeakerMuted 
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
              >
                {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* End Call Button */}
              <button
                id="call-end-button"
                onClick={() => endCall('ended', 'Ended by user')}
                className="p-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title="End Call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          ) : (
            /* 4. Ended State Notice */
            <div className="text-center py-2 text-xs text-zinc-500">
              Call terminated. Cleaning up session...
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
