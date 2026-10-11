<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RegisterDeviceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'deviceId' => ['required', 'string', 'max:255'],
            'deviceName' => ['required', 'string', 'max:255'],
            'platform' => ['required', 'string', 'in:android,ios,web'],
            'enrollmentCode' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'deviceId.required' => 'The device identifier is required.',
            'deviceName.required' => 'The device name is required.',
            'platform.in' => 'The platform must be one of: android, ios, web.',
        ];
    }
}
