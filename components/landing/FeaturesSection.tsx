'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Check } from 'lucide-react';

const FEATURES = [
    {
        title: "Play & Earn Daily",
        description: "Turn your spare time into profit. Complete simple tasks like spinning the wheel, opening lucky boxes, or watching videos to earn coins instantly.",
        image: "https://images.unsplash.com/photo-1616077168712-fc6c7eb8cad8?auto=format&fit=crop&q=80&w=1200", // Gamification/Rewards abstract
        points: ["Daily Spin Wheel", "Lucky Box Rewards", "Video Ads Tasks"],
        align: "right"
    },
    {
        title: "Hybrid Shopping Wallet",
        description: "Why pay full price? Use your collected coins to pay for up to 50% of your product value. A flexible wallet system designed for savings.",
        image: "https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?auto=format&fit=crop&q=80&w=1200", // Shopping/Wallet
        points: ["Split Payment (Cash + Coins)", "Secure Withdrawals", "No Hidden Fees"],
        align: "left"
    },
    {
        title: "Grow Your Network",
        description: "Refer friends and build your team. Earn commissions from every active member in your downline up to 10 levels deep.",
        image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&q=80&w=1200", // Team/Network
        points: ["Direct Referral Bonus", "Multi-Level Income", "City Partner Dashboard"],
        align: "right"
    }
];

export default function FeaturesSection() {
    return (
        <section className="py-32 bg-thinkmart-deep overflow-hidden">
            <div className="container-wide">
                <div className="flex flex-col gap-32">
                    {FEATURES.map((feature, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8 }}
                            className={`flex flex-col ${feature.align === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-24`}
                        >
                            {/* Text Content */}
                            <div className="flex-1 space-y-8">
                                <h2 className="text-3xl md:text-5xl font-display font-medium tracking-tight text-white leading-[1.1]">
                                    {feature.title}
                                </h2>
                                <p className="text-lg text-white/60 leading-relaxed max-w-xl">
                                    {feature.description}
                                </p>
                                <div className="space-y-4">
                                    {feature.points.map((point, i) => (
                                        <div key={i} className="flex items-center gap-3 text-white/80">
                                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-white">
                                                <Check className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="font-medium">{point}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Visual Asset */}
                            <div className="flex-1 w-full relative group">
                                <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-white/5 border border-white/10 sm:aspect-[16/9] lg:aspect-[4/3]">
                                    <Image
                                        src={feature.image}
                                        alt={feature.title}
                                        fill
                                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                    {/* Subtle sheen effect */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                </div>

                                {/* Decorative Elements */}
                                <div className={`absolute -bottom-8 ${feature.align === 'left' ? '-left-8' : '-right-8'} -z-10 w-full h-full border border-white/5 rounded-3xl`}></div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
