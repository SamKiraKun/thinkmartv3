'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Truck, Zap, Lock, Globe, RefreshCcw } from 'lucide-react';

const DETAILS = [
    {
        icon: ShieldCheck,
        title: 'Secure Payouts',
        description: 'Withdrawals are processed securely with risk analysis and fraud prevention.',
        colSpan: "md:col-span-2",
    },
    {
        icon: Zap,
        title: 'Instant Credits',
        description: 'Task rewards and referral bonuses are credited to your wallet in real-time.',
        colSpan: "md:col-span-1",
    },
    {
        icon: Globe,
        title: 'Verified Partners',
        description: 'We partner with trusted brands to ensure product authenticity.',
        colSpan: "md:col-span-1",
    },
    {
        icon: Lock,
        title: 'Transparent Ledger',
        description: 'Every coin earned and spent is tracked in your transaction history. No hidden deductions.',
        colSpan: "md:col-span-2",
    }
];

export default function TrustSection() {
    return (
        <section className="py-32 bg-thinkmart-deep border-t border-white/5">
            <div className="container-narrow">

                <div className="text-center mb-20">
                    <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-6">
                        Your trust, our priority.
                    </h2>
                    <p className="text-lg text-white/60">
                        A secure platform built for long-term growth and rewards.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {DETAILS.map((item, index) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={`p-8 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-colors ${item.colSpan}`}
                        >
                            <item.icon className="w-8 h-8 text-white/80 mb-6" />
                            <h3 className="text-xl font-medium text-white mb-3">
                                {item.title}
                            </h3>
                            <p className="text-white/60 leading-relaxed">
                                {item.description}
                            </p>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}
