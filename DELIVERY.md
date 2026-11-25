# Adrio III release review · 25 November 2026

The feature branch is ready for review and staging. The redesigned frontend successfully read the existing public Supabase schedule. Production deployment, database migration and authenticated production validation remain pending.

## Baseline and causes

The source is Jlrvidal/adrioiii at d8b8b6f. Before editing, the Pages response and deployed config matched the two tracked files byte for byte. The original repository contained only README.md, config.js and index.html. Neither commit supplied database schema, policies or migration history.

| Report | Evidence and outcome |
|---|---|
| Invalid request URL | The SDK received a URL already ending in /rest/v1/. A browser recorded HTTP 404 on /rest/v1/rest/v1/schedule. Using the original publishable key with the project origin returned HTTP 200 at /rest/v1/schedule. The revised browser client displayed the existing revision 0 with seven phases. |
| Administrator access | The same malformed base URL affected SDK Auth initialization. The only login handler called signInWithOtp. There was no password flow or auth lifecycle listener. The replacement uses Supabase password login, persistent sessions, refresh events, server authorization and logout. The actual account password, email delivery, provider settings and prior Auth response were unavailable for verification. |
| Offline scenario buttons | The visitor handler returned whenever published was null. Only a successful read assigned published. Both scenarios now derive from validated state available at startup. Switching a view does not mutate or publish that state. |

## Changes and security review

- Replaced the monolithic HTML with a static Spanish dashboard and native modules. The domain model preserves the original optimistic 21-month and pessimistic 28-month default schedules. Each scenario keeps its own estimates. Confirmed phase dates agree across scenarios. Editing maintains explicit overlaps, propagates changes and rejects conflicts with locked phases.
- The dashboard includes delivery estimates, planned activity, upcoming milestones, elapsed-calendar warnings and the Madrid date marker. Visitors can share a scenario without copying query tokens or fragments. Editing supports pointer controls and month inputs.
- The original renderer interpolated remote phase names into HTML, the share handler copied location.href, and the SDK dependency floated on major version 2. Rendering now uses DOM text nodes and fixed phase identifiers. Share URLs are reconstructed. The browser SDK is pinned locally. Its SHA-256 matched the npm release: 8816af04d9915dbba1882d6f84f0b402dc40268063a63d9c66d24f52f371c263.
- The original script inferred UI permissions from a single client-side getUser result. Production backend authorization could not be determined from the repository. Migration 001 checks auth.uid() in the database, revokes old RPC access and direct writes, restricts public reads to the singleton, and makes history readable only through the admin RPC. Privileged functions have explicit search paths. Unexpected identifiers, types, bounds, overlaps, completion flags, payloads and stale revisions are rejected by the server.
- The original use of an unscoped pending key and polling during edits risked data loss. Drafts now carry the project, administrator and base revision. Writes serialize and preserve newer pending edits. The application displays conflicts, timestamps and fallback status. Restores require preview and confirmation and generate a new revision.

## Verification

| Environment | Actual result |
|---|---|
| Node automated suite | Seven tests passed. Coverage includes original schedules, delay and advance propagation, overlaps, locks, repeated scenario reads, Madrid leap day and year boundaries, invalid state and config, recovery, stale reads and queued saves. |
| Local PostgreSQL integration | Migration executed on PGlite 0.3.14 using a representative legacy schema and Supabase-style roles. Both visitor roles could read the public row. Anonymous and authenticated non-admin writes and privileged calls were denied. Admin validation, revision conflicts, milestone locks, restore, ordered history and compatibility decoding passed. |
| Browser integration, mocked service | Headless Brave with the real vendored SDK passed public/offline scenario changes, absence of edit handles, sanitized sharing, login errors, non-admin access, admin session reload and logout, mouse resize, emulated touch drag, keyboard-accessible manual editing and confirmed history restore. The browser reported no uncaught page errors. Desktop and 390-pixel mobile layouts were exercised. |
| Live GitHub Pages and Supabase | Compared deployed assets with Git. Captured the original failing browser request and the successful revised public request. Desktop and mobile screenshots show the local revised frontend rendering the real public schedule. Live traffic during final browser verification was restricted to read-only HTTP methods. |

The database fixture cannot establish the privileges, triggers, auxiliary functions, history layout or Auth settings of the hosted project. Valid administrator login and writes, authenticated denial, cross-device publishing and restoration still require a staging project configured from the actual schema. Touch testing used browser emulation. Safari, physical WhatsApp webviews and password recovery email delivery were not exercised.

## Files and rollout

Modified README.md, config.js and index.html. Added style.css, package.json, six modules under src/, the SDK and license under vendor/, preflight.sql and 001_production.sql under migrations/, four test files under tests/, and this report. The README maps files to responsibilities and gives the Spanish setup, deployment, recovery and rollback procedures.

The owner must inspect the production schema using the read-only preflight, save a private schema/data backup, test migration 001 on a staging copy, verify the existing admin UUID and password, and disable public signups. After authenticated staging tests, apply the verified migration once and approve the frontend PR for the configured Pages branch. No production data, Auth settings, permissions or GitHub branches were changed during this work.
