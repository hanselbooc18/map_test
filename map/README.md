# DevicePulse

A React Native / Expo mobile app for device location tracking and estimated network-transfer accounting. All screens are native mobile screens; the app is configured for Android and iOS only.

## Setup

1. Install Node.js (LTS) and the Android Studio SDK for Android development. iOS native builds require macOS and Xcode.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to the HTTPS root of your backend. The app deliberately reports upload failures when this value is missing; it does not use mock data.
3. Start Metro with `npm start` and open the app on a physical Android or iOS device. For native builds, run `npx expo run:android` or `npx expo run:ios`.

Do not put backend secrets in `EXPO_PUBLIC_*` variables. Device access tokens returned by registration are kept in the platform secure store. No Google Maps key is required.

## Tracking and offline behavior

- Tracking starts only after foreground and background location permission have both been granted. The app explains each permission in context and in Settings.
- **Start Tracking** requests GPS updates every 10 seconds and keeps tracking until **Stop Tracking** is pressed. The app uses Expo Location background updates and an Android foreground-service notification. GPS accuracy, altitude, speed, heading, coordinates, and timestamp are shown locally when available. iOS and Android can delay or suspend background work; the interval is a request, not a guaranteed schedule.
- Each location fix normally triggers one `POST /locations` and one `POST /data-usage`. At 10-second sampling that is up to about 12 POST requests per minute, plus occasional reads. The client spaces API requests at least 1.1 seconds apart to stay below Laravel's 60-request/minute authenticated limit, including when retrying a queued backlog. The Tracking screen refreshes the server's latest location at most once per minute while focused. Server requests are not made once per GPS-second; retries reuse the same idempotency keys, and duplicate fixes with the same timestamp are discarded locally.
- Each GPS fix is committed to SQLite before networking. Offline fixes stay queued and are retried on reconnection or with **Sync Now**. Each update has a UUID used as an idempotency key for both location and usage submissions.
- Location history and usage totals persist locally and continue to be available after app restarts. Server history and summaries are fetched when configured and online.

## Data usage measurement

The app cannot inspect all cellular traffic used by the device. Per-update figures are explicitly **estimated**: serialized request/response body byte lengths are counted when observable and fixed HTTP-header allowances (520 bytes per request and 280 bytes per response) are added. This does not measure TLS, TCP/IP, retransmits, acknowledgements, DNS, OS traffic, registration traffic, or read-only latest/history/summary fetches. GPS payload size is recorded separately and is never treated as total transfer.

For each update the stored totals are:

```text
estimated upload = request body bytes + estimated request-header bytes
estimated download = response body bytes + estimated response-header bytes
estimated total = estimated upload + estimated download
daily/monthly total = sum of per-update estimated totals in the local calendar day/month
```

When an update cannot be sent because the device is offline, the record stays pending and its network usage remains zero until a request is attempted. Failed attempted requests are counted as estimates where body/header information is available.

## Backend contract

Set `EXPO_PUBLIC_API_BASE_URL` to the API root. The backend must provide:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/devices/register` | Device enrollment/bootstrap. Body: `{ deviceId, deviceName, platform }`. Return `{ accessToken }`; secure this enrollment endpoint against arbitrary device impersonation. |
| `POST` | `/locations` | Store a GPS update. Requires `Authorization: Bearer …` and `Idempotency-Key: <updateId>`. Body contains `updateId`, `deviceId`, `timestamp`, `latitude`, `longitude`, and `coordinatePayloadBytes`. |
| `POST` | `/data-usage` | Store estimated transfer measurements. Requires bearer auth and an idempotency key (`<updateId>:usage`). |
| `GET` | `/devices/{deviceId}/locations/latest` | Return the latest location object. |
| `GET` | `/devices/{deviceId}/locations` | Return `{ items: [...] }` location history; accept optional `from` and `to` ISO timestamps. |
| `GET` | `/devices/{deviceId}/data-usage/summary` | Return daily/monthly data usage summaries. |

The backend should enforce uniqueness on the update ID and return the same successful result for retries. Device registration is the bootstrap operation; all location, history, and usage operations use the issued bearer token. Do not ship service credentials in the app.

## Validation and device testing

From the `map` directory, run `npm install`, `npx expo start`, `npm test`, and `npx tsc --noEmit`. Test permissions, GPS availability/accuracy, offline retries, and background tracking on a physical Android/iOS device. A development build is required to validate native background location.
