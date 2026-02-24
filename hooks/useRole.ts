"use client";

import { useAuth } from "./useAuth";
import { User } from "@/types/user";

export const useRole = () => {
  const { user, profile } = useAuth();

  const hasRole = (role: string): boolean => {
    return profile?.role === role;
  };

  const isAdmin = (): boolean => {
    return profile?.role === "admin";
  };

  const isPartner = (): boolean => {
    return profile?.role === "partner";
  };

  const isUser = (): boolean => {
    return profile?.role === "user";
  };

  return { user, profile, hasRole, isAdmin, isPartner, isUser };
};
