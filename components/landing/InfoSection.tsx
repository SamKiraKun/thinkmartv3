'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';

export default function InfoSection() {
    return (
        <section className="py-24 bg-thinkmart-deep px-6">
            <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">

                {/* Content */}
                <div className="order-2 lg:order-1">
                    <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-6">
                        Comprehensive solutions for modern shoppers.
                    </h2>
                    <p className="text-white/60 text-lg mb-8 leading-relaxed">
                        We&apos;ve rebuilt the e-commerce stack from the ground up to favor the user. From instant task rewards to a decentralized partner network, every feature is designed to put money back in your pocket.
                    </p>

                    <ul className="space-y-4 mb-10">
                        {[
                            "Zero-fee account creation",
                            "Daily login bonuses",
                            "Real-time wallet tracking",
                            "Secure bank withdrawals"
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-3 text-white/80">
                                <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </ul>

                    <button className="text-indigo-300 font-medium border-b border-indigo-300/30 pb-1 hover:border-indigo-300 transition-colors">
                        Read our full manifesto
                    </button>
                </div>

                {/* Visual */}
                <div className="order-1 lg:order-2 relative aspect-square lg:aspect-[4/3] rounded-3xl overflow-hidden bg-white/5 border border-white/10">
                    <Image
                        src="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800"
                        alt="Platform Preview"
                        fill
                        className="object-cover"
                    />
                    <div className="absolute inset-0 bg-indigo-900/20 mix-blend-multiply" />
                </div>

            </div>
        </section>
    );
}
