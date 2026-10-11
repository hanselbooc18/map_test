<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreDataUsageRequest extends FormRequest
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
            'requestBodyBytes' => ['required', 'integer', 'min:0'],
            'estimatedRequestHeaderBytes' => ['required', 'integer', 'min:0'],
            'responseBodyBytes' => ['required', 'integer', 'min:0'],
            'estimatedResponseHeaderBytes' => ['required', 'integer', 'min:0'],
            'estimatedUploadBytes' => ['nullable', 'integer', 'min:0'],
            'estimatedDownloadBytes' => ['nullable', 'integer', 'min:0'],
            'estimatedTotalBytes' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
