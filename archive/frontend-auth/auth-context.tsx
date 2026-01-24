// Authentication context and provider - Zitadel OIDC integration
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
        credentials: 'include', // Include cookies for Zitadel access token
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
    // Redirect to Zitadel OIDC authorization endpoint
    const authDomain = import.meta.env.VITE_AUTH_DOMAIN || 'auth.dev.localhost';
    const clientId = import.meta.env.VITE_ZITADEL_CLIENT_ID;

    if (!clientId) {
      console.error('VITE_ZITADEL_CLIENT_ID is not set');
      return;
    }

    const authUrl = new URL(`https://${authDomain}/oauth/v2/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `${import.meta.env.VITE_BACKEND_URL}/auth/callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('prompt', 'login');

    window.location.href = authUrl.toString();
  };

  const logout = async () => {
    // Call backend logout endpoint to clear cookies
    try {
      await fetch(`${import.meta.env.VITE_BACKEND_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    // Clear local state
    setUser(null);

    // Redirect to Zitadel end session endpoint
    const authDomain = import.meta.env.VITE_AUTH_DOMAIN || 'auth.dev.localhost';
    const logoutUrl = new URL(`https://${authDomain}/oidc/v1/end_session`);
    logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin);

    window.location.href = logoutUrl.toString();
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
