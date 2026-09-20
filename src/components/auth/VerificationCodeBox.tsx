import React from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';

interface VerificationCodeBoxProps {
  code: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const VerificationCodeBox: React.FC<VerificationCodeBoxProps> = ({
  code,
  onRefresh,
  isRefreshing = false
}) => {
  // Split code into individual characters for styled presentation
  const chars = (code || '------').split('');

  // Predefined subtle rotations for captcha character styling
  const rotations = [-4, 3, -2, 5, -3, 2];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-700" />
          <span>Security Verification Code</span>
        </label>
        <span className="text-[10px] text-gray-500">Case-insensitive</span>
      </div>

      <div 
        id="verification-code-display-box"
        className="relative flex items-center justify-between p-3 bg-gradient-to-r from-zinc-100 via-gray-100 to-zinc-200 border border-zinc-300 rounded-2xl overflow-hidden shadow-inner select-none"
      >
        {/* Background decorative security pattern */}
        <svg 
          className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="0" y1="15" x2="100%" y2="25" stroke="#000" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1="0" y1="35" x2="100%" y2="10" stroke="#555" strokeWidth="1" strokeDasharray="6 3" />
          <circle cx="25%" cy="30%" r="18" fill="none" stroke="#666" strokeWidth="0.75" />
          <circle cx="75%" cy="65%" r="14" fill="none" stroke="#666" strokeWidth="0.75" />
        </svg>

        {/* The randomized verification code characters */}
        <div className="flex items-center space-x-2 pl-2 z-10">
          {chars.map((char, index) => {
            const rot = rotations[index % rotations.length];
            return (
              <span
                key={index}
                style={{ transform: `rotate(${rot}deg)` }}
                className="inline-block text-xl font-black font-mono tracking-wider text-zinc-800 drop-shadow-xs"
              >
                {char}
              </span>
            );
          })}
        </div>

        {/* Refresh button to randomize code anytime */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Generate new verification code"
          aria-label="Generate new verification code"
          className="z-10 p-2 text-zinc-600 hover:text-black hover:bg-white/80 active:scale-95 bg-white/50 border border-zinc-200 rounded-xl transition-all shadow-xs cursor-pointer flex items-center space-x-1"
        >
          <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-bold text-zinc-700 hidden sm:inline">New code</span>
        </button>
      </div>
    </div>
  );
};
