import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Call, CallType, CallStatus, CallSignalPayload } from '../types/index';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';
import { useRealtime } from './RealtimeContext';
import { callSounds } from '../utils/callSounds';

export interface PermissionErrorInfo {
  device: 'microphone' | 'camera';
  title: string;
  message: string;
}

export interface PeerMediaState {
  isMuted: boolean;
  isVideoEnabled: boolean;
}

export interface WebRTCDiagnostics {
  connectionState: string;
  iceConnectionState: string;
  iceGatheringState: string;
  signalingState: string;
  localAudio: boolean;
  localVideo: boolean;
  remoteAudio: boolean;
  remoteVideo: boolean;
  iceCandidateCount: number;
}

interface CallContextType {
  activeCall: Call | null;
  callStatus: CallStatus | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerMuted: boolean;
  facingMode: 'user' | 'environment';
  peerMediaState: PeerMediaState;
  callDuration: number;
  permissionError: PermissionErrorInfo | null;
  errorMessage: string | null;
  diagnostics: WebRTCDiagnostics;
  startCall: (receiverId: string, type: CallType) => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: (status?: CallStatus, reason?: string) => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  switchCamera: () => Promise<void>;
  clearPermissionError: () => void;
  clearErrorMessage: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' }
  ]
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const { subscribe } = useRealtime();

  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [peerMediaState, setPeerMediaState] = useState<PeerMediaState>({ isMuted: false, isVideoEnabled: true });
  const [callDuration, setCallDuration] = useState(0);
  const [permissionError, setPermissionError] = useState<PermissionErrorInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Diagnostic state for live inspection
  const [diagnostics, setDiagnostics] = useState<WebRTCDiagnostics>({
    connectionState: 'new',
    iceConnectionState: 'new',
    iceGatheringState: 'new',
    signalingState: 'stable',
    localAudio: false,
    localVideo: false,
    remoteAudio: false,
    remoteVideo: false,
    iceCandidateCount: 0
  });

  // References for WebRTC session management
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const appliedCandidatesRef = useRef<Set<string>>(new Set());
  const localCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteOfferRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const hasCreatedOfferRef = useRef<boolean>(false);
  const hasCreatedAnswerRef = useRef<boolean>(false);
  const durationTimerRef = useRef<any>(null);
  const iceServersRef = useRef<RTCConfiguration>(DEFAULT_ICE_SERVERS);

  // Keep activeCallRef in sync
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Fetch production ICE servers (STUN + TURN fallback from backend)
  useEffect(() => {
    if (!token) return;
    apiRequest<{ iceServers: RTCIceServer[] }>('/calls/ice-servers')
      .then(res => {
        if (res?.iceServers && Array.isArray(res.iceServers) && res.iceServers.length > 0) {
          iceServersRef.current = {
            iceServers: res.iceServers
          };
        }
      })
      .catch(() => {
        // Fallback remains DEFAULT_ICE_SERVERS
      });
  }, [token]);

  // Update live diagnostic stats
  const updateDiagnostics = useCallback((partial?: Partial<WebRTCDiagnostics>) => {
    setDiagnostics(prev => {
      const pc = pcRef.current;
      const ls = localStreamRef.current;
      const rs = remoteStreamRef.current;

      const localAudio = ls ? ls.getAudioTracks().some(t => t.readyState === 'live' && t.enabled) : false;
      const localVideo = ls ? ls.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) : false;
      const remoteAudio = rs ? rs.getAudioTracks().some(t => t.readyState === 'live') : false;
      const remoteVideo = rs ? rs.getVideoTracks().some(t => t.readyState === 'live') : false;

      return {
        ...prev,
        connectionState: pc?.connectionState || prev.connectionState,
        iceConnectionState: pc?.iceConnectionState || prev.iceConnectionState,
        iceGatheringState: pc?.iceGatheringState || prev.iceGatheringState,
        signalingState: pc?.signalingState || prev.signalingState,
        localAudio,
        localVideo,
        remoteAudio,
        remoteVideo,
        iceCandidateCount: appliedCandidatesRef.current.size,
        ...partial
      };
    });
  }, []);

  // Helper to attach all tracks (audio & video) from a MediaStream to an RTCPeerConnection before SDP creation
  const attachTracksToPeer = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    const senders = pc.getSenders();
    stream.getTracks().forEach(track => {
      try {
        const existingSender = senders.find(s => s.track === track || (s.track && s.track.kind === track.kind));
        if (!existingSender) {
          console.log(`[WebRTC] pc.addTrack added ${track.kind} track (${track.id})`);
          pc.addTrack(track, stream);
        } else if (existingSender.track !== track) {
          console.log(`[WebRTC] existingSender.replaceTrack with ${track.kind} track (${track.id})`);
          existingSender.replaceTrack(track).catch(err => {
            console.warn(`[WebRTC] replaceTrack error for ${track.kind}:`, err);
          });
        }
      } catch (err) {
        console.warn(`[WebRTC] Error attaching ${track.kind} track to peer:`, err);
      }
    });
  }, []);

  // Stop media tracks and cleanup session
  const cleanupMediaAndPeer = useCallback(() => {
    callSounds.stopAll();

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    // Stop and release all local tracks (camera and microphone hardware indicators turn off)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Stop remote stream tracks
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      remoteStreamRef.current = null;
    }
    setRemoteStream(null);

    // Close and remove peer connection listeners
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach(sender => {
          if (sender.track) {
            try { sender.track.stop(); } catch {}
          }
        });
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onicegatheringstatechange = null;
        pcRef.current.onsignalingstatechange = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    pendingCandidatesRef.current = [];
    appliedCandidatesRef.current.clear();
    localCandidatesQueueRef.current = [];
    remoteOfferRef.current = null;
    hasCreatedOfferRef.current = false;
    hasCreatedAnswerRef.current = false;
    setIsMuted(false);
    setIsVideoEnabled(true);
    setIsSpeakerMuted(false);
    setPeerMediaState({ isMuted: false, isVideoEnabled: true });
    updateDiagnostics({
      connectionState: 'closed',
      iceConnectionState: 'closed',
      signalingState: 'closed',
      localAudio: false,
      localVideo: false,
      remoteAudio: false,
      remoteVideo: false
    });
  }, [updateDiagnostics]);

  // Send signaling message (uses WebSocket if open, otherwise authenticated REST API)
  const sendSignal = useCallback(async (signal: CallSignalPayload) => {
    const call = activeCallRef.current;
    if (!call || !call.id || call.id.startsWith('temp-')) {
      if (signal.type === 'ice-candidate' && signal.candidate) {
        localCandidatesQueueRef.current.push(signal.candidate);
      }
      return;
    }

    console.log(`[WebRTC Signal TX] ${signal.type} for call ${call.id}`);

    // WebSocket attempt
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          callId: call.id,
          signal
        }));
        return;
      } catch {}
    }

    // REST signaling fallback
    try {
      await apiRequest(`/calls/${call.id}/signal`, {
        method: 'POST',
        body: JSON.stringify({ signal })
      });
    } catch {}
  }, []);

  // Flush any locally gathered candidates once a persistent call ID is established
  const flushLocalCandidates = useCallback(() => {
    const call = activeCallRef.current;
    if (!call || !call.id || call.id.startsWith('temp-')) return;
    while (localCandidatesQueueRef.current.length > 0) {
      const cand = localCandidatesQueueRef.current.shift();
      if (cand) {
        sendSignal({
          type: 'ice-candidate',
          candidate: cand
        });
      }
    }
  }, [sendSignal]);

  // Send peer media state update (mute/unmute, camera on/off)
  const sendMediaState = useCallback(async (state: { isMuted?: boolean; isVideoEnabled?: boolean }) => {
    const call = activeCallRef.current;
    if (!call) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'media-state',
          callId: call.id,
          mediaState: state
        }));
        return;
      } catch {}
    }

    try {
      await apiRequest(`/calls/${call.id}/media-state`, {
        method: 'POST',
        body: JSON.stringify({ mediaState: state })
      });
    } catch {}
  }, []);

  // Safe candidate processor
  const addCandidateSafely = useCallback(async (pc: RTCPeerConnection, candidate: any) => {
    if (!candidate || !candidate.candidate) return;
    const key = `${candidate.candidate}|${candidate.sdpMid}|${candidate.sdpMLineIndex}`;
    if (appliedCandidatesRef.current.has(key)) return;
    appliedCandidatesRef.current.add(key);

    if (pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        updateDiagnostics();
      } catch (err) {
        console.warn('[WebRTC] addIceCandidate error:', err);
      }
    } else {
      pendingCandidatesRef.current.push(candidate);
    }
  }, [updateDiagnostics]);

  // Drain pending candidates after remote description is set
  const drainPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription || !pc.remoteDescription.type) return;

    const candidates = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];

    for (const cand of candidates) {
      if (cand && cand.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('[WebRTC] Error draining early candidate:', err);
        }
      }
    }
    updateDiagnostics();
  }, [updateDiagnostics]);

  // Request user media (microphone/camera) with robust error reporting & fallbacks
  const acquireMedia = useCallback(async (type: CallType, mode: 'user' | 'environment' = 'user'): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support WebRTC media acquisition.');
      }

      let stream: MediaStream | null = null;

      // Try preferred high-quality constraints
      try {
        const preferredConstraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: type === 'video' ? {
            facingMode: mode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } : false
        };
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (constraintErr: any) {
        // If overconstrained or failed, fallback to standard basic constraints
        console.warn('[WebRTC] Preferred constraints failed, falling back to basic media constraints:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video' ? true : false
        });
      }

      // Verify that audio track is present
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('No functional microphone audio track was received.');
      }
      audioTracks.forEach(track => {
        track.enabled = !isMuted;
      });

      // If video call, verify video track is present
      if (type === 'video') {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
          stream.getTracks().forEach(t => t.stop());
          throw new Error('No functional camera video track was received.');
        }
        videoTracks.forEach(track => {
          track.enabled = isVideoEnabled;
        });
      }

      setLocalStream(stream);
      localStreamRef.current = stream;
      setPermissionError(null);
      updateDiagnostics();
      return stream;
    } catch (err: any) {
      console.error('[WebRTC] getUserMedia failed:', err);
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const isDeviceNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError';
      const isDeviceBusy = err.name === 'NotReadableError' || err.name === 'TrackStartError';

      const errorInfo: PermissionErrorInfo = {
        device: type === 'video' ? 'camera' : 'microphone',
        title: isPermissionDenied 
          ? `${type === 'video' ? 'Camera & Microphone' : 'Microphone'} Permission Required` 
          : isDeviceNotFound
            ? `No ${type === 'video' ? 'Camera' : 'Microphone'} Detected`
            : isDeviceBusy
              ? 'Device Already In Use'
              : 'Media Device Access Error',
        message: isPermissionDenied
          ? `ISHARA requires access to your ${type === 'video' ? 'camera and microphone' : 'microphone'} to transmit media. Please click "Allow" in your browser's address bar and try again.`
          : isDeviceNotFound
            ? `We could not detect an active ${type === 'video' ? 'camera' : 'microphone'} on this device. Please connect a device and try again.`
            : isDeviceBusy
              ? 'Your camera or microphone is already open in another application or browser tab. Please close other calls and try again.'
              : (err.message || 'An unexpected error occurred while accessing media devices.')
      };

      setPermissionError(errorInfo);
      return null;
    }
  }, [isMuted, isVideoEnabled, updateDiagnostics]);

  // Create or obtain WebRTC Peer Connection with robust ontrack handling
  const getOrCreatePeerConnection = useCallback((call: Call) => {
    if (pcRef.current) return pcRef.current;

    console.log('[WebRTC] Initializing RTCPeerConnection with config:', iceServersRef.current);
    const pc = new RTCPeerConnection(iceServersRef.current);
    pcRef.current = pc;

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate) {
        const candidateInit = event.candidate.toJSON();
        const activeCall = activeCallRef.current;
        if (activeCall && activeCall.id && !activeCall.id.startsWith('temp-')) {
          sendSignal({
            type: 'ice-candidate',
            candidate: candidateInit
          });
        } else {
          localCandidatesQueueRef.current.push(candidateInit);
        }
      }
    };

    // CRITICAL: Remote track handling
    pc.ontrack = (event) => {
      console.log('[WebRTC ontrack] Received incoming track:', event.track.kind, event.track.id, 'enabled:', event.track.enabled);

      // Listen for track status changes
      event.track.onmute = () => {
        console.log('[WebRTC] Remote track muted:', event.track.kind);
        updateDiagnostics();
      };
      event.track.onunmute = () => {
        console.log('[WebRTC] Remote track unmuted:', event.track.kind);
        if (remoteStreamRef.current) {
          const fresh = new MediaStream(remoteStreamRef.current.getTracks());
          setRemoteStream(fresh);
        }
        updateDiagnostics();
      };
      event.track.onended = () => {
        console.log('[WebRTC] Remote track ended:', event.track.kind);
        updateDiagnostics();
      };

      // Accumulate into our stable remote MediaStream
      let remoteMs = remoteStreamRef.current;
      if (!remoteMs) {
        remoteMs = new MediaStream();
        remoteStreamRef.current = remoteMs;
      }

      // Replace or add track of the same kind
      const existing = remoteMs.getTracks().find(t => t.id === event.track.id);
      if (!existing) {
        const oldSameKind = remoteMs.getTracks().find(t => t.kind === event.track.kind);
        if (oldSameKind) {
          try { remoteMs.removeTrack(oldSameKind); } catch {}
        }
        remoteMs.addTrack(event.track);
      }

      // Also ingest any other tracks from streams[0] if the browser delivered a multi-track stream
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(stTrack => {
          if (!remoteMs!.getTracks().some(t => t.id === stTrack.id)) {
            const oldSameKind = remoteMs!.getTracks().find(t => t.kind === stTrack.kind);
            if (oldSameKind) {
              try { remoteMs!.removeTrack(oldSameKind); } catch {}
            }
            remoteMs!.addTrack(stTrack);
          }
        });
      }

      // CRITICAL FOR REACT: Produce a fresh MediaStream instance with all current tracks
      // so that React detects state reference change and triggers useEffect on <video> / <audio>
      const updatedStream = new MediaStream(remoteMs.getTracks());
      setRemoteStream(updatedStream);
      updateDiagnostics();

      // If we are currently in connecting/calling/ringing, track arrival confirms live media!
      if (activeCallRef.current && (activeCallRef.current.status === 'connecting' || activeCallRef.current.status === 'calling' || activeCallRef.current.status === 'ringing')) {
        callSounds.stopAll();
        setCallStatus('connected');
        setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] Connection State changed to:', state);
      updateDiagnostics();

      const currentCallId = activeCallRef.current?.id || call.id;

      if (state === 'connected') {
        callSounds.stopAll();
        callSounds.playConnectedChime();
        setCallStatus('connected');
        setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);

        // Inform backend
        if (currentCallId && !currentCallId.startsWith('temp-')) {
          apiRequest(`/calls/${currentCallId}/connected`, { method: 'POST' }).catch(() => {});
        }
      } else if (state === 'disconnected') {
        setCallStatus('reconnecting');
        setActiveCall(prev => prev ? { ...prev, status: 'reconnecting' } : null);
        if (currentCallId && !currentCallId.startsWith('temp-')) {
          apiRequest(`/calls/${currentCallId}/reconnecting`, { method: 'POST' }).catch(() => {});
        }
      } else if (state === 'failed') {
        console.warn('[WebRTC] Connection failed, attempting ICE restart...');
        if (pc.restartIce) {
          try {
            pc.restartIce();
          } catch {}
        } else {
          setErrorMessage('Call connection lost. Please verify network.');
        }
      }
    };

    // ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE Connection State changed to:', pc.iceConnectionState);
      updateDiagnostics();

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        callSounds.stopAll();
        setCallStatus('connected');
        setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);
      } else if (pc.iceConnectionState === 'disconnected') {
        setCallStatus('reconnecting');
      } else if (pc.iceConnectionState === 'failed') {
        if (pc.restartIce) {
          try { pc.restartIce(); } catch {}
        }
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE Gathering State:', pc.iceGatheringState);
      updateDiagnostics();
    };

    pc.onsignalingstatechange = () => {
      console.log('[WebRTC] Signaling State:', pc.signalingState);
      updateDiagnostics();
    };

    // Attach existing local tracks to peer connection if available
    if (localStreamRef.current) {
      attachTracksToPeer(pc, localStreamRef.current);
    }

    return pc;
  }, [sendSignal, updateDiagnostics, attachTracksToPeer]);

  // Handle incoming Offer (Receiver side)
  const handleOffer = useCallback(async (pc: RTCPeerConnection, offerSdp: any) => {
    if (hasCreatedAnswerRef.current) return;

    // CRITICAL: Ensure local tracks are available before creating answer SDP
    if (!localStreamRef.current) {
      console.log('[WebRTC] Deferring handleOffer: local media tracks not ready yet');
      remoteOfferRef.current = offerSdp;
      return;
    }

    try {
      console.log('[WebRTC] Processing remote offer SDP...');
      
      // Ensure local tracks are attached before creating answer
      attachTracksToPeer(pc, localStreamRef.current);

      if (pc.remoteDescription && pc.remoteDescription.type === 'offer') {
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      await drainPendingCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      hasCreatedAnswerRef.current = true;
      updateDiagnostics();

      console.log('[WebRTC] Created and sending answer SDP');
      await sendSignal({
        type: 'answer',
        sdp: answer
      });

      flushLocalCandidates();
    } catch (err) {
      console.error('[WebRTC] Failed to process offer:', err);
    }
  }, [attachTracksToPeer, drainPendingCandidates, sendSignal, updateDiagnostics, flushLocalCandidates]);

  // Handle incoming Answer (Caller side)
  const handleAnswer = useCallback(async (pc: RTCPeerConnection, answerSdp: any) => {
    try {
      console.log('[WebRTC] Processing remote answer SDP in state:', pc.signalingState);
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
        await drainPendingCandidates(pc);
        updateDiagnostics();
        flushLocalCandidates();
      }
    } catch (err) {
      console.error('[WebRTC] Failed to process answer:', err);
    }
  }, [drainPendingCandidates, updateDiagnostics, flushLocalCandidates]);

  // Handle incoming signaling messages
  const handleRemoteSignal = useCallback(async (signal: CallSignalPayload) => {
    const call = activeCallRef.current;
    if (!call) return;

    console.log(`[WebRTC Signal RX] Received ${signal.type} for call ${call.id}`);

    if (signal.type === 'offer' && signal.sdp) {
      remoteOfferRef.current = signal.sdp;
      // Only process offer automatically if receiver has answered and local tracks are ready
      if (call.receiverId === user?.id && localStreamRef.current && (callStatus === 'connecting' || callStatus === 'connected')) {
        const pc = getOrCreatePeerConnection(call);
        await handleOffer(pc, signal.sdp);
      }
    } else if (signal.type === 'answer' && signal.sdp) {
      const pc = getOrCreatePeerConnection(call);
      await handleAnswer(pc, signal.sdp);
    } else if (signal.type === 'ice-candidate' && signal.candidate) {
      const pc = pcRef.current;
      if (pc) {
        await addCandidateSafely(pc, signal.candidate);
      } else {
        pendingCandidatesRef.current.push(signal.candidate);
      }
    }
  }, [user?.id, callStatus, getOrCreatePeerConnection, handleOffer, handleAnswer, addCandidateSafely]);

  // Start outgoing call
  const startCall = async (receiverId: string, type: CallType) => {
    if (!user) {
      setErrorMessage('You must be logged in to make a call.');
      return;
    }

    cleanupMediaAndPeer();
    setErrorMessage(null);
    setPermissionError(null);
    setCallDuration(0);

    // 1. Acquire media FIRST
    const stream = await acquireMedia(type, 'user');
    if (!stream) {
      // Permission error is shown in UI
      return;
    }

    try {
      // 2. Initiate call on backend FIRST to get a persistent server call ID
      const res = await apiRequest<{ call: Call }>('/calls/initiate', {
        method: 'POST',
        body: JSON.stringify({
          receiverId,
          type
        })
      });

      const call = res.call;
      activeCallRef.current = call;
      setActiveCall(call);
      setCallStatus('calling');
      callSounds.startOutgoingRingtone();

      // 3. Create WebRTC PeerConnection with the real call ID
      const pc = getOrCreatePeerConnection(call);

      // 4. CRITICAL: Add all local audio & video tracks BEFORE creating offer
      attachTracksToPeer(pc, stream);

      // 5. Create SDP offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await pc.setLocalDescription(offer);
      hasCreatedOfferRef.current = true;
      updateDiagnostics();

      // 6. Send the offer to the server and peer
      await sendSignal({
        type: 'offer',
        sdp: offer
      });

      // 7. Flush any local ICE candidates gathered during offer creation
      flushLocalCandidates();
    } catch (err: any) {
      cleanupMediaAndPeer();
      const message = err?.message || 'Unable to start call.';
      setErrorMessage(message);
      if (message.includes('busy')) {
        callSounds.playBusyTone();
      }
    }
  };

  // Answer incoming call
  const answerCall = async () => {
    const call = activeCallRef.current;
    if (!call || !user) return;

    callSounds.stopAll();
    setCallStatus('connecting');

    // 1. Acquire receiver's media
    const stream = await acquireMedia(call.type, facingMode);
    if (!stream) {
      endCall('declined', 'Media permission was not granted');
      return;
    }

    try {
      // 2. Create WebRTC PeerConnection
      const pc = getOrCreatePeerConnection(call);

      // 3. CRITICAL: Add all local audio & video tracks to peer connection BEFORE creating answer
      attachTracksToPeer(pc, stream);

      // 4. Notify server that receiver answered
      const res = await apiRequest<{ call: Call }>(`/calls/${call.id}/answer`, {
        method: 'POST'
      });

      activeCallRef.current = res.call;
      setActiveCall(res.call);

      // 5. Retrieve offer from ref or server signals
      let offerSdp = remoteOfferRef.current;
      const signalsRes = await apiRequest<any>(`/calls/${call.id}/signals`).catch(() => null);
      if (!offerSdp && signalsRes?.offer) {
        offerSdp = signalsRes.offer;
      }

      if (signalsRes?.callerCandidates?.length) {
        for (const cand of signalsRes.callerCandidates) {
          await addCandidateSafely(pc, cand);
        }
      }

      if (offerSdp) {
        await handleOffer(pc, offerSdp);
      }

      flushLocalCandidates();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to answer call.');
      endCall('ended', 'Failed to answer');
    }
  };

  // Decline incoming call
  const declineCall = async () => {
    const call = activeCallRef.current;
    if (!call) return;
    await endCall('declined', 'Declined by recipient');
  };

  // End active call
  const endCall = async (status: CallStatus = 'ended', reason?: string) => {
    const call = activeCallRef.current;
    callSounds.stopAll();
    callSounds.playEndTone();

    if (call) {
      try {
        await apiRequest<{ call: Call }>(`/calls/${call.id}/end`, {
          method: 'POST',
          body: JSON.stringify({ status, reason })
        });
      } catch {
        if (navigator.sendBeacon) {
          try {
            navigator.sendBeacon(
              `/api/calls/${call.id}/end`,
              new Blob([JSON.stringify({ status, reason })], { type: 'application/json' })
            );
          } catch {}
        }
      }
    }

    setCallStatus(status);
    cleanupMediaAndPeer();

    setTimeout(() => {
      setActiveCall(null);
      setCallStatus(null);
      setCallDuration(0);
    }, 1500);
  };

  // Toggle microphone
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    sendMediaState({ isMuted: nextMuted });
    updateDiagnostics();
  };

  // Toggle camera
  const toggleVideo = () => {
    const nextEnabled = !isVideoEnabled;
    setIsVideoEnabled(nextEnabled);

    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = nextEnabled;
      });
    }

    sendMediaState({ isVideoEnabled: nextEnabled });
    updateDiagnostics();
  };

  // Toggle speaker mute
  const toggleSpeaker = () => {
    setIsSpeakerMuted(prev => !prev);
  };

  // Switch camera between front and back
  const switchCamera = async () => {
    const call = activeCallRef.current;
    if (!call || call.type !== 'video' || !localStreamRef.current) return;

    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    try {
      const newStream = await acquireMedia('video', nextMode);
      if (!newStream || !pcRef.current) return;

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }
    } catch {
      // Ignore if camera mode switch is unavailable
    }
  };

  const clearPermissionError = () => setPermissionError(null);
  const clearErrorMessage = () => setErrorMessage(null);

  // Connected duration timer
  useEffect(() => {
    if (callStatus === 'connected') {
      durationTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [callStatus]);

  // Periodic active call sync & signaling polling (fallback if SSE/WS drops)
  useEffect(() => {
    if (!user || !token) return;

    const syncInterval = setInterval(async () => {
      try {
        const currentCall = activeCallRef.current;

        // 1. If not currently in a call, check if an incoming call exists
        if (!currentCall) {
          const res = await apiRequest<{ call: Call | null }>('/calls/active').catch(() => null);
          if (res?.call && res.call.receiverId === user.id && (res.call.status === 'calling' || res.call.status === 'ringing')) {
            activeCallRef.current = res.call;
            setActiveCall(res.call);
            setCallStatus('ringing');
            callSounds.startIncomingRingtone();
            apiRequest(`/calls/${res.call.id}/ring`, { method: 'POST' }).catch(() => {});
          }
          return;
        }

        // 2. If in a call that is negotiating (calling, ringing, connecting), sync signals
        if (currentCall.status === 'connecting' || currentCall.status === 'ringing' || currentCall.status === 'calling') {
          const signals = await apiRequest<any>(`/calls/${currentCall.id}/signals`).catch(() => null);
          if (!signals) return;

          const pc = pcRef.current;
          if (pc) {
            // Caller fallback: if recipient answered but offer hasn't been created yet
            if (currentCall.callerId === user.id && !hasCreatedOfferRef.current && (signals.status === 'connecting' || signals.status === 'connected')) {
              callSounds.stopAll();
              setCallStatus('connecting');
              if (localStreamRef.current) {
                attachTracksToPeer(pc, localStreamRef.current);
              }
              try {
                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: currentCall.type === 'video'
                });
                await pc.setLocalDescription(offer);
                hasCreatedOfferRef.current = true;
                sendSignal({ type: 'offer', sdp: offer });
              } catch (err) {
                console.error('Failed to create fallback offer during sync:', err);
              }
            }

            // Receiver: if offer exists and we have answered the call
            if (currentCall.receiverId === user.id && signals.offer && !hasCreatedAnswerRef.current && (callStatus === 'connecting' || callStatus === 'connected')) {
              await handleOffer(pc, signals.offer);
            }

            // Caller: if answer exists and we have local offer
            if (currentCall.callerId === user.id && signals.answer && pc.signalingState === 'have-local-offer') {
              await handleAnswer(pc, signals.answer);
            }

            // Candidate syncing
            const candidatesToSync = currentCall.callerId === user.id ? signals.receiverCandidates : signals.callerCandidates;
            if (Array.isArray(candidatesToSync)) {
              for (const cand of candidatesToSync) {
                await addCandidateSafely(pc, cand);
              }
            }
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(syncInterval);
  }, [user, token, callStatus, handleOffer, handleAnswer, addCandidateSafely, sendSignal]);

  // Real-time Event Subscriptions (SSE & WebSocket)
  useEffect(() => {
    if (!user) return;

    // 1. Incoming call from another user
    const unsubIncoming = subscribe('CALL_INCOMING', (event) => {
      const incomingCall: Call = event.call;
      if (!incomingCall || incomingCall.receiverId !== user.id) return;

      // If already in a call, reject incoming call as busy
      if (activeCallRef.current) {
        apiRequest(`/calls/${incomingCall.id}/end`, {
          method: 'POST',
          body: JSON.stringify({ status: 'busy', reason: 'Recipient is currently on another call' })
        }).catch(() => {});
        return;
      }

      activeCallRef.current = incomingCall;
      setActiveCall(incomingCall);
      setCallStatus('ringing');
      callSounds.startIncomingRingtone();

      // Tell caller's device that receiver is ringing
      apiRequest(`/calls/${incomingCall.id}/ring`, { method: 'POST' }).catch(() => {});
    });

    // 2. Caller receives ringing notification from receiver
    const unsubRinging = subscribe('CALL_RINGING', (event) => {
      if (activeCallRef.current && activeCallRef.current.id === event.callId) {
        setCallStatus('ringing');
      }
    });

    // 3. Receiver answered -> Caller initiates offer if not already sent
    const unsubAccepted = subscribe('CALL_ACCEPTED', async (event) => {
      const call = activeCallRef.current;
      if (!call || call.id !== event.callId) return;

      if (call.callerId !== user.id) return;
      if (hasCreatedOfferRef.current) return;

      callSounds.stopAll();
      setCallStatus('connecting');

      try {
        const pc = getOrCreatePeerConnection(call);
        if (localStreamRef.current) {
          attachTracksToPeer(pc, localStreamRef.current);
        }

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: call.type === 'video'
        });
        await pc.setLocalDescription(offer);
        hasCreatedOfferRef.current = true;
        updateDiagnostics();

        sendSignal({
          type: 'offer',
          sdp: offer
        });
      } catch (err) {
        console.error('Failed to create offer on CALL_ACCEPTED:', err);
      }
    });

    // 4. WebRTC Signaling messages (offer, answer, ice-candidate)
    const unsubSignal = subscribe('CALL_SIGNAL', (event) => {
      if (activeCallRef.current && activeCallRef.current.id === event.callId) {
        handleRemoteSignal(event.signal);
      }
    });

    // 5. Peer updated camera / microphone state
    const unsubMediaState = subscribe('CALL_PEER_MEDIA_STATE', (event) => {
      if (activeCallRef.current && activeCallRef.current.id === event.callId && event.mediaState) {
        setPeerMediaState(prev => ({
          ...prev,
          ...event.mediaState
        }));
      }
    });

    // 6. Connected status broadcast
    const unsubConnected = subscribe('CALL_CONNECTED', (event) => {
      if (activeCallRef.current && activeCallRef.current.id === event.callId) {
        callSounds.stopAll();
        setCallStatus('connected');
      }
    });

    // 7. Reconnecting status
    const unsubReconnecting = subscribe('CALL_RECONNECTING', (event) => {
      if (activeCallRef.current && activeCallRef.current.id === event.callId) {
        setCallStatus('reconnecting');
      }
    });

    // 8. Call ended / declined / missed / busy
    const unsubEnded = subscribe('CALL_ENDED', (event) => {
      if (activeCallRef.current && activeCallRef.current.id === event.callId) {
        callSounds.stopAll();
        const endStatus: CallStatus = event.status || 'ended';

        if (endStatus === 'busy') {
          callSounds.playBusyTone();
          setErrorMessage('User is currently busy on another call.');
        } else if (endStatus === 'declined') {
          callSounds.playEndTone();
          setErrorMessage('Call was declined.');
        } else if (endStatus === 'missed') {
          callSounds.playEndTone();
          setErrorMessage('Call timed out (no answer).');
        } else {
          callSounds.playEndTone();
        }

        setCallStatus(endStatus);
        cleanupMediaAndPeer();

        setTimeout(() => {
          setActiveCall(null);
          setCallStatus(null);
          setCallDuration(0);
        }, 1500);
      }
    });

    return () => {
      unsubIncoming();
      unsubRinging();
      unsubAccepted();
      unsubSignal();
      unsubMediaState();
      unsubConnected();
      unsubReconnecting();
      unsubEnded();
    };
  }, [user, subscribe, handleRemoteSignal, getOrCreatePeerConnection, sendSignal, cleanupMediaAndPeer, updateDiagnostics]);

  // Connect WebSocket for low-latency duplex messaging where available
  useEffect(() => {
    if (!token || !user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/call?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CALL_SIGNAL' && activeCallRef.current?.id === data.callId) {
            handleRemoteSignal(data.signal);
          } else if (data.type === 'CALL_PEER_MEDIA_STATE' && activeCallRef.current?.id === data.callId) {
            setPeerMediaState(prev => ({ ...prev, ...data.mediaState }));
          }
        } catch {}
      };

      const pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 15000);

      return () => {
        clearInterval(pingTimer);
        ws.close();
        wsRef.current = null;
      };
    } catch {
      // SSE and REST polling will handle signaling if WebSocket is blocked
    }
  }, [token, user, handleRemoteSignal]);

  // Handle tab closing or browser refresh during an active call
  useEffect(() => {
    const handleBeforeUnload = () => {
      const call = activeCallRef.current;
      if (call) {
        try {
          navigator.sendBeacon(
            `/api/calls/${call.id}/end`,
            new Blob([JSON.stringify({ status: 'ended', reason: 'Browser tab closed or refreshed' })], {
              type: 'application/json'
            })
          );
        } catch {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      cleanupMediaAndPeer();
    };
  }, [cleanupMediaAndPeer]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        callStatus,
        localStream,
        remoteStream,
        isMuted,
        isVideoEnabled,
        isSpeakerMuted,
        facingMode,
        peerMediaState,
        callDuration,
        permissionError,
        errorMessage,
        diagnostics,
        startCall,
        answerCall,
        declineCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleSpeaker,
        switchCamera,
        clearPermissionError,
        clearErrorMessage
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};
