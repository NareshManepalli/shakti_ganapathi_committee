import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

// ---------------------------------------------------------------------------
// Holds the signed-in member for the length of a visit.
//
// sessionStorage, not localStorage: closing the tab ends the session, which is
// the right default for a shared or borrowed phone. The token itself is signed
// by the Auth Web App — editing it here only makes the server reject it, so
// keeping it in the browser costs nothing.
// ---------------------------------------------------------------------------

const KEY = 'ssgc.session';

const AuthContext = createContext({
  member: null, token: null, isAuthed: false, signIn: () => {}, signOut: () => {},
});

const readStored = () => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // The server enforces expiry as well; this just avoids showing a signed-in
    // shell that every request would then bounce.
    if (!s || !s.token || !s.expiresAt || Date.now() > s.expiresAt) return null;
    return s;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(readStored);

  const signIn = useCallback(({ token, member, expiresInMin }) => {
    const s = {
      token,
      member,
      expiresAt: Date.now() + (Number(expiresInMin) || 60) * 60 * 1000,
    };
    sessionStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setSession(null);
  }, []);

  // Drop the session the moment it lapses, rather than on the next click.
  useEffect(() => {
    if (!session) return undefined;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) { signOut(); return undefined; }
    const t = setTimeout(signOut, ms);
    return () => clearTimeout(t);
  }, [session, signOut]);

  const value = useMemo(() => ({
    member: session ? session.member : null,
    token: session ? session.token : null,
    isAuthed: Boolean(session),
    signIn,
    signOut,
  }), [session, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
