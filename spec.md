# Personal CRM — Project Blueprint

## 1. Purpose

A personal CRM that helps users maintain important relationships intentionally.

The core problem it solves:

> People often drift out of touch with friends, family, mentors, and other important people—not because they don't care, but because there is no lightweight system for remembering **who** they want to stay connected with and **when** they last connected.

The product should feel more like a **personal relationship assistant** than a traditional CRM. It should help the user maintain relationships without turning those relationships into a sales pipeline.

### Priorities

1. **Learning** — every architectural decision should be understood by the developer, not just generated.
2. **Daily usefulness** — the developer should be able to use the product personally and dogfood it.
3. **Resume/interview value** — clean architecture, explainable decisions, testing, deployment, and a real product.

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

* As a user, I can add a contact with a name, relationship type, and desired contact cadence.
* As a user, I can optionally add a birthday and general notes.
* As a user, I can edit a contact.
* As a user, I can archive a contact.
* As a user, I can view all active contacts.
* As a user, I can view archived contacts separately.

### Interaction tracking

* As a user, I can log an interaction with a contact.
* An interaction contains a date and optional note.
* As a user, I can view a contact's complete interaction history.
* As a user, I can edit or delete an interaction.
* As a user, I can mark a contact as "reached out today" directly from the dashboard.

### Dashboard

* As a user, I can see contacts who are currently overdue.
* Overdue contacts are sorted by how overdue they are.
* As a user, I can see when I last interacted with each overdue contact.
* As a user, I can see the contact's desired cadence.
* As a user, I can quickly record that I reached out without navigating through multiple screens.

### Reminders

* As a user, I can configure which day of the week I receive my weekly digest.
* As a user, I receive a weekly email containing contacts who are overdue.
* As a user, I can mark a contact as "reached out today" from the email.
* Email actions must be authenticated and must not expose private information through an easily guessable URL.

---

# 5. Explicitly Out of Scope for v1

The following should **not** be implemented unless explicitly added to the specification later:

* SMS notifications
* Push notifications
* Native mobile app
* Google Contacts integration
* Apple Contacts integration
* LinkedIn integration
* Gmail inbox integration
* Browser extension
* Automatic contact discovery
* AI-generated talking points
* AI-generated messages
* Adaptive/learned cadence
* Automatic relationship scoring
* Social media integrations
* Multi-user/shared contacts
* Teams
* Organizations
* Billing/payments
* Public profiles
* Contact recommendations

The goal is to validate the fundamental relationship-maintenance loop before adding integrations or AI.

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
| ------------------- | ---------------- | ---------------------- |
| `id`                | uuid, PK         |                        |
| `user_id`           | uuid, FK → users | Owner of the contact   |
| `name`              | text             | Required               |
| `relationship_type` | text             | Free text in v1        |
| `cadence_days`      | int              | Required; default `30` |
| `birthday`          | date             | Nullable               |
| `notes`             | text             | Nullable               |
| `archived`          | boolean          | Default `false`        |
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

# 7. Derived Relationship State

The application should **not store "days overdue" as a database field**.

It is derived from the current date and interaction history.

A contact is overdue when:

```text
today - last_interaction_date >= cadence_days
```

If a contact has no interactions, `created_at` is used as the initial baseline.

Conceptually:

```text
last_contact_date =
    latest interaction.occurred_on
    OR contact.created_at

next_due_date =
    last_contact_date + cadence_days

days_overdue =
    today - next_due_date
```

A contact is overdue when `days_overdue >= 0`.

The exact SQL implementation should account for the user's timezone when determining the current local date.

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
                                   │
                  ┌────────────────┴────────────────┐
                  │                                 │
         ┌────────▼────────┐              ┌─────────▼────────┐
         │   Web App Logic │              │ Scheduled Job    │
         │                 │              │                  │
         │ overdue.ts      │              │ Find overdue     │
         │ contact CRUD    │              │ contacts         │
         └─────────────────┘              └─────────┬────────┘
                                                    │
                                             ┌──────▼───────┐
                                             │    Resend    │
                                             │     Email    │
                                             └──────────────┘
```

The architecture should remain intentionally small.

Do **not** introduce Redis, a message queue, a separate backend service, or additional databases unless a concrete requirement emerges.

The purpose of this project is to learn why infrastructure is needed—not to add infrastructure for its own sake.

---

# 12. Application Structure

```text
src/
  pages/
    Dashboard.tsx
    ContactList.tsx
    NewContact.tsx
    ContactDetail.tsx

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

### Database/integration tests

Verify:

* contact CRUD
* interaction CRUD
* user ownership
* RLS behavior

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

---

# 20. Observability

Keep observability lightweight.

At minimum, be able to determine:

* whether the reminder job executed
* how many users were processed
* how many overdue contacts were found
* how many emails were sent
* whether email delivery failed

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

**Developer-owned learning:**

Understand the relationship between:

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

Do not implement features listed as out of scope without explicit instruction.

### Preserve explainability

Code should be understandable by the developer in a technical interview.

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

---

# 24. Future Product Opportunities

These are intentionally **not part of v1**, but could be evaluated after the core loop is validated.

### Convenience

* Google Contacts import
* Apple Contacts import
* Gmail integration
* Calendar integration
* Mobile application
* Push notifications

### Intelligence

* Automatically summarize interaction notes
* Extract important facts from notes
* Suggest people worth contacting
* Detect changing interaction patterns
* Suggest cadence adjustments
* Generate conversation reminders based on previous notes

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

Because revenue is not the primary goal, v1 success should not be measured primarily by MRR.

The first success criterion is:

> **Does the developer actually use this product to maintain relationships?**

Secondary signals:

* contacts added
* interactions logged
* reminders acted upon
* weekly digest opened
* overdue contacts successfully cleared
* repeated weekly usage

If the product is genuinely useful during dogfooding, then consider whether it is worth turning into a public Micro-SaaS.

---

# 26. Project Philosophy

The project should demonstrate that a small application can be:

* useful
* secure
* well-tested
* thoughtfully designed
* deployed
* maintainable
* technically explainable

The goal is **not** to demonstrate how many technologies can be put into one application.

The strongest version of this project is a relatively small codebase where every important technical decision has a clear reason behind it.

> **Build less. Understand more. Ship it. Use it.**
