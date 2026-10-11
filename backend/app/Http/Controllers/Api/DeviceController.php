<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterDeviceRequest;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DeviceController extends Controller
{
    public function register(RegisterDeviceRequest $request): JsonResponse
    {
        $requiredCode = env('DEVICEPULSE_ENROLLMENT_CODE');

        if (filled($requiredCode) && (! $request->filled('enrollmentCode') || $request->input('enrollmentCode') !== $requiredCode)) {
            return response()->json([
                'message' => 'A valid enrollment code is required to register this device.',
            ], 403);
        }

        $deviceId = trim((string) $request->input('deviceId'));
        $deviceName = trim((string) $request->input('deviceName'));
        $platform = strtolower((string) $request->input('platform'));

        $device = Device::query()->firstOrNew(['device_id' => $deviceId]);

        if ($device->exists && $device->deactivated_at !== null) {
            return response()->json([
                'message' => 'This device has been deactivated and cannot be re-enrolled.',
            ], 403);
        }

        $token = Str::random(64);

        $device->fill([
            'device_id' => $deviceId,
            'device_name' => $deviceName,
            'platform' => $platform,
            'enrollment_status' => 'active',
            'token_hash' => Hash::make($token),
        ]);

        $device->save();

        return response()->json([
            'accessToken' => $token,
        ], 201);
    }
}
