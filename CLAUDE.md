# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev       # Start with watch mode
npm run start:debug     # Start with debugger attached

# Build
npm run build           # Compile TypeScript via NestJS CLI

# Code quality
npm run lint            # ESLint with auto-fix
npm run format          # Prettier format

# Testing
npm run test            # Run all unit tests
npm run test:watch      # Watch mode
npm run test:cov        # Coverage report
npm run test:e2e        # End-to-end tests (test/jest-e2e.json)
# Run a single test file:
npx jest src/auth/auth.service.spec.ts

# Database
npx prisma migrate dev          # Apply migrations in development
npx prisma migrate deploy       # Apply migrations in production
npx prisma generate             # Regenerate Prisma client after schema changes
npx prisma studio               # Open Prisma Studio GUI
```

## Infrastructure

PostgreSQL runs via Docker. Start with:
```bash
docker-compose -f infra/docker/docker-compose.yml up -d
```
Database: `finances`, User: `finances_user`, Port: `5432`.

Required `.env` variables: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT` (optional, defaults to 3000).

## Architecture

**NestJS** REST API with **Prisma** ORM on **PostgreSQL**. Authentication uses Passport JWT (tokens accepted via `Authorization: Bearer` header or `access_token` cookie).

### Module Structure

Each feature module lives under `src/<module>/` and follows the pattern:
- `<module>.module.ts` — NestJS module definition
- `<module>.controller.ts` — HTTP route handlers
- `<module>.service.ts` — Business logic (injected with `PrismaService`)
- `dto/` — DTOs validated with `class-validator`

`PrismaService` extends `PrismaClient` and is provided globally via `PrismaModule`. All services receive it via constructor injection.

### Domain Modules

| Module | Purpose |
|--------|---------|
| `auth` | JWT login/register, refresh tokens, `JwtAuthGuard` |
| `users` | User CRUD |
| `accounts` | Bank/cash/wallet accounts with balance tracking |
| `movements` | Income/expense transactions that mutate account balances |
| `categories` | User-owned or global categories (INCOME/EXPENSE) |
| `credit-cards` | Credit card definitions linked to a bank account |
| `credit-card-purchases` | Purchases against a credit card (single or multi-installment) |
| `credit-card-installments` | Individual installment records per purchase |
| `credit-card-statements` | Monthly billing cycles (OPEN → CLOSED → PAID) |
| `dashboard` | Aggregated reporting endpoints |

### Key Design Patterns

**All monetary amounts are stored in cents (integers)** — never floats.

**Account balance is kept in sync transactionally.** Every `createMovement`, `softDeleteMovement`, and `updateMovement` operation runs inside `prisma.$transaction()` to atomically update both the `Movement` record and the `Account.currentBalanceCents`.

**Soft deletes** — `Movement` uses `isDeleted: boolean`, `Account`/`Category`/`CreditCard` use `isActive: boolean`. Queries must filter accordingly.

**`userId` is always the auth boundary.** Controllers extract `userId` from `request.user` (populated by `JwtStrategy.validate`) and pass it to services. Services always scope Prisma queries with `userId` to prevent cross-user data access.

**Categories can be global** (`userId: null`) or user-owned. Queries must use `OR: [{ userId }, { userId: null }]` when validating category ownership.

**Credit card purchase flow:**
1. `CreditCardPurchase` created with `installmentsCount` and `firstStatementSequence`
2. `CreditCardInstallment` records auto-generated (one per installment)
3. When a statement closes (`CreditCardStatement` status → CLOSED), installments get assigned a `statementId`
4. Payment (`CreditCardPayment`) links a statement to a `Movement` (EXPENSE) from a bank account
