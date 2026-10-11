<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IdempotencyKey extends Model
{
    protected $table = 'idempotency_keys';

    protected $fillable = [
        'device_id',
        'resource_type',
        'key_hash',
        'request_hash',
        'response_payload',
    ];

    protected $casts = [
        'response_payload' => 'array',
    ];

    public function device()
    {
        return $this->belongsTo(Device::class, 'device_id');
    }
}
