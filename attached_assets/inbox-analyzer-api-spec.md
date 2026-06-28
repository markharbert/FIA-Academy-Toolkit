# Inbox Analyzer — Full Technical Reference for Mobile App Development

**Base URL:** `https://your-app.replit.app`  
**API Version:** v1  
**Authentication:** All endpoints require a valid API key  

---

## Table of Contents

1. [What the Inbox Analyzer Is](#1-what-the-inbox-analyzer-is)
2. [How the System Works End-to-End](#2-how-the-system-works-end-to-end)
3. [Authentication](#3-authentication)
4. [Data Model Reference](#4-data-model-reference)
5. [Endpoint Reference](#5-endpoint-reference)
   - [GET /api/v1/inbox-analyzer/address](#51-get-apiv1inbox-analyzeraddress)
   - [GET /api/v1/inbox-analyzer/emails](#52-get-apiv1inbox-anslyzeremails)
   - [GET /api/v1/inbox-analyzer/emails/:id](#53-get-apiv1inbox-analyzeremailsid)
   - [GET /api/v1/inbox-analyzer/emails/:id/placement](#54-get-apiv1inbox-analyzeremailsidplacement)
   - [GET /api/v1/inbox-analyzer/summary](#55-get-apiv1inbox-analyzersummary)
6. [AI Insight Object Schemas](#6-ai-insight-object-schemas)
7. [Score Calculation Logic](#7-score-calculation-logic)
8. [Placement Monitoring Explained](#8-placement-monitoring-explained)
9. [Status Field Values](#9-status-field-values)
10. [Suggested Mobile UI Flows](#10-suggested-mobile-ui-flows)

---

## 1. What the Inbox Analyzer Is

The Inbox Analyzer is an email intelligence tool built into Academy Toolkit. Its primary purpose is to let a user analyze any email — whether their own campaigns or competitor emails — by forwarding it to a unique personal seed address. The system then:

- Parses the raw email and extracts every header, authentication result, and body element
- Runs the email through seven AI-powered analysis modules using OpenAI
- Performs DNS blacklist lookups on the sending IP and domain
- Optionally runs inbox placement tests across real seed mailboxes (Gmail tabs, Outlook, etc.)
- Produces a scored report with actionable recommendations

This is a **read-only** tool from the mobile app's perspective. Users cannot submit emails or trigger analysis through the API — that happens via email forwarding on the web. The mobile app surfaces the results.

---

## 2. How the System Works End-to-End

### Step 1: The User's Seed Address
Every user account has exactly one unique seed email address, automatically created the first time they visit the Inbox Analyzer. The address format is:

```
<10-character-token>@score.fearlesspromo.com
```

Example: `mk8i4qoeom@score.fearlesspromo.com`

The token is a random 20-character string stored in the database and permanently tied to the user. This address never changes and never expires.

### Step 2: Submitting an Email for Analysis
To analyze an email, the user (or anyone they give the address to) simply **forwards or sends** an email to their seed address. There is no API call involved — it's just email.

SendGrid's inbound parse webhook receives the email and delivers it to the server, which:
1. Looks up the seed token in the address to identify the user
2. Parses the raw MIME message: headers, body (text + HTML), attachments
3. Extracts SPF, DKIM, and DMARC results from the `Authentication-Results` header
4. Extracts sending IP, sending domain, message ID, reply-to, from name/address
5. Stores a new `email_analyses` record with `status = "pending"`

### Step 3: AI Analysis Pipeline
The server runs the email through OpenAI, producing seven separate analysis objects:

| AI Module | What It Analyzes |
|-----------|-----------------|
| `spamFlags` | Spam trigger words and structural red flags |
| `copyFeedback` | Marketing copy quality across multiple dimensions |
| `subjectAnalysis` | Subject line characteristics (length, emoji, personalization, etc.) |
| `technicalHealth` | HTML structure, image alt tags, tracking pixels, preheader |
| `senderTrust` | Display name consistency, reply-to matching, domain trust |
| `contentQuality` | Word count, link density, hidden text, URL shorteners |
| `canSpamCompliance` | Physical address, unsubscribe link, subject line honesty |

In parallel, the server runs DNS blacklist checks (DNSBL) against the sending IP and domain, detects URL shorteners in links, and analyzes hidden text in the HTML.

### Step 4: Scoring
Once analysis is complete, three numeric scores are computed and stored (all 0–100):

- **`overallScore`** — Composite score combining spam, copy, auth, and content dimensions
- **`spamScore`** — Inverse spam likelihood (100 = very clean, 0 = highly spammy)
- **`copyScore`** — Raw AI marketing copy score

The record is updated to `status = "complete"`.

### Step 5: Inbox Placement Testing (Optional)
Separately, the user can trigger an inbox placement test. This sends a test email from their registered sending address to a panel of real seed inboxes (Gmail Primary, Gmail Promotions, Gmail Social, Gmail Updates, Outlook, etc.). The system then polls each inbox via IMAP/Gmail API and reports where the email landed. Results are stored on the email record and on the user's address record.

---

## 3. Authentication

All `/api/v1/*` endpoints require an API key. Users generate their key from the Account page of the web app.

**Headers accepted (use either):**
```
Authorization: Bearer ftk_<key>
```
or
```
X-API-Key: ftk_<key>
```

Keys are stored in the database as SHA-256 hashes. The raw key is shown to the user only once at generation time.

**ClickFunnels membership** is re-validated against the ClickFunnels API once every 24 hours per key. If membership lapses, the key returns `403 Forbidden`.

**Error responses:**
```json
{ "message": "Missing or invalid API key. Use Authorization: Bearer <key> or X-API-Key header." }
```
```json
{ "message": "ClickFunnels membership not active" }
```

---

## 4. Data Model Reference

### EmailAnalysis (one record per analyzed email)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Primary key |
| `userId` | `string` | Owner user ID |
| `status` | `"pending" \| "analyzing" \| "complete" \| "error"` | Processing state |
| `receivedAt` | `ISO 8601 timestamp` | When the email was received by the server |
| `fromAddress` | `string` | Sender's email address |
| `fromName` | `string \| null` | Sender's display name |
| `replyTo` | `string \| null` | Reply-To address if different from From |
| `messageId` | `string \| null` | Email Message-ID header value |
| `subject` | `string` | Email subject line |
| `bodyText` | `string \| null` | Plain-text version of the body |
| `sendingDomain` | `string \| null` | Domain extracted from the sending IP's rDNS or From header |
| `sendingIp` | `string \| null` | IP address the email was sent from |
| `spfResult` | `"pass" \| "fail" \| "softfail" \| "neutral" \| "none" \| null` | SPF authentication result |
| `dkimResult` | `"pass" \| "fail" \| "none" \| null` | DKIM authentication result |
| `dmarcResult` | `"pass" \| "fail" \| "none" \| null` | DMARC policy result |
| `spfRecordExists` | `boolean \| null` | Whether an SPF DNS record was found |
| `dkimRecordExists` | `boolean \| null` | Whether a DKIM DNS record was found |
| `dmarcRecordExists` | `boolean \| null` | Whether a DMARC DNS record was found |
| `overallScore` | `integer 0–100 \| null` | Composite score (null until analysis complete) |
| `spamScore` | `integer 0–100 \| null` | Spam cleanliness score |
| `copyScore` | `integer 0–100 \| null` | Marketing copy quality score |
| `spamFlags` | `SpamFlag[] \| null` | Array of AI-detected spam signals |
| `copyFeedback` | `CopyFeedback \| null` | Sectional copy feedback with suggestions |
| `subjectAnalysis` | `SubjectAnalysis \| null` | Subject line structural breakdown |
| `technicalHealth` | `TechnicalHealth \| null` | HTML/technical email health metrics |
| `senderTrust` | `SenderTrust \| null` | Reputation and trust signals |
| `contentQuality` | `ContentQuality \| null` | Content density and structure metrics |
| `canSpamCompliance` | `CanSpamCompliance \| null` | CAN-SPAM compliance check |
| `placementResults` | `PlacementResult[] \| null` | Inbox placement per seed mailbox |
| `placementConfirmedAt` | `ISO 8601 timestamp \| null` | When placement results were finalized |

### EmailInboxAddress (one record per user)

| Field | Type | Description |
|-------|------|-------------|
| `token` | `string` | The 10-char token used in the seed address |
| `email` | `string` | Full seed address: `<token>@score.fearlesspromo.com` |
| `sendingFromAddress` | `string \| null` | The user's registered sending email (used for placement tests) |
| `lastPlacementResults` | `PlacementResult[] \| null` | Results from the most recent placement monitoring run |
| `lastPlacementCheckedAt` | `timestamp \| null` | When the last placement check completed |
| `placementAutoCheckUntil` | `timestamp \| null` | If set, the system is actively polling placement until this time |
| `placementCheckMessageId` | `string \| null` | Message-ID of the email being tracked in the active window |
| `placementCheckSubject` | `string \| null` | Subject of the email being tracked |
| `placementCheckReceivedAt` | `timestamp \| null` | When the tracked email was received |

---

## 5. Endpoint Reference

---

### 5.1 `GET /api/v1/inbox-analyzer/address`

Returns the user's unique seed inbox address and the current state of placement monitoring. This is the starting point for the mobile app — call it first to show the user their address and whether a live placement test is in progress.

**Request:**
```
GET /api/v1/inbox-analyzer/address
Authorization: Bearer ftk_<key>
```

**Response: 200 OK**
```json
{
  "token": "mk8i4qoeom",
  "email": "mk8i4qoeom@score.fearlesspromo.com",
  "sendingFromAddress": "mark@example.com",
  "lastPlacementResults": [
    {
      "provider": "gmail",
      "label": "Gmail - Primary",
      "status": "primary",
      "checkedAt": "2026-06-15T10:30:00.000Z"
    },
    {
      "provider": "gmail",
      "label": "Gmail - Promotions",
      "status": "promotions",
      "checkedAt": "2026-06-15T10:30:00.000Z"
    },
    {
      "provider": "outlook",
      "label": "Outlook",
      "status": "inbox",
      "checkedAt": "2026-06-15T10:30:00.000Z"
    }
  ],
  "lastPlacementCheckedAt": "2026-06-15T10:30:00.000Z",
  "placementAutoCheckUntil": null,
  "placementCheckMessageId": null,
  "placementCheckSubject": null,
  "placementCheckReceivedAt": null,
  "createdAt": "2026-04-29T14:17:28.990Z"
}
```

**Notes:**
- `lastPlacementResults` is the result set from the most recent placement monitoring run (not tied to a specific email). It is `null` if no placement test has ever been run.
- `placementAutoCheckUntil` being non-null means a live monitoring window is active. The server is currently polling seed inboxes automatically.
- `placementCheckMessageId`, `placementCheckSubject`, `placementCheckReceivedAt` are populated when a specific email is being actively monitored.
- Seed inbox email addresses are stripped from `lastPlacementResults` — each result only contains `provider`, `label`, `status`, `checkedAt`. The actual seed inbox address is never exposed to API consumers.

---

### 5.2 `GET /api/v1/inbox-analyzer/emails`

Returns a paginated list of all email analyses for the authenticated user. Returns summary-level fields only — no body HTML, raw headers, or full AI insight objects. Use this for a feed/list view.

**Request:**
```
GET /api/v1/inbox-analyzer/emails?limit=20&offset=0
Authorization: Bearer ftk_<key>
```

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | `50` | `100` | Number of records to return |
| `offset` | integer | `0` | — | Number of records to skip (for pagination) |

**Response: 200 OK**
```json
{
  "total": 47,
  "limit": 20,
  "offset": 0,
  "emails": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "subject": "Your exclusive offer inside 🔥",
      "fromAddress": "promos@competitor.com",
      "fromName": "Competitor Brand",
      "receivedAt": "2026-06-14T09:22:11.000Z",
      "status": "complete",
      "overallScore": 74,
      "spamScore": 68,
      "copyScore": 81,
      "spfResult": "pass",
      "dkimResult": "pass",
      "dmarcResult": "pass",
      "sendingDomain": "mail.competitor.com",
      "sendingIp": "198.51.100.42",
      "hasPlacementResults": true
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "subject": "Last chance to grab your spot",
      "fromAddress": "info@anotherbrand.com",
      "fromName": null,
      "receivedAt": "2026-06-13T14:05:33.000Z",
      "status": "analyzing",
      "overallScore": null,
      "spamScore": null,
      "copyScore": null,
      "spfResult": "pass",
      "dkimResult": "fail",
      "dmarcResult": "fail",
      "sendingDomain": "anotherbrand.com",
      "sendingIp": "203.0.113.99",
      "hasPlacementResults": false
    }
  ]
}
```

**Field Notes:**
- `status` — See section 9 for all possible values. An email with `status: "analyzing"` will have `null` for score fields until processing completes. Poll `/summary` to detect when new emails finish.
- `hasPlacementResults` — Boolean shortcut so you can show a placement badge on list items without fetching the full record.
- Results are ordered **newest first** (most recently received).
- `total` reflects the total number of emails across all pages, not just the current page.

**Pagination Example:**
```
Page 1: GET /emails?limit=20&offset=0   → items 1–20
Page 2: GET /emails?limit=20&offset=20  → items 21–40
Page 3: GET /emails?limit=20&offset=40  → items 41–47
```

---

### 5.3 `GET /api/v1/inbox-analyzer/emails/:id`

Returns the full analysis record for a single email, including all AI insight objects, authentication detail, and placement results. This is the detail view.

**Request:**
```
GET /api/v1/inbox-analyzer/emails/a1b2c3d4-e5f6-7890-abcd-ef1234567890
Authorization: Bearer ftk_<key>
```

**Response: 200 OK**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "subject": "Your exclusive offer inside 🔥",
  "fromAddress": "promos@competitor.com",
  "fromName": "Competitor Brand",
  "replyTo": "support@competitor.com",
  "messageId": "<abc123@mail.competitor.com>",
  "receivedAt": "2026-06-14T09:22:11.000Z",
  "status": "complete",
  "bodyText": "Hi there, we have an exclusive offer just for you...",

  "sendingDomain": "mail.competitor.com",
  "sendingIp": "198.51.100.42",

  "overallScore": 74,
  "spamScore": 68,
  "copyScore": 81,

  "spfResult": "pass",
  "dkimResult": "pass",
  "dmarcResult": "pass",
  "spfRecordExists": true,
  "dkimRecordExists": true,
  "dmarcRecordExists": true,

  "spamFlags": [
    {
      "label": "Uses urgency phrase 'last chance'",
      "severity": "low",
      "category": "trigger_word",
      "matches": ["last chance"]
    },
    {
      "label": "ALL CAPS word detected in body",
      "severity": "medium",
      "category": "structural",
      "matches": ["FREE"]
    }
  ],

  "copyFeedback": {
    "sections": [
      {
        "name": "Hook / Opening",
        "score": 85,
        "feedback": "Strong opening that creates curiosity. Consider adding a specific benefit in the first sentence."
      },
      {
        "name": "Body / Story",
        "score": 78,
        "feedback": "Good narrative flow. The story could be more personal and specific to the reader's situation."
      },
      {
        "name": "Call to Action",
        "score": 90,
        "feedback": "Clear, single CTA. Well placed and action-oriented."
      }
    ],
    "topSuggestions": [
      "Add the reader's first name in the opening line for personalization.",
      "Replace 'FREE' with a specific benefit statement to reduce spam risk.",
      "Consider a P.S. line to reinforce the main offer."
    ]
  },

  "subjectAnalysis": {
    "charCount": 34,
    "wordCount": 6,
    "hasEmoji": true,
    "hasNumber": false,
    "hasQuestion": false,
    "hasPersonalizationToken": false,
    "isIdealLength": true
  },

  "technicalHealth": {
    "hasHtmlVersion": true,
    "hasPlainTextVersion": true,
    "estimatedSizeKb": 42.3,
    "missingAltCount": 3,
    "trackingPixelCount": 2,
    "uniqueExternalDomains": 5,
    "hasPreheader": true
  },

  "senderTrust": {
    "displayNameDomainMatch": true,
    "replyToMatchesFrom": false,
    "blacklisted": false,
    "blacklistHits": [],
    "domainBlacklisted": false,
    "domainBlacklistHits": [],
    "trackingDomainsChecked": ["click.competitor.com", "track.competitor.com"],
    "trackingDomainsBlacklisted": [],
    "trackingDomainMismatch": false,
    "trackingDomainRoots": ["competitor.com"]
  },

  "contentQuality": {
    "wordCount": 312,
    "linkCount": 4,
    "hasPs": true,
    "hasPersonalization": false,
    "htmlToTextRatio": 0.52,
    "hasUrlShortener": false,
    "hasHiddenText": true,
    "hiddenTextClassification": "PREHEADER",
    "hiddenBlocks": [
      {
        "text": "View this email in your browser",
        "methods": ["font-size:0"],
        "position": 0,
        "hasLinks": true,
        "hasImages": false,
        "classification": "PREHEADER"
      }
    ],
    "hiddenTextSamples": ["View this email in your browser"],
    "linkToTextRatio": 0.013,
    "isImageHeavy": false,
    "subjectCharCount": 34
  },

  "canSpamCompliance": {
    "hasPhysicalAddress": true,
    "hasUnsubscribeLink": true,
    "hasHonestSubject": true,
    "score": 100
  },

  "placementResults": [
    {
      "provider": "gmail",
      "label": "Gmail - Primary",
      "status": "primary",
      "checkedAt": "2026-06-14T09:45:00.000Z"
    },
    {
      "provider": "gmail",
      "label": "Gmail - Promotions",
      "status": "promotions",
      "checkedAt": "2026-06-14T09:45:00.000Z"
    },
    {
      "provider": "outlook",
      "label": "Outlook",
      "status": "inbox",
      "checkedAt": "2026-06-14T09:45:00.000Z"
    }
  ],
  "placementConfirmedAt": "2026-06-14T09:45:00.000Z"
}
```

**Error Response: 404 Not Found**
```json
{ "message": "Email not found" }
```

**Important Notes:**
- `bodyHtml` and `rawHeaders` are intentionally excluded from this endpoint to keep payload sizes manageable. The plain-text `bodyText` is included.
- All AI insight fields (`spamFlags`, `copyFeedback`, etc.) are `null` if the email is still `status: "pending"` or `"analyzing"`.
- Score fields (`overallScore`, `spamScore`, `copyScore`) are `null` until analysis is complete.
- Records are ownership-scoped — a user can only access their own email records. A request for another user's email ID returns `404`, not `403`, to avoid enumeration.

---

### 5.4 `GET /api/v1/inbox-analyzer/emails/:id/placement`

Returns only the placement results for a specific email, with a pre-computed `placementRate` percentage. Use this for a dedicated placement detail screen or to refresh placement data without re-fetching the full analysis.

**Request:**
```
GET /api/v1/inbox-analyzer/emails/a1b2c3d4-e5f6-7890-abcd-ef1234567890/placement
Authorization: Bearer ftk_<key>
```

**Response: 200 OK (with placement data)**
```json
{
  "messageId": "<abc123@mail.competitor.com>",
  "subject": "Your exclusive offer inside 🔥",
  "receivedAt": "2026-06-14T09:22:11.000Z",
  "placementRate": 67,
  "results": [
    {
      "provider": "gmail",
      "label": "Gmail - Primary",
      "status": "primary",
      "checkedAt": "2026-06-14T09:45:00.000Z"
    },
    {
      "provider": "gmail",
      "label": "Gmail - Promotions",
      "status": "promotions",
      "checkedAt": "2026-06-14T09:45:00.000Z"
    },
    {
      "provider": "gmail",
      "label": "Gmail - Spam",
      "status": "spam",
      "checkedAt": "2026-06-14T09:45:00.000Z"
    }
  ],
  "confirmedAt": "2026-06-14T09:45:00.000Z"
}
```

**Response: 200 OK (no placement data yet)**
```json
{
  "messageId": "<abc123@mail.competitor.com>",
  "subject": "Your exclusive offer inside 🔥",
  "receivedAt": "2026-06-14T09:22:11.000Z",
  "placementRate": null,
  "results": null,
  "confirmedAt": null
}
```

**How `placementRate` is computed:**

1. Filter results to only **definitive** statuses: `primary`, `promotions`, `social`, `updates`, `forums`, `spam`
   - Statuses like `pending` or `unknown` are excluded from the calculation
2. Count how many of those are **not** `spam`
3. `placementRate = round((inboxCount / definitiveCount) * 100)`

So if 3 out of 4 definitive results landed in any inbox tab (not spam), `placementRate = 75`.

**Possible `status` values per placement result:**

| Status | Meaning |
|--------|---------|
| `primary` | Landed in Gmail Primary inbox |
| `promotions` | Landed in Gmail Promotions tab |
| `social` | Landed in Gmail Social tab |
| `updates` | Landed in Gmail Updates tab |
| `forums` | Landed in Gmail Forums tab |
| `spam` | Landed in spam/junk folder |
| `inbox` | Landed in inbox (non-Gmail providers like Outlook) |
| `pending` | Inbox not yet checked |
| `unknown` | Could not determine placement |

Note: `primary`, `promotions`, `social`, `updates`, `forums`, and `inbox` all count as **inbox** for the `placementRate` calculation. Only `spam` counts against it.

**Error Response: 404 Not Found**
```json
{ "message": "Email not found" }
```

---

### 5.5 `GET /api/v1/inbox-analyzer/summary`

Returns computed aggregate analytics across all of the user's completed email analyses. This mirrors exactly what the analytics dashboard cards show on the web app. Use it for a home screen summary widget or dashboard card.

**Request:**
```
GET /api/v1/inbox-analyzer/summary
Authorization: Bearer ftk_<key>
```

**Response: 200 OK**
```json
{
  "totalEmails": 47,
  "completedEmails": 43,
  "avgOverallScore": 71,
  "avgAuthScore": 87,
  "avgContentQualityScore": 64,
  "placementRate": 82,
  "placementCheckedCount": 11,
  "trend": "up",
  "computedAt": "2026-06-28T21:31:44.743Z"
}
```

**Response: 200 OK (no data yet)**
```json
{
  "totalEmails": 0,
  "completedEmails": 0,
  "avgOverallScore": null,
  "avgAuthScore": null,
  "avgContentQualityScore": null,
  "placementRate": null,
  "placementCheckedCount": 0,
  "trend": null,
  "computedAt": "2026-06-28T21:31:44.743Z"
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `totalEmails` | `integer` | Total emails received (any status) |
| `completedEmails` | `integer` | Emails with full AI analysis complete |
| `avgOverallScore` | `integer 0–100 \| null` | Average composite score across completed emails |
| `avgAuthScore` | `integer 0–100 \| null` | Average computed authentication score (see scoring formula below) |
| `avgContentQualityScore` | `integer 0–100 \| null` | Average computed content quality score (see scoring formula below) |
| `placementRate` | `integer 0–100 \| null` | Percentage of placement-tested emails that landed in inbox (not spam). `null` if no placement tests have been run. |
| `placementCheckedCount` | `integer` | Number of emails that have placement results |
| `trend` | `"up" \| "down" \| "flat" \| null` | Direction of overall score trend (null if fewer than 6 completed emails) |
| `computedAt` | `ISO 8601 timestamp` | When this summary was computed (always the current request time) |

**Trend Calculation:**
- Requires at least 6 completed emails with scores
- Compares the average of the **5 most recent** scores to the average of the **5 before those**
- If recent average > previous average + 2 points → `"up"`
- If recent average < previous average − 2 points → `"down"`
- Otherwise → `"flat"`
- The 2-point deadband prevents minor noise from flipping the direction

---

## 6. AI Insight Object Schemas

These are the TypeScript types as defined in the application. Every field in every AI object can be `null` if the email has not yet been analyzed.

### `SpamFlag[]` (array)
```typescript
type SpamFlag = {
  label: string;                                                          // Human-readable description of the flag
  severity: "low" | "medium" | "high";                                   // Risk level
  category?: "trigger_word" | "subject_trigger" | "structural" | "pattern"; // What kind of flag it is
  matches?: string[];                                                     // Exact text matches that triggered the flag
}
```

### `CopyFeedback`
```typescript
type CopyFeedbackSection = {
  name: string;     // Section name, e.g. "Hook / Opening", "Call to Action"
  score: number;    // 0–100 score for this section
  feedback: string; // AI-generated actionable feedback text
}

type CopyFeedback = {
  sections: CopyFeedbackSection[];  // Each email section scored individually
  topSuggestions: string[];         // 3–5 top improvement suggestions as plain strings
}
```

### `SubjectAnalysis`
```typescript
type SubjectAnalysis = {
  charCount: number;               // Total character count of subject line
  wordCount: number;               // Word count of subject line
  hasEmoji: boolean;               // Whether the subject contains an emoji
  hasNumber: boolean;              // Whether the subject contains a number
  hasQuestion: boolean;            // Whether the subject is a question
  hasPersonalizationToken: boolean;// Whether the subject has a personalization token (e.g. {first_name})
  isIdealLength: boolean;          // true if charCount is between 20–60 characters
}
```

### `TechnicalHealth`
```typescript
type TechnicalHealth = {
  hasHtmlVersion: boolean;      // Email has an HTML body
  hasPlainTextVersion: boolean; // Email has a plain text body
  estimatedSizeKb: number;      // Estimated email size in kilobytes
  missingAltCount: number;      // Number of <img> tags missing alt attributes
  trackingPixelCount: number;   // Number of 1x1 pixel tracking images detected
  uniqueExternalDomains: number;// Count of unique external link domains
  hasPreheader: boolean;        // Whether a preheader text element was detected
}
```

### `SenderTrust`
```typescript
type SenderTrust = {
  displayNameDomainMatch: boolean | null;     // Whether the display name domain matches the From: domain
  replyToMatchesFrom: boolean | null;         // Whether Reply-To address matches the From: address
  blacklisted: boolean;                       // Whether the sending IP is on any DNS blacklist
  blacklistHits: string[];                    // Names of blacklists that flagged the sending IP
  domainBlacklisted: boolean;                 // Whether the sending domain is on any DNS blacklist
  domainBlacklistHits: string[];              // Names of blacklists that flagged the domain
  trackingDomainsChecked: string[];           // Tracking/click domains found in email links
  trackingDomainsBlacklisted: string[];       // Tracking domains that are blacklisted
  trackingDomainMismatch: boolean;            // Whether tracking domains differ from the sending domain root
  trackingDomainRoots: string[];              // Root domains of all tracking links
}
```

### `ContentQuality`
```typescript
type HiddenBlockResult = {
  text: string;                                              // The hidden text content
  methods: string[];                                         // CSS/HTML techniques used to hide it
  position: number;                                          // Position in document (0 = near top)
  hasLinks: boolean;                                         // Hidden block contains links
  hasImages: boolean;                                        // Hidden block contains images
  classification: "PREHEADER" | "AMBIGUOUS" | "SPAM_SIGNAL"; // What this hidden block likely is
}

type ContentQuality = {
  wordCount: number;                                                    // Visible word count
  linkCount?: number;                                                   // Total number of hyperlinks
  hasPs: boolean;                                                       // Whether a P.S. line is present
  hasPersonalization: boolean;                                          // Whether personalization tokens are used
  htmlToTextRatio: number;                                              // Ratio 0.0–1.0 of actual text to HTML markup
  hasUrlShortener: boolean;                                             // Whether URL shorteners (bit.ly etc.) are used
  hasHiddenText: boolean;                                               // Whether hidden text was detected
  hiddenTextClassification: "NONE" | "PREHEADER" | "AMBIGUOUS" | "SPAM_SIGNAL" | "MIXED";
  hiddenBlocks: HiddenBlockResult[];                                    // Detailed breakdown of each hidden text block
  hiddenTextSamples: string[];                                          // Short text snippets of hidden content
  linkToTextRatio: number;                                              // Links per word ratio
  isImageHeavy: boolean;                                                // Whether images dominate the email
  subjectCharCount: number;                                             // Subject line character count (mirrored here)
}
```

### `CanSpamCompliance`
```typescript
type CanSpamCompliance = {
  hasPhysicalAddress: boolean;  // Email contains a physical mailing address
  hasUnsubscribeLink: boolean;  // Email contains an unsubscribe link or mechanism
  hasHonestSubject: boolean;    // Subject line is not deceptive (AI judgment)
  score: number;                // 0–100 compliance score (100 = fully compliant)
}
```

---

## 7. Score Calculation Logic

The `avgAuthScore` and `avgContentQualityScore` in the `/summary` endpoint, and the derived "Auth Health" and "Content Quality" metric cards, are computed server-side using this exact logic:

### Authentication Score (0–100)

Points are awarded out of a maximum of 30, then normalized to 0–100.

| Check | Points |
|-------|--------|
| `spfResult === "pass"` | 8 pts |
| `spfResult === "softfail"` | 4 pts (partial credit) |
| `dkimResult === "pass"` | 8 pts |
| `dmarcResult === "pass"` | 7 pts |
| `spfRecordExists === true` | 4 pts |
| `dkimRecordExists === true` | 3 pts |
| **Maximum** | **30 pts** |

Formula: `authScore = Math.round((pts / 30) * 100)`

An email with all three protocols passing and both DNS records confirmed would score: `(8+8+7+4+3) / 30 * 100 = 100`.

### Content Quality Score (0–100)

Points are awarded out of a maximum of 10, then normalized to 0–100.

| Check | Points |
|-------|--------|
| `!hasUrlShortener` | 2 pts |
| `hiddenTextClassification === "NONE"` or `"PREHEADER"` | 2 pts |
| `hiddenTextClassification === "AMBIGUOUS"` | 1 pt (partial) |
| `htmlToTextRatio >= 0.3` | 1 pt |
| `linkToTextRatio <= 0.02` | 1 pt |
| `wordCount >= 50 && wordCount <= 500` | 2 pts |
| `wordCount > 500 && wordCount <= 900` | 1 pt (partial) |
| `subjectCharCount >= 20 && subjectCharCount <= 60` | 1 pt |
| `hasPersonalization || hasPs` | 1 pt |
| **Maximum** | **10 pts** |

Formula: `contentScore = Math.round((pts / 10) * 100)`

---

## 8. Placement Monitoring Explained

Placement monitoring is the feature that tells you whether a real email you sent actually landed in inbox vs. spam across different email providers. Here's how it works and what the API exposes:

### How Monitoring Works
1. The user has a registered `sendingFromAddress` (their actual email address they send campaigns from)
2. They send a real email from that address to their seed address
3. The system detects this incoming email and activates a monitoring window (stored in `placementAutoCheckUntil`)
4. The server polls connected seed inboxes (Gmail accounts, Outlook accounts) every few minutes
5. When the email is found in a seed inbox, its tab/folder is recorded
6. Once all inboxes are checked or the window expires, `lastPlacementResults` is updated

### What the Mobile App Should Show
- **If `placementAutoCheckUntil` is in the future:** A live monitoring indicator — "Checking inboxes..."
- **If `lastPlacementResults` is populated:** The result breakdown by provider
- **If both are null:** The user hasn't run a placement test yet

### PlacementResult Object Shape
```typescript
type PlacementResult = {
  provider: string;  // "gmail" | "outlook" | "other"
  label: string;     // Human-readable label, e.g. "Gmail - Primary", "Outlook"
  status: string;    // See status table in section 5.4
  checkedAt: string; // ISO 8601 timestamp when this inbox was checked
  // Note: the actual seed inbox email address is NEVER included in API responses
}
```

---

## 9. Status Field Values

The `status` field on an email analysis record represents where it is in the processing pipeline:

| Value | Meaning | Score Fields | AI Fields |
|-------|---------|-------------|-----------|
| `"pending"` | Email received, queued for analysis | `null` | `null` |
| `"analyzing"` | AI analysis in progress | `null` | `null` |
| `"complete"` | Full analysis done | populated | populated |
| `"error"` | Analysis failed (email was still saved) | `null` | `null` |

**Mobile app guidance:** When you display a list of emails, treat `pending` and `analyzing` as loading states. You can show a spinner or "Analyzing..." badge. Poll the `/summary` endpoint or re-fetch the list every 10–15 seconds to detect when emails finish processing.

---

## 10. Suggested Mobile UI Flows

### Home Screen / Dashboard Widget
Call `GET /api/v1/inbox-analyzer/summary` on load. Display:
- Overall avg score with trend arrow (up/down/flat)
- Auth health score
- Content quality score  
- Inbox placement rate (or "No tests yet" if null)
- `completedEmails` count

### Inbox Address Screen
Call `GET /api/v1/inbox-analyzer/address`. Display:
- The full seed email address with a copy button
- The user's registered sending address
- If `placementAutoCheckUntil` is in the future: show a live "Monitoring active" banner with the subject and expected completion time
- If `lastPlacementResults` is present: show last placement results with per-provider badges

### Emails List Screen
Call `GET /api/v1/inbox-analyzer/emails?limit=20&offset=0`. Display:
- Each email as a card: subject, from name, received date, overall score badge, SPF/DKIM/DMARC pass/fail indicators
- Placement badge if `hasPlacementResults === true`
- Status badge for `pending`/`analyzing` states
- Implement pull-to-refresh and infinite scroll using `offset`

### Email Detail Screen
Call `GET /api/v1/inbox-analyzer/emails/:id`. Suggested tab structure:

**Tab 1 — Overview**
- Overall score, spam score, copy score
- From/subject/received info
- CAN-SPAM compliance score

**Tab 2 — Authentication**
- SPF result with pass/fail/softfail color coding
- DKIM result
- DMARC result
- Whether each record exists in DNS
- Computed auth score with breakdown

**Tab 3 — Copy Feedback**
- Each `copyFeedback.sections` as a card with section name, score bar, and feedback text
- `topSuggestions` list

**Tab 4 — Technical**
- Email size, HTML/text ratio
- Tracking pixels, missing alt tags, unique domains
- Spam flags list (grouped by severity)
- Hidden text analysis

**Tab 5 — Sender Trust**
- Blacklist results (clean / flagged)
- Domain match, reply-to consistency
- Tracking domain check

**Tab 6 — Placement**
- If `hasPlacementResults`: per-inbox result with icons
- Placement rate as a large percentage
- "No placement data" empty state otherwise

---

## Quick Reference Card

```
BASE URL: https://your-app.replit.app

AUTH: Authorization: Bearer ftk_<key>

Endpoints:
  GET /api/v1/inbox-analyzer/address            → seed address + monitoring state
  GET /api/v1/inbox-analyzer/emails             → paginated list (?limit=50&offset=0)
  GET /api/v1/inbox-analyzer/emails/:id         → full analysis detail
  GET /api/v1/inbox-analyzer/emails/:id/placement → placement results + placementRate %
  GET /api/v1/inbox-analyzer/summary            → aggregate stats + trend

All scores: 0–100 integers (null if not yet computed)
All timestamps: ISO 8601 strings (UTC)
Emails ordered: newest first
Seed inbox emails: NEVER exposed in API responses
```
