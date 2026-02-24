export interface MLMNode {
  userId: string;
  uplineId?: string;
  downline: string[];
  level: number;
  totalDownlineCount: number;
  directReferrals: number;
}

export interface MLMCommission {
  userId: string;
  referralId: string;
  amount: number;
  commissionRate: number;
  level: number;
  timestamp: Date;
}
