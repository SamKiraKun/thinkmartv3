import { User } from "@/types/user";

export const checkAuth = (user: User | null, allowedRoles: string[]) => {
  if (!user) {
    return false;
  }
  return allowedRoles.includes(user.role);
};

export const isAdmin = (user: User | null) => {
  return user?.role === "admin";
};

export const isPartner = (user: User | null) => {
  return user?.role === "partner";
};

export const isRegularUser = (user: User | null) => {
  return user?.role === "user";
};
