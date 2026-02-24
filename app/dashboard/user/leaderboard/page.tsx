'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { apiClient } from '@/lib/api/client';
import { Trophy, Medal, Crown, TrendingUp, RefreshCw, Users } from 'lucide-react';

interface LeaderboardEntry {
  userId: string;
  name: string;
  score: number;
  rank: number;
  photoURL?: string;
}

interface LeaderboardResponse {
  type: 'referrals' | 'earnings';
  period: 'all_time' | 'monthly' | 'weekly';
  entries: Array<{
    userId: string;
    userName: string;
    userAvatar?: string;
    rank: number;
    value: number;
  }>;
  lastUpdated?: { seconds: number } | string;
}

interface AvatarProps {
  url?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<'earners' | 'referrers'>('earners');
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLeaderboard = useCallback(async (tab: 'earners' | 'referrers') => {
    setLoading(true);
    try {
      const result = await apiClient.get<{ data: LeaderboardResponse }>(
        `/api/leaderboard?${new URLSearchParams({
          type: tab === 'earners' ? 'earnings' : 'referrals',
          period: 'all_time',
          limit: '50',
        }).toString()}`
      );
      const payload = result.data;

      const mapped = (payload.entries || []).map((entry) => ({
        userId: entry.userId,
        name: entry.userName || 'User',
        score: Number(entry.value || 0),
        rank: Number(entry.rank || 0),
        photoURL: entry.userAvatar,
      }));

      setLeaders(mapped);

      if (typeof payload.lastUpdated === 'string') {
        const d = new Date(payload.lastUpdated);
        setLastUpdated(Number.isNaN(d.getTime()) ? null : d);
      } else if (payload.lastUpdated?.seconds) {
        setLastUpdated(new Date(payload.lastUpdated.seconds * 1000));
      } else {
        setLastUpdated(null);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setLeaders([]);
      setLastUpdated(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard(activeTab);
  }, [activeTab, fetchLeaderboard]);

  const refreshLeaderboard = async () => {
    await fetchLeaderboard(activeTab);
  };

  const Avatar = ({ url, name, size = 'md', className = '' }: AvatarProps) => {
    const sizeClasses =
      size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'xl' ? 'w-28 h-28 text-4xl' : 'w-10 h-10 text-sm';
    const sizeValue = size === 'lg' ? 80 : size === 'xl' ? 112 : 40;

    if (url) {
      return (
        <Image
          src={url}
          alt={name}
          width={sizeValue}
          height={sizeValue}
          className={`rounded-full object-cover border-4 border-white shadow-md ${sizeClasses} ${className}`}
          unoptimized
        />
      );
    }

    return (
      <div
        className={`rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 border-4 border-white shadow-md ${sizeClasses} ${className}`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const metricLabel = activeTab === 'earners' ? 'Rs' : 'Referrals';

  const formatScore = (score: number) => {
    if (activeTab === 'earners') {
      return `₹${score.toLocaleString('en-IN')}`;
    }
    return `${score.toLocaleString('en-IN')} refs`;
  };

  const TopThree = ({ first, second, third }: { first: LeaderboardEntry; second?: LeaderboardEntry; third?: LeaderboardEntry }) => (
    <div className="flex justify-center items-end gap-4 mb-12 min-h-[240px]">
      {second && (
        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 delay-100">
          <div className="relative mb-2">
            <Avatar url={second.photoURL} name={second.name} size="lg" className="border-gray-200 bg-gray-200" />
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gray-400 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
              <Medal size={12} /> 2
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm text-center w-32 border-b-4 border-gray-300">
            <p className="font-bold text-gray-800 truncate text-sm">{second.name}</p>
            <p className="text-indigo-600 font-bold text-xs mt-1">{formatScore(second.score)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center z-10 animate-in slide-in-from-bottom duration-700">
        <div className="relative mb-2">
          <Crown className="text-yellow-500 absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce" size={32} />
          <Avatar url={first.photoURL} name={first.name} size="xl" className="border-yellow-100 ring-4 ring-yellow-400/30" />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-white text-sm font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
            <Trophy size={14} /> 1
          </div>
        </div>
        <div className="bg-gradient-to-b from-yellow-50 to-white p-6 rounded-2xl shadow-md text-center w-40 border-b-4 border-yellow-400 transform -translate-y-2">
          <p className="font-bold text-gray-900 truncate">{first.name}</p>
          <p className="text-indigo-600 font-extrabold mt-1">{formatScore(first.score)}</p>
        </div>
      </div>

      {third && (
        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 delay-200">
          <div className="relative mb-2">
            <Avatar url={third.photoURL} name={third.name} size="lg" className="border-orange-100 bg-orange-100" />
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-orange-400 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
              <Medal size={12} /> 3
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm text-center w-32 border-b-4 border-orange-300">
            <p className="font-bold text-gray-800 truncate text-sm">{third.name}</p>
            <p className="text-indigo-600 font-bold text-xs mt-1">{formatScore(third.score)}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
          <Trophy className="text-yellow-500" size={32} /> Leaderboard
        </h1>
        <p className="text-gray-500 mt-2">Top performers of the community</p>
      </div>

      <div className="flex justify-between items-center">
        <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
          <button
            onClick={() => setActiveTab('earners')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'earners' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Top Earners
          </button>
          <button
            onClick={() => setActiveTab('referrers')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'referrers' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            Top Referrers
          </button>
        </div>

        <button
          onClick={refreshLeaderboard}
          className="text-gray-500 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition"
          title="Refresh Leaderboard"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="text-sm text-gray-500 text-center">Metric: {metricLabel}</div>

      {loading ? (
        <div className="py-20 text-center text-gray-500">Loading champions...</div>
      ) : leaders.length === 0 ? (
        <div className="py-20 text-center text-gray-500 bg-gray-50 rounded-2xl">
          No data available yet. Be the first to join the leaderboard!
        </div>
      ) : (
        <>
          {leaders.length > 0 && (
            <TopThree first={leaders[0]} second={leaders[1]} third={leaders[2]} />
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {leaders.slice(3).map((leader) => (
                <div key={leader.userId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 flex items-center justify-center font-bold text-gray-400 bg-gray-100 rounded-full text-sm">
                      #{leader.rank}
                    </div>
                    <div className="flex items-center gap-3">
                      <Avatar url={leader.photoURL} name={leader.name} size="sm" className="border-2 border-gray-100" />
                      <p className="font-bold text-gray-700">{leader.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                    {activeTab === 'referrers' ? <Users size={14} /> : <TrendingUp size={14} />}
                    <span className="font-bold">{formatScore(leader.score)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {lastUpdated && (
            <p className="text-center text-xs text-gray-400 mt-4">Last updated: {lastUpdated.toLocaleString()}</p>
          )}
        </>
      )}
    </div>
  );
}
