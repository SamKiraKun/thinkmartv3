import { User } from "@/types/user";

export const redirectIfNotAuthenticated = (user: User | null, router: any) => {
  if (!user) {
    router.push("/auth/login");
    return false;
  }
  return true;
};

export const redirectIfNotAuthorized = (
  user: User | null,
  requiredRole: string,
  router: any
) => {
  if (!user || user.role !== requiredRole) {
    router.push("/auth/login");
    return false;
  }
  return true;
};
