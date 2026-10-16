# CC SAS independent Hostinger deployment

Source baseline: integration commit 4ee04930457740ddca02d756efd3bee0938c71ef.
Work stays on feature/hostinger-vps. Main and existing live sites are unchanged.

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

This branch is staging work, not a production deployment. Local supplier domain
tests and VPS runtime tests run without third-party dependencies. Full API tests,
TypeScript and Next build require installed dependencies and the GitHub workflow.
No claim of production readiness is made before those checks and real HTTPS
browser tests pass. No server commands in this document have been executed on
the owner's VPS. No production data has been imported.

## Existing server constraints

Host: srv1177396.hstgr.cloud, Ubuntu 24.04, IP 72.60.114.80.
Preserve childcareinvoice.com, childcareregister.com and api.childcareregister.com.
Ports 3000, 5000 and 5010 already have applications; use a verified unused
127.0.0.1:3100 for CC SAS. Do not stop their containers or overwrite their Nginx
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
unprotected files. Stripe and email stay disabled until real credentials, verified
webhooks/sender configuration and staging acceptance are complete.

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

