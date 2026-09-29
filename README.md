# My Auth App

A REST API built with **Express 5** and **TypeScript**, backed by **MongoDB**. Users can register and log in with JWT authentication, and visitors can leave a support request without an account. A small vanilla JS frontend is served by the same server.

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

### Run

```bash
npm run dev
```

Open http://localhost:3000. The server connects to MongoDB before it starts listening, and exits with a clear error if the connection or any required environment variable is missing.

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

### Validation rules

- **Username:** 3–30 characters
- **Email:** valid format, stored in lowercase, must be unique
- **Password:** 8–72 characters, with at least one letter and one number
- **Guest message:** 10–1000 characters
- **Phone:** Egyptian mobile number, `010`, `011`, `012` or `015` followed by 8 digits (for example `01012345678`)

### Rate limits

- `/register` and `/login`: 10 requests per 15 minutes per IP (shared)
- `/requests`: 5 requests per hour per IP

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
```

### Request flow

```text
request → helmet → express.json → route → [rate limiter] → [requireAuth] → controller → Mongoose model → MongoDB
                                                                              ↓ (any error)
                                                                         errorHandler
```

## Testing

See [TESTING.md](TESTING.md) for a full manual test checklist covering registration, login, JWT handling, protected routes and guest requests, with expected HTTP status codes.
