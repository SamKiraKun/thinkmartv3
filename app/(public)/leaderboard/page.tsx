'use client';

import { motion } from 'framer-motion';
import LeaderboardTable from '@/components/leaderboard/LeaderboardTable';
import PulseTicker from '@/components/leaderboard/PulseTicker';

export default function LeaderboardPage() {
    return (
        <main className="min-h-screen bg-[#2b2f7a] selection:bg-indigo-500/30 selection:text-white pb-32">

            {/* 
        HERO SECTION 
        "Minimalism with purpose" - Clean typography, focused message.
      */}
            <section className="relative pt-40 pb-20 px-6 overflow-hidden">
                {/* Ambient Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none opacity-50" />

                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <h1 className="text-5xl md:text-7xl font-display font-medium text-white tracking-tight mb-6">
                            Champions of <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-white">ThinkMart</span>
                        </h1>
                        <p className="text-lg md:text-xl text-indigo-200/60 max-w-2xl mx-auto leading-relaxed">
                            Celebrating the hustlers, the earners, and the believers.
                            See who&apos;s leading the revolution this week.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* 
        PULSE TICKER
        "Subtle, purpose-driven motion" - Shows platform activity without being loud.
      */}
            <section className="mb-20">
                <PulseTicker />
            </section>

            {/* 
        LEADERBOARD TABLE
        "Clarity over decoration" - Focused data visualization.
      */}
            <section className="px-4 md:px-6">
                <LeaderboardTable />
            </section>

            {/* 
        CTA SECTION
        "Final Call to Action: Simple, focused, reassuring" 
      */}
            <section className="mt-32 text-center px-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1 }}
                >
                    <h2 className="text-2xl font-medium text-white mb-6">Ready to climb the ranks?</h2>
                    <button className="px-8 py-3 bg-white text-[#2b2f7a] font-semibold rounded-full hover:bg-indigo-50 transition-all transform hover:scale-105 active:scale-95 duration-300">
                        Start Earning Now
                    </button>
                </motion.div>
            </section>

        </main>
    );
}
