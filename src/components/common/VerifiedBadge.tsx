import React from 'react';
import { Check } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ 
  size = 'sm',
  className = '' 
}) => {
  const sizeClasses = {
    xs: 'w-3 h-3 min-w-3 min-h-3',
    sm: 'w-3.5 h-3.5 min-w-3.5 min-h-3.5',
    md: 'w-4 h-4 min-w-4 min-h-4',
    lg: 'w-5 h-5 min-w-5 min-h-5'
  };

  const iconSizes = {
    xs: 'w-2 h-2 stroke-[3]',
    sm: 'w-2.5 h-2.5 stroke-[3]',
    md: 'w-2.5 h-2.5 stroke-[3.5]',
    lg: 'w-3 h-3 stroke-[3.5]'
  };

  return (
    <span 
      title="Verified Account"
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 via-orange-500 to-amber-400 text-white shadow-xs shrink-0 select-none ${sizeClasses[size]} ${className}`}
    >
      <Check className={`${iconSizes[size]} text-white`} />
    </span>
  );
};
