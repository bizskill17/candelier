<?php
// Candelier WordPress plugin: settings are kept outside the plugin folder so updates never remove them.
// The plugin writes them from wp-config.php on activation. This file only loads them.
define('CANDELIER_CONFIG_FILE', dirname(__DIR__, 3) . '/uploads/candelier/config.php');
if (!is_file(CANDELIER_CONFIG_FILE)) {
    http_response_code(503);
    header('Content-Type: application/json');
    exit('{"error":"Candelier is not set up yet. Open the WordPress admin once (Plugins → Candelier) or activate the plugin."}');
}
return require CANDELIER_CONFIG_FILE;
