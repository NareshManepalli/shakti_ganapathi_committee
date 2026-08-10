import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { getProfile } from '../utils/authService';
import { clearAdminData } from '../admin/adminDataCache';

// ---------------------------------------------------------------------------
// Holds the signed-in member for the length of a visit.
//
// sessionStorage, not localStorage: closing the tab ends the session, which is
// the right default for a shared or borrowed phone. The token itself is signed
// by the Auth Web App — editing it here only makes the server reject it, so
// keeping it in the browser costs nothing.
//
// Two records live here, and they are not the same thing. `member` is what the
// sign-in reply carried — id, name and adm_in — and it is what decides access.
// `profile` is the member's full sheet row, fetched once per session, and it is
// what the chrome displays: their photo and their position. Access never reads
// from `profile`; a member can edit their own row, and adm_in is not theirs to
// set. The server checks the signed token on every request regardless.
// ---------------------------------------------------------------------------

const KEY = 'ssgc.session';

const AuthContext = createContext({
  member: null, token: null, isAuthed: false, profile: null,
  profileLoading: false, profileError: '',
  refreshProfile: async () => null, setProfile: () => {},
  signIn: () => {}, signOut: () => {},
});

/**
 * What the chrome prints under the member's name. adm_in is a permission, not a
 * job, so it reads as a suffix on the position the committee actually gave them
 * — "President / Administrative" — rather than replacing it.
 *
 * Empty until the record arrives. The position lives in the sheet row, not in
 * the sign-in reply, so on a refresh there is a moment where it is genuinely
 * unknown; printing the "Committee member" fallback there made every reload
 * flash a wrong title before correcting itself. The fallback is for a member
 * whose position cell is actually blank, which is a different thing.
 */
export const roleLabelFor = (profile, isAdmin) => {
  if (!profile) return '';
  const position = String(profile.position || '').trim() || 'Committee member';
  return isAdmin ? `${position} / Administrative` : position;
};

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
  const [profile, setProfile] = useState(null);
  // True from the first render when a session is already stored, so the profile
  // screen shows its skeleton rather than flashing "could not load" in the gap
  // before the effect below fires.
  const [profileLoading, setProfileLoading] = useState(Boolean(session));
  const [profileError, setProfileError] = useState('');

  const signIn = useCallback(({ token, member, expiresInMin, bypass }) => {
    const s = {
      token,
      member,
      bypass: Boolean(bypass),
      expiresAt: Date.now() + (Number(expiresInMin) || 60) * 60 * 1000,
    };
    sessionStorage.setItem(KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const signOut = useCallback(() => {
    // The editor screens hold the three sheets in memory for the visit,
    // including every member's email and access flags. Dropping them here is
    // what stops the next person to sign in on this tab from seeing them.
    clearAdminData();
    sessionStorage.removeItem(KEY);
    setSession(null);
    setProfile(null);
    setProfileError('');
    setProfileLoading(false);
  }, []);

  // Drop the session the moment it lapses, rather than on the next click.
  useEffect(() => {
    if (!session) return undefined;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) { signOut(); return undefined; }
    const t = setTimeout(signOut, ms);
    return () => clearTimeout(t);
  }, [session, signOut]);

  const token = session ? session.token : null;

  // One fetch per session, shared by the portal chrome and the profile screen —
  // both want the same row, and asking twice for it would be a second round
  // trip to Apps Script for nothing.
  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    setProfileLoading(true);
    setProfileError('');
    const res = await getProfile(token);
    setProfileLoading(false);
    if (res.ok) {
      setProfile(res.profile);
      return res.profile;
    }
    setProfileError(res.error || '');
    // A dead session cannot be fixed by retrying — end it and let the route
    // guard send them back to sign in.
    if (res.code === 'UNAUTHORIZED') setTimeout(signOut, 1800);
    return null;
  }, [token, signOut]);

  useEffect(() => {
    if (!token) { setProfile(null); return; }
    refreshProfile();
  }, [token, refreshProfile]);

  const value = useMemo(() => ({
    member: session ? session.member : null,
    token,
    bypass: Boolean(session && session.bypass),
    isAuthed: Boolean(session),
    profile,
    profileLoading,
    profileError,
    refreshProfile,
    setProfile,
    signIn,
    signOut,
  }), [session, token, profile, profileLoading, profileError, refreshProfile, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
