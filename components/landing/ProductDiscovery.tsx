'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Plus } from 'lucide-react';

const PRODUCTS = [
    {
        id: 1,
        name: 'Sony WH-1000XM5',
        price: '$348',
        image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=1000',
        category: 'Audio',
    },
    {
        id: 2,
        name: 'MacBook Air M2',
        price: '$1199',
        image: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&q=80&w=1000',
        category: 'Laptop',
    },
    {
        id: 3,
        name: 'Canon EOS R5',
        price: '$3899',
        image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=1000',
        category: 'Camera',
    },
    {
        id: 4,
        name: 'Nike Air Max',
        price: '$129',
        image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=1000',
        category: 'Footwear',
    }
];

export default function ProductDiscovery() {
    return (
        <section className="relative py-32 bg-[#2b2f7a]">
            <div className="max-w-7xl mx-auto px-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-4">
                            Curated for you.
                        </h2>
                        <p className="text-white/60 text-lg max-w-md">
                            Handpicked products from brands you trust, at prices you&apos;ll love.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <button className="text-white border-b border-white/30 pb-1 hover:border-white transition-colors">
                            View all collections
                        </button>
                    </motion.div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {PRODUCTS.map((product, index) => (
                        <motion.div
                            key={product.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group relative"
                        >
                            {/* Card */}
                            <div className="relative aspect-[4/5] bg-white/5 rounded-2xl overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
                                {/* Image */}
                                <Image
                                    src={product.image}
                                    alt={product.name}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                                />

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                                {/* Hover Actions */}
                                <div className="absolute font-medium bottom-0 left-0 w-full p-6 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <p className="text-white/70 text-sm mb-1">{product.category}</p>
                                            <h3 className="text-white text-lg font-medium leading-tight mb-2">{product.name}</h3>
                                            <p className="text-white font-semibold">{product.price}</p>
                                        </div>

                                        <button className="w-10 h-10 rounded-full bg-white text-thinkmart-deep flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-indigo-50 transform translate-y-2 group-hover:translate-y-0">
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}
