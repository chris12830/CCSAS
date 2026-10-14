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
   commit for deployment. Package lock regeneration currently occurs at install;
   capture and commit the resulting lock after CI before a final release build.
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
