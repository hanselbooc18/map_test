<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDataUsageRequest;
use App\Models\DataUsage;
use App\Models\IdempotencyKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DataUsageController extends Controller
{
    public function store(StoreDataUsageRequest $request): JsonResponse
    {
        $device = $request->user();
        $deviceId = (string) $request->input('deviceId');
        $updateId = (string) $request->input('updateId');
        $idempotencyKey = (string) $request->header('Idempotency-Key', '');

        if ($deviceId !== $device->device_id) {
            return response()->json([
                'message' => 'You are not allowed to submit data usage for another device.',
            ], 403);
        }

        if ($idempotencyKey === '' || ! preg_match('/^'.preg_quote($updateId, '/').':usage$/', $idempotencyKey)) {
            return response()->json([
                'message' => 'The Idempotency-Key header must match the format <updateId>:usage.',
            ], 422);
        }

        $estimatedUpload = (int) $request->input('requestBodyBytes') + (int) $request->input('estimatedRequestHeaderBytes');
        $estimatedDownload = (int) $request->input('responseBodyBytes') + (int) $request->input('estimatedResponseHeaderBytes');
        $estimatedTotal = $estimatedUpload + $estimatedDownload;

        $providedUpload = (int) $request->input('estimatedUploadBytes', $estimatedUpload);
        $providedDownload = (int) $request->input('estimatedDownloadBytes', $estimatedDownload);
        $providedTotal = (int) $request->input('estimatedTotalBytes', $estimatedTotal);

        if ($providedUpload !== $estimatedUpload || $providedDownload !== $estimatedDownload || $providedTotal !== $estimatedTotal) {
            return response()->json([
                'message' => 'Estimated byte totals are inconsistent with the required formula.',
                'details' => [
                    'estimatedUpload' => $estimatedUpload,
                    'estimatedDownload' => $estimatedDownload,
                    'estimatedTotal' => $estimatedTotal,
                ],
            ], 422);
        }

        if ($estimatedUpload < 0 || $estimatedDownload < 0 || $estimatedTotal < 0) {
            return response()->json([
                'message' => 'Byte counts cannot be negative.',
            ], 422);
        }

        $requestHash = hash('sha256', $request->getContent());
        $storedKey = IdempotencyKey::query()
            ->where('device_id', $device->id)
            ->where('resource_type', 'data-usage')
            ->where('key_hash', hash('sha256', $idempotencyKey))
            ->first();

        if ($storedKey !== null) {
            if ($storedKey->request_hash !== $requestHash) {
                return response()->json([
                    'message' => 'The provided Idempotency-Key has already been used with different data.',
                ], 409);
            }

            return response()->json($storedKey->response_payload, 200);
        }

        return DB::transaction(function () use ($request, $device, $updateId, $idempotencyKey, $requestHash, $estimatedUpload, $estimatedDownload, $estimatedTotal) {
            $existingUsage = DataUsage::query()
                ->where('device_id', $device->id)
                ->where('update_id', $updateId)
                ->first();

            if ($existingUsage !== null) {
                $payload = [
                    'success' => true,
                    'message' => 'Data usage recorded successfully',
                    'data' => $this->serializeUsage($existingUsage),
                ];

                $this->saveIdempotencyResponse($device, 'data-usage', $idempotencyKey, $requestHash, $payload);

                return response()->json($payload, 200);
            }

            $usage = DataUsage::query()->create([
                'device_id' => $device->id,
                'update_id' => $updateId,
                'recorded_at' => $request->input('timestamp'),
                'request_body_bytes' => (int) $request->input('requestBodyBytes'),
                'estimated_request_header_bytes' => (int) $request->input('estimatedRequestHeaderBytes'),
                'response_body_bytes' => (int) $request->input('responseBodyBytes'),
                'estimated_response_header_bytes' => (int) $request->input('estimatedResponseHeaderBytes'),
                'estimated_upload_bytes' => $estimatedUpload,
                'estimated_download_bytes' => $estimatedDownload,
                'estimated_total_bytes' => $estimatedTotal,
            ]);

            $payload = [
                'success' => true,
                'message' => 'Data usage recorded successfully',
                'data' => $this->serializeUsage($usage),
            ];

            $this->saveIdempotencyResponse($device, 'data-usage', $idempotencyKey, $requestHash, $payload);

            return response()->json($payload, 201);
        });
    }

    public function summary(Request $request, string $deviceId): JsonResponse
    {
        $device = $request->user();

        if ($deviceId !== $device->device_id) {
            return response()->json([
                'message' => 'You can only access your own data usage summary.',
            ], 403);
        }

        $dayExpression = 'DATE(recorded_at)';
        $monthExpression = DB::getDriverName() === 'sqlite'
            ? 'strftime("%Y-%m", recorded_at)'
            : 'DATE_FORMAT(recorded_at, "%Y-%m")';

        $daily = DataUsage::query()
            ->where('device_id', $device->id)
            ->selectRaw($dayExpression.' as day')
            ->selectRaw('SUM(estimated_upload_bytes) as estimated_upload_bytes')
            ->selectRaw('SUM(estimated_download_bytes) as estimated_download_bytes')
            ->selectRaw('SUM(estimated_total_bytes) as estimated_total_bytes')
            ->groupByRaw($dayExpression)
            ->orderBy('day')
            ->get()
            ->map(function ($row) {
                return [
                    'day' => $row->day,
                    'estimatedUploadBytes' => (int) ($row->estimated_upload_bytes ?? 0),
                    'estimatedDownloadBytes' => (int) ($row->estimated_download_bytes ?? 0),
                    'estimatedTotalBytes' => (int) ($row->estimated_total_bytes ?? 0),
                ];
            })
            ->all();

        $monthly = DataUsage::query()
            ->where('device_id', $device->id)
            ->selectRaw($monthExpression.' as month')
            ->selectRaw('SUM(estimated_upload_bytes) as estimated_upload_bytes')
            ->selectRaw('SUM(estimated_download_bytes) as estimated_download_bytes')
            ->selectRaw('SUM(estimated_total_bytes) as estimated_total_bytes')
            ->groupByRaw($monthExpression)
            ->orderBy('month')
            ->get()
            ->map(function ($row) {
                return [
                    'month' => $row->month,
                    'estimatedUploadBytes' => (int) ($row->estimated_upload_bytes ?? 0),
                    'estimatedDownloadBytes' => (int) ($row->estimated_download_bytes ?? 0),
                    'estimatedTotalBytes' => (int) ($row->estimated_total_bytes ?? 0),
                ];
            })
            ->all();

        return response()->json([
            'deviceId' => $device->device_id,
            'daily' => $daily,
            'monthly' => $monthly,
        ]);
    }

    protected function serializeUsage(DataUsage $usage): array
    {
        return [
            'id' => $usage->id,
            'updateId' => $usage->update_id,
            'deviceId' => $usage->device->device_id,
            'timestamp' => $usage->recorded_at->toIso8601String(),
            'requestBodyBytes' => $usage->request_body_bytes,
            'estimatedRequestHeaderBytes' => $usage->estimated_request_header_bytes,
            'responseBodyBytes' => $usage->response_body_bytes,
            'estimatedResponseHeaderBytes' => $usage->estimated_response_header_bytes,
            'estimatedUploadBytes' => $usage->estimated_upload_bytes,
            'estimatedDownloadBytes' => $usage->estimated_download_bytes,
            'estimatedTotalBytes' => $usage->estimated_total_bytes,
        ];
    }

    protected function saveIdempotencyResponse($device, string $resourceType, string $idempotencyKey, string $requestHash, array $payload): void
    {
        IdempotencyKey::query()->updateOrCreate(
            [
                'device_id' => $device->id,
                'resource_type' => $resourceType,
                'key_hash' => hash('sha256', $idempotencyKey),
            ],
            [
                'request_hash' => $requestHash,
                'response_payload' => $payload,
            ]
        );
    }
}
