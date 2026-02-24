'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Star } from 'lucide-react';

export default function TestimonialsSection() {
    return (
        <section className="py-24 bg-thinkmart-deep px-6 overflow-hidden">
            <div className="max-w-7xl mx-auto">

                <div className="grid lg:grid-cols-2 gap-16 items-center">

                    {/* Image Side */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="relative"
                    >
                        <div className="aspect-square relative rounded-3xl overflow-hidden">
                            <Image
                                src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800"
                                alt="Happy Customer"
                                fill
                                className="object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                            <div className="absolute bottom-8 left-8">
                                <div className="flex gap-1 mb-2">
                                    {[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />)}
                                </div>
                                <p className="text-white font-medium">Verified Purchase</p>
                            </div>
                        </div>

                        {/* Decorative Elements */}
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-500 rounded-full blur-[40px] opacity-50" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-purple-500 rounded-full blur-[50px] opacity-40" />
                    </motion.div>

                    {/* Content Side */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                    >
                        <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-8 leading-tight">
                            &quot;ThinkMart completely changed how I budget for luxury items.&quot;
                        </h2>
                        <p className="text-xl text-white/60 mb-8 leading-relaxed">
                            I used to feel guilty buying premium skincare. Now, I just complete my daily tasks, earn coins, and get them for free. It feels like a cheat code for shopping.
                        </p>

                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-white/10 relative overflow-hidden">
                                <Image src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=100" alt="Sarah J" fill className="object-cover" />
                            </div>
                            <div>
                                <p className="text-white font-bold">Sarah Jenkins</p>
                                <p className="text-indigo-300 text-sm">City Partner, Sydney</p>
                            </div>
                        </div>
                    </motion.div>

                </div>

            </div>
        </section>
    );
}
