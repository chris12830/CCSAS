# DocTrain connection

Child Care DocTrain uses the existing `doctrain` application and
`Dashboard ticker` placement. `SAS_DOCTRAIN_APP_KEY` is a runtime secret shared
with DocTrain's server-only `SAS_APP_KEY`. It provisions the first connection
when no key hash exists for this application. The secret is never included in
dashboard state or browser code. Normal authenticated feed requests update
`sas_connections.last_seen`.

An owner-generated replacement key in D1 takes precedence over the initial
runtime key, revoking it. Update DocTrain's runtime key and redeploy DocTrain
after a replacement. Other application keys and advertising rules are unchanged.

CC SAS is currently public at the Sites access layer; its live feed and events
still require the application key. If its Site audience becomes private,
configure the platform service credential in DocTrain as
`SAS_SITE_ACCESS_TOKEN` without changing the application key.

Live feeds exclude sample suppliers and sample campaigns. Approval, active
paid coverage, dates, audience, package, countries and placement are enforced
centrally. A successful empty feed is a connected application with no eligible
offers, rather than a failed connection.
