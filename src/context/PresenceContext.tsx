import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from './AuthContext';

interface PresenceContextType {
  onlineUserIds: string[];
  isUserOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  const checkPresence = async () => {
    try {
      const res = await apiRequest<{ onlineUserIds: string[] }>('/presence/online');
      setOnlineUserIds(res.onlineUserIds || []);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    checkPresence();
    const interval = setInterval(checkPresence, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const isUserOnline = (userId: string) => {
    return onlineUserIds.includes(userId);
  };

  return (
    <PresenceContext.Provider value={{ onlineUserIds, isUserOnline }}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = () => {
  const context = useContext(PresenceContext);
  if (!context) throw new Error('usePresence must be used within a PresenceProvider');
  return context;
};
