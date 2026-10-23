# Static Review Build Runbook

This repository deploys a **purely static review copy** of the chérie bakery
site. WordPress, PHP, WooCommerce, Contact Form 7, search, cart, checkout, and
account routes are intentionally not available. Visual client-side JavaScript
(navigation, mobile drawer, carousels, hero animation, preloader) is preserved.

The deployable artifact is committed at `public/`. `vercel.json` points Vercel
at that directory, so Vercel does not need to run the build.

---

## 1. Layout

```
bakery.local/
├── public/                  # committed, generated deploy artifact
├── scripts/
│   ├── build.py             # deterministic scrape -> public pipeline
│   ├── verify.py            # independent URL/reference gate
│   └── overrides/           # stable, non-hashed review fixes
├── scrape/
│   └── 2026-10-23-refresh-1450/
│       └── bakery.local/    # immutable raw HTTrack snapshot (gitignored)
├── build-manifest.json      # source/output hashes + repair report
├── package.json             # local convenience commands
└── vercel.json              # public output + static caching rules
```

`scrape/` is deliberately ignored by Git. It is the raw input for a rebuild,
not part of the deploy. Never hand-edit `public/`; every rebuild replaces it.

---

## 2. Commands

```bash
# Build from the current default snapshot into a fresh public/
python3 scripts/build.py

# Verify the generated artifact independently
python3 scripts/verify.py

# Build twice and compare content-only tree hashes
python3 scripts/build.py --check-repeatable

# Build a specific snapshot to a specific directory
python3 scripts/build.py \
  --source scrape/YYYY-MM-DD/bakery.local \
  --output public
```

The Vercel configuration uses:

```json
"buildCommand": "true",
"installCommand": "true",
"outputDirectory": "public",
"trailingSlash": true,
"cleanUrls": false
```

There are no rewrites, no CORS headers, and no WordPress fallback routes.
Because `public/` is committed, a Vercel deployment serves the checked-in
artifact without running Python.

---

## 3. URL contract

Every internal runtime URL must be:

* **root-relative** (`/about/`, `/wp-content/...`)
* **trailing-slash for pages** (`/about/`, `/our-menu/`)
* free of `../` and `./`
* free of `index.html` in page links
* free of the crawl host and production host
* free of removed routes

External URLs, `mailto:`, `tel:`, fragments, and data URIs are left alone.
Query strings and fragments are preserved. Asset references are never turned
into page references.

The builder discovers hashed filenames dynamically. Do not hardcode values
such as `theme47bb.css`, `index.min132d.js`, or `view5cc9.js` in scripts or
documentation.

---

## 4. Build pipeline

`scripts/build.py` performs the following steps from a fresh copy of the
snapshot:

1. **Copy** the immutable source into a temporary tree.
2. **Remove server/crawl artifacts**: `wp-admin/`, `wp-json/`, `feed/`,
   `comments/`, `my-account/`, `cart/`, `checkout/`, `author/`, PHP files,
   XML-RPC/login endpoints, `.readme`/`.tmp`/HTTrack files, duplicate
   `indexXXXX.html` pages, and HTML error pages saved under `wp-content/uploads`.
3. **Strip backend markup**: HTTrack comments, Gutenberg comments, RSS/oEmbed/
   REST/shortlink/canonical tags, `og:`/`twitter:` metadata, JSON-LD, WP emoji,
   Contact Form 7 scripts, WooCommerce cart/account/order-attribution scripts,
   and WooCommerce block modules that call the Store API.
4. **Canonicalize URLs** in HTML attributes, `srcset`, inline styles, `<style>`
   blocks, stylesheet `url()`/`@import` references, and script/data text.
5. **Repair the import map** used by WordPress Interactivity API modules
   (mobile menu and product builder) to the interactivity file that actually
   exists in the snapshot.
6. **Repair missing assets** (see section 6).
7. **Inject stable overrides** into every page:
   `/review-overrides.css` and `/review-overrides.js`.
8. **Add static support files**: `404.html`, `products.json`, and a neutral
   image placeholder.
9. **Swap** the finished temporary tree into `public/` and write
   `build-manifest.json` with content-only source/output hashes.

The build fails if any local reference remains unresolved. Failed temporary
trees are left in `.build-public.tmp/` for inspection and are ignored by Git.

---

## 5. Removed and retargeted routes

| Removed route | Replacement behavior |
| --- | --- |
| `wp-admin`, `wp-login` | `/` |
| `wp-json`, XML-RPC | `/` |
| `my-account`, lost password | `/contact/` |
| `cart`, `checkout` | `/shop/` |
| feeds, comments feeds | `/` |
| author archives | `/` |

All of these routes are deleted from the output. Links that still appeared in
mirrored markup are retargeted during canonicalization, and the override script
has a defensive click guard as a final fallback.

---

## 6. Stable overrides

The following fixes live in `scripts/overrides/` and are copied to the site root
on every build. They never edit a hashed theme asset.

### `review-overrides.css`

* hides the search toggle and search panel (there is no search backend),
* constrains the CF7 newsletter input so the original `size="40"` cannot
  overflow its card,
* styles the static-review form message.

### `review-overrides.js`

* captures all form submissions and prevents network/navigation attempts,
* applies the cinematic-hero ScrollTrigger fix without touching
  `blocks/cinematic-hero/view*.js`:
  * `ScrollTrigger.normalizeScroll(true)`,
  * `invalidateOnRefresh` on existing triggers,
  * `ScrollTrigger.refresh()`,
  * debounced refresh on resize/orientation change,
* retargets any stale backend link that survived canonicalization.

### `404.html`

A self-contained branded not-found page with links to `/`, `/our-menu/`, and
`/contact/`. Vercel serves it for missing paths automatically.

`products.json` is an empty static array. The theme search script is detached
from the WordPress Store API and points at this file; the search UI is hidden.

---

## 7. Asset repair rules

The source is a mirror, not a clean WordPress export. The builder repairs:

* **Unhashed references**: `theme.css` -> the single matching
  `theme<hash>.css`, `interactions.js` -> `interactions<hash>.js`, etc.
* **Wrong-depth paths**: a reference like `product/foo/wp-content/...` is
  rebased to the real `/wp-content/...` path.
* **404 pages used as images**: a background pointing at
  `wp-content/uploads/.../image.html` is resolved to the real image-family
  variant (`...-scaled.jpg`, etc.).
* **Missing image dimensions in `srcset`**: entries resolve to an existing
  family variant; unresolved entries are removed.
* **Vendor icons**: missing WooCommerce credit-card SVGs receive a fixed,
  deterministic placeholder so the stylesheet has no broken references.
* **Unresolved images**: a neutral placeholder SVG is used and recorded in
  `build-manifest.json`.

Full asset trees are kept. The build does not prune to only currently
referenced files.

---

## 8. Verification gates

`scripts/verify.py` independently checks:

* no crawl host or production host remains in any text file;
* no removed route directories or PHP/HTTrack artifacts remain;
* every `href`, `src`, `poster`, `data-*` URL, `srcset` entry, inline CSS
  `url()`, and stylesheet `url()` resolves to a local file;
* no internal URL is relative, contains `../`, or is query-only;
* no internal page URL contains `index.html`;
* no URL points at a removed route;
* every page has the stable overrides injected;
* every page with module scripts or Interactivity markup has a valid
  `wp-importmap`, and its `@wordpress/interactivity` target exists;
* required support files exist (`404.html`, overrides, placeholder,
  `products.json`);
* `build-manifest.json` matches the content hash of `public/`.

A successful build is not complete until both commands pass:

```bash
python3 scripts/build.py
python3 scripts/verify.py
```

For release changes, also run:

```bash
python3 scripts/build.py --check-repeatable
```

---

## 9. Determinism

The build is designed to produce identical bytes from the same snapshot:

* sorted filesystem traversal;
* UTF-8 output with LF line endings;
* no timestamps or current dates written into files;
* fixed override and placeholder content;
* no hardcoded hashed filenames;
* content-only SHA-256 tree hashes in `build-manifest.json`;
* a second build can be compared with `--check-repeatable`.

If a rebuild changes `public/`, the change should correspond to a source or
pipeline change, not filesystem ordering.

---

## 10. Rebuilding from a new scrape

1. Put the new HTTrack output in `scrape/YYYY-MM-DD/bakery.local/`.
   Do not put raw scrape files at the repository root.
2. Confirm the mirror finished and that no lock file is active.
3. Run `python3 scripts/build.py --source scrape/YYYY-MM-DD/bakery.local`.
4. Run `python3 scripts/verify.py`.
5. Run `python3 scripts/build.py --check-repeatable`.
6. Review `build-manifest.json` for repaired assets, placeholders, removals,
   and warnings.
7. Commit `public/`, `build-manifest.json`, and any script/config changes.
8. Deploy from the committed `public/` directory.

Do not patch `public/` directly and do not patch hashed theme files. Put
long-lived repairs in `scripts/build.py` or `scripts/overrides/`.

---

## 11. Intentionally nonfunctional in the review build

* search results and product filtering,
* cart, checkout, payment, and account pages,
* newsletter and enquiry form submission,
* WordPress feeds, comments, REST API, and XML-RPC.

Everything else is static and can be reviewed on Vercel using trailing-slash
page URLs such as `/`, `/our-menu/`, `/about/`, `/shop/`, and `/contact/`.
