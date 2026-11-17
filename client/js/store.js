// auth session: the login token and the logged-in user, as returned by the
// backend's login/register endpoints.
//
// it lives in sessionstorage (per-tab) rather than localstorage (shared
// per-origin) so a teacher tab and a student tab can be signed in as two
// different users in the same browser at once.

const KEY = "att_auth";

/** @returns {{ token: string, user: { id: number, name: string, email: string, role: string } } | null} */
export function getSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** keeps only the fields the ui needs from a login/register response */
export function setSession({ token, user }) {
  const { id, name, email, role } = user;
  sessionStorage.setItem(KEY, JSON.stringify({ token, user: { id, name, email, role } }));
}

/** forgets the login in this tab (the server token is revoked separately by api.logout) */
export function clearSession() {
  sessionStorage.removeItem(KEY);
}

/** @returns {{ id: number, name: string, email: string, role: string } | null} */
export function getCurrentUser() {
  return getSession()?.user ?? null;
}
