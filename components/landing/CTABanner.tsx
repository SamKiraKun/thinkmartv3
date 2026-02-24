'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function CTABanner() {
    return (
        <section className="py-20 px-6">
            <div className="max-w-7xl mx-auto">

                <div className="relative rounded-[3rem] overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-20 md:py-32 text-center">

                    {/* Background Texture */}
                    <div className="absolute inset-0 opacity-20">
                        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white rounded-full blur-[100px]" />
                        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-pink-500 rounded-full blur-[100px]" />
                    </div>

                    <div className="relative z-10 max-w-3xl mx-auto">
                        <h2 className="text-4xl md:text-6xl font-display font-medium text-white mb-8 tracking-tight">
                            Start your earning journey today.
                        </h2>
                        <p className="text-xl text-indigo-100 mb-10 max-w-xl mx-auto">
                            Join 10,000+ members who are shopping smarter and living better.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href="/auth/register"
                                className="px-8 py-4 bg-white text-indigo-600 font-bold rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl"
                            >
                                Create Free Account
                            </Link>
                            <Link
                                href="/about"
                                className="px-8 py-4 text-white font-medium hover:text-indigo-100 flex items-center gap-2"
                            >
                                Learn more <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>

                </div>

            </div>
        </section>
    );
}
