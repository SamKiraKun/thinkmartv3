'use client';

import { motion } from 'framer-motion';
import { Trophy, Medal, Award, MoreHorizontal } from 'lucide-react';

const LEADERS = [
    { rank: 1, name: "Amit Sharma", tasks: 142, earnings: "₹18,450", avatar: "AS" },
    { rank: 2, name: "Priya Kapoor", tasks: 128, earnings: "₹15,200", avatar: "PK" },
    { rank: 3, name: "Rohan Das", tasks: 115, earnings: "₹12,800", avatar: "RD" },
    { rank: 4, name: "Sneha Patel", tasks: 98, earnings: "₹9,540", avatar: "SP" },
    { rank: 5, name: "Vikram Singh", tasks: 92, earnings: "₹8,900", avatar: "VS" },
    { rank: 6, name: "Anjali Gupta", tasks: 88, earnings: "₹8,200", avatar: "AG" },
    { rank: 7, name: "Rahul Verma", tasks: 85, earnings: "₹7,850", avatar: "RV" },
    { rank: 8, name: "Neha Reddy", tasks: 72, earnings: "₹6,400", avatar: "NR" },
    { rank: 9, name: "Arjun Nair", tasks: 68, earnings: "₹5,900", avatar: "AN" },
    { rank: 10, name: "Kavita Joshi", tasks: 65, earnings: "₹5,200", avatar: "KJ" },
];

export default function LeaderboardTable() {
    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return <Trophy className="w-6 h-6 text-yellow-400" />;
            case 2: return <Medal className="w-6 h-6 text-gray-300" />;
            case 3: return <Award className="w-6 h-6 text-amber-600" />;
            default: return <span className="text-white/40 font-mono w-6 text-center">{rank}</span>;
        }
    };

    const getRowStyle = (rank: number) => {
        if (rank === 1) return "bg-yellow-500/10 border-yellow-500/20";
        if (rank === 2) return "bg-white/10 border-white/20";
        if (rank === 3) return "bg-amber-600/10 border-amber-600/20";
        return "bg-white/5 border-white/5 hover:bg-white/10";
    };

    return (
        <div className="w-full max-w-4xl mx-auto">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 text-xs font-medium uppercase tracking-wider text-white/40 border-b border-white/10">
                <div className="col-span-2 md:col-span-1 text-center">Rank</div>
                <div className="col-span-6 md:col-span-7">User</div>
                <div className="col-span-2 text-right hidden md:block">Tasks</div>
                <div className="col-span-4 md:col-span-2 text-right">Earnings</div>
            </div>

            {/* Rows */}
            <div className="space-y-2 mt-2">
                {LEADERS.map((leader, index) => (
                    <motion.div
                        key={leader.rank}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                        className={`grid grid-cols-12 gap-4 px-6 py-4 rounded-xl border items-center transition-all duration-300 backdrop-blur-sm ${getRowStyle(leader.rank)}`}
                    >
                        {/* Rank */}
                        <div className="col-span-2 md:col-span-1 flex justify-center">
                            {getRankIcon(leader.rank)}
                        </div>

                        {/* User */}
                        <div className="col-span-6 md:col-span-7 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shrink-0">
                                {leader.avatar}
                            </div>
                            <div>
                                <h3 className="text-white font-medium truncate">{leader.name}</h3>
                                <p className="text-white/40 text-xs md:hidden">{leader.tasks} Tasks</p>
                            </div>
                        </div>

                        {/* Tasks (Desktop) */}
                        <div className="col-span-2 text-right hidden md:block text-white/60 font-medium">
                            {leader.tasks}
                        </div>

                        {/* Earnings */}
                        <div className="col-span-4 md:col-span-2 text-right text-emerald-400 font-bold font-mono">
                            {leader.earnings}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Footer */}
            <div className="flex justify-center mt-8">
                <button className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm group">
                    <MoreHorizontal className="w-4 h-4 group-hover:bg-white/10 rounded" />
                    <span>Load more earners</span>
                </button>
            </div>
        </div>
    );
}
