export type UsageRecord = {
  created_at: string;
  upload_bytes: number;
  download_bytes: number;
  total_bytes: number;
  status: string;
};

export type UsageSummary<T> = {
  today: number;
  month: number;
  average: number;
  upload: number;
  download: number;
  successful: number;
  failed: number;
  latest: T | null;
  daily: { day: string; bytes: number }[];
};

function localDayKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function summarizeLocations<T extends UsageRecord>(
  rows: T[],
  now = new Date()
): UsageSummary<T> {
  const todayKey = localDayKey(now);
  const monthKey = todayKey.slice(0, 7);
  const rowDay = (row: T) => localDayKey(new Date(row.created_at));
  const todayRows = rows.filter((row) => rowDay(row) === todayKey);
  const monthRows = rows.filter((row) => rowDay(row).slice(0, 7) === monthKey);
  const dailyMap = new Map<string, number>();
  for (const row of rows) {
    const day = rowDay(row);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + row.total_bytes);
  }
  return {
    today: todayRows.reduce((sum, row) => sum + row.total_bytes, 0),
    month: monthRows.reduce((sum, row) => sum + row.total_bytes, 0),
    average: rows.length ? rows.reduce((sum, row) => sum + row.total_bytes, 0) / rows.length : 0,
    upload: rows.reduce((sum, row) => sum + row.upload_bytes, 0),
    download: rows.reduce((sum, row) => sum + row.download_bytes, 0),
    successful: rows.filter((row) => row.status === 'success').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    latest: rows[0] ?? null,
    daily: [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([day, bytes]) => ({ day, bytes })),
  };
}
