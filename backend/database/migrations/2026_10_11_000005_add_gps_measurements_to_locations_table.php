<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->decimal('accuracy', 10, 2)->nullable()->after('longitude');
            $table->decimal('altitude', 10, 2)->nullable()->after('accuracy');
            $table->decimal('speed', 10, 2)->nullable()->after('altitude');
            $table->decimal('heading', 7, 2)->nullable()->after('speed');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn(['accuracy', 'altitude', 'speed', 'heading']);
        });
    }
};
