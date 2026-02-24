'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

const FEATURES = [
    {
        title: "Daily Tasks",
        desc: "Simple actions, real rewards.",
        image: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&q=80&w=600",
        link: "/user/tasks"
    },
    {
        title: "Spin & Win",
        desc: "Try your luck daily.",
        image: "https://images.unsplash.com/photo-1605218427306-635ba2496ed9?auto=format&fit=crop&q=80&w=600",
        link: "/user/games/spin"
    },
    {
        title: "Hybrid Wallet",
        desc: "Pay with coins + cash.",
        image: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&q=80&w=600",
        link: "/user/wallet"
    },
    {
        title: "Community",
        desc: "Refer friends, earn together.",
        image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=600",
        link: "/user/network"
    }
];

export default function FeatureCards() {
    return (
        <section className="py-24 bg-thinkmart-deep px-6">
            <div className="max-w-7xl mx-auto space-y-12">

                <div className="text-center max-w-2xl mx-auto">
                    <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-4">
                        Explore new ways to earn.
                    </h2>
                    <p className="text-white/60 text-lg">
                        Everything you need to grow your wealth, all in one place.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {FEATURES.map((item, index) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group relative aspect-[4/5] rounded-3xl overflow-hidden bg-white/5 border border-white/10"
                        >
                            <Image
                                src={item.image}
                                alt={item.title}
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                            <div className="absolute bottom-0 left-0 right-0 p-6">
                                <h3 className="text-xl font-bold text-white mb-1">{item.title}</h3>
                                <p className="text-sm text-white/70 mb-4">{item.desc}</p>
                                <Link href={item.link} className="inline-flex text-sm font-medium text-white border-b border-white/30 pb-0.5 hover:border-white transition-colors">
                                    Get Started
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}
