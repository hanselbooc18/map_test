import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { utf8ByteLength } from './bytes';
import type { LocationUpdate, TrackingSettings } from './types';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL
)?.trim().replace(/\/+$/, '');
const TOKEN_KEY = 'tracking-api-token';
const ENROLLMENT_CODE_KEY = 'tracking-enrollment-code';
const ESTIMATED_REQUEST_HEADERS_BYTES = 520;
const ESTIMATED_RESPONSE_HEADERS_BYTES = 280;
const MIN_API_REQUEST_INTERVAL_MS = 1100;
let tokenRefresh: Promise<string> | null = null;
let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAllowedAt = 0;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly responseBodyBytes = 0,
    public readonly requestBodyBytes = 0,
    public readonly networkFailure = false,
    public readonly statusCode?: number,
    public readonly responseMessage?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

export async function getEnrollmentCode(): Promise<string> {
  return (await SecureStore.getItemAsync(ENROLLMENT_CODE_KEY)) ?? '';
}

export async function saveEnrollmentCode(code: string): Promise<void> {
  const normalized = code.trim();
  if (normalized) {
    await SecureStore.setItemAsync(ENROLLMENT_CODE_KEY, normalized);
  } else {
    await SecureStore.deleteItemAsync(ENROLLMENT_CODE_KEY);
  }
}

function requireBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new ApiError('Set EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_API_BASE_URL) to connect to your backend.');
  }
  return API_BASE_URL;
}

function getApiHost(): string {
  try {
    return new URL(requireBaseUrl()).host;
  } catch {
    return 'the configured server';
  }
}

function networkError(error: unknown, requestBodyBytes = 0): ApiError {
  const details = error instanceof Error ? error.message : 'Network request failed.';
  const host = getApiHost();
  const message = /CLEARTEXT/i.test(details)
    ? `Android blocked cleartext HTTP to ${host}. For local development, enable EXPO_PUBLIC_ALLOW_CLEARTEXT_HTTP and rebuild the Android app. Use HTTPS for production.`
    : `Could not reach the Laravel API at ${host}. Check that both phones and the computer are on the same Wi-Fi, the API is listening on 0.0.0.0:8000, and Windows Firewall allows port 8000. (${details})`;
  return new ApiError(message, 0, requestBodyBytes, true);
}

function httpError(statusCode: number, text: string, requestBodyBytes = 0): ApiError {
  let payload: { message?: unknown; errors?: Record<string, unknown> } = {};
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    // Non-JSON server responses still carry an HTTP status for diagnosis.
  }
  const responseMessage = typeof payload.message === 'string' ? payload.message : undefined;
  const validationMessages = Object.values(payload.errors ?? {}).flatMap((value) =>
    Array.isArray(value) ? value.filter((message): message is string => typeof message === 'string') : []
  );
  const detail = validationMessages.length
    ? validationMessages.join(' ')
    : responseMessage ?? (text ? text.slice(0, 180) : '');
  const suffix = detail ? `: ${detail}` : '';
  const message = statusCode === 422
    ? `Laravel validation failed (HTTP 422)${suffix}`
    : statusCode === 401 || statusCode === 403
      ? `Laravel authentication/authorization failed (HTTP ${statusCode})${suffix}`
      : `Laravel API returned HTTP ${statusCode}${suffix}`;

  return new ApiError(message, utf8ByteLength(text), requestBodyBytes, false, statusCode, responseMessage);
}

async function fetchWithNetworkHandling(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw networkError(error);
  }
}

async function waitForApiRequestSlot(): Promise<void> {
  let release!: () => void;
  const previous = requestQueue;
  requestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const delay = nextRequestAllowedAt - Date.now();
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    nextRequestAllowedAt = Date.now() + MIN_API_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

async function sendJson<T>(
  path: string,
  body: unknown,
  options: { token?: string; idempotencyKey?: string } = {}
): Promise<{ value: T; requestBodyBytes: number; responseBodyBytes: number }> {
  const url = `${requireBaseUrl()}${path}`;
  const serialized = JSON.stringify(body);
  const requestBodyBytes = utf8ByteLength(serialized);
  let response: Response;
  try {
    await waitForApiRequestSlot();
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: serialized,
    });
  } catch (error) {
    throw networkError(error, requestBodyBytes);
  }
  const text = await response.text();
  const responseBodyBytes = utf8ByteLength(text);
  if (!response.ok) {
    throw httpError(response.status, text, requestBodyBytes);
  }
  let value: T;
  try {
    value = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new ApiError('The backend returned an invalid JSON response.', responseBodyBytes, requestBodyBytes);
  }
  return { value, requestBodyBytes, responseBodyBytes };
}

async function getJson<T>(path: string, token: string): Promise<T> {
  await waitForApiRequestSlot();
  const response = await fetchWithNetworkHandling(`${requireBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw httpError(response.status, text);
  }
  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new ApiError('The backend returned an invalid JSON response.', utf8ByteLength(text));
  }
}

async function registerDevice(settings: TrackingSettings): Promise<string> {
  const existing = await SecureStore.getItemAsync(TOKEN_KEY);
  if (existing) return existing;
  const enrollmentCode = await getEnrollmentCode();
  const { value } = await sendJson<{ accessToken?: string }>('/devices/register', {
    deviceId: settings.deviceId,
    deviceName: settings.deviceName,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android',
    ...(enrollmentCode ? { enrollmentCode } : {}),
  });
  if (!value.accessToken) {
    throw new ApiError('Device registration response did not include an accessToken.');
  }
  await SecureStore.setItemAsync(TOKEN_KEY, value.accessToken);
  return value.accessToken;
}

async function refreshDeviceToken(settings: TrackingSettings, rejectedToken: string): Promise<string> {
  if (tokenRefresh) return tokenRefresh;

  const refresh = (async () => {
    const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    if (storedToken && storedToken !== rejectedToken) return storedToken;
    if (storedToken === rejectedToken) await SecureStore.deleteItemAsync(TOKEN_KEY);
    return registerDevice(settings);
  })();
  tokenRefresh = refresh;
  try {
    return await refresh;
  } finally {
    if (tokenRefresh === refresh) tokenRefresh = null;
  }
}

async function sendAuthenticatedJson<T>(
  settings: TrackingSettings,
  path: string,
  body: unknown,
  idempotencyKey: string
): Promise<{ value: T; requestBodyBytes: number; responseBodyBytes: number }> {
  let token = await registerDevice(settings);
  try {
    return await sendJson<T>(path, body, { token, idempotencyKey });
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 401) throw error;
    token = await refreshDeviceToken(settings, token);
    return sendJson<T>(path, body, { token, idempotencyKey });
  }
}

async function getAuthenticatedJson<T>(settings: TrackingSettings, path: string): Promise<T> {
  let token = await registerDevice(settings);
  try {
    return await getJson<T>(path, token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 401) throw error;
    token = await refreshDeviceToken(settings, token);
    return getJson<T>(path, token);
  }
}

export async function submitLocation(
  settings: TrackingSettings,
  update: LocationUpdate
): Promise<{
  requestBodyBytes: number;
  responseBodyBytes: number;
  locationSucceeded: boolean;
  locationError: string | null;
  usageSucceeded: boolean;
  usageError: string | null;
}> {
  let requestBodyBytes = 0;
  let responseBodyBytes = 0;
  let locationSucceeded = false;
  let locationError: string | null = null;
  let usageSucceeded = false;
  let usageError: string | null = null;
  try {
    const locationResult = await sendAuthenticatedJson(
      settings,
      '/locations',
      {
        updateId: update.id,
        deviceId: update.device_id,
        timestamp: update.created_at,
        latitude: update.latitude,
        longitude: update.longitude,
        coordinatePayloadBytes: update.coordinate_bytes,
        accuracy: update.accuracy,
        altitude: update.altitude,
        speed: update.speed,
        heading: update.heading,
      },
      update.id
    );
    requestBodyBytes += locationResult.requestBodyBytes;
    responseBodyBytes += locationResult.responseBodyBytes;
    locationSucceeded = true;
  } catch (error) {
    locationError = error instanceof Error ? error.message : 'Location upload failed.';
    if (error instanceof ApiError) {
      requestBodyBytes += error.requestBodyBytes;
      responseBodyBytes += error.responseBodyBytes;
      if (error.networkFailure || error.statusCode === 401 || error.statusCode === 429) {
        return {
          requestBodyBytes,
          responseBodyBytes,
          locationSucceeded,
          locationError,
          usageSucceeded,
          usageError,
        };
      }
    }
  }
  let usageBody: Record<string, unknown> = {};
  let estimatedRequestBodyBytes = requestBodyBytes;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const beforeUsage = estimateTransfer(estimatedRequestBodyBytes, responseBodyBytes);
    usageBody = {
      updateId: update.id,
      deviceId: update.device_id,
      timestamp: update.created_at,
      coordinatePayloadBytes: update.coordinate_bytes,
      requestBodyBytes: estimatedRequestBodyBytes,
      estimatedRequestHeaderBytes: ESTIMATED_REQUEST_HEADERS_BYTES * 2,
      responseBodyBytes,
      estimatedResponseHeaderBytes: ESTIMATED_RESPONSE_HEADERS_BYTES * 2,
      estimatedUploadBytes: beforeUsage.uploadBytes,
      estimatedDownloadBytes: beforeUsage.downloadBytes,
      estimatedTotalBytes: beforeUsage.totalBytes,
      measurementMode: 'estimated',
      status: locationSucceeded ? 'success' : 'failed',
      ...(locationError ? { error: locationError } : {}),
    };
    const nextSize = requestBodyBytes + utf8ByteLength(JSON.stringify(usageBody));
    if (nextSize === estimatedRequestBodyBytes) break;
    estimatedRequestBodyBytes = nextSize;
  }
  try {
    const usageResult = await sendAuthenticatedJson(
      settings,
      '/data-usage',
      usageBody,
      `${update.id}:usage`
    );
    requestBodyBytes += usageResult.requestBodyBytes;
    responseBodyBytes += usageResult.responseBodyBytes;
    usageSucceeded = true;
  } catch (error) {
    usageError = error instanceof Error ? error.message : 'Data usage upload failed.';
    if (error instanceof ApiError) {
      requestBodyBytes += error.requestBodyBytes;
      responseBodyBytes += error.responseBodyBytes;
    }
  }
  return { requestBodyBytes, responseBodyBytes, locationSucceeded, locationError, usageSucceeded, usageError };
}

export async function getRemoteLatest(settings: TrackingSettings): Promise<unknown> {
  try {
    const result = await getAuthenticatedJson<{ data?: unknown }>(
      settings,
      `/devices/${encodeURIComponent(settings.deviceId)}/locations/latest`
    );
    return result.data ?? result;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404 && error.responseMessage === 'Location not found.') {
      return null;
    }
    throw error;
  }
}

export async function getRemoteHistory(settings: TrackingSettings): Promise<unknown> {
  return getAuthenticatedJson(settings, `/devices/${encodeURIComponent(settings.deviceId)}/locations`);
}

export async function getRemoteUsageSummary(settings: TrackingSettings): Promise<unknown> {
  return getAuthenticatedJson(settings, `/devices/${encodeURIComponent(settings.deviceId)}/data-usage/summary`);
}

export function estimateTransfer(
  requestBodyBytes: number,
  responseBodyBytes: number,
  requestCount = 2
) {
  const uploadBytes = requestBodyBytes + requestCount * ESTIMATED_REQUEST_HEADERS_BYTES;
  const downloadBytes = responseBodyBytes + requestCount * ESTIMATED_RESPONSE_HEADERS_BYTES;
  return { uploadBytes, downloadBytes, totalBytes: uploadBytes + downloadBytes };
}
