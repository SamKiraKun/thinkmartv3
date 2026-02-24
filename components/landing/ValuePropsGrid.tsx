'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Zap, HeartHandshake, BadgeCheck } from 'lucide-react';

const VALUES = [
    {
        icon: ShieldCheck,
        title: "Secure Payments",
        desc: "Bank-grade encryption for every transaction."
    },
    {
        icon: Zap,
        title: "Instant Rewards",
        desc: "Coins credited to your wallet in real-time."
    },
    {
        icon: BadgeCheck,
        title: "Verified Products",
        desc: "100% authentic items from trusted brands."
    },
    {
        icon: HeartHandshake,
        title: "24/7 Support",
        desc: "Always here to help you succeed."
    }
];

export default function ValuePropsGrid() {
    return (
        <section className="py-20 bg-thinkmart-deep px-6 border-b border-white/5">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
                    {VALUES.map((item, index) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="flex flex-col items-start"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-300 mb-6">
                                <item.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">{item.title}</h3>
                            <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
