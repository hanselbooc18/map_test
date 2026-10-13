# DevicePulse local GPS map test

DevicePulse is configured for Android and iOS. Expo Location reads the phone's GPS position and saves each fix to the on-device SQLite database first. When the Laravel API is configured and reachable, it uploads the GPS report and estimated transfer usage; failures remain on-device and can be retried from Settings. The live position is displayed on an OpenStreetMap/Leaflet map in a React Native WebView. No Google Maps key, Google Cloud account, or billing setup is needed.

## Connect the phone to the Laravel/MySQL backend

The phone sends data to the Laravel API, not directly to MySQL. Configure MySQL in `backend/.env`, create the database, then from the `backend` directory run:

```powershell
php artisan migrate
php artisan serve --host=0.0.0.0 --port=8000
```

Find the laptop's current Wi-Fi IPv4 address with `ipconfig` (look under the active Wi-Fi adapter; the address can change when reconnecting). In `map/.env`, set `EXPO_PUBLIC_API_URL` to `http://<LAPTOP-WIFI-IP>:8000/api` (the existing `EXPO_PUBLIC_API_BASE_URL` name remains supported). Do not use `localhost` or `127.0.0.1` on a phone, because those refer to the phone itself. Put both phones and the laptop on the same Wi-Fi, turn off any guest-network/client isolation, and allow inbound TCP port 8000 through Windows Defender Firewall on a trusted Private network if prompted. From the `backend` directory, run `php artisan serve --host=0.0.0.0 --port=8000` so Laravel listens beyond the laptop itself.

For a local Android development build only, opt in to cleartext HTTP in the Expo config. This flag is applied only when the configured API uses HTTP with a local/private address and the EAS profile is not `production`:

```powershell
Set-Location 'C:\path\to\map'
$env:EXPO_PUBLIC_ALLOW_CLEARTEXT_HTTP = 'true'
npx expo prebuild --platform android
npx expo run:android
```

The `prebuild` step generates/updates the native Android project; `run:android` can also create it automatically if it does not exist. Restarting Metro alone is insufficient because cleartext policy is compiled into Android's native manifest. Keep the environment variable unset for production builds and use HTTPS for a deployed backend. After rebuilding, start the development server with:

```powershell
Set-Location 'C:\path\to\map'
npx expo start --dev-client --clear
```

To verify LAN reachability from either phone, open `http://<LAPTOP-WIFI-IP>:8000` in the phone's browser (a Laravel 404 response still proves the network connection). If it cannot connect, confirm `ipconfig` still shows that address, Laravel is running, and both devices share the same non-guest Wi-Fi. If Windows Firewall blocks it, run this from an elevated PowerShell prompt to allow only the trusted Private profile:

```powershell
New-NetFirewallRule -DisplayName 'Laravel API port 8000' -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
```

If the Laravel server has `DEVICEPULSE_ENROLLMENT_CODE` configured, enter that code in **Settings → Laravel / MySQL sync**. The code is stored in the phone's secure storage. Start tracking to upload new fixes, or use **Sync pending reports** to send fixes collected before the backend was connected. Check History for each report's sync status. The backend stores the timestamp, coordinates, accuracy, altitude, speed, and heading; run migrations to add the optional measurement columns.

## Run on Android

Install Node.js and Android Studio/SDK, then from this `map` directory run:

```powershell
npm install
$env:EXPO_PUBLIC_ALLOW_CLEARTEXT_HTTP = 'true'
npx expo prebuild --platform android
npx expo run:android
npx expo start --dev-client
```

`react-native-webview` is a native module. Rebuild/reinstall the Android development APK once with `npx expo run:android` (or rebuild your EAS development client) before launching the updated app. A Google Maps key or billing account is not required.

If the app reports that `RNCWebViewModule` is missing, the installed development build predates WebView support. Rebuild and reinstall it using `npx expo run:android`; restarting Metro alone does not add native modules to an already-installed binary.

On the phone, enable Android Location, open the **GPS Test** tab, tap **Start Tracking**, and grant foreground and background location access. The app requests location updates every 5 seconds and shows the actual reported accuracy and GPS fix timestamp. Screen recording can continue while moving; Android may defer fixes because of GPS reception, power management, or permission settings.

## Map and connectivity behavior

The marker and measured GPS values come from the device via `expo-location`. They are stored locally before any upload attempt. GPS acquisition does not depend on internet connectivity; syncing requires access to the configured Laravel API.

The interactive map uses Leaflet and OpenStreetMap tiles from `tile.openstreetmap.org`, with visible OpenStreetMap contributor attribution in the map. Leaflet itself is loaded from `unpkg.com`. These map resources need internet access. In a no-connection area, tiles or the map library may not load; GPS collection and its on-screen values continue independently, and unsynced reports can be retried later. The displayed accuracy is the device's reported uncertainty radius, not a guarantee of true position. The map draws that radius only when the device reports a positive accuracy value.

## Local records and other tabs

GPS fixes remain in the app's SQLite database and can be browsed in History. Data Usage shows estimated API transfer sizes for GPS reports; map-tile traffic is not included. Settings shows permissions, backend configuration, pending uploads, and the option to sync queued reports.

The Expo Location plugin configuration retains foreground, background, and Android foreground-service permissions. Android also declares `RECEIVE_BOOT_COMPLETED`, which Expo TaskManager needs to persist scheduled background location jobs. Rebuild and reinstall the development app after changing native permissions. No Google Maps dependency or API key is used.

## Validation

From the `map` directory:

```powershell
npm test
npx tsc --noEmit
npx expo-doctor
```

Background location scheduling and observed GPS accuracy must be verified on a physical Android device.
