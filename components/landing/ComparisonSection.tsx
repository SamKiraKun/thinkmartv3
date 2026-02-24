'use client';

import { motion } from 'framer-motion';

export default function ComparisonSection() {
    return (
        <section className="py-24 bg-thinkmart-deep px-6 border-y border-white/5">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-display font-medium text-white mb-2">The ThinkMart Difference</h2>
                    <p className="text-white/50">Stop spending. Start investing in your lifestyle.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 container-narrow mx-auto">

                    {/* Before */}
                    <div className="relative group overflow-hidden rounded-3xl bg-white/5 border border-white/5 p-8 text-center grayscale opacity-70 hover:opacity-100 hover:grayscale-0 transition-all duration-500">
                        <div className="absolute top-4 left-4 text-xs font-bold text-white/40 tracking-widest uppercase">Traditional</div>
                        <div className="mt-8 mb-6">
                            <div className="text-5xl font-bold text-white mb-2">₹5,000</div>
                            <div className="text-sm text-red-300">Spent on Monthly Essentials</div>
                        </div>
                        <p className="text-white/40 text-sm">Money gone forever. No returns. Zero growth.</p>
                    </div>

                    {/* After */}
                    <div className="relative overflow-hidden rounded-3xl bg-indigo-600 p-8 text-center transform md:scale-105 shadow-2xl shadow-indigo-500/20 z-10">
                        <div className="absolute top-4 left-4 text-xs font-bold text-white/60 tracking-widest uppercase">ThinkMart</div>
                        <div className="absolute top-0 right-0 p-3 bg-white/10 rounded-bl-2xl text-white text-xs font-bold">WINNER</div>

                        <div className="mt-8 mb-6">
                            <div className="flex items-center justify-center gap-3 mb-2">
                                <span className="text-5xl font-bold text-white">₹2,500</span>
                                <span className="text-lg text-indigo-200 line-through opacity-70">₹5k</span>
                            </div>
                            <div className="text-sm text-indigo-100">+ 1000 Coins Earned</div>
                        </div>
                        <p className="text-white/80 text-sm">Save 50% using coins. Earn cashback for next time.</p>
                    </div>

                </div>
            </div>
        </section>
    );
}
