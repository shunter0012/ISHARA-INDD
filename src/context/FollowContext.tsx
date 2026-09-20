import React, { createContext, useContext, useState, useCallback } from 'react';
import { FollowButtonState } from '../types/index';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';

interface FollowStateEntry {
  state: FollowButtonState;
  followersCount?: number;
  followingCount?: number;
}

interface FollowContextType {
  getFollowState: (targetUserId: string) => FollowButtonState;
  getCounts: (userId: string) => { followersCount?: number; followingCount?: number };
  getStats: (userId: string, defaults?: { followersCount?: number; followingCount?: number; postsCount?: number }) => { followersCount: number; followingCount: number; postsCount: number };
  toggleFollow: (targetUserId: string) => Promise<FollowButtonState>;
  acceptFollowRequest: (targetUserId: string) => Promise<void>;
  declineFollowRequest: (targetUserId: string) => Promise<void>;
  fetchFollowState: (targetUserId: string) => Promise<void>;
  refreshCounts: (userId: string) => Promise<void>;
  setFollowInfo: (userId: string, state: FollowButtonState, followersCount?: number, followingCount?: number) => void;
}

const FollowContext = createContext<FollowContextType | undefined>(undefined);

export const FollowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useAuth();
  const [followMap, setFollowMap] = useState<Record<string, FollowStateEntry>>({});

  const setFollowInfo = useCallback((userId: string, state: FollowButtonState, followersCount?: number, followingCount?: number) => {
    setFollowMap(prev => ({
      ...prev,
      [userId]: {
        state,
        followersCount: followersCount !== undefined ? followersCount : prev[userId]?.followersCount,
        followingCount: followingCount !== undefined ? followingCount : prev[userId]?.followingCount
      }
    }));
  }, []);

  const getFollowState = useCallback((targetUserId: string): FollowButtonState => {
    return followMap[targetUserId]?.state || 'Follow';
  }, [followMap]);

  const getCounts = useCallback((userId: string) => {
    return {
      followersCount: followMap[userId]?.followersCount,
      followingCount: followMap[userId]?.followingCount
    };
  }, [followMap]);

  const getStats = useCallback((userId: string, defaults?: { followersCount?: number; followingCount?: number; postsCount?: number }) => {
    const c = followMap[userId];
    return {
      followersCount: c?.followersCount !== undefined ? c.followersCount : (defaults?.followersCount ?? 0),
      followingCount: c?.followingCount !== undefined ? c.followingCount : (defaults?.followingCount ?? 0),
      postsCount: defaults?.postsCount ?? 0
    };
  }, [followMap]);

  const fetchFollowState = useCallback(async (targetUserId: string) => {
    if (!user || user.id === targetUserId) return;
    try {
      const res = await apiRequest<{ state: FollowButtonState; isFollowing: boolean; isRequested: boolean }>(
        `/follow/status/${targetUserId}`
      );
      setFollowMap(prev => ({
        ...prev,
        [targetUserId]: {
          ...prev[targetUserId],
          state: res.state
        }
      }));
    } catch {
      // Ignore
    }
  }, [user]);

  const refreshCounts = useCallback(async (userId: string) => {
    try {
      const followersRes = await apiRequest<{ users: any[] }>(`/follow/followers/${userId}`);
      const followingRes = await apiRequest<{ users: any[] }>(`/follow/following/${userId}`);

      setFollowMap(prev => ({
        ...prev,
        [userId]: {
          state: prev[userId]?.state || 'Follow',
          followersCount: followersRes.users.length,
          followingCount: followingRes.users.length
        }
      }));
    } catch {
      // Ignore
    }
  }, []);

  const toggleFollow = async (targetUserId: string): Promise<FollowButtonState> => {
    if (!user) throw new Error('Please login to follow users');

    const currentState = getFollowState(targetUserId);
    const optimisticNext: FollowButtonState = currentState === 'Following' || currentState === 'Requested' ? 'Follow' : 'Requested';

    setFollowMap(prev => ({
      ...prev,
      [targetUserId]: {
        ...prev[targetUserId],
        state: optimisticNext
      }
    }));

    try {
      const res = await apiRequest<{ status: FollowButtonState; followersCount: number; followingCount: number }>(
        `/follow/${targetUserId}`,
        { method: 'POST' }
      );

      setFollowMap(prev => ({
        ...prev,
        [targetUserId]: {
          state: res.status,
          followersCount: res.followersCount,
          followingCount: res.followingCount
        }
      }));

      refreshUser();
      return res.status;
    } catch (err) {
      setFollowMap(prev => ({
        ...prev,
        [targetUserId]: {
          ...prev[targetUserId],
          state: currentState
        }
      }));
      throw err;
    }
  };

  const acceptFollowRequest = async (targetUserId: string) => {
    const res = await apiRequest<{ success: boolean; followersCount: number; followingCount: number; requesterFollowingCount: number }>(
      `/follow/accept/${targetUserId}`,
      { method: 'POST' }
    );

    if (user?.id) {
      setFollowMap(prev => ({
        ...prev,
        [user.id]: {
          ...prev[user.id],
          followersCount: res.followersCount,
          followingCount: res.followingCount
        }
      }));
    }

    setFollowMap(prev => ({
      ...prev,
      [targetUserId]: {
        ...prev[targetUserId],
        followingCount: res.requesterFollowingCount
      }
    }));

    refreshUser();
  };

  const declineFollowRequest = async (targetUserId: string) => {
    const res = await apiRequest<{ success: boolean; followersCount: number; followingCount: number }>(
      `/follow/decline/${targetUserId}`,
      { method: 'POST' }
    );

    if (user?.id) {
      setFollowMap(prev => ({
        ...prev,
        [user.id]: {
          ...prev[user.id],
          followersCount: res.followersCount,
          followingCount: res.followingCount
        }
      }));
    }
  };

  return (
    <FollowContext.Provider
      value={{
        getFollowState,
        getCounts,
        getStats,
        toggleFollow,
        acceptFollowRequest,
        declineFollowRequest,
        fetchFollowState,
        refreshCounts,
        setFollowInfo
      }}
    >
      {children}
    </FollowContext.Provider>
  );
};

export const useFollow = () => {
  const context = useContext(FollowContext);
  if (!context) throw new Error('useFollow must be used within a FollowProvider');
  return context;
};
