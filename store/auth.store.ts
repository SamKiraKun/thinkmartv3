// File: ThinkMart/store/auth.store.ts
import { create } from 'zustand';
import { User } from 'firebase/auth';
import { UserProfile } from '@/types/user';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,

  setUser: (user) => set({ user }),
  
  setProfile: (profile) => set({ profile }),
  
  clearAuth: () => set({ user: null, profile: null }),
}));