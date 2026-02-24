'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Map, PieChart, Users, Wallet } from 'lucide-react';

const BENEFITS = [
  {
    icon: Map,
    title: "Exclusive Territory",
    description: "Own the rights to your city. You get commissions from every user tracked to your region."
  },
  {
    icon: PieChart,
    title: "20% Revenue Share",
    description: "Earn a massive 20% cut from all order profits generated within your assigned territory."
  },
  {
    icon: Users,
    title: "Local Leadership",
    description: "Build a team of local affiliates and influencers to drive growth in your area."
  },
  {
    icon: Wallet,
    title: "Instant Settlements",
    description: "Partner commissions are calculated real-time and available for monthly payout."
  }
];

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-thinkmart-deep pt-32 pb-20 px-6 overflow-hidden relative">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[700px] h-[700px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-indigo-200 font-medium text-sm mb-6 border border-white/5">
              Limited Applications Open
            </span>
            <h1 className="text-4xl md:text-6xl font-display font-medium text-white mb-6 tracking-tight">
              Lead the revolution in your city.
            </h1>
            <p className="text-xl text-white/60 leading-relaxed text-balance">
              Become a City Partner and build a sustainable business with ThinkMart.
              Earn passive income from every transaction in your region.
            </p>
          </motion.div>
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-2 gap-16 items-start">

          {/* Benefits */}
          <div className="grid sm:grid-cols-2 gap-6">
            {BENEFITS.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white/5 border border-white/10 p-6 rounded-3xl hover:bg-white/10 transition-colors"
              >
                <item.icon className="w-8 h-8 text-indigo-300 mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">{item.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.description}</p>
              </motion.div>
            ))}

            <div className="sm:col-span-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-8 text-white relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <h3 className="text-2xl font-bold mb-2 relative z-10">Ready to scale?</h3>
              <p className="text-indigo-100 mb-6 relative z-10">Join 50+ partners already earning across the country.</p>
              <div className="flex -space-x-3 relative z-10">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full bg-white/20 border-2 border-indigo-500" />
                ))}
                <div className="w-10 h-10 rounded-full bg-white text-indigo-600 flex items-center justify-center font-bold text-xs border-2 border-indigo-500">
                  +50
                </div>
              </div>
            </div>
          </div>

          {/* Application Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl shadow-indigo-900/20"
          >
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Apply Now</h3>
            <p className="text-gray-500 mb-8">Fill out the form below and our partnerships team will contact you within 24 hours.</p>

            <form className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <input type="text" placeholder="First Name" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-900" />
                <input type="text" placeholder="Last Name" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-900" />
              </div>
              <input type="email" placeholder="Email Address" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-900" />
              <input type="tel" placeholder="Phone Number" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-900" />
              <input type="text" placeholder="City / Region of Interest" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-gray-900" />

              <button className="w-full py-4 bg-thinkmart-deep text-white font-bold rounded-xl hover:bg-indigo-900 transition-transform active:scale-[0.98]">
                Submit Application
              </button>

              <p className="text-center text-xs text-gray-400 mt-4">
                By submitting, you agree to our Partner Terms & Conditions.
              </p>
            </form>
          </motion.div>

        </div>

      </div>
    </div>
  );
}