import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, UserRole } from "../auth";
import { api } from "../api";
import { setAccessToken, setRefreshToken, setUser, clearAuth } from "../auth";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setAuthUser: (user: User) => void;
  hasRole: (roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post<{
            accessToken: string;
            refreshToken: string;
            user: User;
          }>("/auth/login", { email, password });

          setAccessToken(response.accessToken);
          setRefreshToken(response.refreshToken);
          setUser(response.user);

          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        clearAuth();
        set({ user: null, isAuthenticated: false });
      },

      setAuthUser: (user: User) => {
        set({ user, isAuthenticated: true });
      },

      hasRole: (roles: UserRole[]) => {
        const { user } = get();
        if (!user) return false;
        return roles.includes(user.role);
      },
    }),
    {
      name: "pariksha-auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
