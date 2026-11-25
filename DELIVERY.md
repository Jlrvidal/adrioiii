# Adrio III resident portal · delivery review

**Release status.** The previous release, dc6def9, is on GitHub Pages. This redesign is on feature/resident-portal. It includes a new database migration for published observations, private photographs and public forecast history. The hosted database was accessed read-only.

## Photo moderation

Migration 004 sends visitor uploads to a private queue of up to 10 pending photos per Madrid calendar day and 30 in total. Pending uploads leave published slots available for the administrator. The moderation panel previews, approves and rejects entries. The administrator can publish directly and remove published photos. Removing a legacy album photo preserves its diary attachment and Storage object.

Back up the database and the legacy Storage bucket, apply 004 after 003, then publish the matching frontend. Keep 004 and the pending queue if rolling back the frontend. The prior frontend cannot show pending confirmations or moderation controls. The moderation release was tested with local PGlite and Playwright mocks.

## Findings from production

The original SDK received a URL ending in /rest/v1/ and generated /rest/v1/rest/v1/schedule. The earlier browser investigation reproduced HTTP 404 on that request and HTTP 200 at the corrected endpoint with the same key. During this iteration the deployed HTML and configuration matched dc6def9 byte for byte. The public schedule returned revision 0, and /auth/v1/settings reported the Email provider enabled and signups disabled. The current hosted authorization RPC returned HTTP 404, PGRST202. It was absent from the exposed API at verification time. Authenticated publication cannot be verified until the project owner checks the migration and schema cache.

The specific browser cache that produced the reported configuration warning was unavailable. Cached assets from different releases are a possible cause. This version handles the exact REST and Auth base suffixes, validates the public key and rejects unrelated paths. It versions the config request, excludes config from offline caches, and shows the normalization diagnostic only in verified administration. The attachment contained the brief; the previous desktop and mobile captures provided the visual baseline.

## Product and implementation

- The public overview pairs an original sectional illustration with both delivery forecasts, their remaining time, changes from baseline and prior publication, documented milestones and observed activity. The illustration shows four residential levels and two underground levels and is labelled schematic.
- Each Gantt year has one colour across headers, bands, bar segments and legend. Madrid's current date, keyboard-accessible details, mobile phase list, aligned comparisons, and baseline references share the existing month-based engine. Seven distinct phase icons and state labels make progress understandable without colour. Major milestones include structure, envelope and delivery.
- Actual activity comes from dated observations and confirmed milestones. Expected milestones are computed from the chosen scenario. Multiple phases can be active. A historical date correction previews its effect across both scenarios and keeps other locked phases fixed. The application uses counts and month-level completion dates.
- The diary supports preview, publish, edit, confirmed withdrawal, phase filtering, stable entry links, and an expanded or paired photo view. Draft entry data stays in the browser form until publication. Signed-in users need server authorization to manage entries. JPEG, PNG and WebP inputs are validated and re-encoded. Only published references make photos publicly readable. Unacknowledged uploads may leave a private orphan; the guide explains cleanup.
- The public evolution chart and accessible revision list receive only delivery offsets, publication times, revision numbers and optional administrator explanations. Legacy snapshots use the original phase offsets and overlaps. With fewer than two publications the portal explains when comparisons become available.
- The manifest, local icons and share graphic require no external asset service. The service worker caches a fixed list of app files. The last validated public plan is separate from private pending edits. A fresh offline visitor without a saved publication sees the initial calendar as an estimate.

## Verification

| Environment | Evidence |
|---|---|
| Node unit and mocked synchronization tests | Ten tests passed. They cover corrected config paths, invalid keys, year-boundary segments, Madrid dates, scenario stability, delay propagation, historical corrections, locked milestones, recovery, queued writes and cached publication status. |
| Local PostgreSQL integration | Both migrations executed against the supplied original SQL and representative Supabase roles and Storage tables. Existing revisions survived. Anonymous and non-admin writes failed. The admin could publish and restore. Unpublished photos were invisible to visitors; linking and unlinking a diary publication changed visibility. Storage restrictions remained effective alongside a broader permissive policy. Public forecast summaries returned only the intended columns. |
| Browser with mocked Supabase | Headless Brave passed the public, non-admin and admin flows, mouse and emulated touch editing, manual dates, revision restore, diary preview/create/edit/remove, image signature rejection, conversion, upload and retrieval. Reload preserved published entries. A second browser context loaded the public plan, reloaded offline via the service worker and switched scenarios. Checked the shell cache contents and uncaught page errors. |
| Visual review | Captured 1440×900, 1280×800, 390×844 and 320×568 in light and dark modes. Checked page width at all four sizes and reviewed overview, Gantt, comparison, phase list, diary, administration, cached and fallback states. Corrected the preview server's SVG MIME type, compacted the narrow header, and separated the HOY flag from the year headings. Screenshots of diary editing use test data. |
| Live service | Public deployment, schedule read, Auth settings and RPC availability were checked. Hosted password login, Storage uploads, database migration and publication were not performed. Native WhatsApp, Safari and real phone hardware were not tested. |

## Activation and rollback

The Spanish README includes dashboard steps, testing instructions, storage limits and backup procedures. Check the existing schema, back it up, apply pending migration 001 followed by 002, verify the private adrio-diary bucket and run the admin checks in staging. Release the frontend to the existing Pages branch after those checks. Reverting the frontend to dc6def9 preserves diary rows, images and schedule history. The JSON planning export covers schedules; database and Storage backups are needed for the complete diary.
