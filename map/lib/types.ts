export type UpdateStatus = 'pending' | 'success' | 'failed';

export type LocationUpdate = {
  id: string;
  device_id: string;
  fix_key: string | null;
  created_at: string;
  uploaded_at: string | null;
  server_received_at: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  coordinate_bytes: number;
  request_body_bytes: number;
  response_body_bytes: number;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  status: UpdateStatus;
  error: string | null;
  server_saved: number;
};

export type TrackingSettings = {
  deviceId: string;
  deviceName: string;
  enabled: boolean;
  intervalSeconds: number;
};

export type UsageTotals = {
  today: number;
  month: number;
  average: number;
  upload: number;
  download: number;
  successful: number;
  failed: number;
  latest: LocationUpdate | null;
  daily: { day: string; bytes: number }[];
};
