<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreLocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'updateId' => ['required', 'uuid'],
            'deviceId' => ['required', 'string', 'max:255'],
            'timestamp' => ['required', 'date'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'coordinatePayloadBytes' => ['required', 'integer', 'min:0'],
        ];
    }
}
