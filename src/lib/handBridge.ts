/**
 * Resolve the WebSocket URL the browser uses to receive hand / LiDAR frames
 * from the local hand-tracking bridge (`scripts/hand-tracking-server.js`).
 *
 * The bridge is a LAN-only dev relay: the iPhone pushes frames to it and it
 * forwards them to web clients on `:8766/ws`. There is intentionally NO relay
 * in production — `server.mjs` serves static files only — so this resolver
 * only ever yields a local / same-LAN default, never a public origin.
 *
 * Precedence (lowest to highest, with the runtime query param applied by the
 * caller on top of this):
 *   1. `ws://localhost:8766/ws` fallback (SSR / https / unknown host).
 *   2. Origin-derived `ws://<page-hostname>:8766/ws` for http pages — this is
 *      the fix for the hardcoded-`localhost` trap: open the dev server from
 *      another device on the same WiFi (`http://<host-ip>:5173`) and the
 *      browser still reaches the relay running on the host machine.
 *   3. `VITE_HAND_BRIDGE_URL` build-time override (explicit always wins).
 *
 * A `?iphone_url=` query param still overrides everything downstream
 * (see `useIPhoneUrl` in GraphCanvas).
 */

/** Web-visualization port of the local hand-tracking bridge. */
export const HAND_BRIDGE_WEB_PORT = 8766

export function getDefaultHandBridgeUrl(): string {
  const envUrl = (import.meta.env as Record<string, string | undefined>)
    .VITE_HAND_BRIDGE_URL
  if (envUrl) return envUrl

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location
    // The relay speaks plain ws:// only. From an https page, ws:// to a LAN
    // host is blocked as mixed content, so only derive the host for http
    // pages; otherwise fall back to localhost (which is a secure-context
    // exception and simply finds no relay in production).
    if (protocol === 'http:' && hostname) {
      return `ws://${hostname}:${HAND_BRIDGE_WEB_PORT}/ws`
    }
  }

  return `ws://localhost:${HAND_BRIDGE_WEB_PORT}/ws`
}
