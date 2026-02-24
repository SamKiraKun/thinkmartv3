'use client';

import { motion } from 'framer-motion';

interface PreloaderProps {
    progress: number;
}

export default function Preloader({ progress }: PreloaderProps) {
    const percentage = Math.round(progress * 100);

    return (
        <motion.div
            className="fixed inset-0 z-50 bg-[#2b2f7a] text-white flex flex-col items-center justify-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: progress === 1 ? 0 : 1 }}
            transition={{ duration: 0.8, ease: "easeInOut", delay: 0.2 }}
            style={{ pointerEvents: progress === 1 ? 'none' : 'auto' }}
        >
            <div className="w-64 space-y-4">
                <div className="flex justify-between text-sm font-medium tracking-wider uppercase text-indigo-200">
                    <span>Loading Experience</span>
                    <span>{percentage}%</span>
                </div>

                {/* Progress Bar Track */}
                <div className="h-1 bg-indigo-900/50 rounded-full overflow-hidden">
                    {/* Progress Bar Fill */}
                    <motion.div
                        className="h-full bg-indigo-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ type: "spring", stiffness: 50 }}
                    />
                </div>

                <p className="text-xs text-center text-indigo-300/50 mt-4 animate-pulse">
                    Preparing your store...
                </p>
            </div>
        </motion.div>
    );
}
