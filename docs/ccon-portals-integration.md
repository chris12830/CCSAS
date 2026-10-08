# ChildCareOwnersNetwork → CC SAS portal integration

Status: implementation specification, not a completed migration.
Source: `chris12830/child-care-owners-network` (`main`), read-only.
Destination: `chris12830/CCSAS` (`feature/ccon-portals-integration`).
Do not merge to `main` without the owner's approval.

## Confirmed architecture
Both applications use React 19, Next 16/Vinext, Drizzle and Cloudflare D1. CC SAS already has a supplier-facing route (`app/supplier/page.tsx`), a network owner dashboard (`app/sas-client.tsx`), an action reducer (`lib/sas-actions.ts`), network state (`lib/sas-model.ts`) and API routes. The current CC SAS database stores the network as JSON in `sas_networks`, with event and connection tables.

ChildCareOwnersNetwork contains specialized modules for supplier accounts, memberships, billing, payments, plans, policies, campaigns, approval workflows, royalty/enquiry flows and support. Its API handlers rely on different user, supplier, ad, subscription, support and audit tables. Direct copying of handlers would not work without a schema and authorization adapter.

## Implementation workstreams

1. **Identity and permissions**: Map CCON's supplier and super_admin roles to CC SAS's owner and supplier identities. Require server-side ownership checks on every supplier write and enforce admin-only approval, pricing, suspension, payment verification and deletion. Do not trust client-provided supplier IDs.
2. **Supplier onboarding and contracts**: Add company/contact details, application and approval statuses, versioned policy publication, immutable supplier acceptance records, request-info workflow and rejection reasons.
3. **Supplier management**: Add account hold/release/cancel/delete lifecycle with audit trail and eligibility gating; preserve history when closing accounts.
4. **Plans and advertising**: Map CCON memberships and normal/premium ticker, targeted hub and rotating static placements into CC SAS's per-application placement catalog; retain CA/US selection, campaign moderation, schedules and preview behavior. Never assume an individual application's resource hubs exist in other applications.
5. **Billing and royalties**: Implement separate invoice/charge/receipt/payment-verification/royalty ledger tables (integer minor currency units, currency, due date, settlement and audit records); do not treat a supplier-submitted payment reference as verified payment. Preserve CC SAS existing package and payment behavior until migration is tested.
6. **Messaging and support**: Port supplier/admin threads, unread counts, attachments authorization and administrative replies with notification and audit records.
7. **Analytics**: Preserve existing CC SAS events; add supplier-facing campaign and app-specific metrics scoped to permitted suppliers.
8. **Application integration**: Keep CC SAS as system of record for suppliers, campaigns and billing. Deliver approved, funded ads to CCON and other apps via existing authenticated CC SAS feed; ensure campaign eligibility, market, placement and sample-data isolation.
9. **Super Admin experience**: Expand existing CC SAS network dashboard with supplier approvals, policies, payment history/verification, account actions, royalties, messaging and reports; retain applications, connectors and ticker studio.
10. **Supplier experience**: Expand `/supplier` with profile, application, agreement, campaigns, purchases, billing, royalty reporting, messages and analytics.

## Safety and migration rules
- No edits to the ChildCareOwnersNetwork repository.
- No direct cross-project database reads or shared passwords.
- Introduce additive D1 migrations; do not overwrite existing supplier or campaign records.
- Make all changes on this feature branch. Review and test before PR merge.
- Build automated checks for authorization, state transitions, paid-ad eligibility, country/placement filtering, idempotent payment and royalty events, and cancellation.
- Use a controlled rollout: read-only preview → sandbox test accounts → approved supplier migration → live connector cutover.

## Immediate next implementation
Create normalized schema extensions and adapters for supplier agreements, review history, admin messages, invoices and royalty ledger. Add authenticated endpoints and connect both portal UIs incrementally. Do not claim feature parity until all workflows pass tests.
