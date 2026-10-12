import type { ExpoConfig, ConfigContext } from 'expo/config';
import { withAndroidManifest } from '@expo/config-plugins';

function isLocalHttpApi(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isPrivateIpv4 = /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
    return parsed.protocol === 'http:'
      && (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || isPrivateIpv4);
  } catch {
    return false;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '';
  const allowLocalCleartext = process.env.EXPO_PUBLIC_ALLOW_CLEARTEXT_HTTP === 'true'
    && process.env.EAS_BUILD_PROFILE !== 'production'
    && isLocalHttpApi(apiUrl);

  const expoConfig: ExpoConfig = {
    ...config,
    name: config.name ?? 'DevicePulse',
    slug: config.slug ?? 'device-pulse',
  };

  return withAndroidManifest(expoConfig, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('Android manifest is missing its application element.');
    }
    application.$['android:usesCleartextTraffic'] = allowLocalCleartext ? 'true' : 'false';
    return modConfig;
  });
};
