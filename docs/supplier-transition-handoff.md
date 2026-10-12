# Supplier portal replacement handoff — 12 October 2026

The replacement implementation is saved on the development branches and passes CI. The production replacement remains unfinished: the execution environment is disconnected, so real signed-in staging, production migration and publication have not run.

Owner direction: CCSAS owns shared supplier services. CCON retains members, Resource Hubs, offers, private enquiries and group purchasing. Do not merge into main without owner approval.

## Implemented replacement

- CCON no longer renders its supplier application/portal, supplier management, membership management or payment-link management screens. The four retired root components are removed from the development branch; Git history and the sealed version 68 handoff preserve the earlier source.
- Supplier application and service links open CCSAS with CCON application context. Legacy menu hashes resolve to the new gateway. CCON supplies separate local offer and enquiry screens, and keeps group orders and restricted hub browsing.
- CCSAS owns company verification, criteria, genuine policy/price/royalty acceptance, approval or information requests, account holds/closure, invoices and support conversations. Closing accounts preserves history and obligations.
- Source annual membership prices, currencies, benefits, separate ticker/premium/static rates and explicit free ticker rules are imported. Preserved private contracts cannot be selected by another supplier. Historical accepted prices/rates stay unchanged.
- Separate campaign invoices and verified receipts fund paid advertising. Free tickers need approval without a fabricated receipt. Static campaigns require the accepted annual advertising membership and a separate paid month; CCON keeps its shared 30-second rotation.
- Stripe checkout reserves the server invoice before contacting Stripe, retries the same reservation, verifies session/intent/charge identity, amount and currency, quarantines changed/refunded/disputed receipts and handles signed webhooks. Test-mode payments never activate live memberships or settle live invoices.
- Original pending provider payments block source freeze, import application and activation until settled, expired or reconciled. Imported verified processor intents cannot be reused as a new payment.
- Stable directory, identity and campaign mappings support new CCSAS suppliers/ads as well as existing source IDs. Mirrors cannot promote or overwrite members/administrators, or reassign another supplier's binding.
- CCON private quotes and purchase reports stay local. Enquiry mutation and a minimal financial outbox entry commit atomically. CCSAS applies each source event once using the accepted quote's currency/rate; local financial rows are projections created only from the central receipt.
- A failed connection or lost response after central commit retries the same event. Recurring registrations create no automatic royalties; actual period receipts preserve month-end/leap-year anchors and original due instants.
- Shared billing/profile/campaign/support writes and legacy automatic payment synchronization are retired after cutover. Member support stays in CCON. Owner-only retry tools expose pending shared delivery.
- Support tickets, replies, unread history, help metadata and protected uploads are in CCSAS. Existing CCON files retain protected source URLs and source access checks; their bytes stay preserved for member/shared-history continuity. New CCSAS uploads use its BUCKET binding and audience checks with range delivery.
- Supplier approval/account/message email notices are durable and owner-triggered. Without verified sender/provider configuration they remain visibly pending. No real notifications were sent in this work.
- All workspace collections, including reservations, mail setup, replay receipts, tickets and help, use the same token/version-guarded D1 record writer. Accepted evidence remains immutable.

## Exact verification

| Project | Validated source commit | Checks | TypeScript / build | CI |
| --- | --- | --- | --- | --- |
| CCSAS | `ad020c3253f037c5b7a91778b228cb7fcc423c21` | 95 passed | Passed / passed | [Run 38260855134](https://github.com/chris12830/CCSAS/actions/runs/38260855134) |
| CCON | `a5158dd81aafd5160360089e85836f311b23ea3a` | 135 repository checks + 4 paired API checks passed | Passed / passed | [Run 38261013342](https://github.com/chris12830/child-care-owners-network/actions/runs/38261013342) |

The paired workflow checks out CCSAS at the exact commit above. Tests execute both real API handlers with SQLite, and cover anonymity, one-time/recurring royalties, failed delivery, and a lost response after the central transaction has committed. R2/provider/authentication bindings are test substitutes; the results do not prove browser layout, real sign-in, live provider operation or production data reconciliation.

See [machine-readable validation](supplier-transition-validation.json). Documentation-only follow-up commits leave the validated application files unchanged.

Review: [CCSAS draft PR](https://github.com/chris12830/CCSAS/pull/1) and [CCON draft PR](https://github.com/chris12830/child-care-owners-network/pull/1).

## Production state and blocker

Both main branches and live publications are unchanged. CCSAS remains version 3; CCON remains version 68. No production supplier data was exported/imported, no source freeze or account change occurred, and no live replacement was published.

The selected environment reports `409 Conflict, environment_offline: Environment is not connected.` No command execution tools are available. Official Site source checkout/push, packaging, publishing, signed-in staging and real migration cannot be completed until that environment is restored.

## Release gates still open

| Gate | Required work |
| --- | --- |
| SUP-06 | Restore execution; stage both projects with real sign-in; apply migrations to test copies; verify provider and file/mail configuration, exact source contracts, directory/campaign links, member privacy, group orders, failure handling, freeze concurrency, currency totals and backup/restore. |
| SUP-07 | Push exact reviewed source to both Site source repositories; publish matching saved versions; perform the frozen-source import and reconciliation; record owner acceptance; enable cutover; verify live role journeys and rollback readiness. Owner approval is required before main merges. |

SUP-01 through SUP-05 have implementation and automated checks. Their real-provider, contract, sign-in and hosted-data acceptance belongs to SUP-06; they are not certified as production-complete.

## Configuration and rollout

1. Keep source mode local while verifying the release. Settle or expire old source checkouts before a freeze. Retain database/file backups and the prior saved Site versions.
2. Preserve CCSAS migration 0002 and CCON 0028; append/apply CCON 0029 for bindings and outbox. Existing migration history and the sealed Laravel handoff remain unchanged. CCSAS declares BUCKET for new protected help files.
3. Configure the CCSAS owners application key server-side as CCON CCSAS_APP_KEY and CCSAS_BASE_URL. SAS_CCON_APP_KEY can seed the CCSAS key hash. Keep keys out of browser code, exports and Git.
4. For provider staging, configure CCSAS STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; point verified webhooks to /api/payments/webhook. Enable the matching connection as owner. Test receipts remain non-funding.
5. For mail, configure RESEND_API_KEY and SAS_MAIL_FROM with a verified sender. The owner explicitly sends pending notifications from Supplier services. Check provider delivery records, including ambiguous or old retries, before repeating a send.
6. Stage owner/supplier/member journeys and finance/file/provider outages. Complete SUP-06, including late source writes/callbacks during freeze and restore/reconciliation. Do not infer consent or payment from a missing source record.
7. Publish the prepared sources in a controlled migration window. CCON's owner export/control endpoints serve the existing records; the new gateway explains the transfer while mode is local/frozen.
8. Freeze supplier writes and let in-flight writes finish. Download /api/admin/ccsas/export, preview in CCSAS, reconcile conflicts/counts/currency totals, and apply the exact frozen fingerprint. Extra supplier criteria, registration details and library metadata are optional-compatible additions to the version 1 allowlist; member-only resources are rejected.
9. Set CCSAS_RELEASE_READY=true only after signed-in staging and reconciliation acceptance. The activation endpoint still requires every owner acceptance check and the exact current frozen import receipt. The source public catalog and protected legacy file checks then delegate to CCSAS.
10. Verify live common supplier services, new supplier/campaign mappings, local offers/enquiries/groups, central royalty receipts and protected downloads. Record the exact saved Site versions and source commits in this handoff.

## Rollback and retention

Before cutover, local writes may be restored after reviewing the current source state. After cutover, a boolean rollback is refused: freeze shared writes, reconcile all newer CCSAS transactions/consent/lifecycle changes into the source, verify restoration, then restore local authority. An old snapshot alone is not a safe rollback.

Historical accounts, consent, prices, receipts, support and private member references are retained. Legacy backend modules remain available for controlled pre-cutover reconciliation and historical recovery; the source UI no longer renders them, and shared endpoints are gated after cutover. The Laravel conversion remains a separate unfinished workstream.
