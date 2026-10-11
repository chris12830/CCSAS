# Supplier centralization handoff — 11 October 2026

Status: development implementation. Production cutover and full CCON feature parity are unfinished.

Owner direction: CCSAS will own shared supplier services; CCON retains members, hubs, offers, private enquiries and group purchasing. Work stays on development branches. Do not merge into main without owner approval.

## Saved implementation

- CCSAS owner and supplier workspaces: company details, review/request-info, policy and exact-price consent, lifecycle holds/cancellation/closure, messages/unread status, invoices, payment claims, independent owner receipt verification, royalty sales/refunds and recurring service receipts.
- Immutable acceptance records and auditable financial/account changes. Money in the new ledger uses integer cents and a currency. Closing an account retains financial, consent and support history.
- Additive D1 migration 0002; existing network JSON and advertising events remain. Workspace records have their own identities and supplier index.
- Atomic network-version update plus token-guarded record writes in one D1 transaction. Changed records are grouped using JSON statements to respect query limits. Oversized imports fail before any writes.
- Strict bound identity: a matching email cannot override an existing user ID.
- Supplier and owner APIs scope data and decisions on the server. Admin preview is read-only and administrators cannot manufacture supplier consent.
- Three ad placements, selected-app hub IDs, normal/premium ticker metadata, CA/US targeting and account/expiry gating.
- Owner migration preview/import endpoint and UI, with allowlisted CCON export format and a server-calculated fingerprint. Same-snapshot imports are idempotent; conflicts and different prior snapshots stop import.
- The importer preserves original identity bindings, consent text/time, annual pricing/currency, financial receipts, royalty due dates/refunds/recurrence, supplier support and raw allowlisted source records.
- CCON development branch includes additive migration 0028, owner export/control tools, a connector and portal/admin gateway. Mode defaults to local.
- CCON activation deliberately fails while `supplierParityReady=false`. The existing live supplier portal remains until the outstanding requirements below are completed.

## Current evidence

The first CCSAS implementation passed all 20 supplier-domain checks, 9 original SAS regressions, TypeScript and the application build in GitHub Actions run 38167271625. Later migration/persistence and CCON changes require the new runs on their exact branch heads. See `docs/supplier-transition-validation.json` for final pinned evidence; do not extend older results to newer code.

No production data export/import, account mutation, source freeze or cutover has been performed. No Site version has been published. Local command execution is unavailable in this session; source work and repository verification use GitHub. Site source checkout/push, deployment and signed-in staging journeys remain necessary.

## Unfinished work and release gates

| ID | Work required before cutover | Acceptance |
| --- | --- | --- |
| SUP-01 | Port provider checkout/session reconciliation and pending-payment handling into CCSAS. External checkout links and manual verified invoices are present; CCON Stripe parity is not complete. | Provider outage, duplicate receipt, wrong currency, abandoned checkout, stale quote and refund journeys pass in test mode. No pending source payment is lost. |
| SUP-02 | Connect CCON enquiry purchase matching and recurring receipts to a central ledger with a transactional outbox and idempotent delivery. Shared financial actions are currently gated during transition. | Private member data stays local; each actual receipt produces exactly one royalty; no ledger remains writable in two systems. |
| SUP-03 | Support new CCSAS suppliers/campaigns in CCON with explicit identity/directory and ad-ID mappings. The current feed adapter accepts imported CCON ad IDs only. | New approved/funded suppliers can advertise and receive local enquiries without exposing member records. |
| SUP-04 | Complete membership/campaign fee catalog, premium/static purchases, supplier criteria and onboarding authorization/privacy parity. Imported contract/criteria snapshots are retained; current simpler SAS packages do not replace every CCON rule. | Tier 1 and annual Tier 2 pricing, fees, shared hub/static rotation and royalty terms match accepted contracts; no category exclusivity is reintroduced. |
| SUP-05 | Complete supplier support library/private file delivery, notification and analytics event forwarding. Imported supplier messages are normalized; CCON support files and member threads remain in source. | Each supplier sees only authorized files and campaign statistics; source support/history is retained. |
| SUP-06 | Apply migrations to test copies, configure application keys, run signed-in owner/supplier/member journeys and failure/rollback tests. | Both builds and all regressions pass on final commits; data counts and currency totals reconcile; exports contain no member data/secrets. |
| SUP-07 | Complete deployment and exact-source verification, accept rollout, replace CCON common supplier controls and retire duplicate endpoints. | Owner approves main merges and release; both saved Site versions match the reviewed source; production smoke tests pass. |

## Migration sequence

1. Complete SUP-01 through SUP-05 and keep source mode local.
2. Apply CCSAS 0002 and CCON 0028 to test copies; do not change applied migrations.
3. Generate an owners application key in CCSAS. Configure it server-side as CCON CCSAS_APP_KEY; configure CCSAS_BASE_URL. A runtime SAS_CCON_APP_KEY may seed the CCSAS key hash. Keep all keys out of browser code and exports.
4. CCON Super Admin downloads GET /api/admin/ccsas/export. CCSAS owner previews it in Supplier migration; no data is saved by preview.
5. After staging acceptance and backups, freeze supplier writes, settle in-flight payments and wait for writes to finish. Export the exact frozen snapshot. Review conflicts and totals, then import that fingerprint. Never infer consent where original evidence is missing.
6. Reconcile supplier counts, currency totals, agreements, recurring periods, payment status, source support and member enquiry IDs. Prepare rollback reconciliation for any later CCSAS writes.
7. Only after all gates pass, update the readiness guard and activate the verified connector. Gate duplicate shared financial/account writes. CCON member/group/enquiry functionality remains local.
8. Remove duplicate UI/APIs after acceptance and a rollback window. Preserve history and source backups.

An immediate rollback before cutover restores local writes. After cutover, a boolean rollback is refused: freeze CCSAS, reconcile new transactions and identity/consent changes back into CCON, verify a backup/restore and then restore local authority. A static old snapshot cannot be called a safe data rollback.

Reference: Cloudflare D1 batch transactions and limits:
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- https://developers.cloudflare.com/d1/platform/limits/
