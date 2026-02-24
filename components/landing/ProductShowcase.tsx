'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';

const PRODUCTS = [
    {
        name: "Premium Coffee beans",
        price: "₹850",
        coins: "200 Coins",
        image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=400"
    },
    {
        name: "Wireless Headphones",
        price: "₹3,499",
        coins: "500 Coins",
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400"
    },
    {
        name: "Smart Watch Series",
        price: "₹4,999",
        coins: "800 Coins",
        image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=400"
    },
    {
        name: "Organic Face Serum",
        price: "₹1,299",
        coins: "300 Coins",
        image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=400"
    }
];

export default function ProductShowcase() {
    return (
        <section className="py-24 bg-thinkmart-deep px-6 border-t border-white/5">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-16">
                    <h2 className="text-3xl font-display font-medium text-white">Trending Products</h2>
                    <button className="text-indigo-300 hover:text-indigo-200 transition-colors text-sm font-medium">View All</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {PRODUCTS.map((product, index) => (
                        <motion.div
                            key={product.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group"
                        >
                            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-white/5 mb-6 border border-white/10">
                                <Image
                                    src={product.image}
                                    alt={product.name}
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10">
                                    Use {product.coins}
                                </div>
                            </div>

                            <h3 className="text-lg font-medium text-white mb-1 group-hover:text-indigo-300 transition-colors">{product.name}</h3>
                            <div className="flex items-center justify-between">
                                <span className="text-white/60">{product.price}</span>
                                <button className="w-8 h-8 rounded-full bg-white text-thinkmart-deep flex items-center justify-center hover:bg-indigo-50 transition-colors">
                                    <ShoppingBag className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
