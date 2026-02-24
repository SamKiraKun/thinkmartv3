export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  method: "bank" | "wallet";
  status: "pending" | "approved" | "rejected" | "completed";
  requestedAt: Date;
  processedAt?: Date;
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  rejectionReason?: string;
}
