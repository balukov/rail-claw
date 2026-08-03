# HTTP security headers

**Date:** 2026-08-03
**Status:** Approved, pending implementation

## Problem

SnapClaw sends no HTTP security headers. The admin panel sits on a public domain and
embeds a terminal with shell access, so the browser-side defenses that would contain a
mistake — framing protection, MIME-sniffing protection, and a content policy — are all
absent.

OWASP's Node.js cheat sheet treats these as baseline. Helmet is the usual vehicle, but
it is Connect/Express middleware and SnapClaw uses raw `http.createServer`. Adding
Express to gain it is disproportionate; the headers themselves are the point, not the
package.

## Design

A single helper, `setSecurityHeaders(req, res)`, called at the top of the
`http.createServer` callback. `res.setHeader()` applies before any `writeHead`, so one
call covers all 14 response sites and proxied responses alike — `http-proxy` overwrites
only the header names the upstream actually sends.

### Applied to every response, including proxied

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |

`preload` is deliberately omitted from HSTS. Preload entries are slow and painful to
reverse, and the deployment sits on a domain SnapClaw does not control.

`X-Frame-Options: DENY` is safe: no page in `public/` uses an iframe, and the panel does
not embed the gateway UI.

### Content Security Policy

Applied only to SnapClaw's own routes — paths beginning `/snapclaw` plus `/healthz`.
Never applied to proxied gateway responses.

```
default-src 'none'; script-src 'self' https://cdn.jsdelivr.net;
style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; img-src 'self';
connect-src 'self' wss://<host>; form-action 'self';
base-uri 'none'; frame-ancestors 'none'
```

No `'unsafe-inline'`. `public/setup.html` contains no inline `<script>`, no `<style>`
block, and no `style=` attribute, so the strict form works there as-is. This is the main
reason the policy is worth having; a CSP carrying `'unsafe-inline'` would block far less.

`public/login.html` was the exception, and it invalidated the original premise: it
carried a single `<style>` block, which the strict `style-src` would have blocked,
leaving the login page unstyled. Rather than weaken `style-src` with `'unsafe-inline'`
for every page, that block moves to `public/login.css`.

Its route, `GET /snapclaw/login.css`, must live in `publicRoutes` rather than
`setupRoutes`. The login page is by definition served to visitors without a session, so
an authenticated stylesheet route would return the login HTML in place of the CSS — and
with `nosniff` set, the browser would reject it outright. The route is served as
`text/css` for the same reason.

The fallback login page built inline at `src/index.ts:196` needs no change; it carries
no styling at all.

`connect-src` names `wss://<host>` explicitly, taken from the request's `Host` header,
rather than relying on `'self'` to cover WebSockets. `'self'` should match a same-origin
`wss:` under CSP Level 3, but browser behaviour has been inconsistent, and a mistake
here silently breaks the terminal at `src/client/setup.ts:348`. The host is validated
against `/^[A-Za-z0-9.\-:]+$/` before interpolation; a value failing that check is
omitted rather than inserted.

`cdn.jsdelivr.net` is permitted because the panel loads xterm.js and addon-fit from it.
This caps the policy's value — a CDN compromise still reaches a page that grants shell
access. Self-hosting those assets would allow `script-src 'self'` with no external
origin, and is recorded here as the natural follow-up rather than being done now.

### Excluded

Proxied OpenClaw Control responses receive the four global headers but no CSP. OpenClaw
Control is a third-party SPA; imposing SnapClaw's policy on it would likely break it,
and SnapClaw cannot track its asset requirements across upstream releases.

## Verification

No test framework; verification is against the running deployment.

| Check | Expected |
| --- | --- |
| `GET /snapclaw` response headers | all four global headers plus CSP |
| `GET /healthz` response headers | all four global headers plus CSP |
| Authenticated `GET` on a proxied path | four global headers, **no** CSP |
| CSP `connect-src` | contains `wss://` with the deployment host |
| Panel loaded in a browser | no CSP violations in the console |
| Terminal opened in the panel | connects and accepts input |

The last two require a real browser and will be driven through Chrome, reading the
console for violation reports. They are the checks that matter: a CSP that silently
breaks the terminal is worse than no CSP.
