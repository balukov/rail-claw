# Gateway proxy authentication

**Date:** 2026-08-02
**Status:** Approved, pending implementation

## Problem

`checkAuth()` is called in exactly one place, `src/index.ts:904`, and only for URLs
beginning with `/snapclaw`. Every other path falls through to the gateway proxy at
`src/index.ts:916-944`, which checks only `isConfigured()` and then stamps an admin
credential onto the anonymous request:

```js
if (!req.headers.authorization && GATEWAY_TOKEN) {
  req.headers.authorization = `Bearer ${GATEWAY_TOKEN}`;
}
proxy.web(req, res, { target: GATEWAY_TARGET });
```

`SETUP_PASSWORD` never participates. The WebSocket upgrade handler at
`src/index.ts:962-989` is a separate code path with the same gap, and additionally
validates no `Origin`.

Verified against the live deployment on 2026-08-02: an anonymous request to
`https://snapclaw-production-2ad1.up.railway.app/some-gateway-path` returns the
OpenClaw Control UI. No path probed returned 401 or 403.

The root redirect to `/snapclaw` is not a gate — it fires only when `!channelsReady`,
and applies only to `/`. Any other path bypasses it.

## Design

Gate both fall-through points on the existing `checkAuth()`.

### HTTP

After the `isConfigured()` check, before `proxy.web()`:

- `checkAuth(req)` passes — proxy as today.
- Fails — `302` to `/snapclaw`, which serves the login form.

A redirect rather than a bare 401 so that opening the Railway URL in a browser leads
to the login form and then to OpenClaw Control. This reveals that a SnapClaw panel
exists, which is already observable today.

### WebSocket

In the gateway branch of the upgrade handler, before proxying:

- Compare the `Origin` header's host against the request's `Host`. On mismatch,
  `socket.destroy()`. A request with no `Origin` proceeds to the auth check —
  cross-site WebSocket hijacking is a browser-only attack, and non-browser clients
  do not send the header.
- `checkAuth(req)` fails — `socket.destroy()`. An upgrade cannot carry a redirect.

Origin validation is required rather than optional. Gating the socket on a cookie is
what creates the CSWSH exposure: WebSockets are not subject to CORS, so any page
could open a socket to the deployment and the browser would attach the session cookie
automatically. Comparing `Origin` to `Host` needs no new configuration and works for
both `*.up.railway.app` and custom domains.

The existing `/snapclaw/terminal` branch is unchanged. Its single-use, 60-second token
already gates that path.

### Authorization header handling

`checkAuth()` accepts HTTP Basic in addition to the session cookie, and the proxy
injects the gateway token only when `authorization` is absent. A client authenticating
with Basic would therefore have its own header forwarded to OpenClaw, which expects
`Bearer ${GATEWAY_TOKEN}` — breaking exactly the API clients the Basic path exists to
serve.

After a successful `checkAuth()`, the proxy must **overwrite** `authorization` with the
bearer token rather than setting it only when missing. This applies to both the HTTP and
WebSocket paths.

## Scope

Unchanged and deliberately public:

- `GET /healthz` and `GET /snapclaw/healthz` — Railway's healthcheck targets
  `/healthz` per `railway.toml`. Gating it would fail every deploy.
- `GET /snapclaw-icon.png`
- `POST /snapclaw/login`

Telegram needs no inbound access. It polls outbound (`src/gateway.ts:202,216`), so no
webhook path has to remain reachable.

Out of scope: helmet security headers, self-hosting xterm.js off the CDN, and a CSP.
Each is a real finding from the same review and each is independent of this change.

## Verification

The repository has no test framework. Introducing one is a larger decision than this
fix warrants and is deferred.

Verify against the deployment after release:

| Check | Expected |
| --- | --- |
| `GET /` with no cookie | 302 to `/snapclaw` |
| `GET /some-gateway-path` with no cookie | 302 to `/snapclaw` |
| `GET /` with a valid session cookie | 200, OpenClaw Control |
| `GET /healthz` with no cookie | 200 |
| WS upgrade with a forged `Origin` | connection refused |
| WS upgrade with a valid cookie and matching `Origin` | connected |

The first check is the regression that matters: it returns the OpenClaw Control UI
today.
