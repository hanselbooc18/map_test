<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    use HasFactory;

    protected $table = 'locations';

    protected $fillable = [
        'device_id',
        'update_id',
        'recorded_at',
        'latitude',
        'longitude',
        'accuracy',
        'altitude',
        'speed',
        'heading',
        'coordinate_payload_bytes',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
        'latitude' => 'float',
        'longitude' => 'float',
        'accuracy' => 'float',
        'altitude' => 'float',
        'speed' => 'float',
        'heading' => 'float',
    ];

    public function device()
    {
        return $this->belongsTo(Device::class, 'device_id');
    }
}