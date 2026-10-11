<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_usage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained('devices')->cascadeOnDelete();
            $table->uuid('update_id');
            $table->dateTime('recorded_at');
            $table->unsignedBigInteger('request_body_bytes');
            $table->unsignedBigInteger('estimated_request_header_bytes');
            $table->unsignedBigInteger('response_body_bytes');
            $table->unsignedBigInteger('estimated_response_header_bytes');
            $table->unsignedBigInteger('estimated_upload_bytes');
            $table->unsignedBigInteger('estimated_download_bytes');
            $table->unsignedBigInteger('estimated_total_bytes');
            $table->timestamps();

            $table->unique(['device_id', 'update_id']);
            $table->index(['device_id', 'recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_usage');
    }
};
