# Post-Processing Procedures — cherrie-site

This document records every transformation applied to the HTTrack-scraped WordPress/WooCommerce static mirror so it can be deployed reliably to Vercel at https://cherrie-site.vercel.app/.

## 1. Absolute URL remediation (CORS + mixed-content + local-network prompt)

Problem: The scraped mirror referenced http://bakery.local/… everywhere. Served from https://cherrie-site.vercel.app, those became:
- Mixed-content requests (https page → http host) — blocked or broken
- Cross-origin requests to a private .local address — CORS failures
- Chrome Private Network Access preflight → user-facing “access your local network” permission prompt

Fix: Rewrote every hardcoded http://bakery.local/… to a root-relative path across 98 text files (HTML, JS, CSS, JSON, PHP, SVG readme), including asset URLs, encoded oEmbed origins, double-encoded JSON-escaped URLs, wp-json/index.html home fields, xmlrpc0db0.php links, and HTTrack header comments.

## 2. WordPress Interactivity API provisions (mobile menu fix)

Problem: The mobile hamburger menu did nothing on mobile. The menu uses the WordPress Interactivity API: <div data-wp-interactive="bakly/mobile-menu"> with <button data-wp-on--click="actions.toggle">.

The Interactivity store module imports @wordpress/interactivity via an importmap pointing to /wp-includes/js/dist/script-modules/interactivity/index.min.js. That file did not exist in the scraped tree — only index.min132d.js (an HTTrack hashed filename) was present. The ES module import failed silently, the bakly/mobile-menu store was never registered, and data-wp-interactive was never processed.

Fix: Corrected the importmap in all 38 HTML pages to point to the real file:
/wp-includes/js/dist/script-modules/interactivity/index.min132d.js

Verification: Open Chrome DevTools → Console on a mobile viewport. Click the hamburger. The drawer should add is-open to #bakly-mobile-drawer, set aria-expanded="true" on the toggle, and reveal the overlay navigation.

## 3. Newsletter input overflow fix (homepage)

Problem: The homepage newsletter email <input> had size="40", a fixed character width that prevented shrinking on small screens, causing horizontal overflow outside its container.

Fix:
- Removed size="40" from the email input in index.html
- Added CSS safeguard in wp-content/themes/bakly-block/assets/css/theme0b45.css:

.bakly-newsletter .wpcf7-form input[type="email"],
.bakly-newsletter .wpcf7-form input[name="your-email"] {
  max-width: 100%;
}
.bakly-newsletter .wpcf7-form .wpcf7-form-control-wrap {
  max-width: 100%;
}

## 4. Vercel deployment configuration

vercel.json (deploy root)
- outputDirectory: "."
- CORS headers: Access-Control-Allow-Origin: *, GET/POST/OPTIONS, Content-Type
- Immutable cache headers for wp-includes, wp-content/uploads, wp-content/plugins, theme assets
- Rewrites: /(.*)/ → //index.html (extensionless permalinks); contact-form-7 fallback

package.json
{ "name": "cherrie-site", "scripts": { "build": "true" } } — no build step, static deploy.

.gitignore
Excludes node_modules/, .vercel/, logs, OS files.

## 5. Deployment steps (GitHub → Vercel)

1. GitHub repo: https://github.com/thisiskibaya/cherrie-site (created)
2. Local git initialized in c:\My Web Sites\Sherrie Bakery v4\bakery.local\, remote origin set, commits pushed to main
3. Vercel dashboard: Add New Project → Import thisiskibaya/cherrie-site → Framework: Other → Build Command: true → Output Directory: . → Deploy
4. Add cherrie-site.vercel.app as production domain
5. Auto-deploys enabled on push to main

Do not reuse the existing cherie.vercel.app project — that belongs to reference repo thisiskibaya/cherie.

## 6. Post-deploy verification checklist

- No mixed-content warnings in Network panel
- No CORS errors in Console
- No Access-Control-Request-Private-Network preflight failures
- No local-network permission prompt
- Mobile hamburger opens full-screen drawer (is-open class added)
- Newsletter email input fits container on narrow screens
- Home, product, cart, shop, /wp-json/ routes load with status 200

## 7. Notes

- xmlrpc0db0.php served as static text (Vercel does not execute PHP) — harmless.
- Pure static HTML scrape; no server-side WordPress backend on Vercel.
- If the Interactivity importmap path changes after a fresh scrape, confirm the mapped file exists before deploying.
