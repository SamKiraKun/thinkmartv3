export const calculateMLMCommission = (
  saleAmount: number,
  level: number,
  commissionRate: number = 0.1
) => {
  return saleAmount * commissionRate;
};

export const buildMLMTree = (uplineId: string, level: number = 0) => {
  // This should be called from Firebase Functions for security
  // Frontend can only display the tree, not build it
  return {
    uplineId,
    level,
  };
};

export const calculateDownlineCount = (nodes: any[]): number => {
  return nodes.length;
};
