import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { palette } from './mobile-ui';

type GpsFix = {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
};

const mapHtml = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; background: #edf2ef; }
    .waiting { position: absolute; z-index: 1000; top: 12px; left: 12px; right: 12px; padding: 10px 12px;
      border-radius: 10px; background: rgba(255,255,255,.94); color: #14231f; font: 14px sans-serif; }
    .leaflet-control-attribution { font-size: 11px !important; }
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
  <div id="map"></div>
  <div id="waiting" class="waiting">Waiting for a GPS fix. No position is assumed.</div>
  <script>
    if (!window.L) {
      window.ReactNativeWebView.postMessage('MAP_LIBRARY_ERROR');
    } else {
      const map = L.map('map', { zoomControl: true }).fitWorld();
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      let marker = null;
      let accuracyCircle = null;
      let newestFixTimestamp = 0;
      let newestFixId = null;
      window.updateGpsFix = function(latitude, longitude, accuracy, timestamp, fixId) {
        const fixTimestamp = Date.parse(timestamp);
        if (!Number.isFinite(fixTimestamp) || fixTimestamp < newestFixTimestamp
          || (fixTimestamp === newestFixTimestamp && fixId === newestFixId)) return;
        newestFixTimestamp = fixTimestamp;
        newestFixId = fixId;
        const point = [latitude, longitude];
        const hasAccuracy = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0;
        if (!marker) {
          marker = L.marker(point, { title: 'Current phone GPS position' }).addTo(map);
          if (hasAccuracy) accuracyCircle = L.circle(point, {
            radius: accuracy,
            color: accuracy > 50 ? '#b53d3d' : '#147d64',
            fillOpacity: 0.12
          }).addTo(map);
        } else {
          marker.setLatLng(point);
          if (hasAccuracy && accuracyCircle) {
            accuracyCircle.setLatLng(point);
            accuracyCircle.setRadius(accuracy);
            accuracyCircle.setStyle({ color: accuracy > 50 ? '#b53d3d' : '#147d64' });
          } else if (hasAccuracy) {
            accuracyCircle = L.circle(point, {
              radius: accuracy,
              color: accuracy > 50 ? '#b53d3d' : '#147d64',
              fillOpacity: 0.12
            }).addTo(map);
          } else if (accuracyCircle) {
            map.removeLayer(accuracyCircle);
            accuracyCircle = null;
          }
        }
        map.setView(point, Math.max(map.getZoom(), 16), { animate: false });
        document.getElementById('waiting').style.display = 'none';
      };
      window.ReactNativeWebView.postMessage('MAP_READY');
    }
  </script>
</body>
</html>`;

type WebViewComponent = typeof import('react-native-webview').default;

function loadWebViewComponent(): WebViewComponent | null {
  try {
    const webViewModule: typeof import('react-native-webview') = require('react-native-webview');
    return webViewModule.default;
  } catch (error) {
    if (error instanceof Error && error.message.includes('RNCWebViewModule')) {
      return null;
    }
    throw error;
  }
}

export function OpenStreetMap({ fix }: { fix: GpsFix | null }) {
  const NativeWebView = loadWebViewComponent();
  const webView = useRef<WebView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapReady || !fix) return;
    const accuracy = fix.accuracy;
    const timestamp = JSON.stringify(fix.timestamp);
    const fixId = JSON.stringify(fix.id);
    const script = `window.updateGpsFix(${fix.latitude},${fix.longitude},${accuracy},${timestamp},${fixId}); true;`;
    webView.current?.injectJavaScript(script);
  }, [fix?.id, fix?.latitude, fix?.longitude, fix?.accuracy, fix?.timestamp, mapReady]);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.data === 'MAP_READY') setMapReady(true);
    if (event.nativeEvent.data === 'MAP_LIBRARY_ERROR') setMapError(true);
  };

  if (!NativeWebView) {
    return createElement(
      View,
      { style: styles.mapUnavailable },
      createElement(Text, { style: styles.unavailableTitle }, 'Install the updated Android development build'),
      createElement(
        Text,
        { style: styles.unavailableText },
        'This installed app does not include the WebView native module. Rebuild and reinstall it with npx expo run:android. GPS tracking and the values shown above remain available.',
      ),
    );
  }

  if (mapError) {
    return createElement(
      View,
      { style: styles.mapUnavailable },
      createElement(Text, { style: styles.unavailableTitle }, 'Map tiles are not available'),
      createElement(
        Text,
        { style: styles.unavailableText },
        'GPS is still collected on this phone. Connect to the internet to load the OpenStreetMap map.',
      ),
    );
  }

  return createElement(NativeWebView, {
    ref: webView,
    source: { html: mapHtml },
    originWhitelist: ['*'],
    javaScriptEnabled: true,
    domStorageEnabled: true,
    nestedScrollEnabled: true,
    setSupportMultipleWindows: false,
    onMessage: handleMessage,
    onError: () => setMapError(true),
    style: styles.webView,
    accessibilityLabel: 'OpenStreetMap with live phone GPS position',
  });
}

const styles = StyleSheet.create({
  webView: { height: 360, width: '100%', backgroundColor: '#edf2ef' },
  mapUnavailable: {
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    gap: 8,
    backgroundColor: '#edf2ef',
  },
  unavailableTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  unavailableText: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
