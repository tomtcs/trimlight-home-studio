# Trimlight Home Studio — one server per household

## Install
1. Extract the downloadable package on a server with Docker Compose.
2. Copy `env.example` to `.env` and set `APP_USER` and a unique `APP_PASSWORD` (at least 8 characters). Trimlight credentials do not belong in this file.
3. Run `docker compose up -d --build` and open `http://YOUR-SERVER:8080`.
4. Sign in, open **Settings → Trimlight connection**, and enter your API client ID, client secret, then select **Find controllers**. Choose your controller by name and online status; its device ID is filled automatically. You can also paste an ID manually. Discovery does not save credentials or change lighting.
5. Select **Test connection**, then **Test & save**. Saving also tests the credentials. A blank secret keeps the saved secret only when the client ID is unchanged.
6. Set your location, latitude, longitude, time zone and logical address count before enabling scheduling. New households start with an empty workspace and scheduling disabled. Existing controller patterns are copied to the library on the first connection; native controller calendars are left unchanged. Import your own workspace backup if migrating an existing installation.

## Credentials and access
Credentials are encrypted with AES-256-GCM in `credentials.enc`. An automatically generated key lives in `credentials.key`; both are stored in the persistent `/data` volume with owner-only file permissions. A person with access to both files can decrypt credentials: protect the volume and server. Back up the entire volume to preserve both data and key. Ordinary workspace exports contain neither credentials nor the key.

The browser never receives the saved secret. Re-enter a secret to replace it. **Disconnect controller** removes the active credentials; it does not erase designs or alter native lighting. Pause the local scheduler and resume Timer Mode before changing a connection. A workspace is bound to one controller; use a separate data volume for another controller to avoid applying the wrong household's rules.

Older installations with all three `TRIMLIGHT_*` environment values migrate them to encrypted storage on startup. After confirming the saved connection, remove those variables from `.env` and recreate the container. A saved disconnect is respected even if old environment variables remain.

The app uses a server login and serves HTTP internally. Use an HTTPS reverse proxy or VPN for remote access. Do not publish the container port directly to the internet. Each household runs an independent instance; users share one household’s lighting workspace.

## Scheduling and backups
The local live scheduler checks rules every 30 seconds and must remain running. It uses Manual Mode for displays, and requests Timer Mode on clean shutdown or disable. A power or network failure can leave the last display active; use the native Trimlight app to resume Timer Mode if necessary.

Manual two-month calendar compilation is available, but a new household does not receive a ChatGPT cloud automation. Configure complete calendar rules before syncing. The app rejects incomplete calendars or capacity overflow. Native calendar synchronization and recovery have an unresolved readback mismatch; verify controller synchronization before relying on it.

Protect and unlock designs with the library lock buttons. Exports include patterns, rules, photos, map geometry and the last controller snapshot. Store SQLite and encrypted credential files in the persistent Docker volume. Controller limits remain: 60 saved patterns, 60 calendar entries, and 30 custom color-run slots.

## Checks
`npm ci`, `npx vite build --config vite.standalone.config.mjs`, and `node --test tests/*.test.mjs` build and check this self-hosted package. No tests operate physical lights. Photo detection suggests the outer roofline and requires review.


## Accounts and roles

The first startup creates an Administrator from APP_USER and APP_PASSWORD. Existing installations migrate automatically without changing lighting data. Once an account exists, these environment variables do not overwrite it. Sign in through the application and open **Account & users** to add users, rename accounts, reset passwords, change roles, or disable access. Every user can change their own password under **Account**; passwords require 8–256 characters.

- Administrator: all features, users, controller connection, sync and household settings.
- Editor: designs, house maps, schedules and manual light controls. Administrative sync, credentials and household settings remain restricted.
- Viewer: read-only access to the shared household workspace. Server rejects changes and controller commands.

Sessions expire after eight hours. Logout invalidates the current session; password changes and administrator account edits invalidate all sessions for that user. At least one active administrator must remain. Disabled accounts retain their identity and can be re-enabled.

Accounts, salted scrypt password hashes and hashed session tokens reside in the existing SQLite data volume. Back up the volume, not only the lighting export, to preserve accounts. Keep the named volume when rebuilding. APP_PASSWORD is only used to bootstrap an empty user database.

For HTTPS deployments set COOKIE_SECURE=true in .env so session cookies are HTTPS-only. Leave it unset for local HTTP access. This account system applies to the self-hosted Docker application; the hosted ChatGPT version continues to use its own sign-in system.

### Verified uploader (version 2)

The uploader saves a durable write intent before each controller mutation. Each mutation is followed by a separate shadow refresh, a three-second settling interval, and a full configuration comparison before the next mutation is permitted. A stale result receives up to three refreshed read checks; a parsing error or an uncertain write acknowledgement stops the job immediately. Writes and backup restores are never automatically retried. Old running jobs cannot resume under the new uploader.

After recovery from a factory reset, use **Accept reset controller**, **Check capacity**, and **Test one design**. The test uploads only the first missing required design, preserves existing designs/calendar entries, and leaves automatic scheduling paused. Verify the design and continued access in the original Trimlight app before requesting a full sync. The test checks one payload only; it does not guarantee that all firmware/API behavior is safe for a bulk upload.

Keep the browser tab open during uploads. Progress counts verified operations, not acknowledgements. The backup export includes the pending request, failure phase, and verified write history (no API credentials). Do not run the original app's editing functions or another uploader concurrently. Mock-controller regression tests cover delayed data, interrupted requests, parsing failures, deletions, configuration mismatches, and final Timer Mode verification; physical-controller validation remains necessary.

## Returning from the experimental dual-controller release

This release restores native Trimlight support only. On the first startup after
that experimental release, both schedulers are paused without contacting either
controller. Saved Trimlight credentials and original designs remain available.
Any looks created exclusively for the other controller are retained in workspace
exports under `retiredControllerLooks`; their calendar rules are archived under `retiredControllerRules` and disabled.
Recreate any needed calendar assignments using native looks before enabling scheduling.
Controller-specific preset assignments are removed from retained Trimlight looks.
An existing failed native sync stays failed; this migration does not bypass its
recovery checks or resolve the underlying Trimlight firmware/API issue.

## Temporary controller protection (default)

Stored-pattern writes/deletes, calendar writes/deletes, restores and ordinary live
previews are blocked at the API client. Both app schedulers are paused by the
heartbeat. The Evening planner provides administrator-only controlled tests:
capture a baseline, lights off, native Timer Mode, a dim white static preview,
and a test that starts in one minute and runs for one minute. Check iOS access
after every test. These operations have not been proven safe on real hardware.
The static test uses one active color run without zero-count padding.

Timed cleanup requires the server to remain running. It requests Timer Mode once
and does not retry after failure; manually select Timer Mode if needed. Overdue
scheduled starts expire after 90 seconds rather than unexpectedly starting after
a long outage. Request diagnostics retain the latest 60 entries without headers,
secrets or device IDs; read responses record counts/firmware, while the complete
baseline is preserved in workspace exports. A sending entry without a response
means the outcome is unknown, not that the controller rejected the request.

Existing failed sync jobs and backups remain intact. A separately deployed cloud
app or automation must be paused separately. For controlled development only,
CONTROLLER_PROTECTION=off restores the legacy paths; do not disable protection
on the affected controller while the firmware/API issue remains unresolved.
