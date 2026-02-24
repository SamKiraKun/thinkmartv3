'use client';

import { motion } from 'framer-motion';
import { TrendingDown, Clock, Ghost, AlertCircle } from 'lucide-react';

const PROBLEMS = [
    {
        icon: TrendingDown,
        title: "Rising Costs",
        desc: "Inflation makes everyday essentials harder to afford."
    },
    {
        icon: Clock,
        title: "Wasted Time",
        desc: "Hours spent doom-scrolling with zero financial return."
    },
    {
        icon: Ghost,
        title: "Empty Promises",
        desc: "Rewards programs that take years to cash out."
    },
    {
        icon: AlertCircle,
        title: "Hidden Fees",
        desc: "Surprise charges at checkout that kill your budget."
    }
];

export default function ProblemSection() {
    return (
        <section className="py-24 bg-thinkmart-deep border-b border-white/5 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 text-center">

                <div className="mb-16">
                    <h2 className="text-3xl md:text-4xl font-display font-medium text-white mb-4">
                        Why traditional shopping is broken.
                    </h2>
                    <p className="text-white/50 text-xl max-w-2xl mx-auto">
                        You spend. They profit. It&apos;s time to change the equation.
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {PROBLEMS.map((item, index) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="flex flex-col items-center p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-white/20 transition-colors"
                        >
                            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-6">
                                <item.icon className="w-7 h-7" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">{item.title}</h3>
                            <p className="text-sm text-white/50">{item.desc}</p>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}
