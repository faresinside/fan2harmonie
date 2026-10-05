<?php

/**
 * Réglages PHP du dossier api/ (public/api/.user.ini), lus par PHP-FPM et LiteSpeed.
 */

declare(strict_types=1);

test('.user.ini de public/api : réglages PHP du script de contact', function (): void {
    $ini = parse_ini_file(RACINE . '/public/api/.user.ini', false, INI_SCANNER_RAW);
    vrai(is_array($ini), '.user.ini lisible');
    egal([
        'display_errors' => 'Off',
        'log_errors' => 'On',
        'expose_php' => 'Off',
        'file_uploads' => 'Off',
        'post_max_size' => '64K',
        'max_input_vars' => '50',
        'max_execution_time' => '10',
        'memory_limit' => '32M',
    ], $ini);
});
