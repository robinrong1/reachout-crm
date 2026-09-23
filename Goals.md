Reach: ship the launch loop
Product: Reach (c:\Users\Robin\CRM) — personal CRM. Keep it a relationship assistant, not a sales CRM.

Read first: spec.md (especially §7 overdue), .cursor/skills/Frontend-Designer.md, then the files named in each goal.

Out of scope: Google/Apple import, Gmail, LinkedIn, AI, photos, snooze, billing, native app, Google OAuth (magic link is enough). Do not add those.

Rules: Match existing code style. Update spec.md when a rule changes. Update tests in the same goal as the code. After UI goals, verify in the browser (signup, add people, Home actions, settings, digest fields). Do not commit unless asked.

Schema: Change schema.sql and src/types/database.ts together. Applying SQL to the live Supabase project is a human step; leave a short note in the wrap-up if they must run schema.sql.

Goal 1 — Overdue uses real conversations only
Problem: No interactions → created_at counts as last talked, so new people vanish until cadence elapses.

Rule (replace spec §7):

last_contact_date = latest interactions.occurred_on only (nullable).
No interactions → due now (days_overdue = 0, last talked Never).
Still overdue when today >= last_contact_date + cadence_days.
Timezone for “today” stays user-local.
Do:

Rewrite overdue_contacts in schema.sql (drop created_at fallback). Null last contact still appears in the view as due now.
Same rule in src/lib/overdue.ts (lastContactDate, computeRelationshipState, types if last_contact_date can be null).
Person page: never show “Last talked: today” when there are no conversations.
Digest still lists never-contacted people as overdue (copy: “due today” is fine).
Tests: Flip src/lib/overdue.test.ts (the created_at baseline cases). Add/adjust src/test/critical-flow.test.ts and src/test/database.test.ts: insert contact with no interactions → row in overdue_contacts; log today → gone.

Done when: Add someone with no history → they show on Keep in touch / Home catch-up immediately. Logging today clears them.

Goal 2 — Home is the action surface
Problem: Catch-up and birthday cards only navigate. “I reached out” is on Keep in touch.

Do:

Extract one shared reachedOutToday(contactId) used by Home, Keep in touch (Dashboard / ContactCard), and person page.
Home catch-up: each shown person can be marked reached out without going to /keep-in-touch. Keep the editorial card language; add the action on the chips (or compact per-person rows). Do not make Home a clone of Keep in touch.
Birthday card: I reached out (or “Wished them”) instead of “open their page to log a hello.”
After success, reload Home feed. Keep in touch remains the full overdue list.
Files: src/pages/Home.tsx, src/components/ContactCard.tsx, src/pages/Dashboard.tsx, src/lib/interactions.ts.

Done when: From / you can clear an overdue person and log a birthday hello without leaving Home.

Goal 3 — No empty “Added a note / No note”
Problem: Date-only reach-out inserts look like broken notes on Timeline and the person page.

Do:

Timeline event label: Reached out when there is no note; Added a note (or similar) only when note is non-empty.
Never render the body “No note.” Omit the body if empty.
Same on the person conversation list.
Optional: after Home/Keep-in-touch reach-out, a skippable one-line “What happened?” If skipped, still save the date-only interaction (now labeled correctly).
Files: src/pages/Timeline.tsx, src/pages/ContactDetail.tsx, src/lib/timeline.ts if labels belong there. Tests in src/lib/timeline.test.ts.

Done when: Marking reached out never produces a card that says “No note.”

Goal 4 — Cadence presets
Problem: “Stay in touch every (days)” + inline table editor.

Do:

Presets: Weekly (7) / Monthly (30) / Quarterly (90) + Custom (positive integer days). Default Monthly.
Use on add + edit (ContactForm). Helpers in src/lib/cadence.ts.
Remove the inline cadence <input> from ContactList. Cadence is edited on the person (or via the form). Table may still display “Weekly” / “every 30 days.”
Files: src/lib/cadence.ts, src/lib/cadence.test.ts, src/components/ContactForm.tsx, src/pages/ContactList.tsx.

Done when: You can add someone without typing a number unless you pick Custom.

Goal 5 — Phone, email, tap to reach
Problem: No way to actually message someone.

Do:

contacts.phone and contacts.email nullable text in schema.sql + types + ContactForm + person page.
Links: sms: (or tel:) and mailto: from person page and from Home/Keep in touch cards when the field exists. Hide the button if missing.
No validation theater beyond basic email format if easy; blank is allowed.
Done when: An overdue card with a phone number opens Messages in one tap.

Goal 6 — Settings (digest + timezone + sign out)
Problem: Digest day/timezone exist only in DB. Sign out is a fifth mobile tab.

Do:

Route /settings. Load/update public.users (digest_day_of_week, timezone). Extend src/lib/users.ts.
UI: weekday picker for the digest; timezone shown (default from browser, editable is enough as a select or text of the IANA zone).
Sidebar: account opens Settings; Sign out lives on Settings (and sidebar footer is fine). Remove Sign out from NavSnackbar. Snackbar: Home, Catch up, Contacts, Timeline only. Align labels (Catch up vs Keep in touch — pick one string and use it in both navs).
Files: new src/pages/Settings.tsx, src/App.tsx, src/components/Sidebar.tsx, src/components/NavSnackbar.tsx, src/lib/users.ts.

Done when: You can set “email me on Sunday” in the app. Mobile tab bar has four destinations.

Goal 7 — First-run: three people, then Home
Problem: Empty Home → long form → one person.

Do:

After session, if the user has zero contacts, send them to /welcome (or equivalent) before Home.
Flow: add 3 people quickly (name + how you know them + cadence preset). Optional last talked date: if set, create an interaction on that date; if blank, they stay due now (Goal 1).
Then go to Home with a real catch-up feed.
Allow Skip so nobody is trapped; Skip goes to Home empty state.
Reuse Goal 4 presets; do not rebuild a second contact model.
Files: new welcome page, src/App.tsx gate, src/lib/contacts.ts / createInteraction.

Done when: Signup → three names → Home shows catch-up without opening Contacts.

Goal 8 — Auth + landing that can convert a stranger
Problem: Hunt/traffic lands on password login; confirm-email can stall; no reset.

Do:

Unauthenticated default: landing (one sentence, 3 screens or UI stills of Home / catch-up / person, CTA). Not only “Welcome back.”
Magic link (signInWithOtp) as primary; keep password as secondary if you want, but password reset must work (resetPasswordForEmail).
If signup still requires email confirm, the UI must say that clearly; prefer a path that yields a session in one sitting (magic link).
ensureUserProfile must still run on first session (including OTP).
Files: src/pages/Auth.tsx (or split Landing.tsx), src/App.tsx.

Done when: A logged-out visitor understands the product, can request a magic link, and can recover a password.

After all goals
npm run test (unit). npm run test:db if integration env exists.
Browser: landing → magic link or signup → welcome (3 people) → Home reach-out → birthday action → person Message/Email → Timeline has no “No note” → Settings digest day → mobile four-tab nav.
Update spec.md user stories: never-contacted overdue, Home reach-out, phone/email, settings, first-run, auth.
Wrap-up: list schema the human must apply in Supabase.
Suggested batches if splitting PRs: Goals 1–3 (truth + Home + timeline) → 4–6 (cadence, reach channels, settings) → 7–8 (onboarding + auth).

When these goals are done, build from Next.md. Do not start Next.md while this file is unfinished.