# Academy Toolkit — Security Audit Report
**Date:** May 2026  
**Scope:** Full-stack production codebase (server/, client/, shared/)  
**Methods:** Automated SAST (Semgrep), dependency audit (npm audit), dataflow scan (HoundDog), manual code review across 5 specialist domains

---

## Executive Summary

Academy Toolkit is a well-structured application with solid fundamentals: bcrypt passwords, parameterised Drizzle queries, proper HMAC webhook verification, server-generated file paths, and spawn-array child-process execution. The biggest risks are **session fixation on login**, **no rate limiting on standard auth endpoints**, **SSRF on outbound webhooks**, and a **hardcoded fallback session secret** that silently undermines all security if the environment variable is not set. None of these require a rewrite — each is a targeted, low-effort fix.

**Deployment Readiness Score: 6.5 / 10**  
Fix the Critical and High items below before carrying live user traffic. Medium items should be addressed within 30 days.

---

## 1 — Critical Vulnerabilities

### C-1 · Session Fixation — No Session Regeneration After Login
**Severity:** CRITICAL  
**Location:** `server/routes.ts` — `/api/auth/login` and `/api/auth/signup`

**Description:**  
After a successful login, the existing session ID is reused. An attacker who can plant a session cookie on a victim's browser (via XSS on any subdomain, or network-level attack) can wait for the victim to log in and then use that known session ID to access the account.

**Reproduction:**
1. Make a GET request to any public page to receive a `connect.sid` cookie.
2. Pass that cookie to `POST /api/auth/login` with valid credentials.
3. The response contains the same `connect.sid`. The attacker who knew the original value now has an authenticated session.

**Fix:**
```typescript
// In /api/auth/login handler, replace req.session.userId = user.id with:
await new Promise<void>((resolve, reject) =>
  req.session.regenerate(err => err ? reject(err) : resolve())
);
req.session.userId = user.id;
// Repeat for /api/auth/signup
```

---

### C-2 · Hardcoded Fallback Session Secret
**Severity:** CRITICAL  
**Location:** `server/routes.ts:220`

**Description:**  
```typescript
secret: process.env.SESSION_SECRET || "video-confidence-coach-secret-key",
```
If `SESSION_SECRET` is not set (misconfigured deployment, secrets rotation gap, new environment), Express silently falls back to a publicly visible string. An attacker can forge `connect.sid` cookies using this known secret, impersonating any user including admins.

**Fix:**
```typescript
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}
// Then pass sessionSecret to the session middleware
```

---

## 2 — High Severity

### H-1 · No Rate Limiting on Standard Login / Signup
**Severity:** HIGH  
**Location:** `server/routes.ts` — `/api/auth/login`, `/api/auth/signup`

**Description:**  
The ClickFunnels login has `cfLoginLimiter` (10 attempts / 10 min). The standard email+password login and signup endpoints have **no rate limit at all**. An attacker can brute-force passwords or enumerate accounts at full server speed.

**Fix:** Apply rate limiting before the handlers:
```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later." },
});
app.post("/api/auth/login", authLimiter, ...);
app.post("/api/auth/signup", authLimiter, ...);
```

---

### H-2 · SSRF via Outbound Webhook Delivery
**Severity:** HIGH  
**Location:** `server/webhooks.ts:40`, `server/routes.ts:7710`

**Description:**  
User-registered webhook URLs are fetched server-side with only a basic `^https?://` regex check. An attacker can register `http://169.254.169.254/` (AWS metadata), `http://localhost:5432/` (database), or internal Replit infrastructure URLs. The Microlink screenshot path has full IP validation — the webhook path does not.

**Reproduction:**
1. Register a webhook via `POST /api/v1/webhooks` with `"url": "http://169.254.169.254/latest/meta-data/"`.
2. Trigger any task/project/DMO write event.
3. The server will POST to the cloud metadata endpoint.

**Fix:** Apply the same `safeNormalizeWebsite` + `isPrivateOrReservedIp` guard already used in `server/inboxIntelScreenshots.ts` before persisting or dispatching to any webhook URL:
```typescript
import { safeNormalizeWebsite } from "./inboxIntelScreenshots";
// In webhook registration handler:
const safeUrl = await safeNormalizeWebsite(url);
if (!safeUrl) return res.status(400).json({ message: "URL resolves to a private or reserved address" });
```

---

### H-3 · AES-GCM Key Derived with Hardcoded Salt
**Severity:** HIGH  
**Location:** `server/storage.ts` — `getEncryptionKey()`

**Description:**  
```typescript
return crypto.scryptSync(secret, 'salt', 32);
```
The literal string `'salt'` is the scrypt salt for every key derivation. scrypt's salt is meant to be random and unique so that an attacker cannot precompute a lookup table from the known secret. With a fixed salt, if `SESSION_SECRET` is ever leaked, all encrypted API keys and IMAP passwords are immediately recoverable with one scrypt invocation.

**Fix:** Store a dedicated, randomly generated `ENCRYPTION_SALT` in environment variables (separate from `SESSION_SECRET`), or use the HMAC of the stored ciphertext to bind the context. At minimum rename it something non-misleading to document the limitation:
```typescript
const salt = process.env.ENCRYPTION_SALT || "academy-toolkit-v1"; // document clearly, rotate if SESSION_SECRET changes
```
Longer term: generate a random salt per encrypted value and store it alongside the ciphertext.

---

### H-4 · HTTP Object Storage Integration (No TLS)
**Severity:** HIGH  
**Location:** `server/replit_integrations/object_storage/objectStorage.ts`

**Description:**  
SAST flagged an unencrypted HTTP request inside the object storage integration layer. Video files, thumbnails, and generated PDFs transit over plaintext HTTP between the application server and the storage backend.

**Fix:** Verify the storage integration client is configured to use HTTPS. If this is a Replit-managed integration, check whether the integration SDK has a `secure: true` or `https` option and ensure it is set.

---

### H-5 · No Rate Limiting on Public API v1
**Severity:** HIGH  
**Location:** `server/routes.ts` — all `/api/v1/*` routes

**Description:**  
API key authentication is enforced, but there is no per-key or per-IP request frequency throttle. A compromised or poorly-written client can send thousands of requests per second, causing database exhaustion or triggering AI API overage charges.

**Fix:**
```typescript
const apiV1Limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // 5 req/sec average
  keyGenerator: (req) => (req as any).apiUser?.id || req.ip,
  standardHeaders: true,
});
// Apply before requireApiKey or immediately after it
app.use("/api/v1", apiV1Limiter);
```

---

## 3 — Medium Severity

### M-1 · Session Cookie `saveUninitialized: true` — DoS Vector
**Severity:** MEDIUM  
**Location:** `server/routes.ts:226`

**Description:**  
Every unauthenticated HTTP request creates a server-side PostgreSQL session row. A bot sending thousands of requests to `/api/auth/login` (even with wrong credentials) will create thousands of session rows, bloating the `user_sessions` table and consuming DB connections.

**Fix:** Set `saveUninitialized: false`. OAuth state (Google, etc.) should be stored temporarily in a signed cookie or a short-lived cache rather than a full session. Review any code that reads session state before authentication and migrate to a cookie-based state token.

---

### M-2 · Global 50 MB JSON Body Limit on All Routes
**Severity:** MEDIUM  
**Location:** `server/index.ts:34`

**Description:**  
`express.json({ limit: "50mb" })` applies to every route, including unauthenticated public ones. Sending repeated 50 MB JSON payloads is a trivial DoS/memory-exhaustion vector.

**Fix:** Set the global limit to a safe default (1 KB–4 KB) and apply a larger limit only to the specific routes that need it (e.g., AI transcript routes):
```typescript
app.use(express.json({ limit: "4kb" }));
// On specific large-payload routes:
app.post("/api/sessions/:id/score", express.json({ limit: "50mb" }), requireAuth, ...);
```

---

### M-3 · `path.join` with Database-Sourced Paths — 32 Instances
**Severity:** MEDIUM  
**Location:** `server/ai.ts`, `server/ffmpeg.ts`, and others (32 instances flagged by SAST)

**Description:**  
Paths like `path.join(UPLOADS_DIR, session.thumbnailPath)` are generally safe because the values come from the database, not directly from user input. However, if any storage write path is ever derived from user-supplied data without sanitization, a `../../../etc/passwd` traversal becomes possible. The SAST tool flagged 32 instances where the joined value is non-literal.

**Fix:** Add a path confinement check on every file-serving route:
```typescript
function safeJoin(base: string, relative: string): string {
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
```
Replace all `path.join(UPLOADS_DIR, session.somePath)` calls with `safeJoin(UPLOADS_DIR, session.somePath)`.

---

### M-4 · No SendGrid Inbound Webhook Signature Verification
**Severity:** MEDIUM  
**Location:** `server/routes.ts` — `POST /api/inbox-analyzer/inbound`, `POST /api/inbox-intel/inbound`

**Description:**  
The endpoints accept any POST from any source and rely entirely on the recipient token being unguessable. SendGrid supports signed webhook payloads via `Sendgrid-Webhook-Signature`. Without this, any party who discovers the inbound domain can inject arbitrary emails into seed inboxes.

**Fix:** Implement SendGrid's event webhook signature verification using the `@sendgrid/eventwebhook` package, or at minimum validate the `X-Forwarded-For` source IP against [SendGrid's published IP ranges](https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook#ip-addresses-to-allowlist).

---

### M-5 · IP Address Logged to stdout on Password Reset
**Severity:** MEDIUM  
**Location:** `server/routes.ts:688` (HoundDog finding)

**Description:**  
The IP address of password reset requesters is logged to standard output. In a multi-tenant logging environment (shared log aggregation), this constitutes PII leakage. EU GDPR classifies IP addresses as personal data.

**Fix:** Log the IP only to a dedicated audit/security log at `info` level, not `console.log`. Consider hashing or truncating it (e.g., log the first two octets only) if the only purpose is geographic abuse detection.

---

### M-6 · HTML Rendered in Template Strings — 34 Instances
**Severity:** MEDIUM  
**Location:** `client/src/lib/teleprompter.ts`, `client/src/pages/topic-pulse-script.tsx` (and others)

**Description:**  
SAST detected `dangerouslySetInnerHTML`-equivalent patterns: HTML constructed in template literals. If any value interpolated into those strings is ever user-controlled without escaping, it becomes a stored XSS vector.

**Fix:** Audit each of the 34 flagged locations. Replace any string interpolation that includes user-supplied content with a safe rendering approach (React elements, `DOMPurify.sanitize()`, or `textContent` assignment rather than `innerHTML`).

---

### M-7 · `unsafe-dynamic-method` — 5 Instances in routes.ts
**Severity:** MEDIUM  
**Location:** `server/routes.ts` (5 instances)

**Description:**  
Dynamic method dispatch (e.g., `obj[userValue]()`) can allow property injection if `userValue` is not strictly validated against a known allowlist.

**Fix:** Replace dynamic method calls with explicit switch/if statements or an allowlisted map.

---

### M-8 · Non-literal Regexp from User Input
**Severity:** MEDIUM  
**Location:** `server/inboxAnalyzer.ts`

**Description:**  
A user-supplied string is compiled into a `RegExp`. Crafted inputs like `(a+)+$` cause catastrophic backtracking (ReDoS).

**Fix:**
```typescript
import RE2 from "re2"; // linear-time regex engine
// Or validate input against a safe character allowlist before compiling
```

---

### M-9 · `react-href-var` — Unvalidated href
**Severity:** MEDIUM  
**Location:** `client/src/pages/sender-reputation.tsx`

**Description:**  
A variable is used directly as an `href` attribute. If the variable can contain `javascript:` (e.g., from a stored API response), this is a stored XSS / open redirect.

**Fix:**
```typescript
// Validate before use:
const safeHref = href.startsWith("https://") || href.startsWith("http://") ? href : "#";
```

---

## 4 — Low Severity

### L-1 · Email Addresses Logged to stdout — 35 Instances
**Severity:** LOW  
**Location:** Multiple files (HoundDog finding — 35 instances across `server/routes.ts`, `server/imapPlacement.ts`, etc.)

**Description:**  
User email addresses appear in `console.log` and `console.error` statements. These will appear in application logs which may be retained, aggregated, and accessible to third parties.

**Fix:** Replace `console.log("email:", email)` patterns with structured logging that can redact PII fields in production. Consider `console.log("email:", email.split("@")[1])` (log domain only) for diagnostic messages.

---

### L-2 · Dependency Vulnerabilities (3 total — 1 High, 2 Moderate)
**Severity:** LOW–HIGH (varies per package)  
**Source:** npm audit

**Fix:** Run `npm audit fix` and review any that require `--force`. Pin updated versions in `package.json`.

---

### L-3 · `resave: true` on Session Store
**Severity:** LOW  
**Location:** `server/routes.ts:225`

**Description:**  
`resave: true` saves the session to the store on every response even when nothing changed, creating unnecessary write load on the `user_sessions` PostgreSQL table under high traffic.

**Fix:** Set `resave: false`. The PostgreSQL session store (`connect-pg-simple`) supports the `touch` method, which correctly handles session refresh without full re-save.

---

### L-4 · Missing Subresource Integrity on External Assets
**Severity:** LOW  
**Location:** `client/index.html`

**Description:**  
SAST flagged one external script/stylesheet reference without an `integrity` attribute. If the CDN is compromised, an attacker can inject arbitrary JavaScript.

**Fix:** Add `integrity` and `crossorigin="anonymous"` attributes to external `<script>` and `<link>` tags. Generate the hash with `openssl dgst -sha384 -binary <file> | openssl base64 -A`.

---

## 5 — Performance & Scalability

### P-1 · No Database Query Result Caching
Sessions, DMO entries, and project lists are fetched from PostgreSQL on every request with no caching layer. Under 100+ concurrent users, this will surface as slow response times. **Recommendation:** Add Redis or an in-process LRU cache (e.g., `lru-cache`) for read-heavy queries like `getUser`, `getSessionsByUser`, and `getProjectsForUser`.

### P-2 · AI Scoring Calls Are Synchronous per Request
`POST /api/sessions/:id/score` calls OpenAI synchronously and holds the HTTP connection open during inference (which can take 10–30 seconds). Under concurrent use, this exhausts Node.js I/O capacity. **Recommendation:** Move AI calls to a background job queue (BullMQ + Redis) and poll for completion.

### P-3 · Video Uploads Hold Open Long HTTP Connections
`httpServer.timeout` is set to 30 minutes to accommodate large video uploads. This keeps a TCP connection and a Node.js request handler alive per upload, severely limiting concurrent upload throughput. **Recommendation:** Move to multipart upload with chunking, or use signed upload URLs directly to object storage.

### P-4 · No Connection Pooling Limits on Placement Scheduler
`runPlacementCheckForUser` fires `Promise.all` across all seed inboxes simultaneously. With many active inboxes, this creates a burst of IMAP connections and DB queries. **Recommendation:** Use `p-limit` to cap concurrent IMAP connections to 3–5.

---

## 6 — Recommended Fixes — Prioritized

| Priority | Item | Effort |
|----------|------|--------|
| 1 | C-2: Remove hardcoded session secret fallback (throw instead) | 5 min |
| 2 | C-1: Add `req.session.regenerate()` on login + signup | 15 min |
| 3 | H-1: Add `authLimiter` to `/api/auth/login` and `/api/auth/signup` | 15 min |
| 4 | H-2: Apply SSRF IP validation to webhook URLs | 30 min |
| 5 | H-5: Add rate limiter to `/api/v1/*` | 15 min |
| 6 | M-1: Set `saveUninitialized: false` | 5 min |
| 7 | M-2: Reduce global JSON body limit to 4 KB | 5 min |
| 8 | M-3: Add `safeJoin()` path confinement helper | 30 min |
| 9 | H-3: Document scrypt salt limitation; add `ENCRYPTION_SALT` env var | 20 min |
| 10 | H-4: Verify object storage TLS | 15 min |
| 11 | npm audit fix | 10 min |
| 12 | M-6: Audit 34 HTML template string usages | 1 day |
| 13 | M-8: Replace dynamic RegExp with RE2 in inboxAnalyzer | 30 min |
| 14 | L-1: Redact PII from debug logging | 2 hr |

---

## 7 — Security Hardening Recommendations

1. **Content Security Policy (CSP):** Add a `Content-Security-Policy` header in production that restricts script sources to `'self'` and blocks `javascript:` URIs.
2. **HSTS:** Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` if serving over a custom domain.
3. **X-Frame-Options / CSP frame-ancestors:** Prevent clickjacking.
4. **Rotate SESSION_SECRET periodically** — this invalidates all existing sessions but protects against long-term token theft.
5. **Separate ENCRYPTION_SALT from SESSION_SECRET** — rotating the session secret today silently invalidates all encrypted API keys and IMAP passwords.
6. **Audit log immutability:** The action log table should have insert-only access from the application (no UPDATE/DELETE permissions granted to the app DB user).

---

## 8 — Load Testing Scripts

```bash
# Install k6: https://k6.io
# Test: Login endpoint under concurrent load
cat > load-test-login.js << 'EOF'
import http from "k6/http";
import { sleep, check } from "k6";

export let options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m",  target: 100 },
    { duration: "30s", target: 0 },
  ],
};

export default function () {
  const res = http.post("https://YOUR_APP_URL/api/auth/login", JSON.stringify({
    email: "test@example.com",
    password: "wrongpassword",
  }), { headers: { "Content-Type": "application/json" } });
  check(res, { "status is 401 or 429": (r) => r.status === 401 || r.status === 429 });
  sleep(1);
}
EOF
k6 run load-test-login.js
```

```bash
# Test: Public API v1 throughput
cat > load-test-api.js << 'EOF'
import http from "k6/http";
import { sleep, check } from "k6";

export let options = { vus: 50, duration: "60s" };

export default function () {
  const res = http.get("https://YOUR_APP_URL/api/v1/tasks", {
    headers: { "X-API-Key": "ftk_YOUR_TEST_KEY" },
  });
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(0.1);
}
EOF
k6 run load-test-api.js
```

---

## 9 — CI/CD Recommendations

Add the following to your CI pipeline (GitHub Actions / Replit Deployments):

```yaml
security:
  steps:
    - name: Dependency audit
      run: npm audit --audit-level=high
    - name: Semgrep SAST
      uses: semgrep/semgrep-action@v1
      with:
        config: auto
    - name: Check for hardcoded secrets
      run: npx secretlint "**/*"
    - name: Type check
      run: npx tsc --noEmit
    - name: Run tests
      run: npm test
```

---

## 10 — Monitoring Recommendations

1. **Alert on 401/403 spikes** — sudden spike in auth failures indicates brute-force attempt.
2. **Alert on 500 errors** — any unhandled exception in production should page on-call.
3. **Session table row count** — monitor `user_sessions` row growth; runaway anonymous sessions will surface as bloat.
4. **AI API spend** — set budget alerts on OpenAI and Gemini dashboards; no per-user quota is enforced in code.
5. **IMAP connection failures** — log and alert when placement check returns `error` status for the same inbox repeatedly (indicates expired App Password).
6. **Webhook delivery failures** — log failed outbound webhook POSTs and surface them in the admin panel.

---

## 11 — Automated Test Recommendations

```typescript
// Security regression tests to add:

describe("Auth hardening", () => {
  it("should regenerate session ID after login", async () => {
    const pre = await getSessionCookie();
    await login(pre, validCreds);
    const post = await getSessionCookie();
    expect(pre).not.toBe(post); // C-1
  });

  it("should return 429 after 20 failed login attempts", async () => {
    for (let i = 0; i < 20; i++) await login(badCreds);
    const res = await login(badCreds);
    expect(res.status).toBe(429); // H-1
  });

  it("should reject SSRF webhook URLs", async () => {
    const res = await registerWebhook("http://169.254.169.254/");
    expect(res.status).toBe(400); // H-2
  });

  it("should fail startup without SESSION_SECRET", async () => {
    delete process.env.SESSION_SECRET;
    expect(() => initializeApp()).toThrow("SESSION_SECRET"); // C-2
  });
});
```

---

## 12 — Deployment Readiness Checklist

- [ ] `SESSION_SECRET` set in production secrets (not fallback string)
- [ ] `ENCRYPTION_SALT` set separately from `SESSION_SECRET`
- [ ] `NODE_ENV=production` confirmed (enables secure cookies)
- [ ] `session.saveUninitialized` set to `false`
- [ ] Rate limiting applied to `/api/auth/login`, `/api/auth/signup`, `/api/v1/*`
- [ ] Session regeneration added post-login
- [ ] SSRF guard applied to webhook URL registration
- [ ] `npm audit` clean (no high/critical)
- [ ] CSP header configured
- [ ] Error responses in production return generic messages (no stack traces)
- [ ] AI API budget alerts configured
- [ ] Object storage confirmed to use TLS
