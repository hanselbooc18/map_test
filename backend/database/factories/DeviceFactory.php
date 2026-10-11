<?php

namespace Database\Factories;

use App\Models\Device;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class DeviceFactory extends Factory
{
    protected $model = Device::class;

    public function definition(): array
    {
        return [
            'device_id' => 'device-'.Str::uuid()->toString(),
            'device_name' => fake()->name(),
            'platform' => fake()->randomElement(['android', 'ios', 'web']),
            'token_hash' => bcrypt(Str::random(32)),
            'enrollment_status' => 'active',
        ];
    }
}
