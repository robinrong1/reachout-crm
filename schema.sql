CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    timezone text DEFAULT 'UTC',
    digest_day_of_week int DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    relationship_type text,
    cadence_days int DEFAULT 30,
    birthday date,
    notes text,
    phone text,
    email text,
    archived boolean DEFAULT false,
    source text NOT NULL DEFAULT 'manual',
    nudge text,
    snoozed_until date,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT contacts_cadence_days_positive CHECK (cadence_days > 0)
);

CREATE TABLE IF NOT EXISTS interactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    occurred_on date DEFAULT current_date,
    note text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders_sent(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sent_at timestamptz DEFAULT now()
);

-- Existing databases created before phone/email: CREATE TABLE IF NOT EXISTS will not add columns.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
UPDATE contacts SET source = 'manual' WHERE source IS NULL;
ALTER TABLE contacts ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE contacts ALTER COLUMN source SET NOT NULL;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_known;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_known CHECK (source IN ('manual', 'gmail_import'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nudge text;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_nudge_length;
ALTER TABLE contacts ADD CONSTRAINT contacts_nudge_length CHECK (nudge IS NULL OR char_length(nudge) <= 140);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS snoozed_until date;
-- Phones are stored digits only; the app normalizes on write.
UPDATE contacts SET phone = NULLIF(regexp_replace(phone, '\D', '', 'g'), '') WHERE phone ~ '\D';

DROP VIEW IF EXISTS overdue_contacts;
CREATE VIEW overdue_contacts
WITH (security_invoker = true) AS
SELECT
    id,
    user_id,
    name,
    relationship_type,
    cadence_days,
    phone,
    email,
    nudge,
    snoozed_until,
    last_contact_date,
    CASE
        WHEN last_contact_date IS NULL THEN today
        ELSE last_contact_date + cadence_days
    END AS next_due_date,
    CASE
        WHEN last_contact_date IS NULL THEN 0
        ELSE today - (last_contact_date + cadence_days)
    END AS days_overdue
FROM (
    SELECT
        c.id,
        c.user_id,
        c.name,
        c.relationship_type,
        c.cadence_days,
        c.phone,
        c.email,
        c.nudge,
        c.snoozed_until,
        (now() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date AS today,
        -- Future-dated rows must not push next_due_date out and hide the person.
        MAX(i.occurred_on) FILTER (
            WHERE i.occurred_on <= (now() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::date
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
        c.phone,
        c.email,
        c.nudge,
        c.snoozed_until,
        u.timezone
) computed
WHERE (last_contact_date IS NULL OR today >= last_contact_date + cadence_days)
  AND (snoozed_until IS NULL OR today >= snoozed_until);

-- A real conversation ends a snooze. Inserts from the app, MCP, and the
-- email action all go through this table.
CREATE OR REPLACE FUNCTION clear_contact_snooze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE contacts
    SET snoozed_until = NULL
    WHERE id = NEW.contact_id
      AND snoozed_until IS NOT NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_clear_snooze ON interactions;
CREATE TRIGGER interactions_clear_snooze
    AFTER INSERT ON interactions
    FOR EACH ROW
    EXECUTE FUNCTION clear_contact_snooze();

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

-- ============================================================
-- Groups (v1.5): user-owned lists, many-to-many with contacts.
-- Additive: safe to re-run on a database that already has v1 tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT groups_name_not_blank CHECK (char_length(trim(name)) > 0),
    CONSTRAINT groups_name_unique_per_user UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS contact_groups (
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, group_id)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select_own" ON groups;
DROP POLICY IF EXISTS "groups_insert_own" ON groups;
DROP POLICY IF EXISTS "groups_update_own" ON groups;
DROP POLICY IF EXISTS "groups_delete_own" ON groups;
DROP POLICY IF EXISTS "contact_groups_select_own" ON contact_groups;
DROP POLICY IF EXISTS "contact_groups_insert_own" ON contact_groups;
DROP POLICY IF EXISTS "contact_groups_delete_own" ON contact_groups;

CREATE POLICY "groups_select_own" ON groups
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "groups_insert_own" ON groups
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "groups_update_own" ON groups
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "groups_delete_own" ON groups
    FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "contact_groups_select_own" ON contact_groups
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = contact_groups.group_id
              AND g.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = contact_groups.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "contact_groups_insert_own" ON contact_groups
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = contact_groups.group_id
              AND g.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = contact_groups.contact_id
              AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "contact_groups_delete_own" ON contact_groups
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM groups g
            WHERE g.id = contact_groups.group_id
              AND g.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = contact_groups.contact_id
              AND c.user_id = auth.uid()
        )
    );

-- ============================================================
-- Gmail connection (v2). One row per user. The refresh token is
-- written by the edge function (service role) and is not readable
-- by the signed-in user. Disconnect is a DELETE of this row.
-- ============================================================

CREATE TABLE IF NOT EXISTS google_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_enc text NOT NULL,
    scopes text NOT NULL,
    connected_at timestamptz DEFAULT now(),
    last_synced_at timestamptz
);

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_connections_select_own" ON google_connections;
DROP POLICY IF EXISTS "google_connections_delete_own" ON google_connections;

CREATE POLICY "google_connections_select_own" ON google_connections
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "google_connections_delete_own" ON google_connections
    FOR DELETE
    USING (auth.uid() = user_id);

REVOKE ALL ON TABLE google_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, scopes, connected_at, last_synced_at) ON google_connections TO authenticated;
GRANT DELETE ON google_connections TO authenticated;
GRANT ALL ON TABLE google_connections TO service_role;

-- ============================================================
-- MCP tokens (v2). The raw token is shown once and only the hash
-- is stored. window_* is the per-token rate limit, written by the
-- edge function. The signed-in user can create and revoke tokens
-- but cannot read the hash or reset the rate window.
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    label text NOT NULL,
    created_at timestamptz DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    window_started_at timestamptz,
    window_count int NOT NULL DEFAULT 0,
    CONSTRAINT mcp_tokens_label_not_blank CHECK (char_length(trim(label)) > 0),
    CONSTRAINT mcp_tokens_label_length CHECK (char_length(label) <= 40)
);

ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mcp_tokens_select_own" ON mcp_tokens;
DROP POLICY IF EXISTS "mcp_tokens_insert_own" ON mcp_tokens;
DROP POLICY IF EXISTS "mcp_tokens_update_own" ON mcp_tokens;

CREATE POLICY "mcp_tokens_select_own" ON mcp_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "mcp_tokens_insert_own" ON mcp_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mcp_tokens_update_own" ON mcp_tokens
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE mcp_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, label, created_at, last_used_at, revoked_at) ON mcp_tokens TO authenticated;
GRANT INSERT (user_id, token_hash, label) ON mcp_tokens TO authenticated;
GRANT UPDATE (revoked_at) ON mcp_tokens TO authenticated;
GRANT ALL ON TABLE mcp_tokens TO service_role;

-- Browser sign-in (OAuth). Settings tokens leave expires_at and client_id empty.
-- These tables are written by the mcp function with the service role.
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS client_id text;

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    client_id text PRIMARY KEY,
    client_name text NOT NULL,
    redirect_uris jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
    code_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id text NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    resource text,
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);

CREATE TABLE IF NOT EXISTS mcp_oauth_refresh (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_at timestamptz
);

ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_refresh ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE mcp_oauth_clients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE mcp_oauth_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE mcp_oauth_refresh FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE mcp_oauth_clients TO service_role;
GRANT ALL ON TABLE mcp_oauth_codes TO service_role;
GRANT ALL ON TABLE mcp_oauth_refresh TO service_role;

-- True only when this session's auth user has a password. Link-only
-- accounts stay out of the app until they choose one.
CREATE OR REPLACE FUNCTION account_has_password()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(length(u.encrypted_password) > 0, false)
  FROM auth.users AS u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION account_has_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION account_has_password() TO authenticated;

