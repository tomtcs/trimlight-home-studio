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

## WLED controllers (initial local integration)

Settings → Controller connection now selects **Native Trimlight** or **WLED**.
Existing installations default to Trimlight. WLED requires this Docker server on
its LAN; the separately hosted cloud app cannot reach a private controller address.
Use a reserved private IPv4 URL, such as `http://192.168.1.50`. Hostnames, public
addresses, redirects, URL credentials and paths are intentionally rejected.
Test connection reads `/json` only; Test & save selects the provider and pauses
both app schedulers. Existing Trimlight credentials, library, calendar, maps,
failed-job diagnostics and backups remain saved. A running sync or active preview
must finish, and the home-server scheduler must be paused, before switching.
WLED mode rejects all Trimlight API requests and rolling-calendar operations.

Configure electrical compatibility, chipset, GPIO/output assignments, LED counts,
color order and power limits in WLED itself. Studio does not modify `/json/cfg`,
flash firmware, or save/delete WLED presets. Set Studio's logical address count to
WLED's total configured LED count (up to 2048); WLED addresses are a continuous
zero-based chain across configured outputs, shown as one-based addresses in Studio.
The four outputs are configured by WLED, not duplicated Trimlight address ranges.

In Looks library, select **Refresh WLED presets**, then add presets as looks or
assign a preset to existing looks. Create animations and multi-output segments in
WLED's own interface and save presets with lights on, brightness and segment bounds.
Studio plays the preset exactly as saved. Native Trimlight animation numbers are
never sent as WLED effect IDs. Unmapped animated looks block scheduler activation.
Presets are references to that controller, not embedded backups; back up WLED
presets separately. Native WLED animation simulation/editing is not included yet.

Unmapped static Trimlight layouts can play their colors directly. Static playback
and the bulb finder temporarily replace active segments with one whole-house
segment, then send RGB colors in sequential batches of at most 256. This allows
individual/incremental bulb finding without the Trimlight 30-slot transmission
limit. The existing saved-layout editor still uses its 30-run format. Hardware
output configuration and saved WLED presets remain unchanged. Select a saved WLED
preset with segment bounds to restore a multi-segment display. A preview expires
after two minutes; with scheduling disabled it turns off. End preview / resume app
schedule clears the preview and lets the enabled runner apply the current rule.

On Evening planner, **Validate looks & enable scheduler** checks all enabled rules
and preset references. The server evaluates the existing calendar/sunset rules
approximately every 30 seconds, with date ranges, priorities and overnight endings.
It sends changes only when the scheduled look changes. There is no two-month WLED
calendar upload. Disable competing WLED timers and other automation integrations.
Pausing the Studio runner turns lights off; it does not enable WLED timers. A server
outage can leave the current display active. A playback error pauses the runner
and records the error instead of repeatedly attempting writes; check the lights
and re-enable after resolving it. No hardware validation has been performed yet.

Switching this local server does not alter an independently deployed cloud app or
its scheduled tasks. Pause any separate Trimlight cloud automation before bench
work or recovery, and keep the troubled native controller out of further upload
testing until its vendor guidance is available.
