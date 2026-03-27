import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin, useRegister, useGetMe, type User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("discord_token"));

  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    },
    request: {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem("discord_token", data.token);
        localStorage.setItem("discord_user", JSON.stringify(data.user));
        setToken(data.token);
        queryClient.setQueryData(["/api/auth/me"], data.user);
        setLocation("/");
      },
    },
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem("discord_token", data.token);
        localStorage.setItem("discord_user", JSON.stringify(data.user));
        setToken(data.token);
        queryClient.setQueryData(["/api/auth/me"], data.user);
        setLocation("/");
      },
    },
  });

  const logout = useCallback(() => {
    localStorage.removeItem("discord_token");
    localStorage.removeItem("discord_user");
    setToken(null);
    queryClient.clear();
    setLocation("/login");
  }, [queryClient, setLocation]);

  return {
    user: user as User | undefined,
    isLoading: isUserLoading && !!token,
    isAuthenticated: !!user,
    token,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    logout,
  };
}

export function getAuthHeaders() {
  const token = localStorage.getItem("discord_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
