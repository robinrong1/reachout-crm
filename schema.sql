CREATE TABLE users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    timezone text DEFAULT 'UTC',
    digest_day_of_week int DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    relationship_type text,
    cadence_days int DEFAULT 30,
    birthday date,
    notes text,
    archived boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT contacts_cadence_days_positive CHECK (cadence_days > 0)
);

CREATE TABLE interactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    occurred_on date DEFAULT current_date,
    note text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE reminders_sent(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sent_at timestamptz DEFAULT now()
);

DROP VIEW IF EXISTS overdue_contacts;
CREATE VIEW overdue_contacts
WITH (security_invoker = true) AS
SELECT
    id,
    user_id,
    name,
    relationship_type,
    cadence_days,
    last_contact_date,
    last_contact_date + cadence_days AS next_due_date,
    today - (last_contact_date + cadence_days) AS days_overdue
FROM (
    SELECT
        c.id,
        c.user_id,
        c.name,
        c.relationship_type,
        c.cadence_days,
        (now() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date AS today,
        COALESCE(
            MAX(i.occurred_on),
            (c.created_at AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date
        ) AS last_contact_date
    FROM contacts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN interactions i ON i.contact_id = c.id
    WHERE c.archived = false
    GROUP BY
        c.id,
        c.user_id,
        c.name,
        c.relationship_type,
        c.cadence_days,
        c.created_at,
        u.timezone
) computed
WHERE today - (last_contact_date + cadence_days) >= 0;

-- ============================================================
-- Row Level Security
-- ============================================================
-- contacts is the ownership root: contacts.user_id must equal
-- auth.uid(). interactions and reminders_sent don't store a
-- user_id directly (per the Section 6 data model), so their
-- policies check ownership by joining back to contacts.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders_sent ENABLE ROW LEVEL SECURITY;

-- Safe to re-run: Postgres has no CREATE POLICY IF NOT EXISTS.
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_delete_own" ON users;
DROP POLICY IF EXISTS "contacts_select_own" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_own" ON contacts;
DROP POLICY IF EXISTS "contacts_update_own" ON contacts;
DROP POLICY IF EXISTS "contacts_delete_own" ON contacts;
DROP POLICY IF EXISTS "interactions_select_own" ON interactions;
DROP POLICY IF EXISTS "interactions_insert_own" ON interactions;
DROP POLICY IF EXISTS "interactions_update_own" ON interactions;
DROP POLICY IF EXISTS "interactions_delete_own" ON interactions;
DROP POLICY IF EXISTS "reminders_sent_select_own" ON reminders_sent;
DROP POLICY IF EXISTS "reminders_sent_insert_own" ON reminders_sent;
DROP POLICY IF EXISTS "reminders_sent_update_own" ON reminders_sent;
DROP POLICY IF EXISTS "reminders_sent_delete_own" ON reminders_sent;

-- users: each auth user owns the matching public.users row.
-- The app inserts this row after a session exists (sign up or
-- first sign in after email confirmation).

CREATE POLICY "users_select_own" ON users
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users
    FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "users_delete_own" ON users
    FOR DELETE
    USING (auth.uid() = id);

-- contacts: direct ownership via user_id

CREATE POLICY "contacts_select_own" ON contacts
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "contacts_insert_own" ON contacts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_update_own" ON contacts
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_delete_own" ON contacts
    FOR DELETE
    USING (auth.uid() = user_id);

-- interactions: ownership inherited through contacts.user_id

CREATE POLICY "interactions_select_own" ON interactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = interactions.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "interactions_insert_own" ON interactions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = interactions.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "interactions_update_own" ON interactions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = interactions.contact_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = interactions.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "interactions_delete_own" ON interactions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = interactions.contact_id
              AND c.user_id = auth.uid()
        )
    );

-- reminders_sent: ownership inherited through contacts.user_id
-- (the app itself is the only writer of this table via a
-- service role in the scheduled job, but RLS is still enabled
-- so a leaked anon/authenticated key can't read or forge rows)

CREATE POLICY "reminders_sent_select_own" ON reminders_sent
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = reminders_sent.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "reminders_sent_insert_own" ON reminders_sent
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = reminders_sent.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "reminders_sent_update_own" ON reminders_sent
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = reminders_sent.contact_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = reminders_sent.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "reminders_sent_delete_own" ON reminders_sent
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = reminders_sent.contact_id
              AND c.user_id = auth.uid()
        )
    );

-- For databases created before this constraint existed:
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_cadence_days_positive;
ALTER TABLE contacts ADD CONSTRAINT contacts_cadence_days_positive CHECK (cadence_days > 0);

