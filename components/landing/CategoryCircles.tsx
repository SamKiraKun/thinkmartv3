'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const CATEGORIES = [
    { name: "Electronics", image: "https://images.unsplash.com/photo-1498049860654-af1a5c5668ba?auto=format&fit=crop&q=80&w=200" },
    { name: "Fashion", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=200" },
    { name: "Home", image: "https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&q=80&w=200" },
    { name: "Beauty", image: "https://images.unsplash.com/photo-1522335789203-abd652327216?auto=format&fit=crop&q=80&w=200" },
    { name: "Gaming", image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=200" },
    { name: "Sports", image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=200" },
];

export default function CategoryCircles() {
    return (
        <section className="py-24 bg-thinkmart-deep px-6 overflow-hidden">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-display font-medium text-white mb-2">Shop by Category</h2>
                    <p className="text-white/50">Find exactly what you need.</p>
                </div>

                <div className="flex flex-wrap justify-center gap-8 md:gap-12">
                    {CATEGORIES.map((cat, index) => (
                        <motion.div
                            key={cat.name}
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.05 }}
                            className="flex flex-col items-center gap-4 group cursor-pointer"
                        >
                            <div className="w-24 h-24 md:w-32 md:h-32 relative rounded-full overflow-hidden border-2 border-white/10 group-hover:border-white/30 transition-colors">
                                <Image
                                    src={cat.image}
                                    alt={cat.name}
                                    fill
                                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                            </div>
                            <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{cat.name}</span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
