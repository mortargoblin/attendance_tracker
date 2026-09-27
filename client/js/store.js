// auth session: the login token and the logged-in user, as returned by the
// backend's login/register endpoints.
//
// it lives in sessionstorage (per-tab) rather than localstorage (shared
// per-origin) so a teacher tab and a student tab can be signed in as two
// different users in the same browser at once.

const KEY = "att_auth";

export function getSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession({ token, user }) {
  const { id, name, email, role } = user;
  sessionStorage.setItem(KEY, JSON.stringify({ token, user: { id, name, email, role } }));
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
}

export function getCurrentUser() {
  return getSession()?.user ?? null;
}
