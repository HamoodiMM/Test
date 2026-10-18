# API Test Checklist

Start the app with `npm run dev`, then test from the frontend at http://localhost:3000,
the interactive docs at http://localhost:3000/docs, the browser console (F12 → Console), or Postman.

Automated tests: `npm test` (unit) and `npm run test:e2e` (end-to-end, needs `.env`).

## Error format

Every error has the same detailed shape:

```json
{
  "statusCode": 504,
  "error": "Gateway Timeout",
  "code": "AI_TIMEOUT",
  "message": "The AI model \"gemini-3-flash-preview\" did not answer within 20 seconds",
  "hint": "Google may be slow right now. Try again, or ask a shorter question.",
  "retryable": true,
  "details": { "model": "gemini-3-flash-preview", "timeoutSeconds": 20, "elapsedMs": 20004 },
  "path": "/chat",
  "timestamp": "2026-10-19T10:00:00.000Z"
}
```

| Status | Code(s) | Meaning |
|---|---|---|
| 200 / 201 / 204 | – | Success / created / deleted |
| 400 | `VALIDATION_FAILED`, `INVALID_JSON`, `INVALID_ID`, `AI_BLOCKED` | Bad input (each problem listed in `details.problems`) |
| 401 | `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | Not logged in, bad token, or wrong email/password |
| 404 | `ROUTE_NOT_FOUND`, `NOT_FOUND` | Unknown URL, or a conversation/user that doesn't exist (or isn't yours) |
| 409 | `EMAIL_TAKEN` | Email already registered |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 20 KB |
| 429 | `RATE_LIMITED` | Our own rate limit; `details.retryAfterSeconds` says how long to wait |
| 500 | `AI_MISCONFIGURED`, `INTERNAL_ERROR` | Wrong `GEMINI_MODEL`/key, or a bug (details only in the server log) |
| 502 | `AI_EMPTY_REPLY`, `AI_UNREACHABLE` | Gemini sent nothing back / couldn't connect to Google |
| 503 | `AI_OVERLOADED`, `AI_RATE_LIMITED`, `AI_DAILY_QUOTA` | Google is busy, or a per-minute / per-day quota of the model is used up |
| 504 | `AI_TIMEOUT` | Gemini didn't answer within `GEMINI_TIMEOUT_MS` |

## Registration — `POST /register`

| ☐ | Case | Body | Expected |
|---|---|---|---|
| ☐ | Valid registration | `{"username":"hamoodi","email":"New@Example.com","password":"secret123"}` | **201**, email returned lowercase, no password in response |
| ☐ | Missing fields | `{}` | **400** `VALIDATION_FAILED`, 3 problems listed |
| ☐ | Username too short | `{"username":"ab","email":"a@b.com","password":"secret123"}` | **400** "Username must be 3-30 characters" |
| ☐ | Invalid email | `{"username":"abc","email":"not-an-email","password":"secret123"}` | **400** "Please provide a valid email address" |
| ☐ | Short password | `{"username":"abc","email":"a@b.com","password":"abc1"}` | **400** "Password must be 8-72 characters" |
| ☐ | Password without a number | `{"username":"abc","email":"a@b.com","password":"abcdefgh"}` | **400** "Password must contain at least one number" |
| ☐ | Password wrong type | `{"username":"abc","email":"a@b.com","password":12345678}` | **400** "Password must be a string" |
| ☐ | Unknown field | `{"username":"abc","email":"a@b.com","password":"secret123","admin":true}` | **400** "property admin should not exist" |
| ☐ | Duplicate email | Same as the valid registration again | **409** `EMAIL_TAKEN` |

## Login — `POST /login`

| ☐ | Case | Body | Expected |
|---|---|---|---|
| ☐ | Valid credentials | `{"email":"new@example.com","password":"secret123"}` | **200**, response contains `token`, no password |
| ☐ | Email in different case | `{"email":"NEW@example.com","password":"secret123"}` | **200** |
| ☐ | Account created before the migration | An account registered with the old Express app | **200** (same `users` collection, same bcrypt hashes) |
| ☐ | Wrong password | correct email, wrong password | **401** `INVALID_CREDENTIALS` "Invalid email or password" |
| ☐ | Unknown email | `{"email":"nobody@example.com","password":"secret123"}` | **401**, exactly the same error as a wrong password |
| ☐ | Missing fields | `{}` | **400** `VALIDATION_FAILED` |
| ☐ | Rate limit | 11 register/login attempts within 15 minutes | **429** `RATE_LIMITED` with `retryAfterSeconds` |

## JWT — `GET /profile`

Log in first; the frontend stores the token in `localStorage`.

| ☐ | Case | How | Expected |
|---|---|---|---|
| ☐ | No token | Request `/profile` with no `Authorization` header | **401** `AUTH_TOKEN_MISSING` |
| ☐ | Malformed header | `Authorization: <token>` (no `Bearer `) | **401** `AUTH_TOKEN_MISSING` |
| ☐ | Invalid token | `Authorization: Bearer abc.def.ghi` | **401** `AUTH_TOKEN_INVALID` |
| ☐ | Tampered token | Real token with one character changed | **401** `AUTH_TOKEN_INVALID` |
| ☐ | Expired token | In `src/auth/auth.module.ts` set `expiresIn: '10s'`, log in, wait 15s, reload the page (then set it back to `'1h'`) | **401** `AUTH_TOKEN_EXPIRED`, login tab shows the detailed error |
| ☐ | Valid token | Log in, or reload the page while logged in | **200**, profile card shows username and email |

Console snippet for header tests:

```js
fetch("/profile", { headers: { Authorization: "Bearer abc.def.ghi" } }).then(r => r.json()).then(console.log)
```

## Protected users list — `GET /users`

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Without token (open in browser) | **401** `AUTH_TOKEN_MISSING` |
| ☐ | With valid token | **200**, list of users, **no `password` field** |

## Guest request — `POST /requests`

| ☐ | Case | Body | Expected |
|---|---|---|---|
| ☐ | Valid request | `{"message":"I need help with my order","phone":"01012345678"}` | **201**, document appears in Atlas `guestrequests` with `createdAt` |
| ☐ | Missing message | `{"phone":"01012345678"}` | **400** "Message is required" |
| ☐ | Short message | `{"message":"hi","phone":"01012345678"}` | **400** "Request must be 10-1000 characters" |
| ☐ | Invalid phone | `{"message":"I need help with my order","phone":"01312345678"}` | **400** "Please provide a valid Egyptian phone number (e.g. 01012345678)" |
| ☐ | Rate limit | 6 requests within an hour | **429** `RATE_LIMITED` |

## AI assistant — `POST /chat`, `/conversations`

Log in, then click **Open AI assistant**.

| ☐ | Case | How | Expected |
|---|---|---|---|
| ☐ | Valid message | Send a message | **200**, reply plus tokens and ≈ cost under the bubble |
| ☐ | Generating indicator | Watch while waiting | Header "● Generating a response…", status line with a live timer, send button becomes **■ Stop** |
| ☐ | Stop | Press **■** while waiting | Request cancelled, note "You stopped waiting…" |
| ☐ | Personal greeting | Ask "What is my name?" | The bot uses your username (from the JWT) |
| ☐ | Memory | Say "my favourite colour is blue", then ask what it is | Bot remembers; **in** tokens grow with each message |
| ☐ | Saved chats | **+ New chat**, then reopen the first chat from the sidebar, then reload the page | The conversation is still there |
| ☐ | Delete chat | Click ✕ on a chat and confirm | Removed from the sidebar (**204**) |
| ☐ | No token | Console: `fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:'{"message":"hi"}'}).then(r=>r.json()).then(console.log)` | **401** `AUTH_TOKEN_MISSING` |
| ☐ | Empty message | Body `{}` from the console with a token | **400** "Message is required" |
| ☐ | Too long | 2001+ characters | **400** "Message must be at most 2000 characters" |
| ☐ | Invalid conversation id | `GET /conversations/abc` with your token | **400** `INVALID_ID` |
| ☐ | Someone else's chat | Another user's conversation id | **404** `NOT_FOUND` |
| ☐ | Rate limit | Send 4 messages within 10 seconds | **429** `RATE_LIMITED` "Wait 10 seconds…" |
| ☐ | AI timeout | Set `GEMINI_TIMEOUT_MS=1` in `.env`, restart, send a message (then set it back to `20000`) | **504** `AI_TIMEOUT` with a **↻ Try again** button |
| ☐ | Wrong model | Set `GEMINI_MODEL=gemini-does-not-exist`, restart, send a message (then change it back) | **500** `AI_MISCONFIGURED`, hint names `GEMINI_MODEL` |
| ☐ | Google overloaded | Happens on its own when a model is in high demand | **503** `AI_OVERLOADED`, retryable |
| ☐ | Daily quota used up | Happens after the free daily requests for the model | **503** `AI_DAILY_QUOTA` with quota name, limit and wait time |
| ☐ | Server stopped | Stop the app and send a message | `NETWORK_ERROR` "Could not reach the server" with **↻ Try again** |

## General

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Health check: http://localhost:3000/health | **200** `{"status":"ok","database":"connected",...}` |
| ☐ | Unknown route, e.g. `GET /nope` | **404** `ROUTE_NOT_FOUND` |
| ☐ | Invalid JSON body | **400** `INVALID_JSON` |
| ☐ | Body over 20 KB | **413** `PAYLOAD_TOO_LARGE` |
| ☐ | Data survives a server restart | Log in again after restarting — still works |
| ☐ | Security headers present (F12 → Network → any request → Headers) | `Content-Security-Policy` present, no `X-Powered-By` |
| ☐ | API docs at http://localhost:3000/docs | All routes listed; **Authorize** with a token to try protected ones |
| ☐ | All frontend buttons work, no red CSP errors in the console | ✔ |
