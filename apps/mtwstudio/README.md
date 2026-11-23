# MTWStudio — MTW manager tool

MTWStudio lives **inside the existing MTW repository and dashboard**, not in a new repository. The new `mtwstudio` dashboard navigation item is manager-only. The actual application is independently authenticated; the MTW dashboard sessionStorage role is **not** treated as a security credential.

## Current implementation

- Dark, responsive remote-access console, login/logout, recent connection history and connection state.
- Worker-side manager login with PBKDF2-SHA256 password verification (240,000 iterations), short-lived opaque random session cookies, HTTP-only, Secure and cross-site iframe compatible.
- D1 records for accounts, hosts, code hashes, sessions and connection history.
- Cryptographically random short-lived one-time access codes issued **only** to an authenticated agent.
- Durable Object WebSocket signalling room; request messages go to the authorised agent; **only the host agent** may approve/reject. SDP and ICE only pass after approval.
- Browser WebRTC video receiver and **approved** WebRTC data-channel mouse/keyboard controls. No local computer capture.
- Code and login request rate limits and enforced server-side per-connection ownership.
- HTTPS/WSS on Cloudflare, encrypted WebRTC via DTLS-SRTP; no homegrown video encryption or storage.

**Not yet live:** No deployed Cloudflare resources, no provisioned manager accounts, no registered Windows host agent, no real stream, no TURN relay secrets, no end-to-end integration tests. Do not label a successful remote connection until a compatible agent has been built, connected and tested.

## Deployment checklist

1. Create Cloudflare D1 database `mtwstudio`; copy database ID into `wrangler.toml`.
2. From `apps/mtwstudio`, run `npm install` and `npx wrangler d1 migrations apply mtwstudio --remote`.
3. Provision **one or more manager accounts** directly in D1 via the local provisioning helper; never put password hashes, session tokens, or raw agent keys in Git.
4. Generate each host's 32-byte random secret separately and store its **SHA-256 hex** in `hosts.agent_key_hash`. The raw secret goes only to the external Windows agent. Store only hashes.
5. Set `EMBED_ORIGIN` to the exact MTW Webflow origin; deploy with `npm run deploy`.
6. In the MTW Webflow dashboard host configuration set `window.MTW_STUDIO_URL = "https://your-mtwstudio-app.example.com"` **before** loading dashboard navigation, or change the deployment constant through a dedicated environment-specific configuration. Never embed login secrets in this value.
7. In a production environment use a Cloudflare custom domain under the same site where practical; third-party cookie blocking can interfere with the embedded login. A full-tab app link is an alternative.
8. Deploy/verify the external agent using the protocol below, then validate manager-only access, one-time codes, approval/rejection, timeout, disconnect and history.

## Agent integration protocol (external project)

- Agent authenticates with `Authorization: Bearer <64-lowercase-hex-secret>`.
- `POST /api/agent/code` returns a 16-character hexadecimal code valid for five minutes.
- Agent connects to `GET /api/agent/ws?code=<code>` with WebSocket upgrade and the same bearer header.
- Controller logs in and requests the code. Agent receives `{type:"request",sessionId,expiresAt}`.
- Host must present a local consent UI and send `{type:"approve"}` or `{type:"reject"}`; the backend will not approve by itself.
- After approval, agent sends `{type:"offer",data: RTCSessionDescriptionInit}`; controller returns `{type:"answer",data: RTCSessionDescriptionInit}`. Either side sends `{type:"ice",data: RTCIceCandidateInit}`.
- Agent produces video using WebRTC and creates the `input` data channel. Remote input should be accepted only while host-side consent remains active; validate every event and enforce local keyboard/mouse safety bounds in the agent.
- Both sides may receive `{type:"end",reason}`. Agent must stop input immediately on disconnect.

## Security notes / deployment blockers

- Repository visibility is **public**, so do not commit environment secrets, live connection codes, API tokens or live account credentials.
- Static UI access is not confidential. Backend checks independently enforce manager access. For truly confidential manager-only content, fetch it only from authenticated API endpoints.
- Role checks based on the MTW Webflow `sessionStorage` are UI-only; MTWStudio uses server-side D1 manager accounts.
- Use Cloudflare WAF/rate limits in addition to application-level checks. Protect authentication against credential stuffing across distributed IPs and account enumeration.
- Check Webflow iframe sandbox and cookie settings; using the Cloudflare-hosted route directly is always an option.
- TURN fallback requires separately configured Cloudflare Realtime TURN or equivalent ephemeral credentials; **not yet integrated**. Never hardcode long-lived TURN secrets in JavaScript.
- Run an independent security review and full browser/agent test before allowing production remote access. The code is a deployment-ready development foundation, not a certified remote access product.

## Persistent codes and paired computers (development branch)

- Each host generates a **16-character code when started** with `POST /api/agent/code`. The code remains valid while the host runs and sends `POST /api/agent/heartbeat` with `{"code":"..."}` periodically (recommended every 60 seconds). The backend refreshes its expiration. Relaunching generates a fresh code.
- **Code mode:** the manager enters the running code each time, then the host approves the request. Codes are not consumed on connection; they are only valid with a connected agent.
- **Allow connections mode:** the host sets its preference with `POST /api/agent/mode`, `{"mode":"paired"}`. A manager enters the running code once under **Save this PC**. That creates a scoped trusted-controller record. Later the dashboard lists paired computers as online/offline, with **Connect to this PC** on online entries. Each connection still requests host approval.
- The pairing record is persistent but does **not** grant unattended access. The host must be online and consent to each connection. Never expose lists of all organisation computers to unpaired managers.
- A registered host must have a separate high-entropy bearer credential provisioned securely before it can call these endpoints.

### Important limitations

These browser/backend routes are implemented in the feature branch, **but there is no Windows host executable yet** and no live Cloudflare deployment. The web UI will not provide real remote-control capability until a signed portable Windows agent implements screen capture, WebRTC media, input handling, visible session controls, and host consent. TURN relay credentials and full integration tests are still pending.
