import React from 'react';
import { UserPlus, UserMinus, ShieldCheck, ShieldAlert, Edit2, Camera, Sparkles, LogOut } from 'lucide-react';
import { Message } from '../../types';

interface SystemMessageBubbleProps {
  message: Message;
}

export const SystemMessageBubble: React.FC<SystemMessageBubbleProps> = ({ message }) => {
  const getIcon = () => {
    switch (message.systemEventType) {
      case 'MEMBER_ADDED':
        return <UserPlus className="w-3 h-3 text-emerald-600" />;
      case 'MEMBER_REMOVED':
        return <UserMinus className="w-3 h-3 text-red-500" />;
      case 'MEMBER_LEFT':
        return <LogOut className="w-3 h-3 text-amber-500" />;
      case 'ADMIN_PROMOTED':
        return <ShieldCheck className="w-3 h-3 text-blue-500" />;
      case 'ADMIN_DEMOTED':
        return <ShieldAlert className="w-3 h-3 text-zinc-500" />;
      case 'GROUP_RENAMED':
        return <Edit2 className="w-3 h-3 text-purple-500" />;
      case 'GROUP_PHOTO_CHANGED':
        return <Camera className="w-3 h-3 text-indigo-500" />;
      case 'GROUP_CREATED':
      default:
        return <Sparkles className="w-3 h-3 text-amber-500" />;
    }
  };

  return (
    <div className="flex justify-center my-3 w-full animate-in fade-in duration-150">
      <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-zinc-100/90 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/50 rounded-full shadow-2xs max-w-[90%] text-center">
        <span className="shrink-0">{getIcon()}</span>
        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 leading-tight">
          {message.text}
        </span>
      </div>
    </div>
  );
};
