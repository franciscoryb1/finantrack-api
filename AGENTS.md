# Repository Guidelines

## Project Structure & Module Organization
- `src/`: NestJS application code, organized by feature modules (`auth`, `accounts`, `movements`, `credit-cards`, etc.).
- `src/**/dto/`: Request/response DTOs; keep validation and payload shape definitions here.
- `test/`: End-to-end tests (`*.e2e-spec.ts`) and Jest e2e config.
- `prisma/`: Database schema and migrations (`schema.prisma`, `migrations/`).
- `infra/docker/`: Local PostgreSQL setup via Docker Compose.
- `dist/`: Build output (generated).

## Build, Test, and Development Commands
- `npm run start:dev`: Run API in watch mode for local development.
- `npm run build`: Compile TypeScript to `dist/`.
- `npm run start:prod`: Run compiled app from `dist/main`.
- `npm run lint`: Run ESLint with auto-fix across `src/` and `test/`.
- `npm run format`: Run Prettier on source and tests.
- `npm test`: Run unit/integration specs (`*.spec.ts` under `src/`).
- `npm run test:e2e`: Run end-to-end tests from `test/`.
- `npm run test:cov`: Generate coverage report in `coverage/`.

## Coding Style & Naming Conventions
- Language: TypeScript with NestJS patterns (module/controller/service).
- Formatting: Prettier (`singleQuote: true`, trailing commas enabled).
- Linting: ESLint + `typescript-eslint` + Prettier plugin.
- Indentation: 2 spaces; keep imports grouped and explicit.
- Naming:
  - Files: kebab-case (e.g., `create-account.dto.ts`).
  - Classes: PascalCase (`CreateAccountDto`, `AccountsService`).
  - Variables/functions: camelCase.

## Testing Guidelines
- Unit/spec files: `src/**/*.spec.ts`.
- E2E files: `test/**/*.e2e-spec.ts`.
- Prefer focused service/controller tests for new business logic and endpoint behavior.
- Run `npm test` plus `npm run test:e2e` for changes touching HTTP flows or auth.

## Database & Configuration Tips
- Treat Prisma schema as source of truth; do not edit DB tables manually.
- Create migrations with descriptive names, e.g. `npx prisma migrate dev --name add_dashboard_filters`.
- Keep secrets in `.env` (never commit credentials).

## Commit & Pull Request Guidelines
- Follow concise, imperative commit subjects seen in history (examples: `FIX auth cookies`, `ADD dashboard module`, `docs: update guide`).
- Keep commits scoped to one logical change.
- PRs should include:
  - clear summary and impacted modules,
  - migration notes (if `prisma/` changed),
  - test evidence (`npm test`, `npm run test:e2e`),
  - linked issue/task when available.
