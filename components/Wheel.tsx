
import React, { useState, useCallback, useRef } from 'react';
import { LotConfig } from '../types';
import { useLoadedImages } from './useLoadedImages';

interface WheelProps {
  // The prizes around the wheel, clockwise, starting with the slice under the pointer
  // at rest. Must match the number of slices printed on WHEEL_IMAGE.
  lots: LotConfig[];
  onSpinEnd: (lot: LotConfig) => void;
  isSpinning: boolean;
  setIsSpinning: (val: boolean) => void;
  targetLotId: string;
}

// The wheel artwork: 7 equal slices, rim and centre hub are part of the image.
const WHEEL_IMAGE = '/assets/images/wheelspin.png';
// Angle (degrees, clockwise from "3 o'clock") where the first slice of WHEEL_IMAGE begins.
// Measured from the image: its divider lines sit at 2.7 + k * 51.43 degrees, and the
// slice starting at 259.8 degrees is the one under the pointer (top) at rest.
const FIRST_SLICE_START = 259.8;
// Prize photo placement inside a slice (SVG units, wheel radius = 50).
const PRIZE_RADIUS = 28;
const PRIZE_SIZE = 23;

const Wheel: React.FC<WheelProps> = ({ lots, onSpinEnd, isSpinning, setIsSpinning, targetLotId }) => {
  const [rotation, setRotation] = useState(0);
  const spinSoundRef = useRef<HTMLAudioElement>(new Audio('/assets/sounds/spin.mp3'));

  const sliceSize = 360 / lots.length;
  const sliceCenter = (i: number) => FIRST_SLICE_START + i * sliceSize + sliceSize / 2;
  const loadedImages = useLoadedImages(lots.map(l => l.image));

  const spin = useCallback(() => {
    if (isSpinning) return;
    const targetIndex = lots.findIndex(l => l.id === targetLotId);
    if (targetIndex < 0) return;
    setIsSpinning(true);

    // Bring the middle of the target slice under the pointer (270 degrees = top).
    const extraSpins = 12 * 360;
    setRotation(extraSpins + (270 - sliceCenter(targetIndex)));

    spinSoundRef.current.currentTime = 0;
    spinSoundRef.current.play().catch(e => console.log("Audio play failed:", e));

    setTimeout(() => {
      setIsSpinning(false);
      onSpinEnd(lots[targetIndex]);
    }, 4500);
  }, [isSpinning, setIsSpinning, onSpinEnd, targetLotId, lots, sliceSize]);

  return (
    <div className="relative flex flex-col items-center justify-center w-full mx-auto p-2 md:p-4">
      {/* Pointer - static at the top */}
      <img src="/assets/images/tringle.png" alt=""
        className="absolute top-0 md:top-[-6px] z-50 pointer-events-none w-12 md:w-16 lg:w-20 h-auto drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" />

      <div className="relative w-full aspect-square max-w-[380px] md:max-w-[540px] lg:max-w-[640px]">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full transition-transform duration-[4500ms] ease-[cubic-bezier(0.1,0,0.1,1)] overflow-visible drop-shadow-[0_20px_30px_rgba(0,0,0,0.35)]"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <image href={WHEEL_IMAGE} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />

          {/* Prize photos (or names until a photo exists), one per printed slice */}
          {lots.map((lot, i) => {
            const angle = sliceCenter(i);
            const hasImage = !!lot.image && loadedImages.has(lot.image);
            const lines = lot.labelAr.split('\n');
            const longest = Math.max(...lines.map(l => l.length));
            const fontSize = longest > 12 ? 2.8 : longest > 9 ? 3.3 : 3.9;
            // Text on the left half would read upside down at rest: turn it half a turn.
            const normalized = ((angle % 360) + 360) % 360;
            const flip = !hasImage && normalized > 90 && normalized < 270 ? ` rotate(180, ${50 + PRIZE_RADIUS}, 50)` : '';
            return (
              <g key={lot.id} transform={`rotate(${angle}, 50, 50)${flip}`}>
                {hasImage ? (
                  <image href={lot.image} x={50 + PRIZE_RADIUS - PRIZE_SIZE / 2} y={50 - PRIZE_SIZE / 2}
                    width={PRIZE_SIZE} height={PRIZE_SIZE}
                    preserveAspectRatio="xMidYMid meet" transform={`rotate(90, ${50 + PRIZE_RADIUS}, 50)`}
                    style={{ filter: 'drop-shadow(0 0.8px 1.4px rgba(0,0,0,0.45))' }} />
                ) : (
                  <text x={50 + PRIZE_RADIUS} y={50} textAnchor="middle" dominantBaseline="middle"
                    fill={lot.textColor} fontSize={fontSize} fontWeight={900}
                    direction="rtl" style={{ fontFamily: "'Cairo', 'Fredoka', sans-serif" }}>
                    {lines.map((line, j) => (
                      <tspan key={j} x={50 + PRIZE_RADIUS} dy={j === 0 ? `${-(lines.length - 1) * 0.55}em` : '1.1em'}>{line}</tspan>
                    ))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <button
        onClick={spin}
        disabled={isSpinning}
        className={`mt-8 md:mt-14 w-full max-w-[280px] md:max-w-[340px] py-4 md:py-6 rounded-[1.5rem] md:rounded-3xl text-xl md:text-3xl font-black transition-all duration-300 btn-3d shadow-2xl md:shadow-3xl
          ${isSpinning
            ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-70 scale-95'
            : 'nutella-gradient text-white hover:scale-105 active:scale-95 active:translate-y-1'
          }`}
      >
        {isSpinning ? 'كتدور...' : 'دوّر العجلة'}
      </button>
    </div>
  );
};

export default Wheel;
