// @mine — client-side guard for a dead Supabase session.
//
// Every authenticated /api/* call answers 401 "You must be signed in to do that."
// when the session is gone — expired, refreshed by another tab, revoked, or the
// account was just edited (changing your own e-mail/password ends your session).
// The UI used to treat that as an ordinary red error while the tab kept looking
// signed in, which reads as "I'm logged in but it says I'm not".
//
// This wraps fetch once, turns that 401 into a single window event, and lets the
// app shell explain it and send the user back to the login screen.

export const SESSION_EXPIRED_EVENT = 'wblrms:session-expired';

/**
 * Endpoints where a 401 is a normal answer rather than a dead session:
 * a wrong master code, wrong credentials, and the recovery flow.
 */
const EXEMPT = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/unlock',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
];

let installed = false;

export function installSessionExpiryHandler(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    if (response.status !== 401) return response;

    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let path = raw;
    try {
      path = new URL(raw, window.location.origin).pathname;
    } catch {
      /* keep the raw value */
    }

    if (path.startsWith('/api/') && !EXEMPT.some((exempt) => path.startsWith(exempt))) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  };
}
