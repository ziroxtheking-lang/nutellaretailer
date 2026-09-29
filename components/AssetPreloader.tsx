import React, { useState, useEffect } from 'react';
import { ASSETS } from '../constants';

interface AssetPreloaderProps {
    onComplete: () => void;
}

const AssetPreloader: React.FC<AssetPreloaderProps> = ({ onComplete }) => {
    const [progress, setProgress] = useState(0);
    const [isDone, setIsDone] = useState(false);

    useEffect(() => {
        let loadedCount = 0;
        const totalAssets = ASSETS.length;

        const updateProgress = () => {
            loadedCount++;
            const newProgress = Math.round((loadedCount / totalAssets) * 100);
            setProgress(newProgress);

            if (loadedCount === totalAssets) {
                setTimeout(() => {
                    setIsDone(true);
                    setTimeout(onComplete, 800);
                }, 500);
            }
        };

        ASSETS.forEach((path) => {
            if (path.endsWith('.mp3') || path.endsWith('.wav')) {
                const audio = new Audio();
                audio.src = path;
                audio.oncanplaythrough = updateProgress;
                audio.onerror = updateProgress; // Skip if failed
            } else {
                const img = new Image();
                img.src = path;
                img.onload = updateProgress;
                img.onerror = updateProgress; // Skip if failed
            }
        });
    }, [onComplete]);

    return (
        <div className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0e1a2b] transition-all duration-1000 ${isDone ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100'}`}>
            <div className="relative flex flex-col items-center w-full max-w-md px-10">
                {/* Animated Background Glow */}
                <div className="absolute inset-0 bg-[#12b0e6] blur-[100px] opacity-10 animate-pulse"></div>

                {/* Logo/Icon */}
                <div className="w-24 h-24 mb-12 rounded-full bg-gradient-to-br from-[#12b0e6] to-[#01426a] flex items-center justify-center shadow-[0_0_40px_rgba(18,176,230,0.3)] animate-bounce-slow">
                    <span className="text-4xl">🌟</span>
                </div>

                <h1 className="text-2xl md:text-3xl font-montserrat font-bold text-white tracking-[0.3em] uppercase mb-10 text-center font-black">
                    L'EXCELLENCE NUTELLA
                </h1>

                {/* Progress Container */}
                <div className="w-full space-y-4">
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                        <div
                            className="h-full bg-gradient-to-r from-[#12b0e6] to-[#2d86c8] transition-all duration-500 rounded-full shadow-[0_0_15px_rgba(18,176,230,0.6)]"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>

                    <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-black">
                            Initialisation...
                        </span>
                        <span className="text-[10px] text-[#12b0e6] font-black font-mono">
                            {progress}%
                        </span>
                    </div>
                </div>

                {/* Footer Text */}
                <div className="mt-20 text-[8px] text-white/10 uppercase tracking-[1em] font-black">
                    Chargement des ressources
                </div>
            </div>
        </div>
    );
};

export default AssetPreloader;
