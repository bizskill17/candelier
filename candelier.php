<?php
/**
 * Plugin Name:       Candelier Management System
 * Description:       Orders, BOQ, stores, production, dispatch, CRM, enquiries and WhatsApp campaigns. Opens at yoursite.com/candelier on its own full-screen page, independent of the theme.
 * Version:           1.1.4
 * Requires at least: 6.0
 * Requires PHP:      8.1
 * Author:            Bizskill
 * License:           Proprietary
 * Text Domain:       candelier
 */

if (!defined('ABSPATH')) {
    exit;
}

const CANDELIER_VERSION = '1.1.4';
const CANDELIER_SLUG    = 'candelier';   // the app opens at /candelier
define('CANDELIER_FILE', __FILE__);
define('CANDELIER_DIR', plugin_dir_path(__FILE__));

// ---------------------------------------------------------------------------
// Database connection details, taken from wp-config.php
// ---------------------------------------------------------------------------

/** DB_HOST can be "host", "host:port", "host:/path/to.sock" or "[ipv6]:port". */
function candelier_db_host(): array
{
    $host = (string) DB_HOST;
    $port = null;
    $socket = null;
    if (preg_match('/^(.*?):(\/.+)$/', $host, $m)) {
        $host = $m[1] !== '' ? $m[1] : 'localhost';
        $socket = $m[2];
    } elseif (preg_match('/^\[(.+)\](?::(\d+))?$/', $host, $m)) {
        $host = $m[1];
        $port = isset($m[2]) ? (int) $m[2] : null;
    } elseif (substr_count($host, ':') === 1) {
        [$host, $p] = explode(':', $host);
        $port = (int) $p;
    }
    return ['host' => $host, 'port' => $port, 'socket' => $socket];
}

function candelier_db_dsn(): string
{
    $h = candelier_db_host();
    $where = $h['socket'] ? 'unix_socket=' . $h['socket'] : 'host=' . $h['host'] . ($h['port'] ? ';port=' . $h['port'] : '');
    return 'mysql:' . $where . ';dbname=' . DB_NAME . ';charset=utf8mb4';
}

/**
 * The real settings file lives in wp-content/uploads/candelier/config.php, outside the plugin folder, so
 * updates (WordPress or Deployer for Git, which replace the whole folder) never remove it. The plugin's
 * api/config.php is a small fixed file that loads it.
 */
function candelier_config_path(): string
{
    return candelier_config()['upload_root'] . '/config.php';
}

/** Settings the app reads (via api/config.php). */
function candelier_config(): array
{
    $up = wp_upload_dir(null, false);
    $tz = wp_timezone_string();
    return [
        'db' => [
            'dsn'      => candelier_db_dsn(),
            'user'     => DB_USER,
            'password' => DB_PASSWORD,
        ],
        'timezone'    => preg_match('#^[A-Za-z]+/[A-Za-z_/+-]+$#', $tz) ? $tz : 'Asia/Kolkata',
        'debug'       => false,
        'upload_root' => $up['basedir'] . '/' . CANDELIER_SLUG,
        'files_url'   => set_url_scheme($up['baseurl']) . '/' . CANDELIER_SLUG . '/',
        'api_url'     => plugins_url('api/index.php', CANDELIER_FILE),
        'app_url'     => home_url('/' . CANDELIER_SLUG . '/'),
    ];
}

/** Writes the settings file when it is missing or out of date. */
function candelier_ensure_config(): bool
{
    $file = candelier_config_path();
    $dir = dirname($file);
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
    }
    if (!is_file($dir . '/.htaccess')) {
        file_put_contents($dir . '/.htaccess', "<Files \"config.php\">\n  Require all denied\n</Files>\n");
    }
    $body = "<?php\n// Written automatically by the Candelier plugin from wp-config.php. Do not edit: changes are overwritten.\n"
          . 'return ' . var_export(candelier_config(), true) . ";\n";
    if (is_file($file) && file_get_contents($file) === $body) {
        return true;
    }
    $ok = file_put_contents($file, $body, LOCK_EX) !== false;
    if ($ok) {
        @chmod($file, 0640);
    }
    return $ok;
}

/** Folder for photos, drawings and WhatsApp images: wp-content/uploads/candelier/uploads/... */
function candelier_ensure_uploads(): void
{
    $root = candelier_config()['upload_root'] . '/uploads';
    if (!is_dir($root)) {
        wp_mkdir_p($root);
    }
    $rules = CANDELIER_DIR . 'uploads.htaccess';
    if (is_file($rules) && !is_file($root . '/.htaccess')) {
        copy($rules, $root . '/.htaccess');
    }
    if (!is_file($root . '/index.html')) {
        file_put_contents($root . '/index.html', '');
    }
}

/** Creates the app's tables the first time. Later changes are applied by the app itself. */
function candelier_install_schema(): void
{
    global $wpdb;
    if ($wpdb->get_var("SHOW TABLES LIKE 'users'") === 'users') {
        return;
    }
    $sql = file_get_contents(CANDELIER_DIR . 'database/schema.sql');
    $h = candelier_db_host();
    $db = mysqli_init();
    if (!$db->real_connect($h['host'], DB_USER, DB_PASSWORD, DB_NAME, $h['port'] ?: null, $h['socket'] ?: null)) {
        throw new RuntimeException('Could not connect to the database to create the Candelier tables.');
    }
    $db->set_charset('utf8mb4');
    if (!$db->multi_query($sql)) {
        throw new RuntimeException('Creating the Candelier tables failed: ' . $db->error);
    }
    do {
        if ($r = $db->store_result()) {
            $r->free();
        }
        if ($db->errno) {
            throw new RuntimeException('Creating the Candelier tables failed: ' . $db->error);
        }
    } while ($db->more_results() && $db->next_result());
    if ($db->errno) {
        throw new RuntimeException('Creating the Candelier tables failed: ' . $db->error);
    }
    $db->close();
}

function candelier_ensure_setup(): void
{
    if (get_option('candelier_setup_version') === CANDELIER_VERSION && is_file(candelier_config_path())) {
        return;
    }
    candelier_ensure_config();
    candelier_ensure_uploads();
    candelier_install_schema();
    update_option('candelier_setup_version', CANDELIER_VERSION, false);
}

// ---------------------------------------------------------------------------
// WordPress Pages: one per app screen (Pages → Candelier → section → screen), for menus and links.
// Each opens the app on its theme-free page; the pages hold no content of their own.
// ---------------------------------------------------------------------------

function candelier_app_url(string $path): string
{
    return home_url('/' . CANDELIER_SLUG . ($path === '/' ? '/' : $path));
}

function candelier_page(string $key, string $title, int $parent, int $order, string $path, string $slug = ''): int
{
    $found = get_posts(['post_type' => 'page', 'post_status' => ['publish', 'draft', 'private', 'trash'], 'meta_key' => '_candelier_key', 'meta_value' => $key, 'numberposts' => 1, 'fields' => 'ids']);
    $data = [
        'post_type'    => 'page',
        'post_status'  => 'publish',
        'post_title'   => $title,
        'post_parent'  => $parent,
        'menu_order'   => $order,
        'comment_status' => 'closed',
        'ping_status'  => 'closed',
        'post_content' => '<!-- wp:paragraph --><p>This page opens the Candelier app (' . esc_html($path) . '). It is created by the Candelier plugin; its content is not used.</p><!-- /wp:paragraph -->',
    ];
    if ($found) {
        $data['ID'] = $found[0];
        $id = wp_update_post($data);
    } else {
        $data['post_name'] = $slug !== '' ? $slug : sanitize_title($title);
        $id = wp_insert_post($data);
    }
    if (!$id || is_wp_error($id)) {
        return 0;
    }
    update_post_meta($id, '_candelier_key', $key);
    update_post_meta($id, '_candelier_path', $path);
    return (int) $id;
}

/** Creates or updates the pages from app/pages.json; screens that no longer exist go to the bin. */
function candelier_sync_pages(): void
{
    $file = CANDELIER_DIR . 'app/pages.json';
    $screens = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
    if (!is_array($screens)) {
        return;
    }
    $keep = [];
    // Own slug so WordPress's page addresses (/candelier-app/...) never overlap the app's (/candelier/...).
    $root = candelier_page('root', 'Candelier', 0, 0, '/', 'candelier-app');
    $keep[] = $root;
    $sections = [];
    $order = 0;
    foreach ($screens as $sc) {
        $order++;
        if (($sc['path'] ?? '') === '/') {
            $keep[] = candelier_page('screen:/', $sc['label'], $root, $order, '/');
            continue;
        }
        $section = (string) ($sc['section'] ?? '');
        $parent = $root;
        if ($section !== '') {
            if (!isset($sections[$section])) {
                // A section page opens its first screen.
                $sections[$section] = candelier_page('section:' . $section, $section, $root, $order, $sc['path']);
                $keep[] = $sections[$section];
            }
            $parent = $sections[$section];
        }
        $keep[] = candelier_page('screen:' . $sc['path'], $sc['label'], $parent, $order, $sc['path']);
    }
    $all = get_posts(['post_type' => 'page', 'post_status' => ['publish', 'draft', 'private'], 'meta_key' => '_candelier_key', 'numberposts' => -1, 'fields' => 'ids']);
    foreach (array_diff($all, $keep) as $old) {
        wp_trash_post($old);
    }
    // Page address as WordPress would build it → app address, so an old or typed page link still opens the app.
    $map = [];
    foreach ($keep as $id) {
        if ($id) {
            remove_filter('page_link', 'candelier_page_link', 10);
            $raw = (string) parse_url(get_permalink($id), PHP_URL_PATH);
            add_filter('page_link', 'candelier_page_link', 10, 2);
            $map[untrailingslashit($raw)] = (string) get_post_meta($id, '_candelier_path', true);
        }
    }
    update_option('candelier_page_paths', $map, true);
}

// Pages need WordPress fully loaded (addresses), so they are made on init, not in the early /candelier handler.
add_action('init', function () {
    if (get_option('candelier_pages_version') !== CANDELIER_VERSION && is_file(CANDELIER_DIR . 'app/pages.json')) {
        candelier_sync_pages();
        update_option('candelier_pages_version', CANDELIER_VERSION, true);
    }
}, 20);

/** Links to these pages (menus, "View page", page lists) go straight to the app screen. */
function candelier_page_link($link, $post_id)
{
    $path = get_post_meta($post_id, '_candelier_path', true);
    return $path !== '' && $path !== false ? candelier_app_url((string) $path) : $link;
}
add_filter('page_link', 'candelier_page_link', 10, 2);

// Wherever WordPress itself would show one of these pages (for example when it is set as the homepage in
// Settings → Reading), open the app screen instead: never the theme, never the WordPress admin bar.
add_action('template_redirect', function () {
    if (!is_page()) {
        return;
    }
    $path = get_post_meta(get_queried_object_id(), '_candelier_path', true);
    if ($path !== '' && $path !== false) {
        wp_redirect(candelier_app_url((string) $path), 302);
        exit;
    }
}, 0);

// Keep these pages out of search and the sitemap.
add_filter('wp_sitemaps_posts_query_args', function ($args, $type) {
    if ($type === 'page') {
        $args['post__not_in'] = array_merge($args['post__not_in'] ?? [], get_posts(['post_type' => 'page', 'meta_key' => '_candelier_key', 'numberposts' => -1, 'fields' => 'ids']));
    }
    return $args;
}, 10, 2);

// ---------------------------------------------------------------------------
// Activation / deactivation
// ---------------------------------------------------------------------------

register_activation_hook(__FILE__, function () {
    if (version_compare(PHP_VERSION, '8.1', '<')) {
        deactivate_plugins(plugin_basename(CANDELIER_FILE));
        wp_die('Candelier needs PHP 8.1 or newer. Change the PHP version in your hosting panel, then activate again.');
    }
    delete_option('candelier_setup_version');
    delete_option('candelier_pages_version');
    try {
        candelier_ensure_setup();
    } catch (Throwable $e) {
        deactivate_plugins(plugin_basename(CANDELIER_FILE));
        wp_die(esc_html($e->getMessage()));
    }
    // /candelier/... needs "pretty" addresses. A fresh WordPress may still use plain ?p=123 links.
    if (get_option('permalink_structure') === '') {
        update_option('permalink_structure', '/%postname%/');
    }
    flush_rewrite_rules(true);
    if (!wp_next_scheduled('candelier_whatsapp_refresh')) {
        wp_schedule_event(time() + 600, 'hourly', 'candelier_whatsapp_refresh');
    }
});

// Keep the settings file current after updates (e.g. a new site address).
add_action('upgrader_process_complete', function () { candelier_ensure_config(); }, 10, 0);
add_action('admin_init', function () {
    if (!is_file(candelier_config_path()) || get_option('candelier_setup_version') !== CANDELIER_VERSION) {
        try { candelier_ensure_setup(); } catch (Throwable $e) { /* shown on the Candelier admin page */ }
    }
});

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook('candelier_whatsapp_refresh');
});

// ---------------------------------------------------------------------------
// The app page: served before the theme loads, so the theme never touches it
// ---------------------------------------------------------------------------

function candelier_base_path(): string
{
    $home = rtrim((string) (parse_url(home_url('/'), PHP_URL_PATH) ?: '/'), '/');
    return $home . '/' . CANDELIER_SLUG;
}

add_action('plugins_loaded', function () {
    if (is_admin() || wp_doing_ajax() || wp_doing_cron() || (defined('WP_CLI') && WP_CLI)) {
        return;
    }
    $path = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $base = candelier_base_path();
    $pages = get_option('candelier_page_paths', []);
    $key = untrailingslashit($path);
    if (is_array($pages) && isset($pages[$key]) && strpos($key . '/', $base . '/') !== 0) {
        wp_redirect(candelier_app_url($pages[$key]), 302);
        exit;
    }
    if ($path !== $base && strpos($path, $base . '/') !== 0) {
        return;
    }
    try {
        candelier_ensure_setup();
    } catch (Throwable $e) {
        status_header(500);
        echo esc_html($e->getMessage());
        exit;
    }
    candelier_render_app($base . '/');
    exit;
}, 1);

function candelier_render_app(string $basename): void
{
    $file = CANDELIER_DIR . 'app/index.html';
    $html = is_file($file) ? file_get_contents($file) : '<p>Candelier app files are missing. Upload the plugin again.</p>';
    $assets = plugins_url('app/assets/', CANDELIER_FILE);
    $html = str_replace(['"./assets/', "'./assets/"], ['"' . $assets, "'" . $assets], $html);
    $cfg = candelier_config();
    $runtime = [
        'apiBase'   => wp_make_link_relative($cfg['api_url']),
        'filesBase' => wp_make_link_relative($cfg['files_url']),
        'basename'  => rtrim($basename, '/'),
    ];
    $script = '<script>window.CANDELIER=' . wp_json_encode($runtime, JSON_UNESCAPED_SLASHES) . ';</script>';
    $pos = stripos($html, '<script');
    $html = $pos === false ? str_ireplace('</head>', $script . '</head>', $html) : substr($html, 0, $pos) . $script . substr($html, $pos);
    status_header(200);
    nocache_headers();
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Frame-Options: SAMEORIGIN');
    echo $html;
}

// ---------------------------------------------------------------------------
// WhatsApp delivery statuses: checked hourly (WordPress cron), same as the live site's scheduler
// ---------------------------------------------------------------------------

add_action('candelier_whatsapp_refresh', function () {
    $config = candelier_config_path();
    if (!is_file($config)) {
        return;
    }
    $token = hash_hmac('sha256', 'whatsapp-status-sync:' . (int) floor(time() / 3600), hash_file('sha256', $config));
    $url = plugins_url('api/index.php', CANDELIER_FILE) . '?r=whatsapp-sync';
    $started = time();
    $after = 0;
    do {
        $r = wp_remote_post($url, [
            'timeout' => 60,
            'headers' => ['Content-Type' => 'application/json', 'X-Candelier-Sync' => $token],
            'body'    => wp_json_encode(['after' => $after]),
        ]);
        if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) {
            return;
        }
        $d = json_decode(wp_remote_retrieve_body($r), true);
        if (!is_array($d) || !empty($d['busy'])) {
            return;
        }
        $after = (int) ($d['cursor'] ?? 0);
    } while (!empty($d['remaining']) && !empty($d['checked']) && time() - $started < 240);
});

// ---------------------------------------------------------------------------
// WordPress admin: a small status page with a button to open the app
// ---------------------------------------------------------------------------

add_action('admin_menu', function () {
    add_menu_page('Candelier', 'Candelier', 'manage_options', 'candelier', 'candelier_admin_page', 'dashicons-lightbulb', 3);
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(home_url('/' . CANDELIER_SLUG . '/')) . '" target="_blank">Open app</a>');
    return $links;
});

function candelier_admin_page(): void
{
    if (isset($_POST['candelier_settings']) && check_admin_referer('candelier_settings')) {
        update_option('candelier_delete_on_uninstall', !empty($_POST['delete_on_uninstall']) ? 1 : 0, false);
        echo '<div class="notice notice-success"><p>Saved.</p></div>';
    }
    global $wpdb;
    $tables = $wpdb->get_var("SHOW TABLES LIKE 'users'") === 'users';
    $config = is_file(candelier_config_path()) && is_file(CANDELIER_DIR . 'api/config.php');
    $pretty = get_option('permalink_structure') !== '';
    $uploads = is_dir(candelier_config()['upload_root'] . '/uploads') && wp_is_writable(candelier_config()['upload_root'] . '/uploads');
    $url = home_url('/' . CANDELIER_SLUG . '/');
    $row = fn ($ok, $label, $fix) => '<tr><td>' . ($ok ? '✅' : '❌') . '</td><td>' . esc_html($label) . '</td><td>' . ($ok ? '' : esc_html($fix)) . '</td></tr>';
    echo '<div class="wrap"><h1>Candelier Management System</h1>';
    echo '<p><a class="button button-primary button-hero" href="' . esc_url($url) . '" target="_blank">Open Candelier</a></p>';
    echo '<p>Address: <code>' . esc_html($url) . '</code>. Staff sign in there with their Candelier username; they do not need a WordPress account. The first visit asks you to create the Candelier administrator.</p>';
    echo '<h2>Status</h2><table class="widefat striped" style="max-width:820px"><tbody>';
    echo $row($tables, 'Database tables', 'Deactivate and activate the plugin again.');
    echo $row($config, 'Connection settings (wp-content/uploads/candelier/config.php)', 'Make wp-content/uploads writable, then deactivate and activate again.');
    echo $row($pretty, 'Pretty addresses (Settings → Permalinks)', 'Choose any option except "Plain" in Settings → Permalinks.');
    echo $row($uploads, 'Photos and drawings folder (wp-content/uploads/candelier)', 'Make wp-content/uploads writable.');
    echo '</tbody></table>';
    $delete = (int) get_option('candelier_delete_on_uninstall', 0);
    echo '<h2>Uninstall</h2><form method="post">';
    wp_nonce_field('candelier_settings');
    echo '<input type="hidden" name="candelier_settings" value="1"><label><input type="checkbox" name="delete_on_uninstall" value="1"' . checked($delete, 1, false) . '> Delete all Candelier data (tables, photos and drawings) when the plugin is deleted</label>';
    echo '<p class="description">Off by default: deleting the plugin keeps your data, so reinstalling brings everything back.</p>';
    submit_button('Save');
    echo '</form></div>';
}

add_action('admin_notices', function () {
    if (!current_user_can('manage_options') || is_file(candelier_config_path())) {
        return;
    }
    echo '<div class="notice notice-error"><p>Candelier could not write its connection settings. Open <a href="' . esc_url(admin_url('admin.php?page=candelier')) . '">Candelier</a> for details.</p></div>';
});
