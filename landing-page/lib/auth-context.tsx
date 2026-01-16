// Authentication context and provider - Authelia integration
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { trpc } from './trpc-provider';

interface User {
  id: string;
  email: string;
  groups: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status by calling /auth/me
  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/me`, {
        credentials: 'include', // Include cookies for Authelia session
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData) {
          setUser(userData);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to check authentication:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const login = () => {
    // Redirect to Authelia login page
    // Authelia will redirect back after successful login
    window.location.href = `http://localhost:9091/?rd=${encodeURIComponent(window.location.href)}`;
  };

  const logout = () => {
    // Redirect to Authelia logout endpoint
    window.location.href = `http://localhost:9091/logout?rd=${encodeURIComponent(window.location.origin)}`;
  };

  const refetchUser = () => {
    checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
