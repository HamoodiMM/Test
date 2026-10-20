# My Auth App

A full-stack learning project with a **NestJS + TypeScript** backend and a **MongoDB** database. Users register and log in with JWT authentication, visitors can leave a support request without an account, and logged-in users can chat with an **AI assistant powered by Google Gemini**, with saved conversations and token/cost tracking.

The backend started as an Express app and was migrated step by step to NestJS. One server now does everything: the API, the AI chat and serving the frontend.

```text
Browser ──► NestJS (localhost:3000)
              ├── /register, /login, /profile, /users   → MongoDB (users)
              ├── /requests                             → MongoDB (guestrequests)
              ├── /chat, /conversations                 → MongoDB (conversations) + Google Gemini API
              ├── /docs                                 → Swagger API documentation
              └── /                                     → the frontend (Frontend/)
```

## Features

- **Accounts:** registration and login. Passwords are hashed with bcrypt and never returned by the API.
- **JWT authentication:** tokens signed with a secret from `.env`, valid for 1 hour, checked by a global guard on every protected route.
- **Guest requests:** visitors submit a message and an Egyptian phone number without logging in.
- **AI assistant (Gemini):**
  - conversation memory and saved chats (sidebar: reopen, delete), stored per user in MongoDB
  - token usage and estimated cost in USD for every message
  - a "generating" indicator with a live timer and a Stop button
  - **automatic model fallback:** if the main model hits a quota, is overloaded or times out, the next backup model answers and the user is told ("⚠ Model capacity reached…"). A cooldown remembers the failed model, and the app switches back to the main model by itself when its limit resets.
- **Detailed errors:** every error has a status, a machine-readable `code`, a message, a hint and details (e.g. which AI quota was hit and how long to wait). Retryable errors get a "Try again" button in the UI.
- **Validation:** DTOs with class-validator on every request body; unknown fields rejected.
- **Security:** Helmet (Content Security Policy), rate limiting per route group, 20 KB body limit, ownership checks, secrets only in `.env`.
- **API docs:** interactive Swagger UI at `/docs`.
- **Tests:** unit tests (Vitest) and end-to-end tests (Supertest).

## Tech stack

| Area | Tools |
|---|---|
| Runtime / language | Node.js, TypeScript (ES modules) |
| Framework | NestJS 12 |
| Database | MongoDB Atlas, Mongoose (`@nestjs/mongoose`) |
| Auth | bcrypt, `@nestjs/jwt` |
| Validation | class-validator, class-transformer; Zod for environment variables |
| AI | Google Gemini via `@google/genai` |
| Security | Helmet, `@nestjs/throttler` |
| Docs / tests | `@nestjs/swagger`, Vitest, Supertest |
| Frontend | HTML, CSS, vanilla JavaScript |

## Getting started

### Prerequisites

- Node.js 20 or newer
- A MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster works)
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com)

### Setup

```bash
git clone https://github.com/HamoodiMM/Test.git
cd Test
npm install
```

Create a `.env` file in the project root from `.env.example`:

| Variable | Description |
|---|---|
| `PORT` | Port to listen on (default `3000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string that signs login tokens |
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_MODEL` | Main Gemini model (default `gemini-3.5-flash-lite`) |
| `GEMINI_FALLBACK_MODELS` | Backup models, comma-separated, tried in order when the main model is out of quota, overloaded or too slow |
| `GEMINI_TIMEOUT_MS` | How long to wait for Gemini before a 504 (default `20000`) |
| `GEMINI_INPUT_PRICE_PER_MILLION` / `GEMINI_OUTPUT_PRICE_PER_MILLION` | Paid-tier prices used for the cost display |

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> `.env` is listed in `.gitignore`. Never commit it. All variables are validated at startup; the app refuses to start if one is missing or invalid.

### Run

```bash
npm run dev
```

Open http://localhost:3000. API docs: http://localhost:3000/docs.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development mode with auto-restart |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled app |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests against the real app and database |
| `npm run lint` / `npm run format` | Lint / format the code |

## API

All bodies are JSON. Routes marked 🔒 need `Authorization: Bearer <token>` (the token from `/login`).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/register` | Create an account (`username`, `email`, `password`) |
| `POST` | `/login` | Log in (`email`, `password`), returns a JWT `token` |
| `GET` | `/profile` 🔒 | The logged-in user's profile |
| `GET` | `/users` 🔒 | All users (without passwords) |
| `POST` | `/requests` | Submit a guest request (`message`, `phone`) |
| `POST` | `/chat` 🔒 | Send a message to the AI (`message`, optional `conversationId`); returns the reply, token usage and cost |
| `GET` | `/conversations` 🔒 | Your saved conversations |
| `GET` | `/conversations/:id` 🔒 | One conversation with its messages |
| `DELETE` | `/conversations/:id` 🔒 | Delete a conversation |
| `GET` | `/health` | API and database status |

### Errors

Every error response has the same shape:

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "code": "AI_DAILY_QUOTA",
  "message": "The free daily limit for the AI model \"gemini-3.5-flash\" has been reached",
  "hint": "Each model allows a limited number of requests per day on the free tier...",
  "retryable": false,
  "details": { "model": "gemini-3.5-flash", "quota": "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "limit": "20" },
  "path": "/chat",
  "timestamp": "..."
}
```

See [TESTING.md](TESTING.md) for the full list of error codes.

### Validation rules

- **Username:** 3–30 characters
- **Email:** valid format, stored in lowercase, must be unique
- **Password:** 8–72 characters, with at least one letter and one number
- **Guest message:** 10–1000 characters
- **Phone:** Egyptian mobile number, `010`, `011`, `012` or `015` followed by 8 digits
- **Chat message:** 1–2000 characters

### Rate limits

- `/register` + `/login`: 10 per 15 minutes per IP
- `/requests`: 5 per hour per IP
- `/chat`: 3 per 10 seconds and 10 per minute **per user**
- On top of that, Gemini's free tier limits requests per model per day (check yours at https://ai.dev/rate-limit)

## Project structure

```text
src/
├── main.ts              # Bootstrap: Helmet, static frontend, validation pipe, filter, interceptor, Swagger
├── app.module.ts        # Root module: config, MongoDB, rate limits, feature modules
├── config/              # Environment variable validation (Zod)
├── auth/                # Register/login, JwtModule, global AuthGuard, @Public(), @CurrentUser()
├── users/               # User schema, UsersService, GET /profile and /users
├── guest-requests/      # POST /requests
├── chat/                # POST /chat: Gemini calls with model fallback, token and cost calculation,
│                        # ModelAvailabilityService (cooldowns), per-model prices
├── conversations/       # Saved chats: schema, service, REST controller
└── common/              # AppException + error codes, exception filter, logging interceptor,
                         # ObjectId pipe, per-user throttler guard, rate-limit settings
test/                    # End-to-end tests
Frontend/                # Static frontend served by NestJS
```

### Request lifecycle

```text
request → Helmet / static files → AuthGuard (JWT) → ThrottlerGuard → LoggingInterceptor
        → ValidationPipe (DTO) → controller → service → MongoDB / Gemini → response
        any error → AllExceptionsFilter → detailed JSON error
```

## Testing

See [TESTING.md](TESTING.md) for the manual checklist with expected status codes and error codes, and run the automated tests with `npm test` and `npm run test:e2e`.
