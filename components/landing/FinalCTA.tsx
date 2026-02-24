'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function FinalCTA() {
    return (
        <section className="relative py-32 bg-thinkmart-deep overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-gradient-to-t from-indigo-900/40 to-transparent" />
            </div>

            <div className="container-narrow relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                >
                    <h2 className="text-4xl md:text-6xl font-display font-medium text-white mb-8 tracking-tight text-balance">
                        Ready to experience the future of shopping?
                    </h2>
                    <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">
                        Join thousands of users who are earning rewards and discovering premium products every day.
                    </p>

                    <Link
                        href="/auth/register"
                        className="group inline-flex items-center gap-2 px-8 py-4 bg-white text-thinkmart-deep font-semibold text-lg rounded-full transition-all hover:scale-105 active:scale-95"
                    >
                        Start Shopping Now
                        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Link>

                    <p className="mt-8 text-sm text-white/40">
                        No credit card required to browse.
                    </p>
                </motion.div>
            </div>
        </section>
    );
}
