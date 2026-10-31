<?php
// Runs when the plugin is deleted in WordPress. Data is kept unless the admin ticked
// "Delete all Candelier data" on the Candelier admin page.
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
if ((int) get_option('candelier_delete_on_uninstall', 0) === 1) {
    global $wpdb;
    // Tables and views the app creates: read from its own schema and update code.
    $names = [];
    $views = [];
    $sources = [__DIR__ . '/database/schema.sql'];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__ . '/api', FilesystemIterator::SKIP_DOTS)) as $f) {
        if (substr($f->getFilename(), -4) === '.php') {
            $sources[] = $f->getPathname();
        }
    }
    foreach ($sources as $src) {
        $text = (string) file_get_contents($src);
        preg_match_all('/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z0-9_]+)`?/i', $text, $m);
        $names = array_merge($names, $m[1]);
        preg_match_all('/(?:RENAME\s+TABLE\s+`?[a-z0-9_]+`?|,)\s*`?[a-z0-9_]+`?\s+TO\s+`?([a-z0-9_]+)`?/i', $text, $m);
        $names = array_merge($names, $m[1]);
        preg_match_all('/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+`?([a-z0-9_]+)`?/i', $text, $m);
        $views = array_merge($views, $m[1]);
    }
    $existing = $wpdb->get_col('SHOW TABLES');
    $safe = fn ($n) => in_array($n, $existing, true) && strpos($n, $wpdb->prefix) !== 0;
    foreach (array_unique($views) as $v) {
        if ($safe($v)) {
            $wpdb->query("DROP VIEW IF EXISTS `$v`");
        }
    }
    $wpdb->query('SET FOREIGN_KEY_CHECKS=0');
    foreach (array_unique($names) as $t) {
        if ($safe($t) && strpos($t, 'backup_') !== 0) {
            $wpdb->query("DROP TABLE IF EXISTS `$t`");
        }
    }
    $wpdb->query('SET FOREIGN_KEY_CHECKS=1');
    $up = wp_upload_dir(null, false);
    $dir = $up['basedir'] . '/candelier';
    if (is_dir($dir)) {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($dir);
    }
}
delete_option('candelier_setup_version');
delete_option('candelier_delete_on_uninstall');
