# Personal CRM — Project Blueprint

## 1. Purpose

A personal CRM that helps users maintain important relationships intentionally.

The core problem it solves:

> People often drift out of touch with friends, family, mentors, and other important people—not because they don't care, but because there is no lightweight system for remembering **who** they want to stay connected with and **when** they last connected.

The product should feel more like a **personal relationship assistant** than a traditional CRM. It should help the user maintain relationships without turning those relationships into a sales pipeline.

### Priorities

1. **Daily usefulness** — the product should be genuinely useful to a new user from day one, with minimal setup friction.
2. **Reliability** — the core loop (add, cadence, log, overdue, remind) must work correctly every time; it's the thing users will judge the product on.
3. **Growth-ready architecture** — clean, maintainable code that can absorb new users and new features without a rewrite.

The project should prioritize **simplicity and correctness over feature count**.

---

## 2. Product Philosophy

The product is built around a simple loop:

```text
Add person
    ↓
Choose desired contact cadence
    ↓
Log interactions
    ↓
Determine who is overdue
    ↓
Remind user
    ↓
User reaches out
    ↓
Log interaction
    ↓
Repeat
```

The core product is **not** the reminder itself.

The core product is helping the user answer:

> **“Who do I care about that I haven't talked to recently?”**

The application should make maintaining relationships require as little administrative work as possible.

---

## 3. Core Concept

Track contacts, record interactions, and notify the user when they are overdue based on a per-contact cadence.

Examples:

* Close friend → every 14 days
* Family member → every 30 days
* College friend → every 90 days
* Mentor → every 60 days

Cadence is explicitly user-defined in v1.

The system should not attempt to infer relationship importance or automatically change cadence until a later version.

---

# 4. User Stories — v1

### Contact management

* As a user, I can add a contact with a name, relationship type, and a cadence preset (Weekly, Monthly, Quarterly, or a custom number of days). The default is Monthly.
* As a user, I can optionally add a birthday, phone, email, and general notes.
* As a user, I can message or email someone in one tap when those fields are set.
* After signup, if I have no people yet, I add three of them (or skip) before Home.
* As a user, I can edit a contact.
* As a user, I can archive a contact.
* As a user, I can view all active contacts.
* As a user, I can view archived contacts separately.

### Interaction tracking

* As a user, I can log an interaction with a contact.
* An interaction contains a date and optional note.
* As a user, I can view a contact's complete interaction history.
* As a user, I can edit or delete an interaction.
* As a user, I can mark a contact as "reached out today" from Home, from Catch up, and from the person page.
* A date-only reach-out is labeled "Reached out". "Added a note" appears only when the note is non-empty. The app never shows a body that says "No note."

### Dashboard

* As a user, I can see contacts who are currently overdue.
* Overdue contacts are sorted by how overdue they are.
* As a user, I can see when I last interacted with each overdue contact.
* As a user, I can see the contact's desired cadence.
* As a user, I can quickly record that I reached out from Home without opening Catch up, including a birthday hello.
* A person with no conversations is overdue immediately (due today, last talked Never). Logging a conversation today clears them.

### Reminders

* As a user, I can configure which day of the week I receive my weekly digest, and see or edit my timezone, on Settings.
* As a user, I sign out from Settings (and the sidebar). The mobile tab bar is Home, Catch up, Contacts, and Timeline.
* As a user, I receive a weekly email containing contacts who are overdue.
* As a user, I can mark a contact as "reached out today" from the email.
* Email actions must be authenticated and must not expose private information through an easily guessable URL.

### Account

* A logged-out visitor sees what Reach is, can request a magic-link sign-in, and can reset a password.
* The first session, including a magic link, creates the `public.users` profile.

### Gmail import (v2)

* As a user, I can connect Gmail and review a short list of people from email headers. Nothing is saved until I accept someone. Disconnecting removes the stored token and leaves accepted people in place.
* As a user, I can create an assistant token in Settings, ask who I'm late to talk to, and log a conversation. Revoking the token stops the next call. The assistant does not draft messages and cannot delete people.
* As a user, I can write one short nudge on a person. When they are due, that line shows on Home, on Catch up, and in the digest. Clearing them does not erase it. The digest does not include general notes.
* As a user, I can hide someone for seven days with Not this week, from Home, Catch up, or the digest, without logging a conversation. They come back on that date. Logging a real conversation ends the pause early.
* As a user, I see overdue people under their group name on Home, on Catch up, and in the digest. Someone in two groups appears once, under the first group name alphabetically. I can set everyone currently in a group to Weekly, Monthly, or Quarterly only after I confirm. People I add later keep their own cadence.

---

# 5. Explicitly Out of Scope for v1

The following should **not** be implemented unless explicitly added to the specification later:

* SMS notifications
* Push notifications
* Native mobile app
* Google Contacts integration
* Apple Contacts integration
* LinkedIn integration
* Browser extension
* Automatic contact discovery beyond the v2 Gmail import defined in Section 28 (still opt-in, still requires explicit review before any contact is created)
* AI-generated talking points
* AI-generated messages sent on the user's behalf
* Adaptive/learned cadence
* Automatic relationship scoring
* Social media integrations
* Multi-user/shared contacts
* Teams
* Organizations
* Billing/payments
* Public profiles
* Contact recommendations

> **Note:** Gmail inbox integration and an AI-facing interface (MCP) were originally listed here as out of scope. They are now scoped for v2 — see Sections 27 and 28. Everything else in this list is still out of scope until explicitly added.

The goal is to validate the fundamental relationship-maintenance loop before adding integrations or AI beyond what's specified below.

---

# 6. Data Model

## `users`

| Column               | Type         | Notes                                 |
| -------------------- | ------------ | ------------------------------------- |
| `id`                 | uuid, PK     | Supabase Auth user ID                 |
| `email`              | text, unique |                                       |
| `timezone`           | text         | IANA timezone, e.g. `America/Toronto` |
| `digest_day_of_week` | int          | `0=Sun … 6=Sat`, default `1`          |
| `created_at`         | timestamptz  |                                       |

The user's timezone is important because "today" and weekly digest scheduling are user-local concepts.

---

## `contacts`

| Column              | Type             | Notes                  |
| ------------------- | ---------------- | ----------------------- |
| `id`                | uuid, PK         |                        |
| `user_id`           | uuid, FK → users | Owner of the contact   |
| `name`              | text             | Required               |
| `relationship_type` | text             | Free text in v1        |
| `cadence_days`      | int              | Required; default `30` |
| `birthday`          | date             | Nullable               |
| `notes`             | text             | Nullable               |
| `phone`             | text             | Nullable; `sms:` link  |
| `email`             | text             | Nullable; `mailto:`    |
| `archived`          | boolean          | Default `false`        |
| `source`            | text             | `manual` (default) or `gmail_import` — see Section 28 |
| `created_at`        | timestamptz      |                        |

### Constraints

* `cadence_days` must be greater than `0`.
* `user_id` must always be the authenticated user's ID when creating a contact.
* Users must never be able to access another user's contacts.

---

## `interactions`

| Column        | Type                | Notes                     |
| ------------- | ------------------- | ------------------------- |
| `id`          | uuid, PK            |                           |
| `contact_id`  | uuid, FK → contacts |                           |
| `occurred_on` | date                | Date interaction occurred |
| `note`        | text                | Nullable                  |
| `created_at`  | timestamptz         |                           |

An interaction belongs to a contact, and the contact's ownership is inherited through `contacts.user_id`.

---

## `reminders_sent`

| Column       | Type                | Notes |
| ------------ | ------------------- | ----- |
| `id`         | uuid, PK            |       |
| `contact_id` | uuid, FK → contacts |       |
| `sent_at`    | timestamptz         |       |

This table exists primarily to support idempotency and prevent duplicate reminder emails.

---

## `google_connections` (new — v2, see Section 28)

| Column                | Type             | Notes                                                    |
| --------------------- | ---------------- | --------------------------------------------------------- |
| `id`                  | uuid, PK         |                                                            |
| `user_id`             | uuid, FK → users | One connection per user in v2                             |
| `refresh_token_enc`   | text             | Encrypted at rest; never sent to the client                |
| `scopes`               | text             | Granted OAuth scopes, e.g. `gmail.metadata`               |
| `connected_at`         | timestamptz      |                                                            |
| `last_synced_at`       | timestamptz      | Nullable — null until the first import runs                |

RLS on this table must restrict rows to `user_id = auth.uid()`, identically to `contacts`.

---

## `mcp_tokens` (new — v2, see Section 27)

| Column       | Type             | Notes                                              |
| ------------ | ---------------- | --------------------------------------------------- |
| `id`         | uuid, PK         |                                                     |
| `user_id`    | uuid, FK → users |                                                     |
| `token_hash` | text             | Hash of the issued token; raw token never stored    |
| `label`      | text             | User-supplied name, e.g. "Claude Desktop"           |
| `created_at` | timestamptz      |                                                     |
| `last_used_at` | timestamptz    | Nullable                                            |
| `revoked_at` | timestamptz      | Nullable — presence means the token is dead         |

A user can have multiple MCP tokens (one per client) and can revoke any of them individually from Settings.

---

# 7. Derived Relationship State

The application should **not store "days overdue" as a database field**.

It is derived from the current date and interaction history.

A contact is overdue when today is on or after the next due date. "Today" is the user's local calendar date.

`last_contact_date` is the latest `interactions.occurred_on` only. It is null when the person has no conversations. `created_at` is not a stand-in for a conversation.

```text
last_contact_date =
    latest interaction.occurred_on
    OR null

next_due_date =
    today                          when last_contact_date is null
    last_contact_date + cadence_days   otherwise

days_overdue =
    0                              when last_contact_date is null
    today - next_due_date          otherwise
```

A contact is overdue when `last_contact_date` is null (due now: `days_overdue = 0`, last talked Never) or when `days_overdue >= 0`.

The digest lists never-contacted people as overdue. Copy may say "due today".

---

# 8. Core Logic

The following pieces are intentionally **owned by the developer** and should be hand-written rather than delegated:

### `overdue_contacts` SQL query/view

Responsible for determining:

* latest interaction
* effective last-contact date
* next due date
* days overdue
* filtering archived contacts
* filtering by user

### `lib/overdue.ts`

A small application-level abstraction around the overdue query.

Responsibilities:

* expose a typed interface to the UI
* keep database/query details out of components
* provide a clear boundary for the core business rule

### Reminder email content

The developer owns:

* what qualifies as worth mentioning
* ordering of contacts
* wording
* formatting
* call-to-action behavior

The email should be useful without becoming noisy.

### MCP tool handlers (new — v2)

The developer owns the mapping between MCP tools and the underlying data layer (Section 27). MCP tool handlers must call the **same** `lib/contacts.ts`, `lib/interactions.ts`, and `lib/overdue.ts` functions the web app uses — never a parallel implementation.

### Gmail candidate filtering (new — v2)

The developer owns the heuristics that decide which email addresses become "suggested contacts" versus noise (Section 28). This logic should live in its own module (`lib/gmail-import.ts`) so it can be tested and tuned independently of the OAuth plumbing.

---

# 9. Security / Data Isolation

Security is part of the MVP because the application stores personal relationship information.

Supabase Row Level Security (RLS) should ensure:

```text
authenticated user
        ↓
can only access
        ↓
their own contacts
        ↓
and interactions belonging to those contacts
```

Users must not rely on the frontend to enforce ownership.

The database should enforce ownership through RLS policies.

The developer should understand:

* why RLS is necessary
* what each policy permits
* how `auth.uid()` is used
* how contact ownership propagates to interactions

Email action links must also be designed so that knowing a contact ID alone is insufficient to perform an unauthorized action.

### v2 additions

* **Gmail OAuth tokens** are refresh tokens, not passwords, encrypted at rest, never exposed to the client, and scoped to `gmail.metadata` only (never the message body — see Section 28).
* **MCP tokens** are bearer credentials with the same blast radius as a password for this app. They are stored hashed, shown to the user exactly once at creation, individually revocable, and every MCP request must resolve to a single `user_id` that RLS then enforces — an MCP client can never see or act on another user's data.
* MCP write actions (`create_contact`, `update_contact`, `log_interaction`) go through the same validation and RLS as the web app. There is no privileged bypass path for MCP.

---

# 10. Tech Stack

## Frontend

* React
* Vite
* TypeScript
* Tailwind CSS

## Database + Authentication

* Supabase

  * PostgreSQL
  * Supabase Auth
  * Row Level Security
  * Client SDK

## Email

* Resend

Email sending should occur server-side through either:

* Supabase Edge Functions, or
* a Vercel serverless function.

Do not expose email-provider API keys to the client.

## Scheduling

Preferred:

* Supabase scheduled Edge Function / cron

Alternative:

* GitHub Actions

The scheduler should invoke a server-side reminder job rather than performing reminder logic in the browser.

## AI Interface (new — v2)

* `@modelcontextprotocol/sdk` (TypeScript) for the MCP server implementation
* Hosted as a Vercel serverless/Edge function (or a Supabase Edge Function) — no local install required for the user, mirroring Dex's hosted `mcp.getdex.com` model
* OAuth 2.1-style browser auth flow for interactive clients (Claude Desktop, Claude Code, etc.), plus a static API-key path generated in Settings for headless use

## Email Import (new — v2)

* Google OAuth 2.0, `https://www.googleapis.com/auth/gmail.metadata` scope only
* Gmail API (`users.messages.list` / `.get` with `format=metadata`) — headers only, never the message body

## Hosting

* Vercel or Netlify

---

# 11. Architecture

```text
                        ┌──────────────────────┐
                        │      React + Vite    │
                        │      TypeScript      │
                        └──────────┬───────────┘
                                   │
                                   │ Supabase SDK
                                   │
                        ┌──────────▼───────────┐
                        │       Supabase       │
                        │                      │
                        │  Auth                │
                        │  PostgreSQL          │
                        │  Row Level Security  │
                        └──────────┬───────────┘
                                   │
        ┌──────────────┬──────────┴──────────┬──────────────────┐
        │              │                     │                  │
┌───────▼──────┐┌───────▼────────┐  ┌─────────▼────────┐┌────────▼─────────┐
│ Web App Logic ││ Scheduled Job  │  │   MCP Server      ││  Gmail Import Job │
│               ││                │  │   (hosted)        ││  (on-demand)      │
│ overdue.ts    ││ Find overdue   │  │                    ││                   │
│ contact CRUD  ││ contacts       │  │ find/get/create/   ││ Fetch headers     │
└───────────────┘└───────┬────────┘  │ update contact,    ││ Filter candidates │
                          │           │ log_interaction,   ││ Return for review │
                   ┌──────▼───────┐  │ get_overdue         │└─────────┬─────────┘
                   │    Resend    │  └──────────┬──────────┘          │
                   │     Email    │             │                     │
                   └──────────────┘             │            ┌────────▼────────┐
                                                 │            │   Gmail API      │
                                          AI clients           │  (metadata only) │
                                     (Claude, ChatGPT, etc.)   └──────────────────┘
```

Both new components (the MCP server and the Gmail import job) call into the **same** data-layer functions (`lib/contacts.ts`, `lib/interactions.ts`, `lib/overdue.ts`) as the existing web app. Neither introduces a parallel database access path.

Do **not** introduce Redis, a message queue, a separate backend service, or additional databases unless a concrete requirement emerges. The MCP server and Gmail import job are both stateless serverless functions, not standing services.

Infrastructure should be added only when a concrete requirement demands it — not speculatively, and not to look impressive.

---

# 12. Application Structure

```text
src/
  pages/
    Dashboard.tsx
    ContactList.tsx
    NewContact.tsx
    ContactDetail.tsx
    GmailImportReview.tsx      (new — v2)
    Settings/McpTokens.tsx     (new — v2)

  components/
    ContactCard.tsx
    OverdueList.tsx
    InteractionForm.tsx
    Navbar.tsx
    EmptyState.tsx

  lib/
    supabase.ts
    overdue.ts
    contacts.ts
    interactions.ts
    email.ts
    gmail-import.ts            (new — v2)

  mcp/                          (new — v2)
    server.ts
    tools/
      findContacts.ts
      getContact.ts
      createContact.ts
      updateContact.ts
      logInteraction.ts
      getOverdueContacts.ts
    auth.ts

  types/
    database.ts

  utils/
    dates.ts
```

The exact structure may evolve as the application grows.

Avoid creating abstractions until they solve an actual problem.

---

# 13. UX Requirements

The application should optimize for **low-friction interaction logging**.

The primary action on the dashboard should be:

> **Reached out today**

A user should be able to record a successful interaction in approximately one interaction.

For example:

```text
Sarah
Last contacted: 38 days ago
Cadence: every 30 days

[ Reached out today ]    [ View ]
```

Clicking `Reached out today` should create an interaction using today's date and return the contact to a non-overdue state.

The user can optionally add a note afterward.

---

# 14. Dashboard

The dashboard is the primary screen.

It should show:

### Overdue

```text
Overdue by 24 days
Sarah
Last contacted: Jan 12
Cadence: every 14 days

[ Reached out today ]
```

Contacts should be sorted by:

```text
days_overdue DESC
```

### Empty state

If there are no overdue contacts:

> **You're caught up.**

Optionally show the next contacts that will become due.

The dashboard should not overwhelm the user with analytics in v1.

---

# 15. Contact Detail

A contact detail page should contain:

### Profile

* Name
* Relationship type
* Cadence
* Birthday
* Notes
* Archive/edit controls

### Relationship status

* Last interaction
* Next due date
* Current overdue status

### Interaction history

```text
Mar 12
Coffee after class
──────────────────
Feb 03
Called to catch up
──────────────────
Jan 08
Texted about new job
```

Newest interactions should appear first.

---

# 16. Weekly Digest

The weekly digest is the first automated feature.

Example structure:

```text
Your weekly relationship check-in

3 people are overdue:

Sarah — 24 days overdue
Marcus — 11 days overdue
Jamie — 4 days overdue

[ Mark Sarah as reached out ]
```

The email should contain enough context to make the reminder useful while minimizing sensitive information.

The reminder system must be **idempotent**.

If the scheduled job executes twice, it must not send duplicate reminders for the same digest.

---

# 17. Reminder Job

Conceptually:

```text
Scheduled trigger
       ↓
Identify users whose digest is due
       ↓
For each user:
       ↓
Find overdue contacts
       ↓
Generate digest
       ↓
Check reminder history / idempotency
       ↓
Send email
       ↓
Record reminder as sent
```

The developer should understand:

* scheduling
* timezone handling
* idempotency
* failure behavior
* what happens if email sending fails
* what happens if the job executes twice

---

# 18. Error Handling

The application should handle expected failures explicitly.

Examples:

* database request fails
* authentication session expires
* email provider fails
* scheduled job partially fails
* contact is deleted/archived while another operation is occurring
* Gmail token is expired or revoked when an import runs (v2)
* an MCP tool call arrives with a revoked or unknown token (v2)

The UI should provide useful error states rather than silently failing.

Do not build elaborate retry infrastructure in v1.

For background jobs, a simple retry strategy or safe re-execution is sufficient.

---

# 19. Testing Strategy

Testing should focus on **business logic and important boundaries**, rather than trying to achieve arbitrary coverage.

### Unit tests

Especially:

* overdue calculation
* due-date calculation
* timezone/date behavior
* cadence validation
* reminder selection
* Gmail candidate filtering (v2) — newsletter/no-reply exclusion, frequency scoring
* MCP tool input validation (v2)

### Database/integration tests

Verify:

* contact CRUD
* interaction CRUD
* user ownership
* RLS behavior
* RLS behavior on `google_connections` and `mcp_tokens` (v2)

### End-to-end test

At least one complete flow:

```text
Create account
    ↓
Create contact
    ↓
Log interaction
    ↓
Advance/test date
    ↓
Contact becomes overdue
    ↓
Mark as reached out
    ↓
Contact is no longer overdue
```

v2 adds a second flow: generate an MCP token, call `get_overdue_contacts` and `log_interaction` against it, and confirm the change is reflected in the web app.

---

# 20. Observability

Keep observability lightweight.

At minimum, be able to determine:

* whether the reminder job executed
* how many users were processed
* how many overdue contacts were found
* how many emails were sent
* whether email delivery failed
* how many MCP tool calls were made, by which tool, and whether any failed auth (v2)
* how many Gmail imports ran and how many candidates were suggested vs. accepted (v2)

Do not build a full observability platform for v1.

Simple structured logging is sufficient.

---

# 21. Build Phases

## Phase 1 — Setup

* Create repository
* Initialize Vite + React + TypeScript
* Provision Supabase
* Create database schema manually
* Enable RLS
* Configure environment variables

**Foundational layer — get this right before building on top of it:**

The relationship between:

```text
React
↓
Supabase client
↓
Postgres
↓
RLS
```

---

## Phase 2 — Authentication

* Implement sign up
* Implement sign in
* Implement sign out
* Handle session persistence
* Protect authenticated routes

The agent may scaffold this, but the developer must manually review and understand session handling.

---

## Phase 3 — Contact Data Layer

Implement:

* Create contact
* Read contacts
* Update contact
* Archive contact

Agent-assisted.

Developer should review:

* Supabase queries
* Type safety
* RLS interaction

---

## Phase 4 — Interaction Data Layer

Implement:

* Create interaction
* Read interaction history
* Edit interaction
* Delete interaction

Agent-assisted.

---

## Phase 5 — Overdue Logic

**Developer-owned.**

Implement:

* SQL overdue query/view
* latest interaction calculation
* initial baseline behavior
* cadence calculation
* days overdue
* timezone/date handling

Then write tests for the business rules.

This is the central technical component of the application.

---

## Phase 6 — Dashboard

Build:

* overdue contact list
* sorting
* last-contact information
* cadence information
* one-click "Reached out today"
* empty state

Agent-assisted UI implementation is acceptable.

The dashboard should consume the developer-written overdue logic rather than duplicate it.

---

## Phase 7 — Contact Management

Build:

* contact list
* new contact form
* contact detail
* edit contact
* archive contact
* interaction history

Mostly agent-assisted.

---

## Phase 8 — Reminder Email

Implement:

* scheduled job
* overdue contact selection
* digest generation
* Resend integration
* idempotency
* email action

The agent may scaffold infrastructure, but the developer owns the business rules and email copy.

---

## Phase 9 — Testing

Add:

* overdue unit tests
* date/time tests
* database tests
* RLS tests
* critical end-to-end flow

---

## Phase 10 — Polish + Deploy

* Responsive UI
* Loading states
* Error states
* Empty states
* Accessibility pass
* Environment configuration
* Production deployment
* Production database configuration
* Email domain/configuration
* Basic logging

---

## Phase 11 — MCP Server (v2, new)

**Developer-owned tool-to-data-layer mapping; agent-assisted plumbing.**

Implement, in order:

1. `mcp_tokens` table + RLS
2. Settings UI to generate/label/revoke a token
3. Auth middleware that resolves a bearer token to a single `user_id`
4. Read-only tools first: `find_contacts`, `get_contact`, `get_overdue_contacts`
5. Write tools: `create_contact`, `update_contact`, `log_interaction`
6. Manual test against Claude Desktop or Claude Code as an MCP client
7. Rate limiting on the endpoint

Do not implement `delete_contacts` or `merge_contacts` in this phase — deferred, higher blast radius for a first cut.

---

## Phase 12 — Gmail Import (v2, new)

**Developer-owned filtering logic; agent-assisted OAuth plumbing.**

Implement, in order:

1. `google_connections` table + RLS + token encryption
2. Google OAuth flow requesting `gmail.metadata` scope only
3. Header-fetch job (`users.messages.list`/`.get`, metadata format)
4. Candidate extraction: aggregate by email address, count frequency, track most recent date
5. Filtering heuristics: drop no-reply/bulk/list addresses, require some reciprocal exchange
6. Review screen: user sees suggested contacts and accepts/skips each — nothing is created without this step
7. On accept: create a `contacts` row with `source = 'gmail_import'`

No background/continuous sync in this phase — on-demand "Import from Gmail" button only.

---

# 22. Working Agreement for the Coding Agent

The coding agent should follow these rules:

### Build incrementally

Build one phase/layer at a time.

Do not scaffold the entire application in a single pass.

### Explain non-trivial decisions

When generating non-trivial code, provide a brief explanation of:

* approach
* alternatives considered
* trade-offs
* relevant framework/database behavior

### Protect developer-owned logic

Do not implement, overwrite, or substantially refactor:

* overdue SQL
* `lib/overdue.ts`
* reminder selection logic
* reminder email copy
* MCP tool-to-data-layer mapping (`src/mcp/`)
* Gmail candidate filtering logic (`lib/gmail-import.ts`)

without explicit instruction.

### Prefer boring technology

Favor:

* standard React patterns
* straightforward TypeScript
* simple SQL
* Supabase primitives
* small functions
* explicit data flow

Avoid unnecessary:

* abstractions
* design patterns
* dependencies
* state-management libraries
* backend frameworks
* infrastructure

### No dependency creep

Do not introduce a dependency without explaining:

1. what problem it solves
2. why existing dependencies are insufficient
3. what maintenance/cost it introduces

### Respect scope

Do not implement features listed as out of scope without explicit instruction. This now includes staying within the v2 boundaries in Sections 27 and 28 (e.g., no `delete_contacts`/`merge_contacts` MCP tools, no continuous Gmail sync) unless explicitly added later.

### Preserve explainability

Code should be understandable and maintainable by whoever has to work in it later, including future-you at 2am during an incident.

If a simpler implementation provides essentially the same functionality, prefer the simpler implementation.

---

# 23. Definition of Done

v1 is complete when a user can:

1. Create an account.
2. Add several contacts.
3. Give each contact a desired cadence.
4. Log interactions.
5. See which contacts are overdue.
6. Understand why each contact is overdue.
7. Mark a contact as reached out with one click.
8. View interaction history.
9. Archive contacts.
10. Receive a weekly digest email.
11. Mark a contact as reached out from the email.
12. Use the application securely from multiple accounts without seeing another user's data.

The application should be deployed publicly and usable without developer intervention.

v2 is complete (see Sections 27–28) when a user can additionally:

13. Generate an MCP token in Settings, connect it to an AI client, and ask that client who they're overdue to talk to and log an interaction through it.
14. Connect their Gmail account, review a list of suggested contacts pulled from their email history, and selectively import them.
15. Revoke an MCP token or disconnect Gmail at any time, with immediate effect.

---

# 24. Future Product Opportunities

The sequenced build after the launch loop is `Next.md`: Gmail review import (§28), MCP (§27), a user-written nudge, a one-week snooze, then group headings. Build that file in order. Do not start it until `Goals.md` is done.

Anything in the lists below is still **not** part of v1, v2, or `Next.md` until a later spec says so.

### Convenience

* Google Contacts import
* Apple Contacts import
* Calendar integration
* Continuous/background Gmail sync (v2 is on-demand only)
* Mobile application
* Push notifications

### Intelligence

* Automatically summarize interaction notes
* Extract important facts from notes
* Suggest people worth contacting
* Detect changing interaction patterns
* Suggest cadence adjustments
* Generate conversation reminders based on previous notes
* `delete_contacts` / `merge_contacts` MCP tools

### Product

* Premium subscription
* Advanced analytics
* Custom reminder rules
* Relationship categories
* Multiple reminder schedules
* Import/export

Any future feature should be evaluated against the central question:

> **Does this help the user maintain meaningful relationships with less friction?**

---

# 25. Success Criteria

The first success criterion is:

> **Do new users actually keep using this to maintain relationships, week over week?**

Primary signals:

* signup → first contact added (activation)
* signup → first "Reached out today" logged (activation on the core loop)
* weekly active users
* week-4 retention
* overdue contacts successfully cleared, per active user
* weekly digest open rate
* (v2) Gmail import completion rate — signup → connect → review → at least one contact accepted
* (v2) MCP tool calls made per week, as a signal the AI interface is driving real usage rather than one-time novelty

Secondary signals:

* contacts added per user
* interactions logged per user
* repeated weekly usage over a full month
* (v2) Gmail import acceptance rate — what fraction of suggested contacts a user actually adds, as a signal the filtering heuristics are good enough to trust

Revenue is not the v1/v2 goal, but retention and activation are — they're the leading indicators of whether the product is worth monetizing later.

---

# 26. Project Philosophy

The product should be:

* useful
* secure
* well-tested
* thoughtfully designed
* deployed
* maintainable
* fast to onboard into

The goal is **not** to demonstrate how many technologies can be put into one application.

The strongest version of this product is a relatively small, reliable codebase that can absorb real users without breaking — every important technical decision should hold up under actual usage, not just look good in the repo.

> **Build less. Ship it. Get people using it. Iterate on what they actually do.**

---

# 27. v2 — AI MCP Server (like Dex)

## Why

Dex's MCP server lets a user manage their CRM from inside Claude or another AI client instead of opening the app — search contacts, log a note, ask "who am I overdue to talk to." That's a meaningful differentiator for launch positioning: "works inside Claude" is a distinct pitch from "another web app to check."

## What it is

A **hosted** MCP server (not a local process the user installs) that any MCP-capable AI client can connect to, authenticate against, and call tools on. This mirrors Dex's `https://mcp.getdex.com/mcp` model rather than a `claude_desktop_config.json` local-binary approach — no local install, no maintaining a binary per OS.

## Auth

Two paths, same as Dex:

* **Browser OAuth (default, interactive clients):** first connection opens a browser, user logs into their existing account, the client caches a token for future sessions.
* **API key (headless clients / testing):** generated in Settings → AI Access, shown once, stored hashed server-side (`mcp_tokens` table).

Every MCP request resolves to exactly one `user_id`. RLS then does the actual enforcement — the MCP layer never bypasses it.

The shipped server is the `mcp` edge function. A desktop client can open Reach in the browser: the user signs into the account they already have and allows the connection. That is an OAuth authorization-code login with PKCE. The client registers itself, Reach stores only hashes of the code and tokens, and the access token expires after an hour. A refresh token rotates on each use. The same account can also use a Settings token sent as `Authorization: Bearer`. The function hashes it, rejects revoked or expired tokens, rate-limits that token, then signs a one-minute Supabase JWT for that user so the tool calls run through the same row-level policies as the web app.

## Tools (v2 initial set)

| Tool | Maps to | Notes |
|---|---|---|
| `find_contacts` | `lib/contacts.ts` search | name/email/relationship-type search |
| `get_contact` | `lib/contacts.ts` + `lib/interactions.ts` | full profile, optional interaction history |
| `create_contact` | `lib/contacts.ts` create | same validation as the web form |
| `update_contact` | `lib/contacts.ts` update | |
| `log_interaction` | `lib/interactions.ts` create | this is the AI-native version of "Reached out today" |
| `get_overdue_contacts` | `lib/overdue.ts` | surfaces the core loop directly to the AI client |

**Deliberately excluded from v2:** `delete_contacts`, `merge_contacts`, any bulk operation. Higher blast radius for a first cut of a write-capable AI interface; revisit after the read/write tools above have been used safely for a while.

## What this is *not*

The MCP server exposes data and actions — it does not generate messages or talking points on the user's behalf inside the product itself. If a user asks their AI client to draft a follow-up message using data pulled via `get_contact`, that's the AI client's job, not a feature this app builds or owns. This keeps "AI-generated messages" correctly out of scope per Section 5 while still shipping the MCP integration.

## Security specifics

* Tokens stored hashed, never in plaintext after creation.
* Individually labeled and revocable (e.g., "Claude Desktop," "Claude Code — laptop").
* Rate-limited per token to prevent a misbehaving or compromised client from hammering the database.
* All writes go through the same validation the web app uses — no parallel/looser path for MCP.

---

# 28. v2 — Gmail Contact Import (like Clay)

## Why

Manual one-by-one contact entry is the biggest activation drop-off risk for a personal CRM. Clay's approach — auto-suggest contacts from email history rather than requiring manual entry — is the standard solution. This section adopts Clay's specific privacy posture (metadata only, never message content) because it's both the right thing to do and a legitimate differentiator against competitors who ask for broader access.

## Scope decision

**Gmail only in v2** (not Apple/Google Contacts, not iMessage, not LinkedIn/Twitter — those stay in Section 24, future). Gmail is the highest-signal, lowest-effort source to start with.

**On-demand import only** — a "Import from Gmail" button the user clicks, not a continuous background sync. Continuous sync is a Section 24 future item; it adds scheduling, incremental-sync state, and re-notification complexity that isn't needed to validate whether the import is useful at all.

## What gets accessed

* OAuth scope: `https://www.googleapis.com/auth/gmail.metadata` **only**.
* This grants headers (`From`, `To`, `Cc`, `Subject`, `Date`) and thread structure — **never the message body**. This is the same boundary Clay documents publicly, and it's worth stating explicitly in the app's own privacy copy at connect time.

## Flow

```text
User clicks "Import from Gmail"
       ↓
Google OAuth consent (gmail.metadata scope)
       ↓
Store encrypted refresh token in google_connections
       ↓
Fetch message headers (sent + received)
       ↓
Aggregate by email address: frequency, most recent date, display name
       ↓
Filter out noise (see below)
       ↓
Show review screen: suggested contacts, ranked by frequency
       ↓
User accepts or skips each one individually
       ↓
Accepted → contacts row created, source = 'gmail_import'
```

Nothing is written to `contacts` without the user reviewing and accepting it. This is a deliberate departure from Clay's fully-automatic creation — reviewing before creation keeps a v2 first cut simpler to reason about and avoids polluting a user's contact list with false positives from day one.

## Filtering heuristics (`lib/gmail-import.ts`, developer-owned)

Exclude a candidate address if:

* It matches common no-reply/notification patterns (`no-reply@`, `notifications@`, `noreply@`, etc.)
* It has a `List-Unsubscribe` header on messages from that sender (bulk/newsletter signal)
* There's no reciprocal exchange — the user has only ever received from it, never sent to it (or vice versa), which usually means a mailing list rather than a relationship
* It's the user's own address

Rank remaining candidates by frequency, with recency as a tiebreaker. The review screen shows at most 30 people.

The on-demand fetch reads headers for at most 200 newest inbox messages and 200 newest sent messages. It does not walk the whole mailbox, and it does not request the Subject header.

## What this does not do

* Does not read message bodies, ever.
* Does not auto-create contacts without review.
* Does not sync continuously — each import is a discrete, user-initiated action.
* Does not import calendar, contacts list, or any other Google product data — Gmail headers only.

## Security specifics

* Refresh token encrypted at rest in `google_connections`. The signed-in user can see that a connection exists and can delete it. They cannot read `refresh_token_enc`, and they cannot insert or update that row. Edge functions use the service role only after the request's Supabase JWT identifies the user.
* Disconnecting in Settings deletes the stored token and stops future imports; it does not retroactively remove already-imported contacts (those are now just regular contacts the user chose to keep).