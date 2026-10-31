=== Candelier Management System ===
Requires at least: 6.0
Requires PHP: 8.1
Stable tag: 1.0.0

Orders, BOQ, stores, production, dispatch, CRM, enquiries and WhatsApp campaigns for chandelier makers.

== Installation ==
1. Plugins → Add New → Upload Plugin → choose candelier-wp.zip → Install Now → Activate.
2. Open yoursite.com/candelier (or WordPress admin → Candelier → Open Candelier).
3. The first visit asks you to create the Candelier administrator. Staff then sign in there; they do not need WordPress accounts.

== How it works ==
* The app opens on its own full-screen page at /candelier. The theme is never loaded there, so any theme works.
* Tables are created in the WordPress database on activation (names without the WordPress prefix, e.g. "orders").
* Photos, drawings and WhatsApp images are stored in wp-content/uploads/candelier/.
* Connection settings are written automatically to the plugin's api/config.php from wp-config.php.
* WhatsApp delivery statuses are refreshed hourly by WordPress cron.
* If addresses were "Plain", activation switches Settings → Permalinks to "Post name" so /candelier works.

== Updating ==
Upload the new zip over the old one (Plugins → Add New → Upload → Replace current). Data is kept; database changes apply automatically.

== Uninstalling ==
Deleting the plugin keeps your data unless you tick "Delete all Candelier data" on the Candelier admin page first.
