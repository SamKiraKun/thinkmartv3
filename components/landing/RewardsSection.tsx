'use client';

import { motion } from 'framer-motion';

export default function RewardsSection() {
    return (
        <section className="py-24 bg-[#262a6e]">
            <div className="max-w-4xl mx-auto px-6 text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="p-12 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/10"
                >
                    <div className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-white/90 text-sm font-medium mb-6 backdrop-blur-md">
                        ThinkMart Rewards
                    </div>

                    <h2 className="text-3xl md:text-4xl font-display font-medium text-white mb-6">
                        Earn while you shop. Automatically.
                    </h2>

                    <p className="text-white/60 text-lg leading-relaxed max-w-xl mx-auto mb-10">
                        No complicated point systems or hidden tiers. Just shop as usual and watch your rewards grow. Use them whenever you want.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
                        <div className="flex flex-col items-center">
                            <span className="text-3xl md:text-4xl font-bold text-white mb-1">1%</span>
                            <span className="text-white/50 text-sm uppercase tracking-wider">Cashback</span>
                        </div>
                        <div className="w-px h-12 bg-white/10 hidden md:block" />
                        <div className="flex flex-col items-center">
                            <span className="text-3xl md:text-4xl font-bold text-white mb-1">∞</span>
                            <span className="text-white/50 text-sm uppercase tracking-wider">No Expiry</span>
                        </div>
                        <div className="w-px h-12 bg-white/10 hidden md:block" />
                        <div className="flex flex-col items-center">
                            <span className="text-3xl md:text-4xl font-bold text-white mb-1">0</span>
                            <span className="text-white/50 text-sm uppercase tracking-wider">Fees</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
