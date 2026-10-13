<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dateTime('gps_fix_at', 3)->nullable()->index();
            $table->dateTime('uploaded_at', 3)->nullable();
            $table->dateTime('server_received_at', 3)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropIndex(['gps_fix_at']);
            $table->dropColumn(['gps_fix_at', 'uploaded_at', 'server_received_at']);
        });
    }
};
