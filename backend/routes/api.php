<?php

use App\Http\Controllers\Api\DataUsageController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\LocationController;
use Illuminate\Support\Facades\Route;

Route::post('/devices/register', [DeviceController::class, 'register'])
    ->middleware('throttle:10,1');

Route::middleware(['device.auth', 'throttle:60,1'])->group(function () {
    Route::post('/locations', [LocationController::class, 'store']);
    Route::post('/data-usage', [DataUsageController::class, 'store']);
    Route::get('/devices/{deviceId}/locations/latest', [LocationController::class, 'latest']);
    Route::get('/devices/{deviceId}/locations', [LocationController::class, 'index']);
    Route::get('/devices/{deviceId}/data-usage/summary', [DataUsageController::class, 'summary']);
});
