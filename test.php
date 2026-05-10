<?php
require __DIR__ . '/../../constants.php';
require __DIR__ . '/../../lib/Minz/Extension.php';
require __DIR__ . '/extension.php';

// mock Minz_Error
class Minz_Error {
    public static function error($code) {
        echo "Error: $code\n";
    }
}

// We need to bypass error about missing configuration? Let's see.
$ext = new ViewLGExtension();
$ext->serveProxiedImage("https://substack.com/img/avatars/default-light.png");
