/**
 * src/context/AuthContext.tsx
 * Authentication state shared across the entire app.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/client';

interface User {
  id: number;
  email: string;
  credits: number;
  daily_streak: number;
  last_checkin?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from storage
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('@cloudpilot:token');
        const savedUser = await AsyncStorage.getItem('@cloudpilot:user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { token: t, user: u } = res.data;
    await AsyncStorage.setItem('@cloudpilot:token', t);
    await AsyncStorage.setItem('@cloudpilot:user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const signup = async (email: string, password: string) => {
    const res = await authApi.signup(email, password);
    const { token: t, user: u } = res.data;
    await AsyncStorage.setItem('@cloudpilot:token', t);
    await AsyncStorage.setItem('@cloudpilot:user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const loginAsDemo = async () => {
    const demoUser: User = {
      id: 1,
      email: 'demo@cloudpilot.ai',
      credits: 100,
      daily_streak: 3,
      last_checkin: new Date().toISOString(),
    };
    const demoToken = 'demo-session-token-bypass';
    await AsyncStorage.setItem('@cloudpilot:token', demoToken);
    await AsyncStorage.setItem('@cloudpilot:user', JSON.stringify(demoUser));
    setToken(demoToken);
    setUser(demoUser);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('@cloudpilot:token');
    await AsyncStorage.removeItem('@cloudpilot:user');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const savedUser = await AsyncStorage.getItem('@cloudpilot:user');
    if (savedUser) setUser(JSON.parse(savedUser));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, loginAsDemo, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
