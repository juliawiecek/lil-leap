# ADR: Sign-in lockout and inactivity timeout (NEXT-253 / BR-03)

## Decision

Use a fixed 15-minute account lock after three consecutive failed password checks.
Count failures in the existing `users.failed_login_attempts` column and store the
deadline in `users.locked_until`. A PostgreSQL row lock serializes attempts for the
same normalized email across requests and Identity instances. Failed-attempt
updates commit before Identity returns HTTP 401.

An active lock rejects every sign-in, including the correct password. Further
attempts do not extend the lock. Once its deadline passes, the next sign-in starts
a fresh streak: a wrong password counts as one failure; a successful sign-in clears
both fields. No scheduled unlock job or process-local counter is needed. Existing
authenticated sessions are unaffected by someone else's failed password attempts.

Every failed sign-in uses the same HTTP status, error code and fixed message for
an unknown email, wrong password and locked account. The message explains the
three-attempt/15-minute policy without confirming whether this particular email
exists or is locked. All paths perform bcrypt verification; unknown emails use a
dummy cost-10 hash. Neither clients nor the API expose remaining attempts or a
per-account unlock timestamp.

## Inactivity: retain ten minutes

The BRS BR-03 note proposes **one minute**. NextTrade's recorded implementation
decision for this story is to retain **ten minutes** of inactivity for both
NextTrade and Insights, rather than silently claiming the one-minute note is met.

Trading involves reading charts, research and order reviews; onboarding and account
forms also require periods of reading without keyboard or pointer input. A
one-minute cutoff can interrupt those ordinary flows. Ten minutes preserves the
current shared-client/server contract and its regression coverage while still
ending unattended sessions. Activity means user input: quote polling and token
refresh do not reset the client's inactivity deadline, and reload preserves it.
Server refresh sessions expire ten minutes after their last refresh, and access
tokens cannot outlive that window.

This is a documented deviation from the one-minute BRS note, not a claim of a new
BRS approval. Changing it later requires updating the Identity setting, both
clients' shared timeout policy, and the corresponding session regression tests
together. The 15-minute sign-in lockout is independent of this idle-session limit.

## Consequences

- The existing schema and development seed remain sufficient. Rerunning
  `db/seeds/002_test_users.sql` resets both lockout columns for the three demo logins.
- Row locks prevent lost increments under concurrent sign-ins. Attempts for different
  users remain independent; no distributed in-memory lock or new table is required.
- Password guessing against a known email is limited to three failures per lock
  window. Broad IP-level rate limiting and CAPTCHA are separate controls.
- A legitimate user can be temporarily locked by another party guessing their
  password; fixed expiry limits that disruption and repeated requests cannot
  perpetually move the deadline.
