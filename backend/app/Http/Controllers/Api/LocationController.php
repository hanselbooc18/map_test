<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLocationRequest;
use App\Models\Device;
use App\Models\IdempotencyKey;
use App\Models\Location;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LocationController extends Controller
{
    public function store(StoreLocationRequest $request): JsonResponse
    {
        $device = $request->user();
        $deviceId = (string) $request->input('deviceId');
        $updateId = (string) $request->input('updateId');
        $idempotencyKey = (string) $request->header('Idempotency-Key', '');

        if ($deviceId !== $device->device_id) {
            return response()->json([
                'message' => 'You are not allowed to submit location data for another device.',
            ], 403);
        }

        if ($idempotencyKey === '') {
            return response()->json([
                'message' => 'The Idempotency-Key header is required.',
            ], 422);
        }

        $requestHash = hash('sha256', $request->getContent());
        $existingLocation = Location::query()
            ->where('device_id', $device->id)
            ->where('update_id', $updateId)
            ->first();

        if ($existingLocation !== null) {
            if (! $this->matchesGpsFix($existingLocation, $request)) {
                return response()->json([
                    'message' => 'This GPS fix ID is already associated with different location data.',
                ], 409);
            }

            $payload = [
                'success' => true,
                'accepted' => true,
                'message' => 'Location was already recorded successfully',
                'data' => $this->serializeLocation($existingLocation),
            ];
            $this->saveIdempotencyResponse($device, 'location', $idempotencyKey, $requestHash, $payload);
            return response()->json($payload, 200);
        }

        $storedKey = IdempotencyKey::query()
            ->where('device_id', $device->id)
            ->where('resource_type', 'location')
            ->where('key_hash', hash('sha256', $idempotencyKey))
            ->first();

        if ($storedKey !== null) {
            if ($storedKey->request_hash !== $requestHash) {
                return response()->json([
                    'message' => 'The provided Idempotency-Key has already been used with different content.',
                ], 409);
            }

            if (($storedKey->response_payload['accepted'] ?? true) !== false) {
                return response()->json($storedKey->response_payload, 200);
            }
        }

        $serverReceivedAt = now();

        return DB::transaction(function () use ($request, $device, $deviceId, $updateId, $idempotencyKey, $requestHash, $serverReceivedAt) {
            Device::query()->whereKey($device->id)->lockForUpdate()->firstOrFail();
            $existingLocation = Location::query()
                ->where('device_id', $device->id)
                ->where('update_id', $updateId)
                ->first();

            if ($existingLocation !== null) {
                if (! $this->matchesGpsFix($existingLocation, $request)) {
                    return response()->json([
                        'message' => 'This GPS fix ID is already associated with different location data.',
                    ], 409);
                }

                $payload = [
                    'success' => true,
                    'accepted' => true,
                    'message' => 'Location recorded successfully',
                    'data' => $this->serializeLocation($existingLocation),
                ];

                $this->saveIdempotencyResponse($device, 'location', $idempotencyKey, $requestHash, $payload);

                return response()->json($payload, 200);
            }

            $gpsFixAt = Carbon::parse($request->input('timestamp'));
            $location = Location::query()->create([
                'device_id' => $device->id,
                'update_id' => $updateId,
                'recorded_at' => $request->input('timestamp'),
                'gps_fix_at' => $gpsFixAt,
                'uploaded_at' => $request->input('uploadedAt'),
                'server_received_at' => $serverReceivedAt,
                'latitude' => $request->input('latitude'),
                'longitude' => $request->input('longitude'),
                'coordinate_payload_bytes' => (int) $request->input('coordinatePayloadBytes'),
                'accuracy' => $request->input('accuracy'),
                'altitude' => $request->input('altitude'),
                'speed' => $request->input('speed'),
                'heading' => $request->input('heading'),
            ]);

            $payload = [
                'success' => true,
                'accepted' => true,
                'message' => 'Location recorded successfully',
                'data' => $this->serializeLocation($location),
            ];

            $this->saveIdempotencyResponse($device, 'location', $idempotencyKey, $requestHash, $payload);

            return response()->json($payload, 201);
        });
    }

    public function latest(Request $request, string $deviceId): JsonResponse
    {
        $device = $request->user();

        if ($deviceId !== $device->device_id) {
            return response()->json([
                'message' => 'You can only access your own location history.',
            ], 403);
        }

        $location = Location::query()
            ->where('device_id', $device->id)
            ->orderByDesc('gps_fix_at')
            ->orderByDesc('recorded_at')
            ->first();

        if (! $location) {
            return response()->json([
                'message' => 'Location not found.',
            ], 404);
        }

        return response()->json([
            'data' => $this->serializeLocation($location),
        ]);
    }

    public function index(Request $request, string $deviceId): JsonResponse
    {
        $device = $request->user();

        if ($deviceId !== $device->device_id) {
            return response()->json([
                'message' => 'You can only access your own location history.',
            ], 403);
        }

        $query = Location::query()
            ->where('device_id', $device->id)
            ->when($request->filled('from'), fn ($query) => $query->where('recorded_at', '>=', Carbon::parse($request->query('from'))->format('Y-m-d H:i:s')))
            ->when($request->filled('to'), fn ($query) => $query->where('recorded_at', '<=', Carbon::parse($request->query('to'))->format('Y-m-d H:i:s')));

        $perPage = min(max((int) $request->query('limit', 25), 1), 100);
        $items = $query->orderByDesc('gps_fix_at')->orderByDesc('recorded_at')->paginate($perPage, ['*'], 'page', max((int) $request->query('page', 1), 1));

        return response()->json([
            'items' => $items->items(),
            'pagination' => [
                'currentPage' => $items->currentPage(),
                'lastPage' => $items->lastPage(),
                'perPage' => $items->perPage(),
                'total' => $items->total(),
            ],
        ]);
    }

    protected function serializeLocation(Location $location): array
    {
        return [
            'id' => $location->id,
            'updateId' => $location->update_id,
            'deviceId' => $location->device->device_id,
            'timestamp' => $location->recorded_at->toIso8601String(),
            'gpsFixAt' => ($location->gps_fix_at ?? $location->recorded_at)->toIso8601String(),
            'uploadedAt' => $location->uploaded_at?->toIso8601String(),
            'serverReceivedAt' => $location->server_received_at?->toIso8601String(),
            'latitude' => $location->latitude,
            'longitude' => $location->longitude,
            'accuracy' => $location->accuracy,
            'altitude' => $location->altitude,
            'speed' => $location->speed,
            'heading' => $location->heading,
            'coordinatePayloadBytes' => $location->coordinate_payload_bytes,
            'createdAt' => $location->created_at?->toIso8601String(),
            'updatedAt' => $location->updated_at?->toIso8601String(),
        ];
    }

    protected function matchesGpsFix(Location $location, StoreLocationRequest $request): bool
    {
        $storedTimestamp = $location->gps_fix_at ?? $location->recorded_at;
        $requestTimestamp = Carbon::parse($request->input('timestamp'));
        $timestampsMatch = $location->gps_fix_at !== null
            ? $storedTimestamp->equalTo($requestTimestamp)
            : abs($storedTimestamp->getTimestamp() - $requestTimestamp->getTimestamp()) <= 1;

        return $timestampsMatch
            && round((float) $location->latitude, 8) === round((float) $request->input('latitude'), 8)
            && round((float) $location->longitude, 8) === round((float) $request->input('longitude'), 8)
            && $this->matchesOptionalMeasurement($location->accuracy, $request->input('accuracy'), 2)
            && $this->matchesOptionalMeasurement($location->altitude, $request->input('altitude'), 2)
            && $this->matchesOptionalMeasurement($location->speed, $request->input('speed'), 2)
            && $this->matchesOptionalMeasurement($location->heading, $request->input('heading'), 2);
    }

    protected function matchesOptionalMeasurement(?float $stored, mixed $submitted, int $precision): bool
    {
        if ($stored === null || $submitted === null) {
            return $stored === null && $submitted === null;
        }

        return round($stored, $precision) === round((float) $submitted, $precision);
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
