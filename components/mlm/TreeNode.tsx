'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchDownlineChildren, type DownlineChildNode } from '@/services/referralService';

interface TreeNodeProps {
  referralCode: string;
  userReferralCode: string;
  name: string;
  level: number;
  root?: boolean;
}

export function TreeNode({ referralCode, userReferralCode, name, level, root = false }: TreeNodeProps) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(root);
  const [children, setChildren] = useState<DownlineChildNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleToggle = async () => {
    setExpanded((prev) => !prev);

    if (!expanded && !loaded && user) {
      setLoading(true);
      try {
        const childNodes = await fetchDownlineChildren(userReferralCode);
        setChildren(childNodes);
        setLoaded(true);
      } catch (error) {
        console.error('Failed to load downline:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="ml-4">
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors ${root ? 'bg-indigo-100' : ''}`}
        onClick={handleToggle}
      >
        <div className="text-gray-400">
          {loading ? <Loader2 size={16} className="animate-spin" /> : expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        <div className="w-8 h-8 rounded-full bg-white border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
          <User size={14} />
        </div>

        <div>
          <p className={`text-sm ${root ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
            {name} <span className="text-xs font-normal text-gray-500 ml-1">(L{level})</span>
          </p>
          {!root && <p className="text-[10px] text-gray-400 font-mono">{userReferralCode}</p>}
        </div>
      </div>

      {expanded && (
        <div className="border-l-2 border-indigo-50 ml-4 pl-2">
          {children.length > 0 ? (
            children.map((child) => (
              <TreeNode
                key={child.uid}
                referralCode={child.referralCode}
                userReferralCode={child.ownReferralCode}
                name={child.name}
                level={level + 1}
              />
            ))
          ) : (
            loaded &&
            !loading && (
              <div className="py-2 pl-8 text-xs text-gray-400 italic">
                No direct referrals found.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
