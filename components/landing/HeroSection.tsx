'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HeroSection() {
    return (
        <section className="relative flex flex-col items-center justify-center pt-40 pb-20 px-6 overflow-hidden min-h-[85vh]">

            {/* Ambient Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] opacity-40" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto text-center space-y-10">

                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="inline-flex justify-center"
                >
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-indigo-200 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        Next-Gen Earning Platform
                    </span>
                </motion.div>

                {/* Headline */}
                <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1, ease: [0.2, 0.65, 0.3, 0.9] }}
                    className="text-5xl md:text-7xl lg:text-8xl font-display font-medium tracking-tight text-white leading-[1.1] text-balance"
                >
                    Shop Smart. <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-indigo-200">
                        Earn Big.
                    </span>
                </motion.h1>

                {/* Subheadline */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    className="max-w-2xl mx-auto text-lg md:text-xl text-white/60 leading-relaxed text-balance"
                >
                    The first gamified e-commerce platform where your daily activity turns into real rewards.
                    Complete tasks, earn coins, and shop for free.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
                >
                    <Link
                        href="/auth/register"
                        className="group relative px-8 py-4 bg-white text-thinkmart-deep font-semibold rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Start Earning
                            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </span>
                    </Link>
                    <Link
                        href="/shop"
                        className="px-8 py-4 text-white hover:text-white/80 font-medium transition-colors"
                    >
                        Explore Shop
                    </Link>
                </motion.div>

            </div>
        </section>
    );
}
