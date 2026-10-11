<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class Device extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $table = 'devices';

    protected $fillable = [
        'device_id',
        'device_name',
        'platform',
        'token_hash',
        'enrollment_status',
        'deactivated_at',
    ];

    protected $hidden = [
        'token_hash',
        'remember_token',
    ];

    protected $casts = [
        'deactivated_at' => 'datetime',
    ];

    public function locations()
    {
        return $this->hasMany(Location::class, 'device_id');
    }

    public function dataUsages()
    {
        return $this->hasMany(DataUsage::class, 'device_id');
    }
}