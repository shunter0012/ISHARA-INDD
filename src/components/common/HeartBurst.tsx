import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

interface HeartBurstProps {
  show: boolean;
  size?: number;
}

export const HeartBurst: React.FC<HeartBurstProps> = ({ show, size = 96 }) => {
  if (!show) return null;

  // 8 radial particles
  const particleAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        <div className="relative flex items-center justify-center">
          {/* Main Heart with Spring Bounce */}
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -15 }}
            animate={{
              scale: [0, 1.35, 0.95, 1.1, 1, 0.8],
              opacity: [0, 1, 1, 1, 0.9, 0],
              rotate: [-15, 0, 5, -2, 0, 0],
              y: [20, 0, -5, 0, -20]
            }}
            transition={{
              duration: 0.85,
              ease: [0.175, 0.885, 0.32, 1.275]
            }}
            className="relative z-10"
          >
            <Heart
              style={{ width: size, height: size }}
              className="fill-red-500 text-red-500 filter drop-shadow-[0_10px_25px_rgba(239,68,68,0.65)]"
            />
          </motion.div>

          {/* Micro Particles Eruption */}
          {particleAngles.map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const distance = size * 0.75;
            const targetX = Math.cos(rad) * distance;
            const targetY = Math.sin(rad) * distance;

            return (
              <motion.div
                key={i}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{
                  scale: [0, 1.2, 0],
                  x: [0, targetX],
                  y: [0, targetY],
                  opacity: [1, 0.9, 0]
                }}
                transition={{
                  duration: 0.65,
                  delay: 0.08,
                  ease: 'easeOut'
                }}
                className={`absolute w-3 h-3 rounded-full ${
                  i % 3 === 0 
                    ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' 
                    : i % 3 === 1 
                      ? 'bg-rose-400 shadow-[0_0_8px_#fb7185]' 
                      : 'bg-amber-300 shadow-[0_0_8px_#fde047]'
                }`}
              />
            );
          })}
        </div>
      </AnimatePresence>
    </div>
  );
};
