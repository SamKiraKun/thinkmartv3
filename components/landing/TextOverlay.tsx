'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function TextOverlay() {
    const { scrollYProgress } = useScroll();

    // Opacity Transforms for sections
    // Frame 1: 0 - 25%
    const opacity1 = useTransform(scrollYProgress, [0, 0.15, 0.20], [1, 1, 0]);
    const y1 = useTransform(scrollYProgress, [0, 0.15], [0, -40]);

    // Frame 2: 25% - 50%
    const opacity2 = useTransform(scrollYProgress, [0.25, 0.35, 0.45], [0, 1, 0]);
    const x2 = useTransform(scrollYProgress, [0.25, 0.35], [-40, 0]);

    // Frame 3: 50% - 75%
    const opacity3 = useTransform(scrollYProgress, [0.50, 0.60, 0.70], [0, 1, 0]);
    const x3 = useTransform(scrollYProgress, [0.50, 0.60], [40, 0]);

    // Frame 4: 75% - 100%
    const opacity4 = useTransform(scrollYProgress, [0.75, 0.85], [0, 1]);
    const scale4 = useTransform(scrollYProgress, [0.75, 0.85], [0.95, 1]);

    return (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center h-screen w-full">
            <div className="relative w-full max-w-7xl px-6 h-full flex flex-col justify-center">

                {/* Frame 1: Intro */}
                <motion.div
                    style={{ opacity: opacity1, y: y1 }}
                    className="absolute inset-0 flex items-center justify-center p-4"
                >
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-semibold text-white/90 tracking-tight text-center leading-[1.1]">
                        A better way to<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">shop online.</span>
                    </h1>
                </motion.div>

                {/* Frame 2: Discovery */}
                <motion.div
                    style={{ opacity: opacity2, x: x2 }}
                    className="absolute inset-0 flex items-center justify-start md:pl-20 p-4"
                >
                    <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium text-white/90 tracking-tight max-w-2xl text-left leading-[1.1]">
                        Discover products<br />
                        <span className="text-white/60">you actually want.</span>
                    </h2>
                </motion.div>

                {/* Frame 3: Cart */}
                <motion.div
                    style={{ opacity: opacity3, x: x3 }}
                    className="absolute inset-0 flex items-center justify-end md:pr-20 p-4"
                >
                    <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium text-white/90 tracking-tight max-w-2xl text-right leading-[1.1]">
                        Add to cart.<br />
                        <span className="text-white/60">Checkout securely.</span>
                    </h2>
                </motion.div>

                {/* Frame 4: CTA */}
                <motion.div
                    style={{ opacity: opacity4, scale: scale4 }}
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto p-4"
                >
                    <h2 className="text-5xl md:text-7xl font-display font-bold text-white mb-8 tracking-tight text-center">
                        ThinkMart
                    </h2>
                    <Link
                        href="/auth/register"
                        className="group relative px-8 py-4 bg-white text-thinkmart-deep font-semibold text-lg rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.7)] active:scale-95"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Start Shopping
                            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                        </span>
                    </Link>
                    <Link
                        href="/products"
                        className="mt-6 text-white/60 hover:text-white transition-colors text-sm font-medium tracking-wide uppercase"
                    >
                        Browse Products
                    </Link>
                </motion.div>

            </div>
        </div>
    );
}
