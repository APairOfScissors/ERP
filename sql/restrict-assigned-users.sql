-- ════════════════════════════════════════════════════════════════
--  Restrict CN/LM-mapped accounts to only their own assigned jobs
--  Run this once in the Supabase SQL Editor.
--
--  How it identifies a restricted account: when created, the user's
--  auth user_metadata carries a "person_code" (e.g. 'CN' or 'LM').
--  Everyone else (William, Steven — no person_code set) is completely
--  unaffected by every policy below, since each one explicitly lets
--  a NULL person_code straight through.
--
--  These are RESTRICTIVE policies, not permissive ones: Postgres ORs
--  together multiple permissive policies for the same table+operation,
--  so a new permissive "only see your own rows" policy would do
--  nothing on top of whatever broad access already exists. A
--  restrictive policy instead ANDs on top of everything else, so it
--  narrows access regardless of what's already granted — no need to
--  know or touch whatever policy already lets William/Steven in.
-- ════════════════════════════════════════════════════════════════

-- ---------- jobs: see + update only your own assigned jobs ----------
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restrict_jobs_select ON jobs;
CREATE POLICY restrict_jobs_select ON jobs
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'person_code') IS NULL
  OR eng = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR drafter = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR sv_drafting = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR checker = (auth.jwt() -> 'user_metadata' ->> 'person_code')
);

DROP POLICY IF EXISTS restrict_jobs_update ON jobs;
CREATE POLICY restrict_jobs_update ON jobs
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'person_code') IS NULL
  OR eng = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR drafter = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR sv_drafting = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR checker = (auth.jwt() -> 'user_metadata' ->> 'person_code')
)
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'person_code') IS NULL
  OR eng = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR drafter = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR sv_drafting = (auth.jwt() -> 'user_metadata' ->> 'person_code')
  OR checker = (auth.jwt() -> 'user_metadata' ->> 'person_code')
);

-- Restricted accounts never book or remove jobs — only the My Jobs page's
-- one write path (updating job_progress on a job they're already on) is allowed.
DROP POLICY IF EXISTS restrict_jobs_insert ON jobs;
CREATE POLICY restrict_jobs_insert ON jobs
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'person_code') IS NULL);

DROP POLICY IF EXISTS restrict_jobs_delete ON jobs;
CREATE POLICY restrict_jobs_delete ON jobs
AS RESTRICTIVE FOR DELETE TO authenticated
USING ((auth.jwt() -> 'user_metadata' ->> 'person_code') IS NULL);

-- ---------- everything else: no access at all for restricted accounts ----------
-- The My Jobs page never queries these tables, so a restricted account has no
-- legitimate reason to reach them either.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','invoice_data','invoice_log','engineer_payout','people']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS restrict_no_access ON %I', t);
    EXECUTE format(
      'CREATE POLICY restrict_no_access ON %I AS RESTRICTIVE FOR ALL TO authenticated
       USING ((auth.jwt() -> ''user_metadata'' ->> ''person_code'') IS NULL)
       WITH CHECK ((auth.jwt() -> ''user_metadata'' ->> ''person_code'') IS NULL)', t
    );
  END LOOP;
END $$;
