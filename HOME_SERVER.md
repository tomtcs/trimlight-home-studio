# Trimlight Home Studio — one server per household

## Install
1. Extract the downloadable package on a server with Docker Compose.
2. Copy `env.example` to `.env` and set `APP_USER` and a unique `APP_PASSWORD` (at least 8 characters). Trimlight credentials do not belong in this file.
3. Run `docker compose up -d --build` and open `http://YOUR-SERVER:8080`.
4. Sign in, open **Settings → Trimlight connection**, and enter your API client ID, client secret, and controller device ID. The device ID comes from your Trimlight API/controller export; it is not your client ID. Controller discovery is not included in this release.
5. Select **Test connection**, then **Test & save**. Saving also tests the credentials. A blank secret keeps the saved secret only when the client ID is unchanged.
6. Set your location, latitude, longitude, time zone and logical address count before enabling scheduling. New households start with an empty workspace and scheduling disabled. Existing controller patterns are copied to the library on the first connection; native controller calendars are left unchanged. Import your own workspace backup if migrating an existing installation.

## Credentials and access
Credentials are encrypted with AES-256-GCM in `credentials.enc`. An automatically generated key lives in `credentials.key`; both are stored in the persistent `/data` volume with owner-only file permissions. A person with access to both files can decrypt credentials: protect the volume and server. Back up the entire volume to preserve both data and key. Ordinary workspace exports contain neither credentials nor the key.

The browser never receives the saved secret. Re-enter a secret to replace it. **Disconnect controller** removes the active credentials; it does not erase designs or alter native lighting. Pause the local scheduler and resume Timer Mode before changing a connection. A workspace is bound to one controller; use a separate data volume for another controller to avoid applying the wrong household's rules.

Older installations with all three `TRIMLIGHT_*` environment values migrate them to encrypted storage on startup. After confirming the saved connection, remove those variables from `.env` and recreate the container. A saved disconnect is respected even if old environment variables remain.

The app uses a server login and serves HTTP internally. Use an HTTPS reverse proxy or VPN for remote access. Do not publish the container port directly to the internet. Each household runs an independent instance; this is not a multi-account hosted service.

## Scheduling and backups
The local live scheduler checks rules every 30 seconds and must remain running. It uses Manual Mode for displays, and requests Timer Mode on clean shutdown or disable. A power or network failure can leave the last display active; use the native Trimlight app to resume Timer Mode if necessary.

Manual two-month calendar compilation is available, but a new household does not receive a ChatGPT cloud automation. Configure complete calendar rules before syncing. The app rejects incomplete calendars or capacity overflow. Native calendar synchronization and recovery have an unresolved readback mismatch; verify controller synchronization before relying on it.

Protect and unlock designs with the library lock buttons. Exports include patterns, rules, photos, map geometry and the last controller snapshot. Store SQLite and encrypted credential files in the persistent Docker volume. Controller limits remain: 60 saved patterns, 60 calendar entries, and 30 custom color-run slots.

## Checks
`npm ci`, `npx vite build --config vite.standalone.config.mjs`, and `node --test tests/*.test.mjs` build and check this self-hosted package. No tests operate physical lights. Photo detection suggests the outer roofline and requires review.
