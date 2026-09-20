import { db } from '../db';
import { Call, CallHistoryItem, CallType, CallStatus, UserPreview, CallSignalPayload } from '../../src/types/index';
import { NotificationService } from './NotificationService';
import { RealtimeService } from './RealtimeService';
import { PresenceService } from './PresenceService';

export class CallService {
  private static timeoutTimers: Map<string, NodeJS.Timeout> = new Map();

  public static getActiveCallForUser(userId: string): Call | null {
    const data = db.getData();
    const activeStatuses: CallStatus[] = ['calling', 'ringing', 'connecting', 'connected', 'reconnecting', 'active'];
    return data.calls.find(
      c => (c.callerId === userId || c.receiverId === userId) && activeStatuses.includes(c.status)
    ) || null;
  }

  public static getIceServers() {
    const iceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:openrelay.metered.ca:80' }
    ];

    if (process.env.TURN_SERVER_URL) {
      const turnUrls = process.env.TURN_SERVER_URL.split(',').map(u => u.trim()).filter(Boolean);
      iceServers.push({
        urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_PASSWORD || undefined
      });
    }

    return iceServers;
  }

  public static initiateCall(callerId: string, receiverId: string, type: CallType, initialOffer?: any, initialCandidates?: any[]): Call {
    if (callerId === receiverId) {
      throw new Error('You cannot call yourself.');
    }

    const data = db.getData();
    const caller = data.users.find(u => u.id === callerId);
    const receiver = data.users.find(u => u.id === receiverId);

    if (!caller) throw new Error('Caller account not found.');
    if (!receiver) throw new Error('User not found.');
    if (receiver.isBanned) throw new Error('This user account is currently suspended.');

    // Prevent duplicate calls: check if caller already has an ongoing call
    const callerActive = this.getActiveCallForUser(callerId);
    if (callerActive) {
      throw new Error('You already have an active or ringing call session. Please end it first.');
    }

    // Check if receiver is already busy in another call
    const receiverActive = this.getActiveCallForUser(receiverId);
    if (receiverActive) {
      // Record a busy attempt in call history
      const busyCall: Call = {
        id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        callerId,
        caller: {
          id: caller.id,
          username: caller.username,
          displayName: caller.displayName,
          avatarUrl: caller.avatarUrl
        },
        receiverId,
        receiver: {
          id: receiver.id,
          username: receiver.username,
          displayName: receiver.displayName,
          avatarUrl: receiver.avatarUrl
        },
        type,
        status: 'busy',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        duration: 0,
        endReason: 'User is busy on another call.'
      };
      this.recordCallHistory(busyCall);
      throw new Error('User is currently on another call.');
    }

    // Respect privacy and follow rules
    if (receiver.isPrivate && callerId !== receiverId) {
      const isFollowerAccepted = (data.follows || []).some(
        f => f.followerId === callerId && f.followingId === receiverId && f.status === 'ACCEPTED'
      );
      const isTargetFollowing = (data.follows || []).some(
        f => f.followerId === receiverId && f.followingId === callerId && f.status === 'ACCEPTED'
      );
      const isAdmin = caller.role === 'OWNER_ADMIN' || caller.role === 'ADMIN';

      if (!isFollowerAccepted && !isTargetFollowing && !isAdmin) {
        throw new Error('This account is private. You can only call after they accept your follow request.');
      }
    }

    const callerPreview: UserPreview = {
      id: caller.id,
      username: caller.username,
      displayName: caller.displayName,
      avatarUrl: caller.avatarUrl
    };

    const receiverPreview: UserPreview = {
      id: receiver.id,
      username: receiver.username,
      displayName: receiver.displayName,
      avatarUrl: receiver.avatarUrl
    };

    const newCall: Call = {
      id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callerId,
      caller: callerPreview,
      receiverId,
      receiver: receiverPreview,
      type,
      status: 'calling',
      startedAt: new Date().toISOString(),
      signals: {
        offer: initialOffer || null,
        answer: null,
        callerCandidates: Array.isArray(initialCandidates) ? [...initialCandidates] : [],
        receiverCandidates: []
      }
    };

    data.calls.push(newCall);

    // Save notification
    NotificationService.createNotification({
      userId: receiverId,
      actorId: callerId,
      type: 'CALL',
      targetId: newCall.id,
      previewText: `Incoming ${type} call from ${caller.displayName || caller.username}`
    });

    db.saveData();

    // Broadcast incoming call event in real-time to receiver
    RealtimeService.broadcast({
      type: 'CALL_INCOMING',
      call: newCall
    }, [receiverId]);

    // Schedule 35-second unanswered / missed call timeout
    const timeout = setTimeout(() => {
      this.handleCallTimeout(newCall.id);
    }, 35000);
    this.timeoutTimers.set(newCall.id, timeout);

    return newCall;
  }

  public static markRinging(callId: string, userId: string): Call {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call not found.');

    if (call.receiverId !== userId) {
      throw new Error('Unauthorized to update this call.');
    }

    if (call.status === 'calling') {
      call.status = 'ringing';
      db.saveData();

      // Notify caller that receiver device is ringing
      RealtimeService.broadcast({
        type: 'CALL_RINGING',
        callId: call.id
      }, [call.callerId]);
    }

    return call;
  }

  public static answerCall(callId: string, userId: string): Call {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call not found.');

    if (call.receiverId !== userId) throw new Error('Unauthorized. Only the recipient can answer this call.');

    if (call.status !== 'calling' && call.status !== 'ringing') {
      throw new Error(`Call cannot be answered because it is currently ${call.status}.`);
    }

    this.clearCallTimeout(callId);

    call.status = 'connecting';
    call.connectedAt = new Date().toISOString();
    db.saveData();

    // Broadcast accepted event to caller so WebRTC negotiation can begin
    RealtimeService.broadcast({
      type: 'CALL_ACCEPTED',
      callId: call.id,
      status: 'connecting',
      connectedAt: call.connectedAt
    }, [call.callerId, call.receiverId]);

    return call;
  }

  public static markConnected(callId: string, userId: string): Call {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call not found.');

    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new Error('Unauthorized.');
    }

    if (call.status !== 'connected') {
      call.status = 'connected';
      if (!call.connectedAt) {
        call.connectedAt = new Date().toISOString();
      }
      db.saveData();

      RealtimeService.broadcast({
        type: 'CALL_CONNECTED',
        callId: call.id,
        connectedAt: call.connectedAt
      }, [call.callerId, call.receiverId]);
    }

    return call;
  }

  public static markReconnecting(callId: string, userId: string): Call {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call not found.');

    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new Error('Unauthorized.');
    }

    if (call.status === 'connected' || call.status === 'connecting') {
      call.status = 'reconnecting';
      db.saveData();

      const peerId = call.callerId === userId ? call.receiverId : call.callerId;
      RealtimeService.broadcast({
        type: 'CALL_RECONNECTING',
        callId: call.id,
        userId
      }, [peerId]);
    }

    return call;
  }

  public static handleSignal(callId: string, senderId: string, signal: CallSignalPayload): void {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call session not found.');

    if (call.callerId !== senderId && call.receiverId !== senderId) {
      throw new Error('Unauthorized to exchange signals for this call session.');
    }

    if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed' || call.status === 'cancelled') {
      throw new Error('Call has already ended.');
    }

    if (!call.signals) {
      call.signals = {
        offer: null,
        answer: null,
        callerCandidates: [],
        receiverCandidates: []
      };
    }

    // Persist offer / answer / ICE candidates on call object
    if (signal.type === 'offer' && signal.sdp) {
      call.signals.offer = signal.sdp;
    } else if (signal.type === 'answer' && signal.sdp) {
      call.signals.answer = signal.sdp;
    } else if (signal.type === 'ice-candidate' && signal.candidate) {
      if (senderId === call.callerId) {
        if (!call.signals.callerCandidates) call.signals.callerCandidates = [];
        call.signals.callerCandidates.push(signal.candidate);
      } else {
        if (!call.signals.receiverCandidates) call.signals.receiverCandidates = [];
        call.signals.receiverCandidates.push(signal.candidate);
      }
    }

    const peerId = call.callerId === senderId ? call.receiverId : call.callerId;
    db.saveData();

    RealtimeService.broadcast({
      type: 'CALL_SIGNAL',
      callId,
      senderId,
      signal
    }, [peerId]);
  }

  public static getSignals(callId: string, userId: string) {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call session not found.');

    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new Error('Unauthorized to read signals for this call.');
    }

    if (!call.signals) {
      call.signals = {
        offer: null,
        answer: null,
        callerCandidates: [],
        receiverCandidates: []
      };
    }

    return {
      callId: call.id,
      status: call.status,
      offer: call.signals.offer || null,
      answer: call.signals.answer || null,
      callerCandidates: call.signals.callerCandidates || [],
      receiverCandidates: call.signals.receiverCandidates || []
    };
  }

  public static updateMediaState(callId: string, senderId: string, mediaState: { isMuted?: boolean; isVideoEnabled?: boolean }): void {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call session not found.');

    if (call.callerId !== senderId && call.receiverId !== senderId) {
      throw new Error('Unauthorized.');
    }

    const peerId = call.callerId === senderId ? call.receiverId : call.callerId;
    RealtimeService.broadcast({
      type: 'CALL_PEER_MEDIA_STATE',
      callId,
      senderId,
      mediaState
    }, [peerId]);
  }

  public static endCall(callId: string, userId: string, status?: CallStatus, reason?: string): Call {
    this.clearCallTimeout(callId);

    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) throw new Error('Call not found.');

    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new Error('Unauthorized. You are not a participant in this call.');
    }

    // Determine finalized status
    let finalStatus: CallStatus = status || 'ended';
    if (!status) {
      if (call.status === 'calling') {
        finalStatus = userId === call.callerId ? 'cancelled' : 'declined';
      } else if (call.status === 'ringing') {
        finalStatus = userId === call.receiverId ? 'declined' : 'cancelled';
      } else {
        finalStatus = 'ended';
      }
    }

    call.status = finalStatus;
    call.endedAt = new Date().toISOString();
    call.endReason = reason;

    const start = call.connectedAt
      ? new Date(call.connectedAt).getTime()
      : (call.startedAt ? new Date(call.startedAt).getTime() : Date.now());
    const end = new Date(call.endedAt).getTime();

    // Only count positive connected duration
    if (call.status === 'ended') {
      call.duration = Math.max(0, Math.round((end - start) / 1000));
    } else {
      call.duration = 0;
    }

    this.recordCallHistory(call);
    db.saveData();

    // Broadcast call ended to both participants
    RealtimeService.broadcast({
      type: 'CALL_ENDED',
      callId: call.id,
      status: finalStatus,
      duration: call.duration,
      endedBy: userId,
      endReason: reason
    }, [call.callerId, call.receiverId]);

    return call;
  }

  private static handleCallTimeout(callId: string): void {
    const data = db.getData();
    const call = data.calls.find(c => c.id === callId);
    if (!call) return;

    if (call.status === 'calling' || call.status === 'ringing') {
      call.status = 'missed';
      call.endedAt = new Date().toISOString();
      call.duration = 0;
      call.endReason = 'No answer (timed out)';

      this.recordCallHistory(call);
      db.saveData();

      RealtimeService.broadcast({
        type: 'CALL_ENDED',
        callId: call.id,
        status: 'missed',
        duration: 0,
        endReason: 'Unanswered call timed out'
      }, [call.callerId, call.receiverId]);
    }
  }

  private static clearCallTimeout(callId: string): void {
    const timer = this.timeoutTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(callId);
    }
  }

  private static recordCallHistory(call: Call): void {
    const data = db.getData();
    if (!data.callHistory) data.callHistory = {};
    if (!data.callHistory[call.callerId]) data.callHistory[call.callerId] = [];
    if (!data.callHistory[call.receiverId]) data.callHistory[call.receiverId] = [];

    // Save outgoing item for caller
    data.callHistory[call.callerId].unshift({
      id: `hist-${Date.now()}-out-${Math.random().toString(36).substring(2, 6)}`,
      peer: call.receiver,
      type: call.type,
      direction: 'outgoing',
      status: call.status,
      timestamp: call.endedAt || new Date().toISOString(),
      duration: call.duration || 0
    });

    // Save incoming item for receiver
    data.callHistory[call.receiverId].unshift({
      id: `hist-${Date.now()}-in-${Math.random().toString(36).substring(2, 6)}`,
      peer: call.caller,
      type: call.type,
      direction: 'incoming',
      status: call.status,
      timestamp: call.endedAt || new Date().toISOString(),
      duration: call.duration || 0
    });

    // Cap history at 100 entries per user
    if (data.callHistory[call.callerId].length > 100) {
      data.callHistory[call.callerId] = data.callHistory[call.callerId].slice(0, 100);
    }
    if (data.callHistory[call.receiverId].length > 100) {
      data.callHistory[call.receiverId] = data.callHistory[call.receiverId].slice(0, 100);
    }
  }

  public static getCallHistory(userId: string): CallHistoryItem[] {
    const data = db.getData();
    return (data.callHistory && data.callHistory[userId]) || [];
  }
}
