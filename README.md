# My Auth App

A full-stack learning project made of **two backend services** in one repository (a monorepo):

1. **Auth API** (`src/`): a REST API built with **Express 5** and **TypeScript**, backed by **MongoDB**. Users register and log in with JWT authentication, and visitors can leave a support request without an account. It also serves the vanilla JS frontend.
2. **AI chatbot** (`chatbot/`): a **NestJS** API that connects logged-in users to Google's **Gemini** model, with saved conversations, token and cost tracking, and its own API docs.

```text
Browser (localhost:3000)
   │  login ──────────────► Express Auth API (:3000) ──► MongoDB (users, guest requests)
   │                              issues a JWT
   │  chat + JWT ─────────► NestJS Chatbot   (:3001) ──► MongoDB (conversations)
   │                              verifies the same JWT    └──► Google Gemini API
```

Both services share one MongoDB database and one `JWT_SECRET`, so a token issued by the Express app is trusted by the chatbot.

Built as a learning project to practice real-world backend fundamentals: persistence, authentication, validation, security and project structure.

## Features

- **User registration and login.** Passwords are hashed with bcrypt and never returned by the API.
- **JWT authentication.** Tokens are signed with a secret from `.env` and expire after 1 hour.
- **Protected routes** (`/profile`, `/users`) using authentication middleware.
- **Guest requests.** Visitors submit a message and an Egyptian phone number, stored in MongoDB.
- **Runtime input validation** with Zod on every endpoint.
- **Security:**
  - Helmet security headers, including a Content Security Policy
  - rate limiting on auth and guest endpoints
  - a 10kb request body limit
  - a global error handler that never leaks internal details
- **Frontend** with login/register tabs, a profile view, a guest request form and dark mode.
- **AI assistant** (NestJS + Gemini) for logged-in users:
  - conversation memory and saved chats (sidebar, reopen, delete), stored in MongoDB
  - token usage and estimated cost in USD for every message
  - protected by the same JWT as the Express app, rate limited per user
  - interactive API docs (Swagger) at `/docs`

## Tech stack

| Area | Tools |
|---|---|
| Runtime / language | Node.js, TypeScript |
| Web framework | Express 5 |
| Database | MongoDB Atlas, Mongoose |
| Auth | bcrypt, jsonwebtoken |
| Validation | Zod |
| Security | Helmet, express-rate-limit |
| Frontend | HTML, CSS, vanilla JavaScript |
| Chatbot service | NestJS, @google/genai (Gemini), @nestjs/mongoose, @nestjs/jwt, class-validator, @nestjs/throttler, Swagger, Vitest |

## Getting started

### Prerequisites

- Node.js 20 or newer
- A MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster works)

### Setup

```bash
git clone https://github.com/HamoodiMM/Test.git
cd Test
npm install
```

Create a `.env` file in the project root, using `.env.example` as a template:

```text
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/test-app?retryWrites=true&w=majority
PORT=3000
JWT_SECRET=<long-random-string>
```

You can generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> `.env` is listed in `.gitignore`. Never commit it.

#### Chatbot setup

```bash
cd chatbot
npm install
```

Create `chatbot/.env` from `chatbot/.env.example`:

- `GEMINI_API_KEY`: a free key from [Google AI Studio](https://aistudio.google.com)
- `MONGODB_URI` and `JWT_SECRET`: **the same values** as the root `.env`
- `GEMINI_MODEL`: defaults to `gemini-3.5-flash-lite` (free-tier daily limits are per model; check yours at https://ai.dev/rate-limit)

### Run

```bash
npm run dev
```

Open http://localhost:3000. The server connects to MongoDB before it starts listening, and exits with a clear error if the connection or any required environment variable is missing.

To use the AI assistant, start the chatbot in a **second terminal**:

```bash
cd chatbot
npm run start:dev
```

It runs on http://localhost:3001, with API docs at http://localhost:3001/docs.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start in development mode with auto-restart |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled app (production) |
| `npm run typecheck` | Check types without emitting files |

## API

All request and response bodies are JSON. Errors have the shape `{ "message": "..." }`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | – | Create an account (`username`, `email`, `password`) |
| `POST` | `/login` | – | Log in (`email`, `password`), returns a JWT `token` |
| `GET` | `/profile` | Bearer token | Get the logged-in user's profile |
| `GET` | `/users` | Bearer token | List all users (without passwords) |
| `POST` | `/requests` | – | Submit a guest request (`message`, `phone`) |

Protected routes expect this header:

```text
Authorization: Bearer <token>
```

### Chatbot API (port 3001)

All routes except `/health` require `Authorization: Bearer <token>` (the token from `/login`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | API and database status (public) |
| `POST` | `/chat` | Send a message (`message`, optional `conversationId`). Returns the reply, token usage and cost |
| `GET` | `/conversations` | List your saved conversations |
| `GET` | `/conversations/:id` | Get one conversation with its messages |
| `DELETE` | `/conversations/:id` | Delete a conversation |

Errors have the shape `{ statusCode, message, error, path, timestamp }`. Failures from Gemini are translated into `503` (busy or daily quota reached), `504` (timeout) or `502` (bad response), without exposing API key details.

### Validation rules

- **Username:** 3–30 characters
- **Email:** valid format, stored in lowercase, must be unique
- **Password:** 8–72 characters, with at least one letter and one number
- **Guest message:** 10–1000 characters
- **Phone:** Egyptian mobile number, `010`, `011`, `012` or `015` followed by 8 digits (for example `01012345678`)

### Rate limits

- `/register` and `/login`: 10 requests per 15 minutes per IP (shared)
- `/requests`: 5 requests per hour per IP
- Chatbot `POST /chat`: 3 messages per 10 seconds and 10 per minute **per user**
- Gemini's own free-tier quota applies on top (per model, per day)

## Project structure

```text
src/
├── server.ts        # Entry point: loads .env, connects to MongoDB, starts the server
├── app.ts           # Express app: global middleware, routes, error handlers
├── config/          # Database connection and JWT settings
├── routes/          # Maps URLs and HTTP methods to middleware and controllers
├── controllers/     # Request handling logic
├── middleware/      # Authentication, rate limiting, error handling
├── models/          # Mongoose schemas (User, GuestRequest)
└── validation/      # Zod schemas for incoming request data
Frontend/            # Static frontend served by Express

chatbot/src/         # NestJS chatbot service
├── main.ts          # Bootstrap: validation pipe, CORS, Swagger, global filter and interceptor
├── app.module.ts    # Root module: config, MongoDB, rate limits, feature modules
├── config/          # Environment variable validation (Zod)
├── auth/            # Global JWT guard, @Public() and @CurrentUser() decorators
├── chat/            # POST /chat: Gemini calls, token and cost calculation, DTO
├── conversations/   # Mongoose schema, service and REST controller for saved chats
└── common/          # Exception filter, logging interceptor, ObjectId pipe
```

### Request flow (Express)

```text
request → helmet → express.json → route → [rate limiter] → [requireAuth] → controller → Mongoose model → MongoDB
                                                                              ↓ (any error)
                                                                         errorHandler
```

### Request flow (NestJS)

```text
request → AuthGuard (JWT) → ThrottlerGuard → LoggingInterceptor → ValidationPipe (DTO)
        → controller → service → Gemini / MongoDB → response
        any error → AllExceptionsFilter
```

## Testing

See [TESTING.md](TESTING.md) for a full manual test checklist covering registration, login, JWT handling, protected routes, guest requests and the chatbot, with expected HTTP status codes.

The chatbot also has automated tests:

```bash
cd chatbot
npm test          # unit tests (AuthGuard, health controller)
npm run test:e2e  # end-to-end tests against the real app
```
