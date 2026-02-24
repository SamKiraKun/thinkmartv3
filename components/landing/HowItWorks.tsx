'use client';

import { motion } from 'framer-motion';

const STEPS = [
    {
        num: '01',
        title: 'Join & Verify',
        description: 'Create your account and complete simple KYC verification to unlock full earning potential.',
    },
    {
        num: '02',
        title: 'Complete Tasks',
        description: 'Spend a few minutes daily spinning the wheel, watching videos, or inviting friends.',
    },
    {
        num: '03',
        title: 'Earn Coins',
        description: 'Watch your wallet grow instantly with every task completed. Track earnings in real-time.',
    },
    {
        num: '04',
        title: 'Shop or Withdraw',
        description: 'Use coins to get discounts on premium products, or withdraw cash directly to your bank.',
    },
];

export default function HowItWorks() {
    return (
        <section className="py-32 bg-[#2b2f7a] relative overflow-hidden">
            {/* Background gradients */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="max-w-7xl mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="mb-20"
                >
                    <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-6">
                        Earning made simple.
                    </h2>
                    <p className="text-white/60 text-lg max-w-xl">
                        A transparent ecosystem designed to reward your tie and network.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
                    {STEPS.map((step, index) => (
                        <motion.div
                            key={step.num}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="relative"
                        >
                            {/* Line connector (Desktop) */}
                            {index !== STEPS.length - 1 && (
                                <div className="hidden lg:block absolute top-8 left-16 right-0 h-[1px] bg-gradient-to-r from-white/20 to-transparent" />
                            )}

                            <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center text-xl font-display font-medium text-white mb-6 bg-white/5 backdrop-blur-sm">
                                {step.num}
                            </div>

                            <h3 className="text-xl font-medium text-white mb-3">
                                {step.title}
                            </h3>
                            <p className="text-white/60 leading-relaxed text-sm">
                                {step.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
