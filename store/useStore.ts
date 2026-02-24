import { create } from 'zustand';
import { User, Wallet } from '@/types';
import { featureFlags } from '@/lib/featureFlags';
import { apiClient, type ApiResponse } from '@/lib/api/client';

interface AppState {
  user: User | null;
  wallet: Wallet | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setWallet: (wallet: Wallet | null) => void;
  initializeListeners: (userId: string) => () => void; // Returns unsubscribe function
}

export const useStore = create<AppState>((set) => ({
  user: null,
  wallet: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setWallet: (wallet) => set({ wallet }),

  initializeListeners: (userId: string) => {
    const fetchUserAndWallet = async () => {
      try {
        const [userRes, walletRes] = await Promise.all([
          apiClient.get<ApiResponse<User>>('/api/users/me'),
          apiClient.get<ApiResponse<Wallet>>('/api/wallet'),
        ]);
        set({ user: userRes.data as User, wallet: walletRes.data as Wallet, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    };

    if (featureFlags.realtimeEnabled) {
      let wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || 'ws://localhost:3001';
      if (!wsUrl.endsWith('/')) wsUrl += '/';
      wsUrl += 'api/ws/realtime';

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          payload: { rooms: [`user:${userId}`, `wallet:${userId}`] }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'user_update') set({ user: data.payload as User, isLoading: false });
          if (data.type === 'wallet_update') set({ wallet: data.payload as Wallet });
        } catch (err) { }
      };

      // Perform initial fetch since WS only pushes deltas natively
      void fetchUserAndWallet();

      return () => ws.close();
    }

    // Polling fallback when websocket realtime is disabled.
    void fetchUserAndWallet();
    const interval = setInterval(() => {
      void fetchUserAndWallet();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  },
}));
