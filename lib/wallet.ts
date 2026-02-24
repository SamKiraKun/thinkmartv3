import { Wallet } from "@/types/wallet";

export const convertCoinsToBalance = (coins: number, rate: number = 0.01) => {
  return coins * rate;
};

export const convertBalanceToCoins = (balance: number, rate: number = 100) => {
  return balance * rate;
};

export const validateWithdrawalAmount = (
  amount: number,
  balance: number,
  minWithdrawal: number = 100
) => {
  if (amount > balance) return false;
  if (amount < minWithdrawal) return false;
  return true;
};

export const calculateFee = (amount: number, feeRate: number = 0.02) => {
  return amount * feeRate;
};
