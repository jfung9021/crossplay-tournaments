# Crossplay tournaments

The accepted specification is docs/implementation-plan.md; docs/integration-contract.md records implementation interfaces and bounds. The user approved all proposed defaults on 2026-09-28. App code is owned here; Supabase production migrations are owned only by C:/Users/jfung/bite-open-card-draw.

Implement only requested scope. Stop when direct acceptance checks pass. At most one general review per implementation phase. Repair only evidenced failures, rerun affected verification, and do not restart a general review. Report unrelated issues separately. Do not spawn reviewers merely to search for more work.

Never commit secrets or use a project-wide service key in the app. Keep actor verification and SQL access server-only. Pairing/reporting changes must retain deterministic rules and transactional version checks.
