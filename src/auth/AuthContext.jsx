import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/client';
import LoginPage from '../pages/LoginPage';

const AuthContext = createContext(null);

// Wraps the app: shows the sign-in (or first-time setup) screen until someone is signed in.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false, error: '' });

  const refresh = useCallback(async () => {
    try {
      const r = await authApi.me();
      setState({ loading: false, user: r.user, needsSetup: r.needs_setup, error: '' });
    } catch (err) {
      setState({ loading: false, user: null, needsSetup: false, error: err.message });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onOut = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('ims:signed-out', onOut);
    return () => window.removeEventListener('ims:signed-out', onOut);
  }, []);

  const signedIn = (user) => setState({ loading: false, user, needsSetup: false, error: '' });
  const logout = async () => {
    try { await authApi.logout(); } catch { /* already signed out */ }
    setState({ loading: false, user: null, needsSetup: false, error: '' });
  };

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-label="Loading" />
      </div>
    );
  }
  if (!state.user) {
    return <LoginPage needsSetup={state.needsSetup} loadError={state.error} onRetry={refresh} onSignedIn={signedIn} />;
  }

  const value = {
    user: state.user,
    isAdmin: state.user.role === 'Admin',
    canEdit: state.user.role !== 'Viewer',
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext) || { user: null, isAdmin: false, canEdit: false, logout: () => {} };
