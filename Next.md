Next: after the launch loop
Product: Reach (c:\Users\Robin\CRM) — personal CRM. Keep it a relationship assistant, not a sales CRM.

Do not start until Goals.md is done (the launch loop works in the browser).

Read first: spec.md §27 (MCP) and §28 (Gmail), then the files named in each goal. Update spec.md when a rule changes. Update tests in the same goal as the code. After UI goals, verify in the browser. Do not commit unless asked.

Schema: Change schema.sql and src/types/database.ts together. Applying SQL to the live Supabase project is a human step; leave a short note in the wrap-up if they must run schema.sql.

Out of scope: Apple or Google Contacts import, LinkedIn, enrichment, AI-written messages, relationship scores, continuous Gmail sync, native app, billing, shared accounts, pipelines, companies. MCP must not add delete_contacts or merge_contacts. Do not auto-create contacts from Gmail.

Build in order. Each goal assumes the ones above it.

Goal 1 — Gmail as a reviewed suggestion list
Problem: Typing people one by one is the activation drop-off. The inbox is a source of suggestions, not the contact list.

Rule: Implement spec §28 as written. Metadata scope only. Nothing is written to contacts until the user accepts that person. On-demand button only.

Do:

Follow Phase 12 in spec.md (google_connections, OAuth, header fetch, filter, review screen, accept creates source = gmail_import).
Review screen: rank by how often they write each other. Cap the list the user sees (about 30). Skipping is the default path; accepting is explicit.
Settings: disconnect deletes the stored token and does not delete contacts already accepted.
Privacy copy at connect time: headers only, message bodies are not read.
Files: schema.sql, src/types/database.ts, src/lib/gmail-import.ts (developer-owned filtering), Settings, a review page. Tests for the filter: drop no-reply, drop list mail, drop one-way addresses, keep a reciprocal person.

Done when: Connect Gmail, see a short list of real people, accept one, skip the rest, and that accepted person shows on Home as due. Disconnect stops a later import.

Goal 2 — Ask from the assistant they already use
Problem: The loop should work inside Claude (or another MCP client) without opening Reach.

Rule: Implement spec §27 as written. Tools are find, get, create, update, log interaction, and list overdue. The server does not draft messages.

Do:

Follow Phase 11 in spec.md (mcp_tokens, Settings generate/label/revoke, bearer token resolves to one user_id, RLS still applies, rate limit).
Writes use the same validation as the web app.
A reach-out logged through MCP clears overdue the same way as the button in the app.
Files: schema.sql, src/types/database.ts, src/mcp/, Settings. Spec names the tool set; do not add tools.

Done when: From an MCP client, “who am I late to?” returns overdue people, and logging a conversation today removes that person. Revoking the token stops the next call.

Goal 3 — A line they wrote, shown when the person is due
Problem: The tap is easy and the memory is not. Notes exist, but they stay on the person page.

Rule: One optional short line, written by the user, shown at the moment of action. The product never writes or rewrites this line.

Do:

contacts.nudge text, nullable, max 140 characters. Separate from notes.
Contact form and person page: a single field, placeholder like “Ask about the new job”. Blank is allowed. Empty string saves as null.
When non-empty, show it on the Home catch-up chip, on Catch up, and as one extra line in the weekly digest for that person. Omit the line when null.
Digest copy stays names, why they are due, the nudge if present, and the reach-out link. Do not include the general notes field.
Files: schema.sql, src/types/database.ts, src/components/ContactForm.tsx, src/pages/Home.tsx, src/pages/Dashboard.tsx (Catch up), src/pages/ContactDetail.tsx, supabase/functions/_shared/digest.ts, digest tests.

Done when: You save “Ask about the new job” on someone overdue, see that sentence on Home and in the digest, and clearing them does not erase the line.

Goal 4 — Not this week
Problem: People log a fake reach-out, or ignore the email, when they mean “later.”

Rule: Snooze hides a person until a date. It does not change cadence and it does not count as a conversation.

Do:

contacts.snoozed_until date, nullable.
“Next week” sets snoozed_until to today + 7 in the user timezone. One control on Home, Catch up, and the digest. No custom date picker.
overdue_contacts and Home catch-up omit the person while today < snoozed_until. The day snoozed_until arrives, they are due again under the normal cadence rule (Goal 1 of Goals.md still applies: no interactions means due now, once the snooze has ended).
Logging a real reach-out clears snoozed_until.
Person page may show “Paused until {date}” with a way to clear it.
Files: schema.sql (view change), src/lib/overdue.ts, src/lib/overdue.test.ts, Home, Catch up, digest, reach-out email action if that path exists. Tests: snoozed person absent from overdue; the morning snoozed_until equals today they are back; a logged conversation clears the date.

Done when: From Home and from the email you can hide someone for a week without creating an interaction, and they return on their own.

Goal 5 — Rituals are groups with a heading
Problem: Some people think “family on Sundays,” and the digest is one flat list.

Rule: Groups already exist (name + membership). Do not change overdue math. A group is a heading, not a second cadence system.

Do:

Home and the digest: people who belong to one group appear under that group’s name. People in no group stay in the main list. A person in several groups appears once, under the first group name alphabetically.
Optional confirmed action on a group: “Set everyone to Monthly” (or Weekly / Quarterly), which writes that cadence_days onto each current member. Require a confirm step. Do not run this when membership changes later.
Do not add a cadence column on groups.
Files: src/lib/groups.ts, src/lib/home.ts, digest formatting, Contact list group UI. Tests: a member shows under the group heading; a person in two groups is not duplicated; the confirm action updates member cadence and does not touch people outside the group.

Done when: An overdue family member shows under “Family” on Home and in the email, and you can set that group to monthly only by confirming.

After all goals
npm run test (unit). npm run test:db if integration env exists.
Browser: Gmail review accept/skip → MCP overdue plus log (or document that MCP needs a desktop client) → nudge visible on Home → snooze hides and returns → group heading on Home.
Update spec.md user stories for nudge, snooze, and group headings.
Wrap-up: list schema the human must apply in Supabase.
Suggested batches if splitting PRs: Goal 1 → Goal 2 → Goals 3–4 → Goal 5.
