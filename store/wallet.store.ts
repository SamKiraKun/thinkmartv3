import { create } from "zustand";
import { Wallet } from "@/types/wallet";

interface WalletStore {
  wallet: Wallet | null;
  setWallet: (wallet: Wallet) => void;
  updateBalance: (amount: number) => void;
  updateCoins: (amount: number) => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  wallet: null,
  setWallet: (wallet) => set({ wallet }),
  updateBalance: (amount) =>
    set((state) =>
      state.wallet
        ? { wallet: { ...state.wallet, cashBalance: state.wallet.cashBalance + amount } }
        : state
    ),
  updateCoins: (amount) =>
    set((state) =>
      state.wallet
        ? { wallet: { ...state.wallet, coinBalance: state.wallet.coinBalance + amount } }
        : state
    ),
}));
