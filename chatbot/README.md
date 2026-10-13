# Chatbot service (NestJS + Gemini)

The AI assistant behind "My Auth App". A NestJS API that sends users' messages to Google's Gemini model, remembers conversations in MongoDB, and reports token usage and cost.

It trusts the JWTs issued by the Express app in the repository root (shared `JWT_SECRET`). See the [main README](../README.md) for the whole project.

## Run

```bash
npm install
npm run start:dev
```

- API: http://localhost:3001
- Interactive docs (Swagger): http://localhost:3001/docs. Click **Authorize** and paste a token from `/login`.

Configuration lives in `.env`. Copy `.env.example`; every variable is validated at startup, and the app refuses to start if one is missing or invalid.

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Development mode with auto-restart |
| `npm run build` / `npm run start:prod` | Compile to `dist/` and run it |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests against the real app and database |

## NestJS concepts used

| Concept | Where |
|---|---|
| Modules, imports/exports | `AppModule`, `ChatModule` imports `ConversationsModule` |
| Controllers, services, dependency injection | `chat/`, `conversations/` |
| Configuration with validation | `ConfigModule` + `config/env.validation.ts` |
| Async module setup (`forRootAsync`, `registerAsync`) | MongoDB connection, JWT module |
| Database (`@nestjs/mongoose`) | `conversations/conversation.schema.ts` |
| DTOs + `ValidationPipe` (class-validator) | `chat/dto/chat-message.dto.ts` |
| Global guard + `@Public()` metadata | `auth/auth.guard.ts` |
| Custom decorators | `@Public()`, `@CurrentUser()` |
| Extending a built-in guard | `chat/user-throttler.guard.ts` (rate limit per user) |
| Custom pipe | `common/parse-object-id.pipe.ts` |
| Interceptor | `common/logging.interceptor.ts` |
| Exception filter | `common/all-exceptions.filter.ts` |
| OpenAPI / Swagger | `main.ts`, `@Api...` decorators |
| Unit and e2e testing | `auth/auth.guard.spec.ts`, `test/app.e2e-spec.ts` |

## Tokens and cost

Every reply includes `usage`: input, output and thinking tokens, plus `costUsd`, estimated with the paid-tier prices in `.env` (`GEMINI_INPUT_PRICE_PER_MILLION`, `GEMINI_OUTPUT_PRICE_PER_MILLION`; thinking tokens are billed as output). On the free tier the real cost is $0, but requests are limited per model per day.

Because the Gemini API is stateless, each request re-sends the recent conversation (up to 20 messages) as context, so **longer chats use more input tokens per message**.
