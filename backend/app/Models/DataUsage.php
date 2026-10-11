<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DataUsage extends Model
{
    use HasFactory;

    protected $table = 'data_usage';

    protected $fillable = [
        'device_id',
        'update_id',
        'recorded_at',
        'request_body_bytes',
        'estimated_request_header_bytes',
        'response_body_bytes',
        'estimated_response_header_bytes',
        'estimated_upload_bytes',
        'estimated_download_bytes',
        'estimated_total_bytes',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
    ];

    public function device()
    {
        return $this->belongsTo(Device::class, 'device_id');
    }
}