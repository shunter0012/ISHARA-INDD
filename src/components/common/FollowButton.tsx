import React, { useState, useEffect } from 'react';
import { useFollow } from '../../context/FollowContext';
import { useAuth } from '../../context/AuthContext';
import { FollowButtonState } from '../../types/index';
import { UserCheck, UserPlus, Clock } from 'lucide-react';

interface FollowButtonProps {
  targetUserId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  onFollowChange?: (newState: FollowButtonState) => void;
}

export const FollowButton: React.FC<FollowButtonProps> = ({
  targetUserId,
  className = '',
  size = 'md',
  showIcon = true,
  onFollowChange
}) => {
  const { user } = useAuth();
  const { getFollowState, toggleFollow, fetchFollowState } = useFollow();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (targetUserId && user && user.id !== targetUserId) {
      fetchFollowState(targetUserId);
    }
  }, [targetUserId, user?.id, fetchFollowState]);

  const state = getFollowState(targetUserId);

  if (user?.id === targetUserId) {
    return null;
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const nextState = await toggleFollow(targetUserId);
      onFollowChange?.(nextState);
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs font-semibold rounded-lg',
    md: 'px-3.5 py-1.5 text-xs font-semibold rounded-xl',
    lg: 'px-5 py-2 text-sm font-bold rounded-xl'
  }[size];

  if (state === 'Following') {
    return (
      <button
        type="button"
        id={`follow-btn-${targetUserId}`}
        disabled={loading}
        onClick={handleClick}
        className={`flex items-center justify-center space-x-1.5 bg-[#F0F0F0] hover:bg-red-50 text-[#1A1A1A] hover:text-[#FF3B30] border border-[#E0E0E0] hover:border-red-200 transition-all ${sizeClasses} ${className} disabled:opacity-50`}
        title="Unfollow"
      >
        {showIcon && <UserCheck className="w-3.5 h-3.5" />}
        <span>Following</span>
      </button>
    );
  }

  if (state === 'Requested') {
    return (
      <button
        type="button"
        id={`follow-btn-${targetUserId}`}
        disabled={loading}
        onClick={handleClick}
        className={`flex items-center justify-center space-x-1.5 bg-[#F9F9F9] hover:bg-gray-200 text-[#666666] border border-[#E0E0E0] transition-all ${sizeClasses} ${className} disabled:opacity-50`}
        title="Cancel Follow Request"
      >
        {showIcon && <Clock className="w-3.5 h-3.5 animate-pulse" />}
        <span>Requested</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      id={`follow-btn-${targetUserId}`}
      disabled={loading}
      onClick={handleClick}
      className={`flex items-center justify-center space-x-1.5 bg-[#1A1A1A] hover:bg-black text-white shadow-xs transition-all active:scale-95 ${sizeClasses} ${className} disabled:opacity-50`}
    >
      {showIcon && <UserPlus className="w-3.5 h-3.5" />}
      <span>Follow</span>
    </button>
  );
};
