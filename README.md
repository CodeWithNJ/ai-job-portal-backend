# AI Job Portal — Backend API

REST API for the **AI-Powered Job Portal**, a two-sided hiring marketplace where job seekers and recruiters are matched by resume intelligence and RAG-backed relevance rather than keyword search.

Built with **NestJS 11 + TypeScript + Prisma 7 + PostgreSQL**.

> Companion repository: **AI Job Portal — Frontend** (React + Vite SPA).
> Product source of truth: `ai_job_portal_prd.pdf` (PRD v1.0, 30 Apr 2026).

---

## Table of contents

- [Product context](#product-context)
- [Implementation status](#implementation-status)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Security model](#security-model)
- [Roadmap](#roadmap)
- [Non-functional targets](#non-functional-targets)

---

## Product context

Job boards are noisy, keyword-driven, and inefficient for both sides of the market. Seekers wade through irrelevant listings; recruiters burn time screening low-fit applicants and rediscovering candidates already sitting in their own database.

This API is the backbone of a platform that instead understands **capability, intent, and relevance**:

| Persona | What the API must deliver |
| --- | --- |
| **Job seeker** | A profile that fills itself from a resume, relevant job recommendations, low-friction applications, application tracking |
| **Recruiter** | Fast job publishing, ranked applicant pipelines, semantic search over the internal talent pool, pipeline state transitions |
| **Hiring manager** | Concise candidate summaries with evidence behind every recommendation |
| **Platform admin** | Moderation, taxonomy management, analytics, auditability of AI outputs |

**AI product principles that constrain the design** (from the PRD):

- **Assistive, not autonomous** — humans remain the final decision makers; no automated hiring decisions.
- **Explainable** — every recommendation must carry evidence (matched skills, experience overlap, missing qualifications).
- **Safe defaults** — never infer protected attributes; always expose a correction path for users.
- **Consent and transparency** — resume parsing and data usage are disclosed, and parsed output never silently overwrites what a user typed.

That last principle is already visible in the schema: parsed resume output is stored in a dedicated `parsedResume` JSON column, separate from the user-editable profile fields, so parsing can never clobber a manual correction.

---

## Implementation status

The API is being built incrementally against the PRD's Phase 1 (MVP) scope.

### Shipped

| Capability | Detail |
| --- | --- |
| **Authentication** | Signup, signin, silent refresh, logout, `GET /users/me` session rehydration |
| **Session hardening** | HttpOnly cookies, refresh-token rotation with reuse detection, refresh tokens encrypted at rest (AES-256-GCM) |
| **"Keep me signed in"** | Preference encoded as a JWT claim so it survives token rotation without extra storage |
| **RBAC** | `job_seeker` / `recruiter` / `admin` roles, enforced by `@Roles()` + `RolesGuard` |
| **Job seeker profile** | Headline, summary, skills, experience years, work history, education, location, work preferences |
| **Recruiter profile** | Designation plus company upsert-and-link by case-insensitive name |
| **Resume upload** | S3-style signed-URL flow, PDF/DOCX only, magic-byte verification, size cap, pluggable storage backend |
| **API conventions** | Uniform success/error response envelope, strict global validation, centralised exception handling |

### Not yet built

In MVP scope per the PRD, but not implemented in this repository yet:

- Job post authoring (create / publish / edit / pause / close) and the `Job` model
- Application workflow, pipeline states, and recruiter notes
- The resume **parsing** pipeline — the schema columns and status enum exist (`resumeParseStatus`, `parsedResume`, `resumeParsedAt`, `resumeParseError`), but nothing writes to them yet
- Embeddings, vector storage, hybrid retrieval, and recommendation services
- Notifications, moderation, admin console, analytics instrumentation
- Rate limiting on the auth routes

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 22 |
| Framework | NestJS 11 (Express platform) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL, with the `citext` extension for case-insensitive emails and company names |
| ORM | Prisma 7 via the `@prisma/adapter-pg` driver adapter |
| Auth | `@nestjs/jwt`, `bcrypt`, `cookie-parser` |
| Validation | `class-validator` + `class-transformer` |
| Config | `@nestjs/config` (global, `.env`) |
| Testing | Jest + Supertest |
| Tooling | ESLint 9, Prettier |

---

## Getting started

### Prerequisites

- Node.js 22+ and npm 10+
- A PostgreSQL database on which you can create extensions (`citext`, and `gen_random_uuid()` support)

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env`

Create a `.env` at the repository root using the [environment variables](#environment-variables) table below. `.env` is git-ignored — never commit real secrets.

Generate each symmetric key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use one output for `REFRESH_TOKEN_ENCRYPTION_KEY` (it **must** decode to exactly 32 bytes) and independent values for each JWT secret and the upload signing secret.

### 3. Apply the database schema

```bash
npx prisma migrate deploy
```

For local schema iteration use `npx prisma migrate dev --name <change>` instead. Prisma reads `DATABASE_URL` through `prisma.config.ts`, which loads `.env` explicitly — Prisma 7 does not do that automatically.

### 4. Generate the Prisma client

```bash
npx prisma generate
```

### 5. Run the API

```bash
npm run start:dev
```

The API listens on `PORT` (this project uses `7500`; Nest falls back to `3000` if unset). Quick liveness check:

```bash
curl http://localhost:7500
```

CORS defaults to `http://localhost:5173` and `http://127.0.0.1:5173` (Vite dev server) with credentials enabled, so the frontend can send its auth cookies without extra configuration.

---

## Environment variables

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://user:pass@localhost:5432/ai_job_portal` | PostgreSQL connection string |
| `PORT` | no | `7500` | HTTP listen port (defaults to `3000`) |
| `NODE_ENV` | no | `development` | Standard environment flag |
| `CORS_ORIGIN` | no | `http://localhost:5173,https://app.example.com` | Comma-separated allowed origins; falls back to the Vite dev origins |
| `JWT_ACCESS_TOKEN_SECRET` | yes | *(random string)* | Signing secret for short-lived access tokens |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | no | `15m` | Access token lifetime (`s`/`m`/`h`/`d`, or bare seconds) |
| `JWT_REFRESH_TOKEN_SECRET` | yes | *(random string)* | Signing secret for refresh tokens — must differ from the access secret |
| `JWT_REFRESH_TOKEN_REMEMBER_EXPIRES_IN` | no | `30d` | Refresh lifetime when "Keep me signed in" is checked |
| `JWT_REFRESH_TOKEN_SESSION_EXPIRES_IN` | no | `1d` | Refresh lifetime when it is not |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | no | `7d` | Legacy fallback for the "remember" lifetime |
| `REFRESH_TOKEN_ENCRYPTION_KEY` | yes | *(base64, 32 bytes)* | AES-256-GCM key protecting refresh tokens at rest |
| `COOKIE_SECURE` | no | `false` locally, `true` in production | Sets the `Secure` cookie flag |
| `COOKIE_SAME_SITE` | no | `lax` | `SameSite` policy; use `none` + `Secure` for cross-site deployments |
| `UPLOAD_URL_SIGNING_SECRET` | yes | *(random string)* | HMAC-SHA256 key for signing resume upload URLs |
| `UPLOAD_URL_TTL` | no | `10m` | Validity window of an issued upload URL |
| `RESUME_STORAGE_DIR` | no | `./storage` | Local-disk storage root (git-ignored) |
| `MAX_RESUME_SIZE_MB` | no | `10` | Upload size cap, also applied by the raw-body middleware |
| `APP_BASE_URL` | no | `http://localhost:7500` | Public origin used to build absolute upload URLs |

Missing `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_ENCRYPTION_KEY`, or `UPLOAD_URL_SIGNING_SECRET` fails fast at boot rather than degrading silently.

---

## Available scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Start with watch mode |
| `npm run start` | Start once |
| `npm run start:debug` | Start with the Node inspector attached |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build (`node dist/main`) |
| `npm test` | Unit tests |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Coverage report |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | ESLint with `--fix` |
| `npm run format` | Prettier over `src/` and `test/` |

---

## Project structure

```
prisma/
  schema.prisma              Data model (User, JobSeekerProfile, Company, RecruiterProfile)
  migrations/                Ordered SQL migrations
src/
  main.ts                    Bootstrap: cookies, raw-body route, CORS, global pipe/interceptor/filter
  app.module.ts              Root module (global ConfigModule + feature modules)
  prisma.service.ts          PrismaClient over the pg driver adapter
  common/
    decorators/              @ResponseMessage(), @Roles()
    filters/                 AllExceptionsFilter — uniform error envelope
    guards/                  RolesGuard — role-claim authorization
    interceptors/            ResponseInterceptor — uniform success envelope
    interfaces/              ApiResponse<T> contract
    services/                EncryptionService (AES-256-GCM)
    utils/                   validateBody() — runtime DTO selection
  user/
    user.controller.ts       Auth routes and cookie lifecycle
    user.service.ts          Credential checks, rotation, reuse detection
    token.service.ts         JWT issuing/verification, expiry parsing
    guards/                  AccessTokenGuard — cookie authentication
    decorators/              @CurrentUser()
    dto/                     CreateUserDto, LoginUserDto, UserRole enum
  profile/
    profile.controller.ts        GET/PATCH /profiles/me, upload-URL issuance
    resume-upload.controller.ts  PUT /uploads/resumes/:token (signed, unauthenticated)
    profile.service.ts           Role-dispatched profile logic, upload completion
    dto/                         Job seeker / recruiter / upload-URL DTOs
  storage/
    upload-url.service.ts    HMAC signed-token issuing and verification
    file-storage.service.ts  Local-disk backend keyed by S3-style object keys
storage/                     Uploaded resume files (git-ignored)
test/                        E2E specs
```

---

## Architecture

### Response envelope

Every response — success or failure — has the same shape, so the SPA needs exactly one parsing path.

**Success** (the message comes from `@ResponseMessage()` on the handler):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile fetched successfully",
  "data": { "user": { "id": "…", "email": "…", "role": "job_seeker" } },
  "timestamp": "2026-07-25T10:15:00.000Z",
  "path": "/users/me"
}
```

**Error** (produced by `AllExceptionsFilter`; `details` carries per-field validation messages):

```json
{
  "success": false,
  "statusCode": 400,
  "message": "password must be longer than or equal to 8 characters",
  "error": {
    "code": "BAD_REQUEST",
    "details": ["password must be longer than or equal to 8 characters"]
  },
  "timestamp": "2026-07-25T10:15:00.000Z",
  "path": "/users/signup"
}
```

### Validation

The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, `transform`, and implicit conversion. Unknown properties are **rejected**, not stripped — clients must send exactly the documented fields.

`PATCH /profiles/me` is the one exception: its body shape depends on the caller's role, which a global pipe cannot express. The service picks `UpdateJobSeekerProfileDto` or `UpdateRecruiterProfileDto` at runtime and validates through the `validateBody()` helper, which mirrors the global pipe's strictness.

### Authentication flow

```
POST /users/signin
  ├─ bcrypt.compare (uniform error for unknown user and wrong password)
  ├─ issue access JWT  (15m) → HttpOnly cookie, path=/
  ├─ issue refresh JWT (1d or 30d, carries the rememberMe claim) → HttpOnly cookie, path=/users
  ├─ store the refresh token AES-256-GCM-encrypted on users.refresh_token
  └─ respond with the user object only — the access token is never in the JSON body

Protected request → AccessTokenGuard reads the access cookie
  └─ 401 → client calls POST /users/refresh → verify JWT, constant-time compare
           against the stored ciphertext, rotate both tokens, replay the request

A cryptographically valid refresh token that does not match the stored copy = suspected replay
  └─ revoke users.refresh_token, log a warning, force re-authentication
```

The refresh cookie is scoped to `path=/users` so it is not attached to ordinary API calls, shrinking its exposure surface. When "Keep me signed in" is off, both cookies are issued without `maxAge`, making them browser-session cookies that vanish when the browser closes.

### Resume upload flow

The API deliberately never proxies file bytes through an authenticated JSON endpoint. It reproduces the S3 pre-signed URL contract locally, so moving to S3/R2/MinIO later changes only `FileStorageService` and `UploadUrlService` — the client contract and the stored data are unaffected.

```
1. POST /profiles/me/resume/upload-url   (authenticated, job_seeker only)
     → server mints storage key `resumes/<userId>/<uuid>.<ext>`
     → HMAC-SHA256 token binds { userId, storageKey, mimeType, fileName, exp }
     → returns { uploadUrl, method: "PUT", headers, expiresAt }

2. PUT /uploads/resumes/:token           (unauthenticated — the token IS the credential)
     → constant-time signature verification, expiry check
     → Content-Type must equal the type the token was issued for
     → size checked against MAX_RESUME_SIZE_MB
     → magic bytes checked: "%PDF" for PDF, "PK\x03\x04" for DOCX
     → file written to the storage key; profile metadata updated
     → parse state reset to not_started so a re-upload re-triggers parsing
```

`main.ts` registers `express.raw()` for `/uploads/resumes` because the default JSON body parser would discard the binary payload.

Only the **storage key** is persisted in `resumeUrl` — not a public URL — so the storage backend can be swapped without a data migration.

---

## API reference

Base URL: `http://localhost:7500` (configurable via `PORT`).

Authenticated routes read the `access_token` HttpOnly cookie. Browser clients must send credentials (`withCredentials: true` in axios, `credentials: "include"` in fetch).

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` | — | Liveness check |

### Authentication — `/users`

| Method | Path | Auth | Success | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/users/signup` | — | `201` | Create an account |
| `POST` | `/users/signin` | — | `200` | Authenticate; sets both auth cookies |
| `POST` | `/users/refresh` | refresh cookie | `200` | Rotate the token pair |
| `GET` | `/users/me` | access cookie | `200` | Current user, for session rehydration |
| `POST` | `/users/logout` | refresh cookie | `200` | Clear cookies and revoke the stored refresh token |

**`POST /users/signup`**

```json
{
  "fullName": "Asha Menon",
  "email": "asha@example.com",
  "password": "at-least-8-chars",
  "role": "job_seeker",
  "contactNo": "+91 98765 43210"
}
```

| Field | Rules |
| --- | --- |
| `fullName` | **required**, 2–100 chars |
| `email` | **required**, valid email, ≤255 chars, unique (case-insensitive) |
| `password` | **required**, 8–128 chars |
| `role` | **required**, one of `job_seeker` \| `recruiter` \| `admin` |
| `contactNo` | optional, ≤20 chars, matches `^[0-9+\-()\s]+$`, unique |

Duplicate email returns `409 Conflict`.

**`POST /users/signin`**

```json
{ "email": "asha@example.com", "password": "…", "rememberMe": true }
```

Returns `{ "user": { id, fullName, email, role, lastLoginAt } }`. Unknown email and wrong password both return the same `401 Invalid email or password` — the endpoint is deliberately not an account-enumeration oracle. A deactivated account returns `403`.

**`POST /users/logout`** is idempotent: logging out twice, or with an already-expired token, still succeeds.

### Profiles — `/profiles`

All routes require the access cookie and run through `AccessTokenGuard` + `RolesGuard`.

| Method | Path | Roles | Success | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/profiles/me` | seeker, recruiter | `200` | Fetch own profile |
| `PATCH` | `/profiles/me` | seeker, recruiter | `200` | Partial update, role-dispatched |
| `POST` | `/profiles/me/resume/upload-url` | seeker | `201` | Issue a signed upload URL |

`GET /profiles/me` creates an empty profile row on first access, so the client always receives an editable object rather than a 404. Admin callers get `400` — there is no admin profile shape.

Responses are wrapped as `{ role, profile }`; recruiter responses include the linked `company`.

**`PATCH /profiles/me` — job seeker body** (all fields optional; only what you send is written)

```json
{
  "headline": "Senior Backend Engineer",
  "summary": "8 years building distributed systems…",
  "skills": ["TypeScript", "PostgreSQL", "NestJS"],
  "experienceYears": 8,
  "experience": [
    {
      "title": "Backend Engineer",
      "company": "Acme",
      "startDate": "2021-04",
      "endDate": "",
      "description": "Owned the payments service."
    }
  ],
  "education": [
    { "degree": "B.Tech CSE", "institution": "NIT Trichy", "year": "2017" }
  ],
  "location": "Bengaluru, IN",
  "workPreferences": {
    "jobTypes": ["full_time", "contract"],
    "remotePreference": "hybrid",
    "expectedCompensation": "45-55 LPA",
    "noticePeriodDays": 60
  }
}
```

Limits: ≤50 skills (≤100 chars each), ≤30 experience entries, ≤10 education entries, `experienceYears` 0–60, `noticePeriodDays` 0–365, `remotePreference` ∈ `remote` \| `hybrid` \| `onsite` \| `any`. An empty or omitted `endDate` means "present".

Resume and parsed-resume fields are **not** client-writable — they are owned by the upload and parsing pipelines.

**`PATCH /profiles/me` — recruiter body**

```json
{
  "designation": "Talent Acquisition Lead",
  "company": {
    "name": "Acme Corp",
    "website": "https://acme.example",
    "industry": "SaaS",
    "size": "201-500",
    "location": "Bengaluru, IN",
    "description": "…"
  }
}
```

Sending `company` upserts it by case-insensitive name and links the recruiter to it, so two recruiters entering "Acme Corp" and "acme corp" land on the same company row.

**`POST /profiles/me/resume/upload-url`**

```json
{ "fileName": "asha-menon-resume.pdf", "mimeType": "application/pdf" }
```

Returns:

```json
{
  "uploadUrl": "http://localhost:7500/uploads/resumes/<signed-token>",
  "method": "PUT",
  "headers": { "Content-Type": "application/pdf" },
  "expiresAt": "2026-07-25T10:25:00.000Z"
}
```

### Resume upload — `/uploads`

| Method | Path | Auth | Success | Description |
| --- | --- | --- | --- | --- |
| `PUT` | `/uploads/resumes/:token` | signed token | `200` | Upload the file bytes |

Send the raw file as the body, with `Content-Type` exactly matching the value from the upload-URL response.

```bash
curl -X PUT "<uploadUrl>" -H "Content-Type: application/pdf" --data-binary @resume.pdf
```

| Failure | Status |
| --- | --- |
| Bad or tampered signature | `401` |
| Expired token | `401` |
| Empty body | `400` |
| Over `MAX_RESUME_SIZE_MB` | `413` |
| `Content-Type` mismatch, or contents don't match the declared type | `415` |

Accepted types: `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX).

---

## Data model

```
User ──1:0..1── JobSeekerProfile
  │
  └──1:0..1── RecruiterProfile ──N:1── Company
```

### `users`

Identity and session state. `email` is `citext` for case-insensitive uniqueness. `refreshToken` holds the AES-256-GCM ciphertext of the active refresh token — `null` means no live session. Deactivation is tracked via `isAccountActive` plus `accountDeactivatedAt` / `accountReactivatedAt` rather than deletion.

### `job_seeker_profiles`

Editable profile fields (`headline`, `summary`, `skills[]`, `experienceYears`, `experience` JSON, `education` JSON, `location`, `workPreferences` JSON) sit alongside two clearly separated groups:

- **Resume file metadata** — `resumeUrl` (storage key), `resumeFileName`, `resumeMimeType`, `resumeUploadedAt`
- **Parsing output** — `resumeParseStatus` (`not_started` → `pending` → `processing` → `completed` \| `failed`), `parsedResume` (structured extraction plus per-section confidence scores), `resumeParsedAt`, `resumeParseError`

Keeping parsing output in its own column is what makes the PRD's "manual correction support" requirement safe: a re-parse never overwrites what the user typed, and the UI can show extraction confidence next to each suggested value.

### `companies`

Shared employer records, unique on a `citext` name, so many recruiters can attach to one company. Cascade rules: deleting a `User` removes their profiles; deleting a `Company` sets `recruiter_profiles.company_id` to `NULL` rather than orphaning the recruiter.

### `recruiter_profiles`

Links a recruiter to a company with a `designation`, indexed on `companyId` for company-scoped lookups.

---

## Security model

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, 10 salt rounds |
| Token transport | HttpOnly cookies — tokens are never readable by JavaScript |
| Access token | Short-lived (15m), never persisted server-side, never returned in a JSON body |
| Refresh token | Encrypted at rest with AES-256-GCM (AEAD, so tampering is detected on decrypt) |
| Token rotation | Every refresh issues a new pair and replaces the stored ciphertext |
| Replay detection | A valid JWT that doesn't match the stored copy revokes the session outright |
| Constant-time comparison | `timingSafeEqual` for refresh-token matching and upload-signature verification |
| Account enumeration | Uniform `401` for unknown-user and wrong-password |
| Cookie scoping | Refresh cookie limited to `path=/users`; `Secure` and `SameSite` are environment-driven |
| Input validation | Strict global pipe; unknown properties rejected |
| Upload authorization | HMAC-signed, expiring tokens bound to one user, key, and MIME type |
| Upload content safety | Declared-type check, magic-byte check, and size cap before anything is written |
| Path traversal | Storage keys are pattern-validated and the resolved path is asserted to stay inside the storage root |
| RBAC | Role claim checked by `RolesGuard`; `@Roles()` is declarative per route |

**Before production:** set `COOKIE_SECURE=true`, serve over HTTPS, set `CORS_ORIGIN` to your real origins, move secrets into a managed secret store, replace `FileStorageService` with an object-storage backend, and add rate limiting on the auth routes.

---

## Roadmap

Tracks the PRD's three phases.

**Phase 1 — MVP.** Auth, profiles, and resume upload are done. Remaining: job posting CRUD with normalized fields, application workflow with status tracking and recruiter notes, resume parsing into structured fields with confidence scores, embeddings for resumes/profiles/job descriptions, hybrid retrieval (metadata filters plus semantic search), basic recommendations for both sides, explainability snippets, notifications, and funnel instrumentation.

**Phase 2 — Product-market fit.** Conversational career assistant and recruiter copilot, richer candidate scoring, saved searches, recruiter collaboration, employer branding pages, personalized alerts, and a feedback loop that learns from clicks, applies, shortlists, and dismissals.

**Phase 3 — Scale and monetization.** Recruiter subscriptions and employer seats, ATS integrations, bulk outreach, interview scheduling, advanced analytics, trust-and-safety tooling, and multi-region deployment.

**Delivery guidance from the PRD:** launch in one vertical or region to build liquidity; start with hybrid ranking (rules + embeddings + light LLM explanations) rather than an end-to-end generative pipeline; instrument everything from day one.

### Explicit non-goals

Not a full HRIS or ATS replacement in MVP. No payroll, offer management, or onboarding. No fully autonomous AI hiring decisions.

---

## Non-functional targets

From the PRD, for reference while designing new endpoints:

| Area | Target |
| --- | --- |
| Performance | Recommendations under 2.5s p95 (cached); under 5s p95 for cold AI-generated summaries |
| Availability | 99.5% at MVP, 99.9% at scale |
| Security | Encryption in transit and at rest, signed upload URLs, RBAC, audit logs, secret isolation |
| Privacy | Configurable retention, deletion workflows, GDPR-style consent and subject-access readiness |
| Observability | Tracing across ingestion, retrieval, ranking, and the application funnel |

The current build covers encryption, signed uploads, and RBAC. Audit logging, retention/deletion workflows, and tracing are still open.

### Success metrics the API must support

| Metric area | Definition |
| --- | --- |
| North star | Qualified application rate per active job |
| Activation | Percent of new job seekers completing profile plus resume upload |
| Discovery quality | CTR on recommended jobs and recruiter-recommended candidates |
| Efficiency | Median recruiter time to first qualified shortlist |
| Marketplace | Active jobs, active seekers, applies per active seeker, fill rate |
| AI quality | Recommendation acceptance rate and recruiter override rate |

Every one of these needs event instrumentation that does not exist yet — worth wiring in alongside the first recommendation endpoint rather than after it.
