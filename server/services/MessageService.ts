import { db } from '../db';
import { Message, Conversation, UserPreview, SharedContentReference } from '../../src/types/index';
import { FollowService } from './FollowService';
import { RealtimeService } from './RealtimeService';
import { FirebaseSyncService } from './FirebaseSyncService';

export class MessageService {
  public static getConversations(userId: string): Conversation[] {
    const data = db.getData();
    const userConvs = data.conversations
      .filter(c => c.participants.some(p => p.id === userId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // Populate availability of shared content and handle deletion status in lastMessage
    return userConvs.map(conv => {
      const copy = { ...conv };

      // If lastMessage is deleted for this user ("Delete for me"), resolve to the latest non-deleted message
      let lastMsg = copy.lastMessage;
      if (lastMsg) {
        const isDeletedForMe = Boolean(
          (data.messageDeletions && data.messageDeletions[`${lastMsg.id}_${userId}`]) ||
          (lastMsg.deletedFor && lastMsg.deletedFor.includes(userId))
        );

        if (isDeletedForMe) {
          const visibleMsgs = data.messages
            .filter(m => m.conversationId === conv.id)
            .filter(m => {
              const delKey = `${m.id}_${userId}`;
              return !(data.messageDeletions && data.messageDeletions[delKey]) && !(m.deletedFor && m.deletedFor.includes(userId));
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          lastMsg = visibleMsgs[0] || undefined;
          copy.lastMessage = lastMsg;
        }
      }

      if (copy.lastMessage) {
        if (copy.lastMessage.deletedForEveryone) {
          copy.lastMessage = {
            ...copy.lastMessage,
            text: 'This message was deleted',
            mediaUrl: undefined,
            sharedContent: undefined,
            voiceDuration: undefined
          };
        } else if (copy.lastMessage.sharedContent) {
          copy.lastMessage = {
            ...copy.lastMessage,
            sharedContent: this.enrichSharedContent(copy.lastMessage.sharedContent)
          };
        }
      }

      return copy;
    });
  }

  public static getOrCreateConversation(userId1: string, userId2: string): Conversation {
    const data = db.getData();
    let conv = data.conversations.find(
      c => !c.isGroup && c.participants.some(p => p.id === userId1) && c.participants.some(p => p.id === userId2)
    );

    if (!conv) {
      const u1 = data.users.find(u => u.id === userId1);
      const u2 = data.users.find(u => u.id === userId2);

      if (!u1 || !u2) throw new Error('User not found.');

      // The OWNER_ADMIN account is private and cannot be messaged by regular users
      if ((u2.role === 'OWNER_ADMIN' || u2.id === 'user-shuv') && u1.id !== 'user-shuv') {
        throw new Error('This account cannot receive messages.');
      }

      // Private Account messaging restriction:
      // Cannot message a private user unless follow request is accepted
      if (u2.isPrivate && userId1 !== userId2) {
        const isFollowerAccepted = (data.follows || []).some(
          f => f.followerId === userId1 && f.followingId === userId2 && f.status === 'ACCEPTED'
        );
        const isTargetFollowing = (data.follows || []).some(
          f => f.followerId === userId2 && f.followingId === userId1 && f.status === 'ACCEPTED'
        );
        const isAdmin = u1.role === 'OWNER_ADMIN' || u1.role === 'ADMIN';

        if (!isFollowerAccepted && !isTargetFollowing && !isAdmin) {
          throw new Error('This account is private. You can only send messages after they accept your follow request.');
        }
      }

      const p1: UserPreview = { 
        id: u1.id, 
        username: u1.username, 
        displayName: u1.displayName, 
        avatarUrl: u1.avatarUrl,
        verified: u1.verified,
        role: u1.role
      };
      const p2: UserPreview = { 
        id: u2.id, 
        username: u2.username, 
        displayName: u2.displayName, 
        avatarUrl: u2.avatarUrl,
        verified: u2.verified,
        role: u2.role
      };

      conv = {
        id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        isGroup: false,
        participants: [p1, p2],
        unreadCount: 0,
        updatedAt: new Date().toISOString()
      };

      data.conversations.unshift(conv);
      db.saveData();

      RealtimeService.broadcast({
        type: 'CONVERSATION_UPDATED',
        conversation: conv
      }, [userId1, userId2]);
    }

    return conv;
  }

  public static createGroup(creatorId: string, groupName: string, memberIds: string[], groupAvatarUrl?: string): Conversation {
    const data = db.getData();
    const creator = data.users.find(u => u.id === creatorId);
    if (!creator) throw new Error('Creator not found.');

    const name = groupName.trim();
    if (!name) throw new Error('Group name is required.');

    const participantUsers = [creator];
    for (const mId of memberIds) {
      if (mId === creatorId) continue;
      const member = data.users.find(u => u.id === mId);
      if (member) {
        participantUsers.push(member);
      }
    }

    if (participantUsers.length < 2) {
      throw new Error('A group must have at least 2 members.');
    }

    const participants: UserPreview[] = participantUsers.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      verified: u.verified,
      role: u.role
    }));

    const convId = `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const newGroup: Conversation = {
      id: convId,
      name,
      isGroup: true,
      groupName: name,
      groupAvatarUrl: groupAvatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
      creatorId,
      adminIds: [creatorId],
      participants,
      unreadCount: 0,
      updatedAt: now
    };

    data.conversations.unshift(newGroup);

    // Initial system message
    const sysMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId: convId,
      senderId: creatorId,
      sender: {
        id: creator.id,
        username: creator.username,
        displayName: creator.displayName,
        avatarUrl: creator.avatarUrl
      },
      text: `${creator.displayName} created the group "${name}".`,
      isSystem: true,
      systemEventType: 'GROUP_CREATED',
      createdAt: now,
      isRead: false
    };

    data.messages.push(sysMsg);
    newGroup.lastMessage = sysMsg;

    db.saveData();

    RealtimeService.broadcast({
      type: 'CONVERSATION_UPDATED',
      conversation: newGroup,
      message: sysMsg
    }, participants.map(p => p.id));

    RealtimeService.broadcast({
      type: 'NEW_MESSAGE',
      message: sysMsg,
      conversationId: newGroup.id
    }, participants.map(p => p.id));

    return newGroup;
  }

  public static updateGroupPhoto(adminId: string, conversationId: string, photoUrl: string): Conversation {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.isGroup) throw new Error('Group conversation not found.');

    if (!conv.adminIds?.includes(adminId)) {
      throw new Error('Only group admins can update the group photo.');
    }

    const admin = data.users.find(u => u.id === adminId);
    conv.groupAvatarUrl = photoUrl;
    const now = new Date().toISOString();
    conv.updatedAt = now;

    const sysMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      senderId: adminId,
      text: `${admin?.displayName || 'Admin'} changed the group photo.`,
      isSystem: true,
      systemEventType: 'GROUP_PHOTO_CHANGED',
      createdAt: now,
      isRead: false
    };

    data.messages.push(sysMsg);
    conv.lastMessage = sysMsg;
    db.saveData();

    RealtimeService.broadcast({
      type: 'CONVERSATION_UPDATED',
      conversation: conv,
      message: sysMsg
    }, conv.participants.map(p => p.id));

    RealtimeService.broadcast({
      type: 'NEW_MESSAGE',
      message: sysMsg,
      conversationId: conv.id
    }, conv.participants.map(p => p.id));

    return conv;
  }

  public static deleteGroup(userId: string, conversationId: string): void {
    const data = db.getData();
    const convIndex = data.conversations.findIndex(c => c.id === conversationId);
    if (convIndex === -1) throw new Error('Group conversation not found.');

    const conv = data.conversations[convIndex];
    if (!conv.isGroup) throw new Error('Not a group conversation.');

    const requestingUser = data.users.find(u => u.id === userId);
    const isOwner = requestingUser?.role === 'OWNER_ADMIN' || requestingUser?.role === 'ADMIN';
    const isCreator = conv.creatorId === userId;
    const isGroupAdmin = conv.adminIds?.includes(userId);

    if (!isCreator && !isOwner && !isGroupAdmin) {
      throw new Error('Only group admins or creator can delete the group.');
    }

    const participantIds = conv.participants.map(p => p.id);
    data.conversations.splice(convIndex, 1);
    data.messages = data.messages.filter(m => m.conversationId !== conversationId);

    db.saveData();

    RealtimeService.broadcast({
      type: 'GROUP_DELETED',
      conversationId
    }, participantIds);
  }

  public static renameGroup(adminId: string, conversationId: string, newName: string): Conversation {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.isGroup) throw new Error('Group conversation not found.');

    if (!conv.adminIds?.includes(adminId)) {
      throw new Error('Only group admins can rename the group.');
    }

    const name = newName.trim();
    if (!name) throw new Error('Group name cannot be empty.');

    const admin = data.users.find(u => u.id === adminId);
    const oldName = conv.groupName;
    conv.groupName = name;
    const now = new Date().toISOString();
    conv.updatedAt = now;

    const sysMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      senderId: adminId,
      text: `${admin?.displayName || 'Admin'} renamed the group to "${name}".`,
      isSystem: true,
      systemEventType: 'GROUP_RENAMED',
      createdAt: now,
      isRead: false
    };

    data.messages.push(sysMsg);
    conv.lastMessage = sysMsg;
    db.saveData();

    RealtimeService.broadcast({
      type: 'CONVERSATION_UPDATED',
      conversation: conv,
      message: sysMsg
    }, conv.participants.map(p => p.id));

    RealtimeService.broadcast({
      type: 'NEW_MESSAGE',
      message: sysMsg,
      conversationId: conv.id
    }, conv.participants.map(p => p.id));

    return conv;
  }

  public static addGroupMembers(adminId: string, conversationId: string, memberIdsToAdd: string[]): Conversation {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.isGroup) throw new Error('Group conversation not found.');

    const isMember = conv.participants.some(p => p.id === adminId);
    if (!isMember) {
      throw new Error('You must be a member of this group to add members.');
    }

    if (!Array.isArray(conv.adminIds)) {
      conv.adminIds = conv.creatorId ? [conv.creatorId] : [];
    }

    const admin = data.users.find(u => u.id === adminId);
    const addedNames: string[] = [];

    for (const mId of memberIdsToAdd) {
      if (conv.participants.some(p => p.id === mId)) continue;
      const user = data.users.find(u => u.id === mId);
      if (user) {
        conv.participants.push({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          verified: user.verified,
          role: user.role
        });
        addedNames.push(user.displayName || user.username);
      }
    }

    if (addedNames.length > 0) {
      const now = new Date().toISOString();
      conv.updatedAt = now;

      const sysMsg: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conv.id,
        senderId: adminId,
        text: `${admin?.displayName || 'Admin'} added ${addedNames.join(', ')} to the group.`,
        isSystem: true,
        systemEventType: 'MEMBER_ADDED',
        createdAt: now,
        isRead: false
      };

      data.messages.push(sysMsg);
      conv.lastMessage = sysMsg;
      db.saveData();

      RealtimeService.broadcast({
        type: 'CONVERSATION_UPDATED',
        conversation: conv,
        message: sysMsg
      }, conv.participants.map(p => p.id));

      RealtimeService.broadcast({
        type: 'NEW_MESSAGE',
        message: sysMsg,
        conversationId: conv.id
      }, conv.participants.map(p => p.id));
    }

    return conv;
  }

  public static removeGroupMember(adminId: string, conversationId: string, targetUserId: string): Conversation {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.isGroup) throw new Error('Group conversation not found.');

    const isSelfLeaving = adminId === targetUserId;
    if (!isSelfLeaving && !conv.adminIds?.includes(adminId)) {
      throw new Error('Only group admins can remove members.');
    }

    const targetUser = data.users.find(u => u.id === targetUserId);
    const admin = data.users.find(u => u.id === adminId);

    // Cannot remove creator if someone else
    if (!isSelfLeaving && targetUserId === conv.creatorId) {
      throw new Error('The group creator cannot be removed.');
    }

    const previousParticipants = [...conv.participants];
    conv.participants = conv.participants.filter(p => p.id !== targetUserId);
    conv.adminIds = (conv.adminIds || []).filter(id => id !== targetUserId);

    // If no admin left, promote first remaining member
    if (conv.adminIds.length === 0 && conv.participants.length > 0) {
      conv.adminIds = [conv.participants[0].id];
    }

    const now = new Date().toISOString();
    conv.updatedAt = now;

    const targetName = targetUser?.displayName || targetUser?.username || 'User';
    const adminName = admin?.displayName || admin?.username || 'Admin';

    const sysMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      senderId: adminId,
      text: isSelfLeaving 
        ? `${targetName} left the group.`
        : `${adminName} removed ${targetName} from the group.`,
      isSystem: true,
      systemEventType: isSelfLeaving ? 'MEMBER_LEFT' : 'MEMBER_REMOVED',
      createdAt: now,
      isRead: false
    };

    data.messages.push(sysMsg);
    conv.lastMessage = sysMsg;
    db.saveData();

    // Broadcast to everyone previously in group so removed member's client updates and loses access immediately
    RealtimeService.broadcast({
      type: 'CONVERSATION_UPDATED',
      conversation: conv,
      message: sysMsg,
      removedUserId: targetUserId
    }, previousParticipants.map(p => p.id));

    RealtimeService.broadcast({
      type: 'NEW_MESSAGE',
      message: sysMsg,
      conversationId: conv.id
    }, previousParticipants.map(p => p.id));

    return conv;
  }

  public static setGroupAdminStatus(adminId: string, conversationId: string, targetUserId: string, makeAdmin: boolean): Conversation {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.isGroup) throw new Error('Group conversation not found.');

    if (!conv.adminIds?.includes(adminId)) {
      throw new Error('Only group admins can manage admin roles.');
    }

    if (targetUserId === conv.creatorId && !makeAdmin) {
      throw new Error('The group creator must remain a group admin.');
    }

    conv.adminIds = conv.adminIds || [];
    const targetUser = data.users.find(u => u.id === targetUserId);
    const targetName = targetUser?.displayName || targetUser?.username || 'User';

    if (makeAdmin && !conv.adminIds.includes(targetUserId)) {
      conv.adminIds.push(targetUserId);
    } else if (!makeAdmin) {
      conv.adminIds = conv.adminIds.filter(id => id !== targetUserId);
    }

    const now = new Date().toISOString();
    conv.updatedAt = now;

    const sysMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      senderId: adminId,
      text: makeAdmin
        ? `${targetName} is now an admin.`
        : `${targetName} is no longer an admin.`,
      isSystem: true,
      systemEventType: makeAdmin ? 'ADMIN_PROMOTED' : 'ADMIN_DEMOTED',
      createdAt: now,
      isRead: false
    };

    data.messages.push(sysMsg);
    conv.lastMessage = sysMsg;
    db.saveData();

    RealtimeService.broadcast({
      type: 'CONVERSATION_UPDATED',
      conversation: conv,
      message: sysMsg
    }, conv.participants.map(p => p.id));

    RealtimeService.broadcast({
      type: 'NEW_MESSAGE',
      message: sysMsg,
      conversationId: conv.id
    }, conv.participants.map(p => p.id));

    return conv;
  }

  public static getMessages(conversationId: string, currentUserId?: string): Message[] {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv) return [];

    // If user specified, verify membership
    if (currentUserId && !conv.participants.some(p => p.id === currentUserId)) {
      throw new Error('You are not a member of this conversation.');
    }

    const messages = data.messages
      .filter(m => {
        if (m.conversationId !== conversationId) return false;
        // If message was deleted for the current user ("Delete for me"), completely exclude it
        if (currentUserId) {
          const deletionKey = `${m.id}_${currentUserId}`;
          if (data.messageDeletions && data.messageDeletions[deletionKey]) return false;
          if (m.deletedFor && m.deletedFor.includes(currentUserId)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Enrich shared content & sanitize messages deleted for everyone
    return messages.map(m => {
      if (m.deletedForEveryone) {
        return {
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          sender: m.sender,
          createdAt: m.createdAt,
          isRead: m.isRead,
          seenAt: m.seenAt,
          text: 'This message was deleted',
          deletedForEveryone: true,
          deletedAt: m.deletedAt,
          deletedBy: m.deletedBy
        };
      }
      if (m.sharedContent) {
        return {
          ...m,
          sharedContent: this.enrichSharedContent(m.sharedContent)
        };
      }
      return m;
    });
  }

  /**
   * Delete message for current user only ("Delete for me")
   * Removes from user's view, persists across logins, recipient unaffected.
   */
  public static deleteMessageForMe(userId: string, messageId: string): { success: boolean; messageId: string; conversationId: string } {
    const data = db.getData();
    const msg = data.messages.find(m => m.id === messageId);
    if (!msg) {
      throw new Error('Message not found.');
    }

    const conv = data.conversations.find(c => c.id === msg.conversationId);
    if (!conv || !conv.participants.some(p => p.id === userId)) {
      throw new Error('Access denied. You are not a member of this conversation.');
    }

    const deletionKey = `${messageId}_${userId}`;
    const now = new Date().toISOString();
    const deletionRecord = {
      id: deletionKey,
      messageId,
      userId,
      deletedAt: now
    };

    data.messageDeletions = data.messageDeletions || {};
    data.messageDeletions[deletionKey] = deletionRecord;

    msg.deletedFor = msg.deletedFor || [];
    if (!msg.deletedFor.includes(userId)) {
      msg.deletedFor.push(userId);
    }

    // Persist to local database and Cloud Firestore
    db.saveData();
    FirebaseSyncService.recordMessageDeletion(deletionRecord).catch(err => {
      console.warn('[MessageService] Background Firestore deletion sync:', err);
    });

    // Notify the user's active client session(s) in real-time
    RealtimeService.broadcast({
      type: 'MESSAGE_DELETED_FOR_ME',
      messageId,
      conversationId: msg.conversationId,
      userId
    }, [userId]);

    return {
      success: true,
      messageId,
      conversationId: msg.conversationId
    };
  }

  /**
   * Delete message globally for everyone in the chat ("Delete for everyone")
   * Sender or authorized group admin/moderator only.
   */
  public static deleteMessageForEveryone(userId: string, messageId: string): { success: boolean; message: Message } {
    const data = db.getData();
    const msg = data.messages.find(m => m.id === messageId);
    if (!msg) {
      throw new Error('Message not found.');
    }

    const conv = data.conversations.find(c => c.id === msg.conversationId);
    if (!conv) {
      throw new Error('Conversation not found.');
    }

    const user = data.users.find(u => u.id === userId);
    const isAuthor = msg.senderId === userId;
    const isGroupAdmin = Boolean(conv.isGroup && (conv.adminIds?.includes(userId) || conv.creatorId === userId));
    const isOwnerOrAdmin = user?.role === 'OWNER_ADMIN' || user?.role === 'ADMIN';

    if (!isAuthor && !isGroupAdmin && !isOwnerOrAdmin) {
      throw new Error('You can only delete your own messages for everyone.');
    }

    const now = new Date().toISOString();

    // Mark as deleted globally
    msg.deletedForEveryone = true;
    msg.deletedAt = now;
    msg.deletedBy = userId;
    msg.text = 'This message was deleted';
    msg.mediaUrl = undefined;
    msg.voiceDuration = undefined;
    msg.sharedContent = undefined;

    // If this was the lastMessage on the conversation, update it too
    if (conv.lastMessage?.id === messageId) {
      conv.lastMessage = {
        ...conv.lastMessage,
        text: 'This message was deleted',
        mediaUrl: undefined,
        voiceDuration: undefined,
        sharedContent: undefined,
        deletedForEveryone: true,
        deletedAt: now,
        deletedBy: userId
      };
    }

    // Persist to local database and Cloud Firestore
    db.saveData();

    const sanitizedMsg: Message = {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      sender: msg.sender,
      createdAt: msg.createdAt,
      isRead: msg.isRead,
      seenAt: msg.seenAt,
      text: 'This message was deleted',
      deletedForEveryone: true,
      deletedAt: now,
      deletedBy: userId
    };

    // Broadcast globally to all participants in real-time
    RealtimeService.broadcast({
      type: 'MESSAGE_DELETED_FOR_EVERYONE',
      messageId: msg.id,
      conversationId: conv.id,
      deletedAt: now,
      deletedBy: userId,
      message: sanitizedMsg
    }, conv.participants.map(p => p.id));

    // Also send generic MESSAGE_DELETED event for universal listener compatibility
    RealtimeService.broadcast({
      type: 'MESSAGE_DELETED',
      messageId: msg.id,
      conversationId: conv.id,
      deletedForEveryone: true,
      deletedAt: now,
      deletedBy: userId,
      message: sanitizedMsg
    }, conv.participants.map(p => p.id));

    return {
      success: true,
      message: sanitizedMsg
    };
  }

  public static sendMessage(params: {
    conversationId: string;
    senderId: string;
    text?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'voice' | 'file';
    voiceDuration?: number;
    sharedContent?: SharedContentReference;
  }): Message {
    const data = db.getData();
    const sender = data.users.find(u => u.id === params.senderId);
    if (!sender) throw new Error('Sender not found.');

    if (sender.isBanned) {
      throw new Error('Your account is banned. You cannot send messages.');
    }

    const conv = data.conversations.find(c => c.id === params.conversationId);
    if (!conv) throw new Error('Conversation not found.');

    if (!conv.participants.some(p => p.id === params.senderId)) {
      throw new Error('You are not a member of this conversation.');
    }

    // Check private account recipient restrictions for direct messages
    if (!conv.isGroup) {
      const otherParticipant = conv.participants.find(p => p.id !== params.senderId);
      if (otherParticipant && otherParticipant.id !== params.senderId) {
        const recipientUser = data.users.find(u => u.id === otherParticipant.id);
        if (recipientUser && recipientUser.isPrivate) {
          const isFollowerAccepted = (data.follows || []).some(
            f => f.followerId === params.senderId && f.followingId === recipientUser.id && f.status === 'ACCEPTED'
          );
          const isTargetFollowing = (data.follows || []).some(
            f => f.followerId === recipientUser.id && f.followingId === params.senderId && f.status === 'ACCEPTED'
          );
          const isAdmin = sender.role === 'OWNER_ADMIN' || sender.role === 'ADMIN';

          if (!isFollowerAccepted && !isTargetFollowing && !isAdmin) {
            throw new Error('This account is private. You can only send messages after they accept your follow request.');
          }
        }
      }
    }

    let sharedContent: SharedContentReference | undefined = undefined;
    if (params.sharedContent) {
      sharedContent = this.enrichSharedContent(params.sharedContent);
    }

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId: params.conversationId,
      senderId: params.senderId,
      sender: {
        id: sender.id,
        username: sender.username,
        displayName: sender.displayName,
        avatarUrl: sender.avatarUrl,
        verified: sender.verified
      },
      text: params.text,
      mediaUrl: params.mediaUrl,
      mediaType: params.mediaType,
      voiceDuration: params.voiceDuration,
      sharedContent,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    data.messages.push(msg);

    conv.lastMessage = msg;
    conv.updatedAt = msg.createdAt;
    conv.unreadCount = (conv.unreadCount || 0) + 1;

    db.saveData();

    RealtimeService.broadcast({
      type: 'MESSAGE_SENT',
      message: msg,
      conversationId: params.conversationId
    }, conv.participants.map(p => p.id));

    RealtimeService.broadcast({
      type: 'NEW_MESSAGE',
      message: msg,
      conversationId: params.conversationId
    }, conv.participants.map(p => p.id));

    return msg;
  }

  public static getGroupSharedMedia(userId: string, conversationId: string): any[] {
    const data = db.getData();
    const conv = data.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.participants.some(p => p.id === userId)) {
      throw new Error('Access denied. You are not a member of this conversation.');
    }

    return data.messages
      .filter(m => m.conversationId === conversationId && (m.mediaUrl || m.sharedContent))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static shareContentInDM(params: {
    senderId: string;
    targetConversationId?: string;
    recipientId?: string;
    contentType: 'post' | 'reel';
    contentId: string;
    messageText?: string;
  }): Message {
    const data = db.getData();
    const sender = data.users.find(u => u.id === params.senderId);
    if (!sender) throw new Error('Sender not found.');

    if (sender.isBanned) {
      throw new Error('Your account is banned.');
    }

    let targetConv: Conversation | undefined;
    if (params.targetConversationId) {
      targetConv = data.conversations.find(c => c.id === params.targetConversationId);
    } else if (params.recipientId) {
      targetConv = this.getOrCreateConversation(params.senderId, params.recipientId);
    }

    if (!targetConv) {
      throw new Error('Conversation or recipient required.');
    }

    // Lookup original content
    let preview: SharedContentReference;
    if (params.contentType === 'post') {
      const post = data.posts.find(p => p.id === params.contentId);
      if (!post) throw new Error('Post not found.');

      // Check author privacy
      const author = data.users.find(u => u.id === post.userId);
      if (author?.isPrivate && !targetConv.isGroup) {
        const otherParticipant = targetConv.participants.find(p => p.id !== params.senderId);
        if (otherParticipant && otherParticipant.id !== author.id) {
          const rel = FollowService.getRelationshipState(otherParticipant.id, author.id);
          if (!rel.isFollowing) {
            throw new Error('Cannot share private content with accounts that do not follow the author.');
          }
        }
      }

      preview = {
        type: 'post',
        id: post.id,
        authorUsername: post.author.username,
        authorAvatarUrl: post.author.avatarUrl,
        caption: post.caption,
        mediaUrl: post.mediaUrl,
        thumbnailUrl: post.thumbnailUrl,
        mediaType: post.mediaType,
        isAvailable: true
      };
    } else {
      const reel = data.reels.find(r => r.id === params.contentId);
      if (!reel) throw new Error('Reel not found.');

      const author = data.users.find(u => u.id === reel.userId);
      if (author?.isPrivate && !targetConv.isGroup) {
        const otherParticipant = targetConv.participants.find(p => p.id !== params.senderId);
        if (otherParticipant && otherParticipant.id !== author.id) {
          const rel = FollowService.getRelationshipState(otherParticipant.id, author.id);
          if (!rel.isFollowing) {
            throw new Error('Cannot share private content with accounts that do not follow the author.');
          }
        }
      }

      preview = {
        type: 'reel',
        id: reel.id,
        authorUsername: reel.author.username,
        authorAvatarUrl: reel.author.avatarUrl,
        caption: reel.caption,
        mediaUrl: reel.videoUrl,
        thumbnailUrl: reel.thumbnailUrl,
        mediaType: 'video',
        isAvailable: true
      };
    }

    return this.sendMessage({
      conversationId: targetConv.id,
      senderId: params.senderId,
      text: params.messageText,
      sharedContent: preview
    });
  }

  public static enrichSharedContent(ref: SharedContentReference): SharedContentReference {
    const data = db.getData();
    if (ref.type === 'post') {
      const post = data.posts.find(p => p.id === ref.id);
      if (!post) {
        return { ...ref, isAvailable: false };
      }
      return {
        ...ref,
        isAvailable: true,
        authorUsername: post.author.username,
        authorAvatarUrl: post.author.avatarUrl,
        caption: post.caption,
        mediaUrl: post.mediaUrl,
        thumbnailUrl: post.thumbnailUrl,
        mediaType: post.mediaType
      };
    } else if (ref.type === 'reel') {
      const reel = data.reels.find(r => r.id === ref.id);
      if (!reel) {
        return { ...ref, isAvailable: false };
      }
      return {
        ...ref,
        isAvailable: true,
        authorUsername: reel.author.username,
        authorAvatarUrl: reel.author.avatarUrl,
        caption: reel.caption,
        mediaUrl: reel.videoUrl,
        thumbnailUrl: reel.thumbnailUrl,
        mediaType: 'video'
      };
    }
    return { ...ref, isAvailable: false };
  }

  public static markConversationAsSeen(conversationId: string, currentUserId: string): { updatedCount: number } {
    const data = db.getData();
    let updatedCount = 0;
    const now = new Date().toISOString();

    data.messages.forEach(m => {
      if (m.conversationId === conversationId && m.senderId !== currentUserId && !m.isRead) {
        m.isRead = true;
        m.seenAt = now;
        updatedCount++;
      }
    });

    const conv = data.conversations.find(c => c.id === conversationId);
    if (conv) {
      conv.unreadCount = 0;
      if (conv.lastMessage && conv.lastMessage.senderId !== currentUserId) {
        conv.lastMessage.isRead = true;
        conv.lastMessage.seenAt = now;
      }
    }

    if (updatedCount > 0) {
      db.saveData();
    }

    return { updatedCount };
  }
}
