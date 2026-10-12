<?php

namespace Tests\Feature;

use App\Models\DataUsage;
use App\Models\Device;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DevicePulseApiTest extends TestCase
{
    use RefreshDatabase;

    protected function registerDevice(array $overrides = []): array
    {
        $payload = [
            'deviceId' => 'device-123',
            'deviceName' => 'Android Phone',
            'platform' => 'android',
            'enrollmentCode' => env('DEVICEPULSE_ENROLLMENT_CODE'),
        ];

        $response = $this->postJson('/api/devices/register', array_merge($payload, $overrides));

        return [
            'response' => $response,
            'token' => $response->json('accessToken'),
        ];
    }

    public function test_device_registration_returns_access_token(): void
    {
        $result = $this->registerDevice();

        $result['response']
            ->assertStatus(201)
            ->assertJsonStructure(['accessToken']);

        $this->assertDatabaseHas('devices', [
            'device_id' => 'device-123',
            'device_name' => 'Android Phone',
        ]);
        $this->assertNotNull($result['token']);
    }

    public function test_device_registration_rejects_invalid_enrollment_code(): void
    {
        $response = $this->postJson('/api/devices/register', [
            'deviceId' => 'device-456',
            'deviceName' => 'Tablet',
            'platform' => 'ios',
            'enrollmentCode' => 'wrong-code',
        ]);

        $response->assertStatus(403)
            ->assertJsonFragment(['A valid enrollment code is required to register this device.']);
    }

    public function test_location_upload_requires_bearer_token_and_idempotency_key(): void
    {
        $this->postJson('/api/locations', [])
            ->assertStatus(401);

        $device = Device::factory()->create([
            'device_id' => 'device-200',
            'enrollment_status' => 'active',
            'token_hash' => Hash::make('token-200'),
        ]);

        $this->withHeader('Authorization', 'Bearer token-200')
            ->postJson('/api/locations', [
                'updateId' => '9d0d5d13-c89e-4d67-a9a6-95e0b0dad7ce',
                'deviceId' => $device->device_id,
                'timestamp' => '2026-10-11T08:00:00Z',
                'latitude' => 10.123456,
                'longitude' => 124.123456,
                'coordinatePayloadBytes' => 150,
            ])
            ->assertStatus(422);
    }

    public function test_location_upload_is_idempotent_for_duplicate_requests(): void
    {
        $device = Device::factory()->create([
            'device_id' => 'device-301',
            'enrollment_status' => 'active',
            'token_hash' => Hash::make('token-301'),
        ]);

        $payload = [
            'updateId' => '673d9d13-0d23-4f3b-9a46-9b9c497b62d8',
            'deviceId' => 'device-301',
            'timestamp' => '2026-10-11T08:00:00Z',
            'latitude' => 10.123456,
            'longitude' => 124.123456,
            'coordinatePayloadBytes' => 150,
            'accuracy' => 8.5,
            'altitude' => 12.25,
            'speed' => 1.4,
            'heading' => 270,
        ];

        $this->withHeader('Authorization', 'Bearer token-301')
            ->withHeader('Idempotency-Key', '673d9d13-0d23-4f3b-9a46-9b9c497b62d8')
            ->postJson('/api/locations', $payload)
            ->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.accuracy', 8.5)
            ->assertJsonPath('data.altitude', 12.25)
            ->assertJsonPath('data.speed', 1.4)
            ->assertJsonPath('data.heading', 270);

        $this->withHeader('Authorization', 'Bearer token-301')
            ->withHeader('Idempotency-Key', '673d9d13-0d23-4f3b-9a46-9b9c497b62d8')
            ->postJson('/api/locations', $payload)
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertSame(1, Location::query()->where('device_id', $device->id)->count());
        $this->assertDatabaseHas('locations', [
            'device_id' => $device->id,
            'update_id' => $payload['updateId'],
            'accuracy' => 8.5,
            'altitude' => 12.25,
            'speed' => 1.4,
            'heading' => 270,
        ]);
    }

    public function test_device_cannot_submit_location_for_another_device(): void
    {
        $owner = Device::factory()->create([
            'device_id' => 'device-owner',
            'enrollment_status' => 'active',
            'token_hash' => Hash::make('owner-token'),
        ]);

        $this->withHeader('Authorization', 'Bearer owner-token')
            ->withHeader('Idempotency-Key', 'device-foreign')
            ->postJson('/api/locations', [
                'updateId' => '925f2d9a-3b6e-4779-b14d-4eb97ee8ea24',
                'deviceId' => 'device-other',
                'timestamp' => '2026-10-11T08:00:00Z',
                'latitude' => 1,
                'longitude' => 2,
                'coordinatePayloadBytes' => 10,
            ])
            ->assertStatus(403);

        $this->assertSame(0, Location::query()->where('device_id', $owner->id)->count());
    }

    public function test_data_usage_calculates_totals_and_rejects_negative_values(): void
    {
        $device = Device::factory()->create([
            'device_id' => 'device-usage',
            'enrollment_status' => 'active',
            'token_hash' => Hash::make('usage-token'),
        ]);

        $payload = [
            'updateId' => 'ec328039-7f11-4b59-a225-4d4d422be79c',
            'deviceId' => 'device-usage',
            'timestamp' => '2026-10-11T08:00:00Z',
            'requestBodyBytes' => 120,
            'estimatedRequestHeaderBytes' => 60,
            'responseBodyBytes' => 400,
            'estimatedResponseHeaderBytes' => 80,
            'estimatedUploadBytes' => 180,
            'estimatedDownloadBytes' => 480,
            'estimatedTotalBytes' => 660,
        ];

        $this->withHeader('Authorization', 'Bearer usage-token')
            ->withHeader('Idempotency-Key', 'ec328039-7f11-4b59-a225-4d4d422be79c:usage')
            ->postJson('/api/data-usage', $payload)
            ->assertStatus(201)
            ->assertJsonPath('data.estimatedTotalBytes', 660);

        $this->withHeader('Authorization', 'Bearer usage-token')
            ->withHeader('Idempotency-Key', 'ec328039-7f11-4b59-a225-4d4d422be79c:usage')
            ->postJson('/api/data-usage', $payload)
            ->assertStatus(200);

        $this->assertSame(1, DataUsage::query()->where('device_id', $device->id)->count());

        $this->withHeader('Authorization', 'Bearer usage-token')
            ->withHeader('Idempotency-Key', 'bad:usage')
            ->postJson('/api/data-usage', [
                'updateId' => 'e828ea90-7680-4a38-8891-4f088d7d6a4d',
                'deviceId' => 'device-usage',
                'timestamp' => '2026-10-11T08:00:00Z',
                'requestBodyBytes' => -1,
                'estimatedRequestHeaderBytes' => 20,
                'responseBodyBytes' => 0,
                'estimatedResponseHeaderBytes' => 0,
            ])
            ->assertStatus(422);
    }

    public function test_latest_location_and_history_queries_are_scoped_to_the_authenticated_device(): void
    {
        $device = Device::factory()->create([
            'device_id' => 'device-history',
            'enrollment_status' => 'active',
            'token_hash' => Hash::make('history-token'),
        ]);

        Location::query()->insert([
            ['device_id' => $device->id, 'update_id' => '0a0911d3-5e7c-4ed0-b17c-5e8d4ddf7437', 'recorded_at' => '2026-10-10 08:00:00', 'latitude' => 10.1, 'longitude' => 124.1, 'coordinate_payload_bytes' => 50, 'created_at' => now(), 'updated_at' => now()],
            ['device_id' => $device->id, 'update_id' => '6e2fc225-6711-49dd-bd4f-868ef56d2ee0', 'recorded_at' => '2026-10-11 08:30:00', 'latitude' => 11.1, 'longitude' => 125.1, 'coordinate_payload_bytes' => 60, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->withHeader('Authorization', 'Bearer history-token')
            ->getJson('/api/devices/device-history/locations/latest')
            ->assertStatus(200)
            ->assertJsonPath('data.latitude', 11.1);

        $this->withHeader('Authorization', 'Bearer history-token')
            ->getJson('/api/devices/device-history/locations?from=2026-10-10T00:00:00Z&to=2026-10-10T23:59:59Z')
            ->assertStatus(200)
            ->assertJsonCount(1, 'items');

        $this->withHeader('Authorization', 'Bearer history-token')
            ->getJson('/api/devices/device-other/locations/latest')
            ->assertStatus(403);
    }

    public function test_usage_summary_returns_daily_and_monthly_totals(): void
    {
        $device = Device::factory()->create([
            'device_id' => 'device-summary',
            'enrollment_status' => 'active',
            'token_hash' => Hash::make('summary-token'),
        ]);

        DataUsage::query()->insert([
            ['device_id' => $device->id, 'update_id' => '11111111-1111-4111-8111-111111111111', 'recorded_at' => '2026-10-01 09:00:00', 'request_body_bytes' => 100, 'estimated_request_header_bytes' => 20, 'response_body_bytes' => 200, 'estimated_response_header_bytes' => 10, 'estimated_upload_bytes' => 120, 'estimated_download_bytes' => 210, 'estimated_total_bytes' => 330, 'created_at' => now(), 'updated_at' => now()],
            ['device_id' => $device->id, 'update_id' => '22222222-2222-4222-8222-222222222222', 'recorded_at' => '2026-10-01 18:00:00', 'request_body_bytes' => 150, 'estimated_request_header_bytes' => 10, 'response_body_bytes' => 100, 'estimated_response_header_bytes' => 10, 'estimated_upload_bytes' => 160, 'estimated_download_bytes' => 110, 'estimated_total_bytes' => 270, 'created_at' => now(), 'updated_at' => now()],
            ['device_id' => $device->id, 'update_id' => '33333333-3333-4333-8333-333333333333', 'recorded_at' => '2026-10-15 12:00:00', 'request_body_bytes' => 50, 'estimated_request_header_bytes' => 10, 'response_body_bytes' => 75, 'estimated_response_header_bytes' => 25, 'estimated_upload_bytes' => 60, 'estimated_download_bytes' => 100, 'estimated_total_bytes' => 160, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->withHeader('Authorization', 'Bearer summary-token')
            ->getJson('/api/devices/device-summary/data-usage/summary')
            ->assertStatus(200)
            ->assertJsonPath('daily.0.estimatedTotalBytes', 600)
            ->assertJsonPath('monthly.0.month', '2026-10');
    }
}
