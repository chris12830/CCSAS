# CC SAS independent Hostinger deployment

Historical conversion baseline: integration commit
4ee04930457740ddca02d756efd3bee0938c71ef. Current development work is on
feature/complimentary-supplier-access. The deployed application commit is
4e8849100727b73b89f53a065990e04bd37f4e6e. No merge to main was performed.

## Conversion

The application uses Next.js on Node, a private SQLite database on a persistent
volume, and protected local file storage. Existing SQL schemas, supplier rules,
payment verification, consent history and transaction version guards are retained.
Identity comes from hashed, revocable server sessions. ChatGPT authentication
headers no longer authenticate users. Owner setup requires the server CLI;
supplier registration requires a single-use email-bound invitation valid for 48
hours. Password recovery currently requires owner/server administration.

The SQLite adapter keeps existing D1-shaped prepared-statement calls, but runs
real SQLite transactions locally. This is for one application instance on one
VPS. It is not a distributed database architecture. Imported supplier identities
must be reconciled with invited accounts before a production supplier migration;
do not replace their existing user IDs or infer consent from an email match.

## Release status

CC SAS is deployed at https://childcaresas.com on the owner's VPS. The latest
shared-package application image was built and started there, and the live public
catalog returned the shared SAS packages in CAD and USD. Fresh supplier signup
and first application submission are now confirmed in the browser; owner review
and resubmission acceptance remain pending. The earlier payment-return labels and cancellation
message were already confirmed in the supplier browser. The build runs the
automated tests, authentication checks, TypeScript, production build and
compiled-server return checks described in the dated checkpoints below.

Stripe invoice checkout is enabled in test mode. The targeted sandbox success,
decline, cancellation, expiration and account-return checks passed. These checks
use the existing Plan-It supplier account; they do not establish live payment
acceptance or complete acceptance of new-business review and other integrations.
Live Stripe configuration and deliberate handling of the sandbox invoices remain
separate work.

## Existing server constraints

Host: srv1177396.hstgr.cloud, Ubuntu 24.04, IP 72.60.114.80.
Preserve childcareinvoice.com, childcareregister.com and api.childcareregister.com.
Ports 3000, 5000 and 5010 belong to other applications. CC SAS uses
127.0.0.1:3100. Do not stop their containers or overwrite their Nginx
configuration. Make a VPS snapshot and keep existing database/file backups before
installing anything. Daily VPS backups were reported disabled.

## Staging installation (after validation)

1. Review the GitHub validation result and exact branch commit. Create a VPS
   snapshot. Confirm port 3100 is unused and disk/memory are adequate for the build.
2. Clone this branch into a new /opt/ccsas directory. Set up /etc/ccsas/app.env
   from deploy/app.env.example; mode 600. Do not commit passwords or provider keys.
3. Create /var/lib/ccsas with owner UID/GID 1000 for the container and mode 700.
   Verify this new path first; do not recursively change existing application paths.
4. Build with docker compose -f deploy/compose.yaml build. Use a pinned reviewed
   commit for deployment. Dependency installation uses the committed lockfile
   with frozen-lockfile mode; do not regenerate it on the production server.
5. Run docker compose -f deploy/compose.yaml run --rm app node scripts/vps-admin.mjs migrate.
6. Create the owner with an interactive shell password prompt, supplying the password
   through stdin to node scripts/vps-admin.mjs owner EMAIL NAME. Do not put it in
   command arguments, screenshots, GitHub or this chat. Then start only the CC SAS
   service with docker compose -f deploy/compose.yaml up -d.
7. Use a separate HTTPS staging hostname and set SAS_BASE_URL to that hostname.
   Secure cookies require HTTPS. Check owner login and logout, supplier invitation
   activation, expired/replayed invitations, permissions, policy/price acceptance,
   approvals, paid/free feeds, uploaded-file access, range delivery, application
   keys, payment webhook handling and database persistence across restart.
8. Verify a SQLite online backup and file backup can restore in an isolated copy.
   Archive the previous image and configuration for rollback. New financial writes
   must be reconciled; restoring an old snapshot alone is not an acceptable rollback.
9. Only after acceptance, configure childcaresas.com DNS and its dedicated HTTPS
   virtual host. Resolve A/AAAA and www records explicitly; change no email records.
   Validate nginx -t before a reload, and verify all existing sites afterward.

## Accounts and integrations

Use the CLI invite EMAIL to generate a supplier invitation. Deliver it privately
to the verified recipient; the token is a credential. reset-password EMAIL reads
a new password on stdin and revokes existing sessions. Supplier approval in the
portal is still required before advertising. Authentication alone is not supplier
approval or payment evidence.

Other applications must switch their server-side SAS base URL and use their own
X-SAS-App-Key. Existing CCON protected historical URLs remain in the migration
logic; they require a separate reviewed migration and must not be redirected to
unprotected files. Keep Stripe in test mode until live credentials, verified live
webhooks and live acceptance are in place. Supplier email configuration and sender
acceptance are separate work.

## Sandbox checkout checkpoint — 2026-10-16

The owner tested a CAD 1.00 sandbox invoice in the deployed application. The
supplier portal recorded `test_paid`, while the invoice remained open and no
live membership or revenue was recorded. Stripe showed the automatic
`checkout.session.completed` webhook delivered with HTTP 200. The owner also
confirmed that resending the event did not duplicate the payment.

The checkout return fix changes the Secure, HttpOnly, host-only session cookie
from SameSite Strict to Lax so a top-level GET back from Stripe retains the
session. Existing exact-origin POST checks and server-side ownership checks
remain in place. The return screen displays the verified outcome, distinguishes
test receipts from real payments, and refreshes applied invoice data without
reloading the same return URL repeatedly. Confirmed sandbox receipts cannot be
paid or expired again through the invoice buttons in test mode.

Validation: `pnpm test` (109 checks), the authentication API suite (5 checks),
TypeScript, and the production build passed locally. The modified payment
workspace has no ESLint findings; unrelated existing lint findings remain in
the main client and payment test fixture. Automated browser verification could
not run because the Chromium download was invalid. This fix still needs
deployment and a real browser return check. After deployment, sign out and back
in once to receive the updated cookie, then test the return using a new clearly
labelled sandbox invoice. This checkpoint does not authorize a live-mode switch
or establish production payment readiness.

## Owner checkout return follow-up — 2026-10-16

The next browser test no longer requested sign-in, but the owner session returned
to the read-only Supplier portal preview and selected an example supplier. A
separate screenshot also showed the real Plan-It Supplier portal. Payment
returns use the current server session; they must not establish a new identity.

New checkout success and cancellation URLs use an authenticated return endpoint.
It checks the current server session and checkout ownership, then sends the owner
to Supplier services / Billing with the invoice's actual supplier selected, or
sends an owning supplier to their Supplier portal. Existing owner return URLs at
`/supplier?payment=...` also pass through this endpoint. Return navigation never
marks an invoice paid or changes membership. Payment verification still uses
the existing processor reconciliation flow.

The header now displays the actual signed-in email. Real suppliers no longer see
the Super Admin navigation link. Completed payments have a View confirmation
link so the return can be checked without another charge.

Validation passed: 122 automated domain, API, authentication and runtime checks;
TypeScript; production build; and five compiled-server HTTP scenarios using real
isolated SQLite sessions. The HTTP scenarios cover owner and supplier routing,
legacy owner URLs, unauthorized accounts, and unchanged financial records. Run
`pnpm test:payment-return` after a build to repeat them; the Docker image build
also runs this check. The deployed confirmation check is recorded below.

## Deployed supplier confirmation check — 2026-10-16

The owner built and deployed commit
`40edb7a7040a132203bc8f8d57253d7d9306e392`. Using View confirmation for an
existing sandbox receipt displayed Test payment confirmed. Both CAD 1.00 invoices,
`CCSAS-SANDBOX-20261016-01` and `CCSAS-SANDBOX-20261016-02`, showed confirmed
test receipts and remained open. The notice explicitly stated that no real money
was collected and membership was unchanged.

A following screenshot from the same browser window showed Supplier portal,
Plan-It Inc., and Signed in: christmckinnon@gmail.com, without the owner preview
banner or Super Admin navigation. This verifies that viewing the existing payment
confirmation retained the correct supplier account. A fresh Stripe Checkout
completion or cancellation return and the owner return path have not yet been
verified in the deployed browser; their HTTP routing tests passed locally.
Stripe remains in test mode. This check does not establish live payment readiness.

## Fresh sandbox checkout browser checks — 2026-10-17

The user tested deployed application commit
`40edb7a7040a132203bc8f8d57253d7d9306e392` with the new separate advertising
invoice `CCSAS-SANDBOX-20261017-03`: CAD 1.00, due 2026-10-17, with no package
paid-through date.

Cancellation: after opening Stripe Sandbox Checkout and returning with Stripe's
back arrow without paying, the portal returned to Billing. The new checkout and
invoice both showed `open`; no confirmed receipt appeared for invoice 03.
The banner said Payment confirmation pending. This is generic unpaid-checkout
wording, not an explicit cancellation acknowledgement, and remains a UX follow-up.

Completion: the user resumed payment for the same invoice using the Stripe test
card. The returned Billing screen showed Test payment confirmed, a third
`test_paid` receipt, and the invoice 03 button changed to Test payment confirmed.
All three sandbox invoices remained open. The notice stated that no real money
was collected and membership was unchanged.

A subsequent screenshot from that same window showed Supplier portal, Plan-It
Inc., and Signed in: christmckinnon@gmail.com, with no owner preview banner or
Super Admin link. The fresh successful payment return therefore passed the
supplier account check. A separate header screenshot was not collected between
cancellation and resuming the payment.

Remaining payment checks and follow-up:
- Retain the sandbox audit history and handle the labelled test invoices and open
  sandbox checkout before offering live invoice collection on this account.
- Live Stripe configuration and live payment acceptance remain separate work.
  Stripe is still in test mode; these checks do not establish live readiness.

## Deployed owner confirmation check — 2026-10-17

After the instruction to open the last View confirmation link in the regular
owner window, the user supplied a screenshot showing Network owner / Super Admin
in the sidebar, Supplier services selected, and the three actual Plan-It sandbox
invoices and receipts, including `CCSAS-SANDBOX-20261017-03`. Online checkout
controls and owner invoice forms were present. This confirms that the owner
confirmation return retained the owner workspace and selected the actual supplier.
The confirmation notice itself was outside the supplied screenshot crop.

Together with the supplier screenshots above, this completes the deployed owner
and supplier account routing checks. No additional payment was requested for the
owner navigation check. The subsequent declined and expired checkout checks are
recorded below. Stripe remains in test mode.

## Declined and expired sandbox checkout — 2026-10-17

The user created separate advertising invoice `CCSAS-SANDBOX-20261017-04` for
CAD 1.00, due 2026-10-17, with no package paid-through date. In Stripe Sandbox
Checkout, the generic-decline test card `4000 0000 0000 0002` produced the expected
card-declined error. The owner then checked payment status in SAS: the fourth
checkout and its invoice remained open and unpaid; only invoices 01–03 had
`test_paid` receipts.

The owner selected Expire unpaid checkout for that open attempt. The resulting
Billing screenshot showed the fourth checkout as `expired`, invoice 04 still
open, and the three earlier confirmed test receipts unchanged. Refreshing the
original Stripe checkout page displayed You're all done here and a generic
completed-or-timed-out explanation. Its meaning here is established by SAS's
expired checkout status and the preceding declined attempt, not by that generic
Stripe message alone. The user confirmed that refreshing produced this screen.

These deployed checks cover the generic card decline, retention of an unpaid
invoice, owner-triggered expiration, and closure of the original Stripe checkout.
The supplier portal's separate expired-return banner was not captured in this
browser test. No successful payment was made for invoice 04.

## Payment display wording follow-up — 2026-10-17

Cancellation now has a distinct Checkout cancelled message only when the return
contains `cancelled=1` and the checked checkout is still open. Loading and errors
are handled first; confirmed payments, review and expiration retain their
verified outcomes. The URL flag does not change a financial record or override a
confirmed payment.

The supplier card labels complimentary access as Advertising access and
Complimentary access through its existing expiry date. Paid access retains Paid
through. When a package has no legacy payment link, the card directs the supplier
to Billing to view invoices and payment options instead of saying checkout has
not been configured.

Validation passed: 122 existing automated checks; TypeScript; production build;
and five compiled-server HTTP payment-return scenarios. The changed supplier
workspace has no ESLint findings. The main client retains its nine existing
findings with none added. The deployment and browser acceptance of this display
update are recorded below. Stripe remains in test mode; live configuration and
acceptance are separate work.

## Display deployment and final browser acceptance — 2026-10-17

The owner's terminal showed a fast-forward from `40edb7a` to
`1c3eaf18e72cc1be42229d64a54e08d3e230ad03`, a successful Docker build, and
`ccsas-app-1` started with status Up on `127.0.0.1:3100`. The deployment command
checked the exact source commit before building and recreated only the app service.

The following supplier screenshot showed Plan-It Inc., Signed in:
christmckinnon@gmail.com, Advertising access, Complimentary access through
2026-10-22, and the new guidance to open Billing for invoices and payment options.
There was no owner preview banner or Super Admin link.

For the final wording check, the supplier opened a new sandbox checkout attempt
for the same unpaid invoice `CCSAS-SANDBOX-20261017-04`, left the payment fields
empty, and returned with Stripe's back arrow. The Billing screenshot displayed
Checkout cancelled and stated that no payment was confirmed, the invoice was
still unpaid, and checkout could be resumed. The three earlier `test_paid`
receipts remained; the prior expired attempt and new open attempt were both
visible, and all four invoices remained open. The open attempt is intentionally
resumable after leaving checkout; it is not a confirmed payment or a new invoice.

This completes browser acceptance of the display update and the targeted sandbox
checkout checks recorded above. No additional successful payment was made for
invoice 04. The current runtime remains application commit
`1c3eaf18e72cc1be42229d64a54e08d3e230ad03`; subsequent documentation-only commits
do not require an application rebuild. Live payment activation, sandbox invoice
handling and the broader outstanding workflows remain separate work.


## Shared SAS packages and new supplier review — 2026-10-17

The owner chose one shared SAS package structure across the network, including
CCON: Single Application, Selected Applications and Full Network. Existing SAS
prices and application coverage settings are retained. These are configurable
prices, not newly approved live payment terms. The owner explicitly deferred
turning Stripe live until later in the process; test mode remains in place.

New applications, including `/supplier?app=owners`, use the shared packages and
one company verification form. The public `/api/catalog` now publishes those
shared offerings, their CAD and USD prices, membership period, coverage limit and
eligible enabled applications. It defaults to CAD; `?currency=USD` selects USD.
Source offerings and supplier-specific preserved contracts are excluded from the
new-application catalog. Existing CCON contracts can still be retained by their
current supplier, with accepted membership, royalty and payment history intact.
No contract migration, price rewrite or financial activation runs on deployment.

Company verification now applies to shared-package submissions as well as
preserved-contract submissions. Authority, privacy, current criteria answers and
the supplier's own policy acceptance are validated before saving. New real
supplier records require this verification before either owner approval action
can approve them. Previously approved direct SAS records are retained; their
next supplier profile submission must complete the common form. Existing
complimentary Plan-It access is not changed by the release.

A supplier answering a more-information request uses Update and resubmit. A
valid submission returns that application to pending review and retains the
request, deadline and earlier submission snapshots. Invalid submissions roll
back. Editing a rejected application does not clear rejection. Approval does not
settle invoices, create a checkout or grant paid access. The review queue opens
Supplier services so the owner can inspect the company verification, submitted
criteria answers and decision history together.

The default criteria introduction now describes the SAS network, with default
revision 2. Explicitly published criteria and earlier acceptance snapshots are
retained. Routine network setting changes no longer discard published supplier
criteria. Each application submission keeps an immutable copy of the company
information and criteria accepted at that time.

Local validation passed: 131 automated checks (21 SAS, 75 supplier/domain,
24 supplier/payment-return API, six VPS runtime and five authentication API),
TypeScript, production build and five compiled-server HTTP return scenarios.
Changed files introduce no additional ESLint findings; existing repository
findings remain. Development tests use isolated fixture databases and do not
create live supplier accounts or send emails.

This release was saved as `4e8849100727b73b89f53a065990e04bd37f4e6e` and the
owner completed the pinned deployment command. The terminal and live catalog
checks are recorded below. No SQLite schema migration was needed.

Remaining browser and integration acceptance:

- Confirm Packages & pricing shows Shared SAS packages and supplier criteria,
  with the three shared package cards and existing prices.
- Confirm the public catalog returns the shared package IDs `single`, `bundle`
  and `network` with the configured amounts and eligible apps.
- The separate supplier test login and first application submission are confirmed
  in the browser. Next test an information request, supplier resubmission,
  rejection/reopening and approval. Keep the regular owner window separate from
  the private supplier session and preserve the original Plan-It account.
  Submitted business details still require the owner's substantive review.
- Confirm the existing Plan-It account, campaign history and complimentary
  access remain available. Keep the browser payment checks already accepted;
  live payment setup and sandbox invoice handling are deferred.
- Complete the separate Laravel CCON supplier entry-point/identity transition.
  The currently inspected Laravel branch still contains local supplier
  registration/KYC routes; this SAS release does not switch those routes.
  Other app integrations, supplier email delivery and remaining hub coverage
  acceptance are still separate outstanding work.


## Shared-package deployment and public catalog check — 2026-10-17

The owner supplied the deployment terminal screenshot after running the pinned
update command. It showed 18 changed files, an 18/18 successful Docker build,
`Image ccsas-app Built`, and `Container ccsas-app-1 Started`. The final Compose
status was Up, with only the SAS app recreated on `127.0.0.1:3100`.

Read-only HTTPS requests to the live `/api/catalog?currency=CAD` and
`/api/catalog?currency=USD` both returned HTTP 200, `packageStructure: shared-sas`
and criteria revision 2. Both returned exactly `single`, `bundle` and `network`.
CAD monthly amounts were 4900, 9900 and 14900 cents; USD monthly amounts were
3900, 7900 and 11900 cents. The respective coverage limits were 1, 3 and 99.
The enabled eligible application IDs in the catalog were `owners` and `doctrain`;
this registry result does not establish new end-to-end integration acceptance.

The shared-package runtime is deployed. The new application form, fresh supplier
registration, information request/resubmission, rejection/reopening and approval
still require browser acceptance. No new real supplier account or invitation was
created by these read-only checks. No emails were sent, provider settings changed
or financial records mutated. Live payment activation remains explicitly deferred.
Documentation-only follow-ups after this runtime commit need no image rebuild.


## Fresh supplier application browser checkpoint — 2026-10-18

The supplier test invitation was generated in the owner's VPS terminal. The
registered test login uses the user-controlled address
`christmckinnon+ccsas-onboarding-20261017@gmail.com`. Reusing the consumed
activation link later returned the expected invitation error. After directing
the user to `/login` and providing a password reset command scoped to that test
login, the user reported that sign-in was working. No password or invitation
token is retained in these notes.

The subsequent private Supplier screenshot showed the matching test identity
and `Plan-It Inc. (onboarding test)` with Pending approval, Single Application,
Canada and Payment needed. Supplier services showed Account active and
Application pending. Company verification details were recorded, with authority
and privacy acceptance dated 2026-10-18. Criteria revision 2 showed all four
criteria confirmed. Supplier policy acceptance was recorded for 2026-10-18,
version 2026-10-05.1. The screenshot showed no campaigns and no recorded
payments. It showed no owner preview banner or Super Admin control.

This confirms the initial application submission and consent-recording flow in
the deployed browser. It does not independently verify the company's legal,
registration or contact information. No approval or advertising access has been
granted to this test account. Owner information request, supplier resubmission,
rejection/reopening and approval remain the next browser acceptance checks.
The original Plan-It supplier account and its existing complimentary access
remain separate. Stripe live activation is still deferred. This checkpoint
changes documentation only and needs no application rebuild.
