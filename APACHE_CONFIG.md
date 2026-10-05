# Apache config for strype.org

Security headers and caching policy for the Apache server hosting
`strype.org` — `/editor/` and `/microbit/` (the standard and micro:bit
builds) plus their `/test/editor/` and `/test/microbit/` test-deployment
counterparts. Not applied via `.htaccess` — add it to the main server/vhost
config. Requires `mod_headers`.

```apache
# Security headers (site-wide):
Header set Content-Security-Policy "frame-ancestors 'self'"
Header set Access-Control-Allow-Origin "https://www.strype.org"
Header set X-Content-Type-Options "nosniff"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains;"

# Default caching policy (site-wide): always revalidate. This is what lets a
# browser discover a new release, so it must stay the default for anything
# not explicitly overridden below. No explicit Last-Modified/ETag here --
# Apache sets one automatically per file from its actual filesystem mtime,
# which is self-maintaining and per-file accurate, unlike a manually-set
# date that needs remembering on every release and is no more precise even
# when someone does.
Header always set Cache-Control "public, no-cache, max-age=0, must-revalidate"

# Vite's content-hashed build output (JS/CSS chunks) is exempt from the
# default above: the filename itself changes whenever the content does, so
# these are safe to cache indefinitely -- nothing will ever change at a URL
# a browser has already fetched. Scoped to assets/ (Vite's default output
# directory) and matched on the "-vuehashed-" marker vite.config.mjs inserts
# before every hash, so this can't accidentally match an unrelated file that
# merely happens to look hash-shaped.
<LocationMatch "^/(test/)?(editor|microbit)/assets/.*-vuehashed-[A-Za-z0-9_]+\.(js|css)$">
    Header onsuccess unset Cache-Control
    Header always set Cache-Control "public, max-age=31536000, immutable"
</LocationMatch>

# The Pyodide runtime is exempt the same way, once served from a
# version-scoped path (see indexURL in src/workers/python-execution.ts,
# and scripts/download-pyodide-libs.cjs which downloads it there) -- a
# future Pyodide upgrade lands at a new path rather than overwriting this
# one, so nothing here ever changes at a URL a browser has already fetched.
<LocationMatch "^/(test/)?(editor|microbit)/pyodide/[^/]+/">
    Header onsuccess unset Cache-Control
    Header always set Cache-Control "public, max-age=31536000, immutable"
</LocationMatch>
```

`Header onsuccess unset` before `Header always set` in the two overrides is
required, not optional: `mod_headers` keeps separate `onsuccess`/`always`
header tables, and the site-wide default above uses `always`. Without the
`unset`, the override and the default would both apply from different
tables, and Cache-Control would come out duplicated instead of the
more-specific rule winning.

Adjust the CORS origin for your own deployment; the path names match how
Strype itself is deployed here and should be adjusted if yours differs.

## Brotli compression (optional, recommended)

The Pyodide runtime is the largest thing a first-time visitor downloads, and
Brotli shrinks it noticeably more than gzip (measured at maximum quality,
for Pyodide 0.29.4):

| File                | gzip -9 | Brotli | Saving |
|---------------------|---------|--------|--------|
| `pyodide.asm.wasm`  | 2818 KB | 2124 KB | ~25%  |
| `pyodide.asm.js`    | 221 KB  | 181 KB  | ~18%  |
| `python_stdlib.zip` | 2385 KB | 2369 KB | ~1% (already compressed) |

Requires `mod_brotli` (and `mod_deflate`, which is normally already enabled).
This is safe for clients that don't support Brotli: `mod_brotli` only
compresses when the request's `Accept-Encoding` includes `br`, otherwise
the response falls through to gzip via `mod_deflate` (and to uncompressed if
neither is accepted). List `BROTLI_COMPRESS` before `DEFLATE` so Brotli wins
when both are acceptable:

```apache
<IfModule mod_brotli.c>
    AddOutputFilterByType BROTLI_COMPRESS application/wasm application/javascript text/javascript application/json text/css text/html
</IfModule>
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE application/wasm application/javascript text/javascript application/json text/css text/html
</IfModule>
```

`mod_brotli` compresses on the fly at its default quality (5), which gives
a smaller saving than the table above. Add `BrotliCompressionQuality 11`
to get the full saving; it costs CPU on each uncached request, which is
fine here because the large Pyodide files are cached by browsers (and
intermediaries) for a year. Alternatively, precompress the files at build
time as `.br` and serve them with `mod_rewrite`/`mod_negotiation`, avoiding
the runtime cost entirely.
