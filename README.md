# Personal CRM

A small app for remembering **who** you want to stay in touch with and **when** you last connected. See `spec.md` for the product blueprint.

## Local development

1. Copy `.env.example` to `.env.local` and fill in the Supabase **project URL** and **anon** key (Settings → API).
2. Apply `schema.sql` in the Supabase SQL editor if this project’s tables/policies are not already on that database.
3. Run the app:

```bash
npm install
npm run dev
```

## Tests

```bash
npm test          # unit tests + DB/RLS/e2e when configured
npm run test:unit # overdue, dates, cadence, digest (no database)
npm run test:db   # live Supabase CRUD, RLS, critical flow
```

`test:db` needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (service role, tests only — never put it in `VITE_*` or the Vercel frontend env).

## Production

The linked Supabase project is the production database. Keep applying `schema.sql` there when the schema changes (RLS stays on).

### Web app (Vercel)

Set **Production** environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then:

```bash
npx vercel --prod
```

Vite inlines those `VITE_*` values at **build** time. After changing them, redeploy.

### Edge Functions (digest + email actions)

Secrets (Supabase → Edge Functions → Secrets, or `supabase secrets set`):

- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM` — use a verified domain, e.g. `Reach Out <reminders@yourdomain.com>`
- `DIGEST_TOKEN_SECRET`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (usually provided automatically)

`send-digest` and `reach-out` have `verify_jwt = false` because the cron job and email links are not end-user JWT calls. Schedule `send-digest` **hourly** (POST, `Authorization: Bearer <CRON_SECRET>`). Users are filtered by their local `digest_day_of_week` (default Monday).

### Gmail import

`gmail-oauth` and `gmail-import` also have `verify_jwt = false` so the browser preflight is not rejected; both functions still require the user's Supabase access token and resolve it with `auth.getUser()`.

Secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_TOKEN_KEY` — long random string. Encrypts the refresh token and signs the OAuth state. The raw refresh token is never stored or sent to the browser.
- `APP_ORIGIN` — production site origin, for example `https://reach.example`. Localhost redirects are allowed without this.

In Google Cloud, create a Web OAuth client with scope `https://www.googleapis.com/auth/gmail.metadata` and these redirect URIs:

- `http://localhost:5173/import/gmail/callback`
- `https://<your-host>/import/gmail/callback`

Deploy the two functions after applying `schema.sql` (`google_connections`, and `contacts.source`). Connect from Settings. The review list is filtered in the browser from headers only; accepting a person is what creates a contact.

### Assistant (MCP)

`mcp` has `verify_jwt = false` because the client sends a Reach token, not a Supabase user JWT. The function still rejects missing, unknown, and revoked tokens.

Secret:

- `REACH_JWT_SECRET` — the project's legacy JWT secret (Settings → JWT Keys). The function uses it to mint a one-minute user JWT so Postgres row-level security still applies. The CLI refuses names that start with `SUPABASE_`. If the project has disabled the legacy JWT secret, turn that secret back on for this function.

Apply `schema.sql` (`mcp_tokens`, plus the `mcp_oauth_*` tables for browser sign-in) and deploy `mcp`. Set `APP_ORIGIN` to the site origin the browser should open, including `http://localhost:<port>` while developing.

Browser sign-in: point the client at `http://localhost:<port>/mcp` (or `https://<your-host>/mcp` in production). The first connection opens Reach. Sign in, then allow the app. Add that site URL to Supabase Auth redirect URLs so a magic link can return to `/oauth/authorize`.

API key: in Settings → Assistant, create a token (shown once) and point the client at `https://<project>.supabase.co/functions/v1/mcp` with `Authorization: Bearer <token>`. The gateway also accepts the anon key as `apikey`.

Tools are find, get, create, update, log a conversation, and list who is overdue. There is no delete. Revoking the token in Settings stops the next call. A browser-issued access token expires after an hour; the client refreshes it.

Resend’s `onboarding@resend.dev` sender often lands in spam. For production, verify a domain in Resend and point `RESEND_FROM` at it.

### Logs

Digest and reach-out functions emit JSON lines you can read in the Supabase function logs:

- `digest_job_started` / `digest_job_finished` — users processed, overdue found, emails sent/failed
- `digest_sent` / `digest_user_failed` — per user
- `reach_out_recorded` / `reach_out_rejected` / `reach_out_failed`
