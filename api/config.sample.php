<?php
// Copy this file to config.php and fill in your Hostinger database details.
// hPanel → Databases → Management shows the database name, user and host.
// config.php is NOT committed to GitHub (see .gitignore).

return [
    'db' => [
        'dsn'      => 'mysql:host=localhost;dbname=u123456789_candelier;charset=utf8mb4',
        'user'     => 'u123456789_candelier',
        'password' => 'CHANGE_ME',
    ],
    'timezone' => 'Asia/Kolkata',
    // Folder that holds uploads/items/... (order item photos). Default: the site root, one level above api/.
    // 'upload_root' => '/home/u123456789/domains/yourdomain.com/public_html',
    // Show detailed error messages. Keep false on the live site.
    'debug' => false,
];
