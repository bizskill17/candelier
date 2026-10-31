#!/usr/bin/env bash
# Builds candelier-wp.zip, the WordPress plugin, from the same code as the live site.
# Needs Node 18+ (npm ci already run). Output: build/candelier-wp.zip
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=build/candelier
rm -rf build && mkdir -p "$OUT"
npx vite build --base=./ --outDir="$OUT/app" --emptyOutDir
rm -rf "$OUT/app/uploads"                      # copied from public/, not needed in the plugin
# The live site's .htaccess routes everything to index.html; in the plugin only caching rules are wanted.
cat > "$OUT/app/.htaccess" <<'HT'
<IfModule mod_headers.c>
  <FilesMatch "\.(js|css)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
HT
cp -a api "$OUT/api"
rm -f "$OUT/api/config.php" "$OUT/api/config.sample.php"
mkdir -p "$OUT/database" && cp database/schema.sql "$OUT/database/"
cp public/uploads/.htaccess "$OUT/uploads.htaccess"
cp wordpress/candelier.php wordpress/uninstall.php wordpress/readme.txt "$OUT/"
(cd build && zip -qr candelier-wp.zip candelier)
echo "Built build/candelier-wp.zip ($(du -h build/candelier-wp.zip | cut -f1))"
