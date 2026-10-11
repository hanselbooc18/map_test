<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthenticateDevice
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->bearerToken();

        if (! is_string($token) || $token === '') {
            return response()->json([
                'message' => 'Unauthenticated. A bearer token is required.',
            ], 401);
        }

        $device = Device::query()
            ->whereNotNull('token_hash')
            ->get()
            ->first(function (Device $device) use ($token) {
                return Hash::check($token, $device->token_hash);
            });

        if (! $device || $device->enrollment_status !== 'active' || $device->deactivated_at !== null) {
            return response()->json([
                'message' => 'Invalid or revoked device token.',
            ], 401);
        }

        $request->setUserResolver(fn () => $device);
        $request->merge(['device' => $device]);

        return $next($request);
    }
}
