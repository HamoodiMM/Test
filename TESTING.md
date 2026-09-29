# API Test Checklist

Start the server with `npm run dev`, then test from the frontend at http://localhost:3000,
the browser console (F12 → Console), or Postman.

Status code meanings used below:

| Code | Meaning |
|---|---|
| 200 OK | Request succeeded |
| 201 Created | A new resource was saved (user, guest request) |
| 400 Bad Request | Input failed validation or the body isn't valid JSON |
| 401 Unauthorized | Wrong credentials, or missing/invalid/expired token |
| 404 Not Found | Route or resource doesn't exist |
| 409 Conflict | Email is already registered |
| 413 Payload Too Large | Request body over 10kb |
| 429 Too Many Requests | Rate limit hit |
| 500 Internal Server Error | Unexpected server bug (details only in the server log) |

## Registration — `POST /register`

| ☐ | Case | Body | Expected |
|---|---|---|---|
| ☐ | Valid registration | `{"username":"hamoodi","email":"New@Example.com","password":"secret123"}` | **201**, email returned lowercase, no password in response |
| ☐ | Missing fields | `{}` | **400** "Username is required" |
| ☐ | Username too short | `{"username":"ab","email":"a@b.com","password":"secret123"}` | **400** |
| ☐ | Invalid email | `{"username":"abc","email":"not-an-email","password":"secret123"}` | **400** "Please provide a valid email address" |
| ☐ | Short password | `{"username":"abc","email":"a@b.com","password":"abc1"}` | **400** "Password must be at least 8 characters" |
| ☐ | Password without a number | `{"username":"abc","email":"a@b.com","password":"abcdefgh"}` | **400** |
| ☐ | Password wrong type | `{"username":"abc","email":"a@b.com","password":12345678}` | **400** "Password is required" |
| ☐ | Duplicate email | Same as the valid registration again | **409** "Email is already registered" |

## Login — `POST /login`

| ☐ | Case | Body | Expected |
|---|---|---|---|
| ☐ | Valid credentials | `{"email":"new@example.com","password":"secret123"}` | **200**, response contains `token`, no password |
| ☐ | Email in different case | `{"email":"NEW@example.com","password":"secret123"}` | **200** |
| ☐ | Wrong password | correct email, wrong password | **401** "Invalid email or password" |
| ☐ | Unknown email | `{"email":"nobody@example.com","password":"secret123"}` | **401**, same message as wrong password |
| ☐ | Missing fields | `{}` | **400** "Email is required" |
| ☐ | Rate limit | 11 attempts within 15 minutes (login + register share the limit) | **429** |

## JWT — `GET /profile`

Log in first; the frontend stores the token in `localStorage`.

| ☐ | Case | How | Expected |
|---|---|---|---|
| ☐ | No token | Click **View Profile** while logged out, or no `Authorization` header | **401** "Authentication token missing" |
| ☐ | Malformed header | `Authorization: <token>` (no `Bearer `) | **401** "Authentication token missing" |
| ☐ | Invalid token | `Authorization: Bearer abc.def.ghi` | **401** "Invalid token" |
| ☐ | Tampered token | Real token with one character changed | **401** "Invalid token" |
| ☐ | Expired token | Set `JWT_EXPIRES_IN` in `src/config/jwt.ts` to `"10s"`, log in, wait 15s (then set it back to `"1h"`) | **401** "Token expired, please log in again" |
| ☐ | Valid token | Log in, click **View Profile** | **200**, username and email shown |

Console snippet for header tests:

```js
fetch("/profile", { headers: { Authorization: "Bearer abc.def.ghi" } }).then(r => r.json()).then(console.log)
```

## Protected users list — `GET /users`

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Without token (open in browser) | **401** |
| ☐ | With valid token | **200**, list of users, **no `password` field** |

## Guest request — `POST /requests`

| ☐ | Case | Body | Expected |
|---|---|---|---|
| ☐ | Valid request | `{"message":"I need help with my order","phone":"01012345678"}` | **201**, document appears in Atlas `guestrequests` with `createdAt` |
| ☐ | Missing message | `{"phone":"01012345678"}` | **400** "Message is required" |
| ☐ | Short message | `{"message":"hi","phone":"01012345678"}` | **400** "Request must be at least 10 characters" |
| ☐ | Invalid phone | `{"message":"I need help with my order","phone":"01312345678"}` | **400** "Please provide a valid Egyptian phone number" |
| ☐ | Rate limit | 6 requests within an hour | **429** |

## General

| ☐ | Case | Expected |
|---|---|---|
| ☐ | Unknown route, e.g. `GET /nope` | **404** `{"message":"Route not found"}` |
| ☐ | Invalid JSON body | **400** "Request body is not valid JSON" |
| ☐ | Data survives a server restart | Log in again after restarting — still works |
| ☐ | Security headers present (F12 → Network → any request → Headers) | `Content-Security-Policy` present, no `X-Powered-By` |
| ☐ | All frontend buttons work, no red CSP errors in the console | ✔ |
