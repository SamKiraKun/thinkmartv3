// File: ThinkMart/app/dashboard/user/referrals/page.tsx
'use client';

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useReferral } from "@/hooks/useReferral"; 
import { TreeNode } from "@/components/mlm/TreeNode";
import { 
  Copy, 
  Share2, 
  Users, 
  DollarSign, 
  Trophy, 
  TrendingUp, 
  CheckCircle2,
  GitFork,
  List,
  Loader2
} from "lucide-react";

export default function ReferralsPage() {
  const { profile } = useAuth();
  // UPDATED: Destructure 'referralCode' and 'loading' from the hook
  const { referrals, referralEarnings, referralCode, loading } = useReferral(); 
  
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'tree' | 'list'>('tree');

  // Use the code from the hook (which pulls from profile.ownReferralCode)
  const myReferralCode = referralCode || '';
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/register?ref=${myReferralCode}` : '';

  const copyToClipboard = () => {
    if (myReferralCode) {
      navigator.clipboard.writeText(myReferralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share && myReferralCode) {
      try {
        await navigator.share({
          title: 'Join my Team on ThinkMart!',
          text: `Use my code ${myReferralCode} to join ThinkMart and start earning daily!`,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Share failed", err);
      }
    } else {
      copyToClipboard();
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      
      {/* 1. Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-yellow-400 opacity-10 rounded-full blur-3xl"></div>
        
        <div className="relative p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-sm font-medium text-yellow-300 border border-white/10">
              <Trophy size={14} /> 
              <span>Rank: {profile?.membershipActive ? "Premium Partner 💎" : "Standard Member 🆓"}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Grow Your Empire
            </h1>
            <p className="text-indigo-100 max-w-lg text-lg">
              Earn passive income up to <span className="font-bold text-white">6 levels deep</span>. Share your code and watch your network explode.
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full md:w-auto">
            <div className="bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/20 flex items-center gap-3">
              <div className="pl-4 font-mono text-2xl font-bold tracking-wider text-white min-w-[140px]">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-indigo-100">
                    <Loader2 className="animate-spin" size={20} /> Fetching...
                  </div>
                ) : (
                  myReferralCode || 'UNAVAILABLE'
                )}
              </div>
              <button 
                onClick={copyToClipboard}
                disabled={!myReferralCode}
                className="p-3 bg-white text-indigo-600 rounded-lg hover:bg-gray-50 transition shadow-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copied ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                <span className="hidden md:inline">{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <button 
              onClick={handleShare}
              disabled={!myReferralCode}
              className="w-full py-2.5 bg-indigo-500/50 hover:bg-indigo-500/70 text-white rounded-lg transition flex items-center justify-center gap-2 font-medium backdrop-blur-sm border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Share2 size={18} /> Share Invite Link
            </button>
          </div>
        </div>
      </div>

      {/* 2. Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard 
          title="Total Earnings" 
          value={loading ? '...' : `${referralEarnings.toLocaleString()} Coins`}
          subValue="Referrals + Team Income"
          icon={DollarSign}
          color="bg-green-100 text-green-700"
        />
        <StatsCard 
          title="Direct Team" 
          value={loading ? '...' : referrals.length} 
          subValue="Level 1 Members"
          icon={Users}
          color="bg-blue-100 text-blue-700"
        />
        <StatsCard 
          title="Potential" 
          value="Uncapped" 
          subValue="Grow to Level 6"
          icon={TrendingUp}
          color="bg-purple-100 text-purple-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 3. Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tabs */}
          <div className="flex items-center gap-4 border-b border-gray-200">
            <TabButton 
              active={activeTab === 'tree'} 
              onClick={() => setActiveTab('tree')}
              icon={GitFork}
              label="Network Tree (Visual)"
            />
            <TabButton 
              active={activeTab === 'list'} 
              onClick={() => setActiveTab('list')}
              icon={List}
              label="Direct Team (List)"
            />
          </div>

          {/* Tab Content: TREE VIEW */}
          {activeTab === 'tree' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm text-gray-500 font-medium">Interactive Map</span>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Click arrows to expand</span>
              </div>
              <div className="p-6 overflow-x-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <Loader2 className="animate-spin mb-2" size={32} />
                    Loading network...
                  </div>
                ) : myReferralCode ? (
                  <div className="min-w-[300px]">
                    <TreeNode 
                      referralCode={myReferralCode} 
                      userReferralCode={myReferralCode} 
                      name={profile?.name || 'Me'} 
                      level={0} 
                      root={true} 
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <Users size={32} className="mb-2 opacity-50"/>
                    <p>Referral code unavailable.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: LIST VIEW */}
          {activeTab === 'list' && (
             <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                   <tr>
                     <th className="px-6 py-4 font-semibold">Team Member</th>
                     <th className="px-6 py-4 font-semibold">Join Date</th>
                     <th className="px-6 py-4 font-semibold">Status</th>
                     <th className="px-6 py-4 font-semibold text-right">Commission</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {referrals && referrals.length > 0 ? (
                     referrals.map((ref: any, idx: number) => (
                       <tr key={ref.uid || idx} className="hover:bg-gray-50 transition group">
                         <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm group-hover:bg-indigo-600 group-hover:text-white transition">
                               {ref.name?.charAt(0).toUpperCase() || 'U'}
                             </div>
                             <div>
                               <p className="font-semibold text-gray-900">{ref.name || 'Unknown User'}</p>
                               <p className="text-xs text-gray-500">{ref.city}, {ref.state}</p>
                             </div>
                           </div>
                         </td>
                         <td className="px-6 py-4 text-sm text-gray-600">
                           {ref.createdAt?.seconds ? new Date(ref.createdAt.seconds * 1000).toLocaleDateString() : 'Recent'}
                         </td>
                         <td className="px-6 py-4">
                           <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ref.membershipActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                             {ref.membershipActive ? 'Premium' : 'Free'}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right font-medium text-green-600">
                           {/* Simplified estimation for display */}
                           +₹{(ref.totalEarnings * 0.05 || 0).toFixed(2)}
                         </td>
                       </tr>
                     ))
                   ) : (
                     <tr>
                       <td colSpan={4} className="px-6 py-16 text-center text-gray-500">
                         <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                           <Users size={32} className="text-gray-400" />
                         </div>
                         <h3 className="text-lg font-medium text-gray-900">No referrals yet</h3>
                         <p className="text-sm mt-1">Share your code to start building your team!</p>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>
          )}
        </div>

        {/* 4. Sidebar Content */}
        <div className="space-y-6">
           <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
             <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
               <DollarSign size={20} className="text-indigo-600" />
               Commission Structure
             </h3>
             <div className="space-y-4">
                <LevelRow level="1" percent="5%" color="bg-indigo-100 text-indigo-700" label="Direct Referrals" />
                <LevelRow level="2" percent="5%" color="bg-blue-100 text-blue-700" label="Your Team's Team" />
                <LevelRow level="3" percent="3%" color="bg-green-100 text-green-700" />
                <LevelRow level="4" percent="3%" color="bg-yellow-100 text-yellow-700" />
                <LevelRow level="5" percent="2%" color="bg-orange-100 text-orange-700" />
                <LevelRow level="6" percent="2%" color="bg-red-100 text-red-700" />
             </div>
             
             {!profile?.membershipActive && (
               <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                 <p className="text-xs font-bold text-yellow-800 uppercase tracking-wide mb-1">Status: Locked 🔒</p>
                 <p className="text-sm text-yellow-700">
                   You are currently a <span className="font-bold">Free Member</span>. Upgrade to unlock earnings from Levels 2-6!
                 </p>
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}

// Sub Components
function StatsCard({ title, value, subValue, icon: Icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between hover:shadow-md transition-shadow">
      <div>
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        <p className="text-xs text-gray-400 mt-1">{subValue}</p>
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={24} />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
        ${active 
          ? 'border-indigo-600 text-indigo-600' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
      `}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function LevelRow({ level, percent, color, label }: any) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${color}`}>
          L{level}
        </div>
        {label && <span className="text-sm text-gray-600">{label}</span>}
      </div>
      <span className="font-bold text-gray-800">{percent}</span>
    </div>
  );
}