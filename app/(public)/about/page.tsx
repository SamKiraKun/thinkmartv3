'use client';

import { motion } from 'framer-motion';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-thinkmart-deep pt-32 pb-20 px-6 overflow-hidden relative">

      {/* Ambient Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-24"
        >
          <h1 className="text-4xl md:text-6xl font-display font-medium text-white mb-8 tracking-tight text-balance">
            Redefining the way the world shops.
          </h1>
          <p className="text-xl text-white/60 leading-relaxed text-balance">
            We believe that e-commerce shouldn&apos;t just be transactional. It should be rewarding, social, and empowering for everyone involved.
          </p>
        </motion.div>

        {/* Story Section */}
        <div className="space-y-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="prose prose-lg prose-invert mx-auto"
          >
            <h2 className="text-2xl font-display font-medium text-white mb-6">Our Mission</h2>
            <p className="text-white/70 leading-relaxed">
              Founded in 2024, ThinkMart started with a simple question: <span className="text-white italic">Why does the platform keep all the profit?</span>
            </p>
            <p className="text-white/70 leading-relaxed">
              We built a system where every purchase, every referral, and every interaction creates value for the community. By combining the efficiency of modern e-commerce with the power of social networking, we&apos;re creating a decentralized economy where everyday shoppers can become entrepreneurs.
            </p>
          </motion.div>

          {/* Stats Grid */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 border-y border-white/10 py-12"
          >
            {[
              { label: "Community Members", value: "10K+" },
              { label: "Products Listed", value: "500+" },
              { label: "Cities Active", value: "25+" },
              { label: "Coins Distributed", value: "1M+" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-display font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-white/40 uppercase tracking-widest font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

      </div>
    </div>
  );
}