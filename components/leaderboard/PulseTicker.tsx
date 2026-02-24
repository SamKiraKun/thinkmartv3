'use client';

import { motion } from 'framer-motion';
import { TrendingUp, User, MapPin, Gift } from 'lucide-react';

const MOCK_EVENTS = [
    { id: 1, text: "Rahul K. just earned ₹450", icon: TrendingUp, color: "text-green-400" },
    { id: 2, text: "Mumbai Central Partner processed 50 orders", icon: MapPin, color: "text-blue-400" },
    { id: 3, text: "Priya M. won a Lucky Box!", icon: Gift, color: "text-purple-400" },
    { id: 4, text: "Amit S. reached Silver Tier", icon: User, color: "text-yellow-400" },
    { id: 5, text: "New City Partner in Pune", icon: MapPin, color: "text-orange-400" },
    { id: 6, text: "Sneha R. just withdrew ₹1,200", icon: TrendingUp, color: "text-green-400" },
];

export default function PulseTicker() {
    return (
        <div className="relative w-full overflow-hidden bg-white/5 border-t border-white/10 backdrop-blur-sm h-14 flex items-center">
            {/* Gradient Masks */}
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#2b2f7a] to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#2b2f7a] to-transparent z-10" />

            {/* Scrolling Content */}
            <div className="flex w-full">
                <motion.div
                    className="flex whitespace-nowrap"
                    animate={{ x: [0, -1000] }}
                    transition={{
                        repeat: Infinity,
                        duration: 30,
                        ease: "linear",
                    }}
                >
                    {[...MOCK_EVENTS, ...MOCK_EVENTS, ...MOCK_EVENTS].map((event, i) => (
                        <div
                            key={`${event.id}-${i}`}
                            className="flex items-center gap-2 mx-8 text-sm font-medium text-white/80"
                        >
                            <event.icon className={`w-4 h-4 ${event.color}`} />
                            <span>{event.text}</span>
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    );
}
