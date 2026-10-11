# ChildCareOwnersNetwork to CCSAS supplier centralization

Shared supplier workspaces and migration foundations are implemented on `feature/ccon-portals-integration`. CCON's companion branch is `feature/ccsas-supplier-transition`. Production migration and full parity remain unfinished.

CCSAS owns the new profile, consent, account lifecycle, billing, royalty and supplier/admin messaging workflows. CCON keeps member data, hubs, offers, private enquiries and group orders. An authenticated application connector transfers approved advertising and supplier eligibility; it does not read another project's database.

See [supplier transition handoff](supplier-transition-handoff.md) for implemented functionality, preserved requirements, migration sequence, exact verification scope and SUP-01 through SUP-07. See [validation evidence](supplier-transition-validation.json) for pinned check results.

The initial specification-only branch was reconciled with CCSAS main so the existing DocTrain feed integration is preserved. Both repositories use additive D1 migrations and development branches. Do not merge into main without owner approval.

Live CCON supplier management remains in place. The transition defaults to local mode, and cutover is blocked until checkout, enquiry finance, new supplier/ad linking, catalog/criteria/support parity and staging checks pass. No live transfer is established by saving this branch.
