// the router's access rules, kept free of dom code so they can be unit
// tested in node (test/route-guard.test.js).

/**
 * where to send the user instead of `path`, or null if they may see it.
 * - unknown or empty path (including the very first load, which has no
 *   hash at all): their home page, so the url always matches the screen
 * - a page for another role, or any role page while logged out: home/login
 * - login/register while already logged in: their home page
 * @param {string} path e.g. "/teacher/session"
 * @param {{ role?: string } | undefined} route the route table entry for path
 * @param {{ role: string } | null} user the logged-in user
 * @returns {string | null}
 */
export function redirectFor(path, route, user) {
  const home = user ? `/${user.role}` : "/login";
  if (!route) return home;
  if (route.role && user?.role !== route.role) return home;
  if (!route.role && user && (path === "/login" || path === "/register")) return home;
  return null;
}
