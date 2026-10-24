#!/usr/bin/env python3
"""Build the deployable static review site from the raw HTTrack snapshot.

The source snapshot is immutable input.  Every build starts from a fresh copy,
so the output never inherits edits from a previous run.  The only intentionally
stable inputs are the files in scripts/overrides/.

Usage:
    python3 scripts/build.py
    python3 scripts/build.py --check-repeatable
    python3 scripts/build.py --source scrape/2026-10-24/bakery.local --output public
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO / "scrape" / "2026-10-24" / "bakery.local"
DEFAULT_OUTPUT = REPO / "public"
OVERRIDE_DIR = REPO / "scripts" / "overrides"

TEXT_SUFFIXES = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".xml", ".svg",
    ".map", ".txt",
}
HTML_SUFFIXES = {".html", ".htm"}
CSS_SUFFIXES = {".css"}
JS_SUFFIXES = {".js", ".mjs"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"}
VIDEO_EXTS = {".mp4", ".webm", ".ogv"}
FONT_EXTS = {".woff", ".woff2", ".ttf", ".otf", ".eot"}

CRAWL_HOSTS = {"bakery.local", "www.bakery.local"}
PRODUCTION_HOSTS = {"cherrie-site.vercel.app", "www.cherrie-site.vercel.app"}
INTERNAL_HOSTS = CRAWL_HOSTS | PRODUCTION_HOSTS

REMOVED_TOP_LEVEL = {
    "wp-admin", "wp-json", "my-account", "cart", "checkout", "author",
    "feed", "comments",
}
REMOVED_FILE_PATTERNS = {
    "*.readme", "*.tmp", "*.whtt", "hts-*", "backblue.gif", "fade.gif",
    "wp-login*.php", "wp-comments-post.php", "wp-cron.php", "wp-signup.php",
    "wp-activate.php", "wp-trackback.php", "xmlrpc*.php",
}

FAKE_ASSET_MARKERS = (b"<!doctype", b"<html", b"<head", b"<body")
IMAGE_STEM_DIM_RE = re.compile(r"-\d+x\d+$")
IMAGE_STEM_SCALED_RE = re.compile(r"-scaled$")
HASHED_VARIANT_RE = re.compile(r"^(?P<stem>.+?)(?P<hash>[0-9a-f]{3,})(?P<ext>\.[^.]+)$", re.I)

# Drop scripts that talk to a WordPress/WooCommerce/CF7 backend.  Visual theme
# scripts (interactions, mobile menu, hero, preloader, product builder, Swiper,
# GSAP) are deliberately kept.
DROP_SCRIPT_SRC = [
    r"wp-emoji",
    r"contact-form-7",
    r"woocommerce/assets/js/frontend/(?:add-to-cart|woocommerce|order-attribution|cart-fragments)",
    r"woocommerce/assets/js/sourcebuster",
    r"woocommerce/assets/js/js-cookie",
    r"woocommerce/assets/client/blocks",
    r"themes/bakly-block/assets/js/cake-enquiry",
]
DROP_SCRIPT_IDS = {
    "wc-add-to-cart-js-extra",
    "woocommerce-js-extra",
    "wc-order-attribution-js-extra",
    "contact-form-7-js-before",
    "wp-emoji-settings",
}
INLINE_BACKEND_MARKERS = (
    "wc_ajax_url",
    "admin-ajax.php",
    "wc_order_attribution",
    "woocommerce_params",
    "wcSettings",
)

# These are removed from the scrape, so no runtime URL should point at them.
REMOVED_ROUTE_RE = re.compile(
    r"(?:^|/)(?:wp-admin|wp-json|my-account|cart|checkout|feed|comments|"
    r"wp-login|xmlrpc|wp-comments-post|author/admin)(?:/|$)",
    re.I,
)

HOST_RES = [
    # http://, https://, http:\/\/, http:\\/\\/, etc.
    re.compile(r"https?:(?:\\*/){2}(?:www\.)?(?:bakery\.local|cherrie-site\.vercel\.app)", re.I),
    # URL-encoded http%3A%2F%2F / http%3A%5C%2F%5C%2F
    re.compile(r"https?%3A(?:%5C)?%2F(?:%5C)?%2F(?:www\.)?(?:bakery\.local|cherrie-site\.vercel\.app)", re.I),
    # Double-encoded variants.
    re.compile(r"https?%253A(?:%255C)?%252F(?:%255C)?%252F(?:www\.)?(?:bakery\.local|cherrie-site\.vercel\.app)", re.I),
    # Protocol-relative, including JSON-escaped \/\/host.
    re.compile(r"(?<!:)(?:\\*/){2}(?:www\.)?(?:bakery\.local|cherrie-site\.vercel\.app)", re.I),
]

COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
CSS_COMMENT_SOURCE_RE = re.compile(r"/\*#\s*(?:sourceURL|sourceMappingURL)=.*?\*/\s*", re.S | re.I)
JS_SOURCE_MAP_RE = re.compile(r"(?:\n|^)\s*//[#@]\s*sourceMappingURL=.*?(?=\n|$)", re.I)
JS_SOURCE_URL_RE = re.compile(r"(?:\n|^)\s*//[#@]\s*sourceURL=.*?(?=\n|$)", re.I)
JS_SOURCE_MAP_BLOCK_RE = re.compile(r"/\*[#@]\s*sourceMappingURL=.*?\*/\s*", re.S | re.I)

LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.I | re.S)
META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.I | re.S)
SCRIPT_TAG_RE = re.compile(r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>", re.I | re.S)

ATTR_RE = re.compile(
    r"(?P<prefix>\b(?:href|src|poster|data-src|data-thumb|data-lazy-src|data-bg|action)\s*=\s*)"
    r"(?P<quote>[\"'])(?P<value>.*?)(?P=quote)",
    re.I | re.S,
)
SRCSET_RE = re.compile(
    r"(?P<prefix>\b(?:srcset|data-thumb-srcset|data-lazy-srcset)\s*=\s*)"
    r"(?P<quote>[\"'])(?P<value>.*?)(?P=quote)",
    re.I | re.S,
)
STYLE_ATTR_RE = re.compile(
    r"(?P<prefix>\bstyle\s*=\s*)(?P<quote>[\"'])(?P<value>.*?)(?P=quote)",
    re.I | re.S,
)
STYLE_BLOCK_RE = re.compile(
    r"(?P<open><style\b[^>]*>)(?P<value>.*?)(?P<close></style\s*>)",
    re.I | re.S,
)
CSS_URL_RE = re.compile(
    r"url\(\s*(?P<quote>['\"]?)(?P<value>.*?)(?P=quote)\s*\)",
    re.I | re.S,
)
CSS_IMPORT_RE = re.compile(
    r"(?P<prefix>@import\s+)(?P<quote>['\"])(?P<value>[^'\"]+)(?P=quote)",
    re.I,
)
IMPORTMAP_RE = re.compile(
    r"(?P<open><script\b[^>]*id=[\"']wp-importmap[\"'][^>]*>)"
    r"(?P<value>.*?)"
    r"(?P<close></script\s*>)",
    re.I | re.S,
)
HEX_INDEX_RE = re.compile(r"^index[0-9a-f]{4}\.html$", re.I)
MODULE_SCRIPT_RE = re.compile(r"<script\b[^>]*\btype=[\"']module[\"'][^>]*>", re.I | re.S)


def log(message: str) -> None:
    print(message, flush=True)


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"build: {message}")


def read_text_file(path: Path) -> str | None:
    """Read a text file deterministically, or return None for binary data."""
    raw = path.read_bytes()
    if b"\x00" in raw[:512]:
        return None
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="ignore")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def write_text_file(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode("utf-8"))


def relpath(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def sha256_tree(root: Path) -> tuple[str, dict[str, str]]:
    """Content-only tree hash.  Paths are sorted; timestamps/modes are ignored."""
    digest = hashlib.sha256()
    per_file: dict[str, str] = {}
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = relpath(path, root)
        data = path.read_bytes()
        fh = hashlib.sha256(data).hexdigest()
        per_file[rel] = fh
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(data)
        digest.update(b"\0")
    return digest.hexdigest(), per_file


def remove_path(path: Path) -> bool:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
        return True
    if path.exists() or path.is_symlink():
        path.unlink()
        return True
    return False


def clean_tree(root: Path, stats: dict) -> None:
    """Remove mirrored server routes, crawl artifacts, and fake binary assets."""
    for name in sorted(REMOVED_TOP_LEVEL):
        target = root / name
        if remove_path(target):
            stats["removed"].append(name)

    # Page-level feed/comments directories can appear below posts as well.  Do
    # not touch plugin/include trees that might legitimately contain such names.
    for directory in sorted(p for p in root.rglob("*") if p.is_dir()):
        if directory.name.lower() not in {"feed", "comments"}:
            continue
        rel = relpath(directory, root)
        if rel.startswith(("wp-content/", "wp-includes/")):
            continue
        if directory.exists() and remove_path(directory):
            stats["removed"].append(rel)

    for pattern in sorted(REMOVED_FILE_PATTERNS):
        for path in sorted(root.rglob(pattern)):
            if remove_path(path):
                stats["removed"].append(relpath(path, root))

    # HTTrack duplicate index pages such as index0012.html.
    for path in sorted(root.glob("index*.html")):
        if path.name != "index.html" and HEX_INDEX_RE.match(path.name):
            if remove_path(path):
                stats["removed"].append(path.name)

    # Remove all PHP files: this review build is static only.
    for path in sorted(root.rglob("*.php")):
        if remove_path(path):
            stats["removed"].append(relpath(path, root))

    # A 404 page saved under uploads is not an image.  The URL resolver later
    # repairs references to this family of files to a real image variant.
    for path in sorted((root / "wp-content" / "uploads").rglob("*.html")):
        if remove_path(path):
            stats["removed"].append(relpath(path, root))

    # Some HTTrack error pages are saved with an image/font extension.
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        if path.suffix.lower() not in (IMAGE_EXTS | FONT_EXTS | VIDEO_EXTS):
            continue
        try:
            head = path.read_bytes()[:512].lstrip().lower()
        except OSError:
            continue
        if head.startswith(b"<") or any(marker in head for marker in FAKE_ASSET_MARKERS):
            if remove_path(path):
                stats["removed"].append(relpath(path, root))

    # Remove empty directories, deepest first.
    for directory in sorted((p for p in root.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        try:
            if not any(directory.iterdir()):
                directory.rmdir()
        except OSError:
            pass


def strip_hosts(text: str) -> str:
    """Turn crawl/production-host absolute URLs into root-relative paths.

    The replacement is context-preserving: it leaves URL-encoded and
    JSON-escaped path separators alone so the result remains valid in HTML,
    JavaScript, JSON, and CSS.
    """

    def replace(match: re.Match) -> str:
        rest = text[match.end():match.end() + 12]
        if rest.startswith(("/", "\\", "%2F", "%2f", "%5C", "%5c",
                             "%252F", "%252f", "%255C", "%255c")):
            return ""
        return "/"

    for pattern in HOST_RES:
        text = pattern.sub(replace, text)
    return text


def clean_common_text(text: str) -> str:
    text = CSS_COMMENT_SOURCE_RE.sub("", text)
    text = JS_SOURCE_MAP_RE.sub("", text)
    text = JS_SOURCE_URL_RE.sub("", text)
    text = JS_SOURCE_MAP_BLOCK_RE.sub("", text)
    return strip_hosts(text)


def link_tag_repl(match: re.Match) -> str:
    tag = match.group(0)
    low = tag.lower()
    relm = re.search(r"\brel\s*=\s*([\"'])(.*?)\1", low, re.S | re.I)
    rel = relm.group(2).strip() if relm else ""
    if rel in {"canonical", "shortlink", "edituri", "rsd", "wlwmanifest", "modulepreload"}:
        return ""
    if "api.w.org" in low or "wp-json" in low or "oembed" in low or "xmlrpc" in low:
        return ""
    if rel == "alternate" and re.search(r"(rss|atom|json|oembed|feed)", low):
        return ""
    if rel in {"preconnect", "dns-prefetch"} and "s.w.org" in low:
        return ""
    if "/feed/" in low or "comments/feed" in low:
        return ""
    return tag


def meta_tag_repl(match: re.Match) -> str:
    tag = match.group(0)
    low = tag.lower()
    if re.search(r"\bname\s*=\s*[\"']generator[\"']", low):
        return ""
    if re.search(r"\bproperty\s*=\s*[\"'](?:og|article):", low):
        return ""
    if re.search(r"\bname\s*=\s*[\"']twitter:", low):
        return ""
    return tag


def script_tag_repl(match: re.Match) -> str:
    attrs = match.group("attrs")
    body = match.group("body")
    low_attrs = attrs.lower()
    srcm = re.search(r"\bsrc\s*=\s*([\"'])(.*?)\1", attrs, re.S | re.I)
    idm = re.search(r"\bid\s*=\s*([\"'])(.*?)\1", attrs, re.S | re.I)
    src = srcm.group(2) if srcm else ""
    script_id = idm.group(2) if idm else ""

    if "application/ld+json" in low_attrs:
        return ""
    if script_id in DROP_SCRIPT_IDS:
        return ""
    if src and any(re.search(pattern, src, re.I) for pattern in DROP_SCRIPT_SRC):
        return ""
    if "wp-emoji-loader" in body or "wp-emoji-release" in body:
        return ""
    if not src and any(marker in body for marker in INLINE_BACKEND_MARKERS):
        return ""
    return match.group(0)


def clean_html(text: str) -> str:
    # Remove all HTML comments.  HTTrack markers, Gutenberg block comments, and
    # WordPress generation comments are not needed in a static review build.
    text = COMMENT_RE.sub("", text)
    text = clean_common_text(text)
    text = LINK_TAG_RE.sub(link_tag_repl, text)
    text = META_TAG_RE.sub(meta_tag_repl, text)
    text = SCRIPT_TAG_RE.sub(script_tag_repl, text)
    return text


def posix_join_base(base: str, path: str) -> str:
    """Resolve a URL path against a page/CSS directory and clamp at site root."""
    joined = posixpath.join("/", base, path)
    normalized = posixpath.normpath(joined)
    return normalized.lstrip("/") if normalized != "/" else ""


def split_url(value: str) -> tuple[str, str, str]:
    fragment = ""
    if "#" in value:
        value, fragment = value.split("#", 1)
        fragment = "#" + fragment
    query = ""
    if "?" in value:
        value, query = value.split("?", 1)
        query = "?" + query
    return value, query, fragment


def is_special_url(value: str) -> bool:
    low = value.strip().lower()
    return (
        not low
        or low.startswith(("#", "data:", "blob:", "mailto:", "tel:", "sms:",
                           "javascript:", "about:", "ftp:"))
    )


def host_of(value: str) -> str | None:
    low = value.strip().lower()
    if low.startswith("//"):
        return low[2:].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    match = re.match(r"[a-z][a-z0-9+.-]*://([^/?#]+)", low)
    return match.group(1) if match else None


def image_variant(root: Path, rel: str) -> str | None:
    """Find a deterministic same-family variant for a missing image/404 asset."""
    target = root / rel
    parent = target.parent
    if not parent.is_dir():
        return None
    stem = IMAGE_STEM_SCALED_RE.sub("", IMAGE_STEM_DIM_RE.sub("", target.stem))
    ext = target.suffix.lower()

    candidates = [p for p in parent.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]

    # 1. Exact stem, any image extension.  This repairs image URLs that were
    # scraped as .html or a slightly different extension.
    exact: list[Path] = []
    for candidate in candidates:
        cstem = IMAGE_STEM_SCALED_RE.sub("", IMAGE_STEM_DIM_RE.sub("", candidate.stem))
        if cstem.lower() == stem.lower():
            exact.append(candidate)
    if exact:
        return choose_image(exact, rel)

    # 2. Hashed filename variant, e.g. hero.js -> hero47bb.js, or image
    # family prefix matches (american-heritage-chocolate-...-unsplash).
    stem_parts = stem.split("-")
    for cut in range(len(stem_parts), 0, -1):
        prefix = "-".join(stem_parts[:cut]).lower()
        if len(prefix) < 4:
            continue
        matches = []
        for candidate in candidates:
            cstem = IMAGE_STEM_SCALED_RE.sub("", IMAGE_STEM_DIM_RE.sub("", candidate.stem))
            if cstem.lower() == prefix or cstem.lower().startswith(prefix + "-"):
                matches.append(candidate)
        if matches:
            return choose_image(matches, rel)
    return None


def choose_image(candidates: list[Path], original_rel: str) -> str:
    """Prefer the largest non-thumbnail variant, deterministically."""
    original_ext = Path(original_rel).suffix.lower()

    def score(path: Path) -> tuple:
        stem = path.stem.lower()
        is_thumb = bool(IMAGE_STEM_DIM_RE.search(stem))
        is_scaled = "scaled" in stem
        exact_ext = path.suffix.lower() == original_ext
        return (is_thumb, not is_scaled, not exact_ext, -path.stat().st_size, path.name.lower())

    return min(candidates, key=score).name


def hashed_variant(root: Path, rel: str) -> str | None:
    target = root / rel
    parent = target.parent
    if not parent.is_dir():
        return None
    stem, ext = target.stem, target.suffix
    if not ext:
        return None
    pattern = re.compile(r"^" + re.escape(stem) + r"[0-9a-f]{3,}" + re.escape(ext) + r"$", re.I)
    matches = sorted(p.name for p in parent.iterdir() if p.is_file() and pattern.match(p.name))
    if not matches:
        return None
    # Prefer the exact basename referenced by a modulepreload elsewhere if it
    # is present; otherwise choose the lexicographically last hash for a
    # deterministic result.
    return matches[-1]


def make_placeholder(root: Path, rel: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="Static review placeholder">'
        '<rect width="600" height="400" fill="#efe7dd"/>'
        '<path d="M120 270c0-44 36-80 80-80h200c44 0 80 36 80 80v20H120z" fill="#d8c6b2"/>'
        '<circle cx="300" cy="150" r="58" fill="#c2aa90"/>'
        '</svg>\n'
    )
    write_text_file(path, svg)


def resolve_asset(root: Path, rel: str, stats: dict) -> str | None:
    """Return a local asset path, repairing known HTTrack naming problems."""
    if not rel:
        return None
    target = root / rel
    if target.is_file():
        return rel

    # Some mirrored pages contain a relative path with too few ../ segments,
    # e.g. product/foo/wp-content/... instead of wp-content/....  Rebase to the
    # real tree root before trying filename repairs.
    for marker in ("wp-content/", "wp-includes/"):
        marker_at = rel.find(marker)
        if marker_at > 0:
            rebased = rel[marker_at:]
            resolved = resolve_asset(root, rebased, stats)
            if resolved:
                stats["resolved"].append(f"{rel} -> {resolved} (rebased)")
            return resolved

    # Missing but a same-family file exists (theme.css -> theme47bb.css, etc.).
    candidate = hashed_variant(root, rel)
    if candidate:
        new_rel = (target.parent / candidate).relative_to(root).as_posix()
        stats["resolved"].append(f"{rel} -> {new_rel}")
        return new_rel

    low = rel.lower()
    if low.startswith("wp-content/plugins/woocommerce/assets/images/icons/credit-cards/"):
        make_placeholder(root, rel)
        stats["placeholders"].append(rel)
        return rel

    if target.suffix.lower() in (IMAGE_EXTS | {".html", ".htm"}):
        candidate_rel = image_variant(root, rel)
        if candidate_rel:
            new_rel = (target.parent / candidate_rel).relative_to(root).as_posix()
            stats["resolved"].append(f"{rel} -> {new_rel}")
            return new_rel
        # Broken image with no usable variant: use a neutral placeholder.
        make_placeholder(root, rel)
        stats["placeholders"].append(rel)
        return rel

    # A missing video poster or image-like asset can also fall back.
    if target.suffix.lower() in VIDEO_EXTS:
        make_placeholder(root, rel)
        stats["placeholders"].append(rel)
        return rel

    stats["missing"].append(rel)
    return None


def canonicalize_url(value: str, base: str, mode: str, root: Path, stats: dict) -> str:
    """Canonicalize one URL reference.

    mode: "href" (may be a page or asset), "asset" (never a page), "css".
    """
    raw = value
    value = value.strip()
    if is_special_url(value):
        return raw

    if value.startswith("?"):
        if mode == "href":
            page_rel = base
            # base is the page directory; the page URL itself ends in "/".
            page_path = "/" + (page_rel.strip("/") + "/" if page_rel else "")
            value = page_path + value
        else:
            return raw

    # Absolute/protocol-relative references to an internal host.
    low = value.lower()
    if low.startswith("//"):
        host = host_of(value)
        if host in INTERNAL_HOSTS:
            parsed = re.match(r"//[^/?#]+(.*)$", value, re.S)
            rest = parsed.group(1) if parsed and parsed.group(1) else "/"
            if rest.startswith(("?", "#")):
                rest = "/" + rest
            value = rest
        else:
            return raw
    elif re.match(r"^https?://", low):
        host = host_of(value)
        if host in INTERNAL_HOSTS:
            parsed = re.match(r"^https?://[^/?#]+(.*)$", value, re.S | re.I)
            rest = parsed.group(1) if parsed and parsed.group(1) else "/"
            if rest.startswith(("?", "#")):
                rest = "/" + rest
            value = rest
        else:
            return raw
    elif re.match(r"^[a-z][a-z0-9+.-]*:", low):
        return raw

    path, query, fragment = split_url(value)
    if not path:
        return raw

    if path.startswith("/"):
        rel = posix_join_base("", path.lstrip("/"))
    else:
        rel = posix_join_base(base, path)

    if not rel and path in {"/", ""}:
        rel = ""

    # Canonical page URLs never contain index.html.
    if mode == "href" and (rel == "index.html" or rel.endswith("/index.html")):
        rel = "" if rel == "index.html" else rel[: -len("/index.html")]

    # Classify href targets.  Extensionless internal URLs are pages; asset
    # extensions are files; a directory with index.html is a page.
    suffix = posixpath.splitext(rel)[1].lower()
    is_page = False
    if mode == "href":
        if rel == "" or suffix in {".html", ".htm"}:
            is_page = True
        elif not suffix and (root / rel).is_dir():
            is_page = True
        elif not suffix and not (root / rel).is_file():
            is_page = True
    elif mode == "css":
        is_page = False

    if is_page:
        page_rel = rel.rstrip("/")
        canonical_rel = (page_rel + "/") if page_rel else ""
        page_file = root / canonical_rel / "index.html" if canonical_rel else root / "index.html"
        if not page_file.is_file():
            stats["missing"].append(f"page:{canonical_rel or '/'}")
            return raw
        return "/" + canonical_rel + query + fragment

    resolved = resolve_asset(root, rel, stats)
    if resolved is None:
        # Final fallback for any remaining image-like href/asset.
        if suffix in IMAGE_EXTS:
            make_placeholder(root, rel)
            stats["placeholders"].append(rel)
            resolved = rel
        else:
            return raw
    return "/" + resolved + query + fragment


def canonicalize_srcset(value: str, base: str, root: Path, stats: dict) -> str:
    if not value.strip() or "data:" in value.lower():
        return value
    entries: list[str] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        bits = part.split(None, 1)
        url = bits[0]
        descriptor = (" " + bits[1].strip()) if len(bits) > 1 else ""
        new_url = canonicalize_url(url, base, "asset", root, stats)
        if new_url:
            entries.append(new_url + descriptor)
    return ", ".join(entries)


def canonicalize_css_text(css: str, base: str, root: Path, stats: dict) -> str:
    def url_repl(match: re.Match) -> str:
        quote = match.group("quote") or ""
        value = match.group("value").strip()
        if not value or value.startswith(("#", "%23")) or value.lower().startswith(("data:", "about:")):
            return match.group(0)
        new = canonicalize_url(value, base, "css", root, stats)
        if quote:
            return f"url({quote}{new}{quote})"
        return f"url({new})"

    css = CSS_URL_RE.sub(url_repl, css)

    def import_repl(match: re.Match) -> str:
        quote = match.group("quote")
        value = match.group("value").strip()
        if not value or value.lower().startswith(("data:", "http://", "https://", "//")):
            return match.group(0)
        new = canonicalize_url(value, base, "css", root, stats)
        return f"{match.group('prefix')}{quote}{new}{quote}"

    return CSS_IMPORT_RE.sub(import_repl, css)


def retarget_href(value: str) -> str:
    """Point links at removed backend routes to the nearest review page."""
    stripped = value.strip()
    low = stripped.lower()
    if not low or low.startswith(("#", "mailto:", "tel:", "sms:", "javascript:", "data:", "blob:")):
        return value
    host = host_of(stripped)
    if host and host not in INTERNAL_HOSTS:
        return value
    path = low.split("#", 1)[0].split("?", 1)[0]
    if "my-account" in path or "lost-password" in path:
        return "/contact/"
    if re.search(r"(^|/)(cart|checkout)(/|$)", path):
        return "/shop/"
    if any(token in path for token in ("wp-admin", "wp-json", "wp-login", "xmlrpc", "wp-comments-post", "author/admin")):
        return "/"
    if "comments/feed" in path or "/feed/" in path or path.endswith("/feed") or path == "feed":
        return "/"
    return value


def canonicalize_html(text: str, base: str, root: Path, stats: dict) -> str:
    def attr_repl(match: re.Match) -> str:
        prefix = match.group("prefix")
        quote = match.group("quote")
        value = match.group("value")
        low_prefix = prefix.lower()
        if "href=" in low_prefix or "action=" in low_prefix:
            value = retarget_href(value)
            new = canonicalize_url(value, base, "href", root, stats)
        else:
            new = canonicalize_url(value, base, "asset", root, stats)
        return f"{prefix}{quote}{new}{quote}"

    text = ATTR_RE.sub(attr_repl, text)

    def srcset_repl(match: re.Match) -> str:
        value = canonicalize_srcset(match.group("value"), base, root, stats)
        if not value.strip():
            return ""
        return f"{match.group('prefix')}{match.group('quote')}{value}{match.group('quote')}"

    text = SRCSET_RE.sub(srcset_repl, text)

    def style_attr_repl(match: re.Match) -> str:
        value = canonicalize_css_text(match.group("value"), base, root, stats)
        return f"{match.group('prefix')}{match.group('quote')}{value}{match.group('quote')}"

    text = STYLE_ATTR_RE.sub(style_attr_repl, text)

    def style_block_repl(match: re.Match) -> str:
        value = canonicalize_css_text(match.group("value"), base, root, stats)
        return f"{match.group('open')}{value}{match.group('close')}"

    text = STYLE_BLOCK_RE.sub(style_block_repl, text)
    return text


def repair_importmap(root: Path, stats: dict) -> None:
    candidates = sorted(
        p for p in (root / "wp-includes/js/dist/script-modules/interactivity").glob("index.min*.js")
        if p.is_file()
    )
    if not candidates:
        fail("no interactivity module found under wp-includes/js/dist/script-modules/interactivity")
    if len(candidates) > 1:
        stats["warnings"].append(
            "multiple interactivity modules found; using " + candidates[-1].name
        )
    module_rel = candidates[-1].relative_to(root).as_posix()
    importmap_json = json.dumps(
        {"imports": {"@wordpress/interactivity": "/" + module_rel}},
        separators=(",", ":"),
        ensure_ascii=False,
    )
    modulepreload = (
        f'<link rel="modulepreload" href="/{module_rel}" '
        'id="@wordpress/interactivity-js-modulepreload" data-wp-fetchpriority="low">'
    )

    for html_path in sorted(root.rglob("*.html")):
        text = read_text_file(html_path)
        if text is None:
            continue

        match = IMPORTMAP_RE.search(text)
        if match:
            replacement = match.group("open") + importmap_json + match.group("close") + "\n" + modulepreload
            text = text[:match.start()] + replacement + text[match.end():]
        elif MODULE_SCRIPT_RE.search(text) or "data-wp-interactive" in text:
            snippet = (
                f'<script id="wp-importmap" type="importmap">{importmap_json}</script>\n'
                f'{modulepreload}\n'
            )
            module_match = MODULE_SCRIPT_RE.search(text)
            if module_match:
                text = text[:module_match.start()] + snippet + text[module_match.start():]
            elif "</head>" in text:
                text = text.replace("</head>", snippet + "</head>", 1)
            else:
                text = snippet + text
        else:
            continue
        write_text_file(html_path, text)


def inject_overrides(root: Path, stats: dict) -> None:
    css_tag = '<link rel="stylesheet" href="/review-overrides.css" data-review-overrides="css">'
    js_tag = '<script src="/review-overrides.js" defer data-review-overrides="js"></script>'
    for html_path in sorted(root.rglob("*.html")):
        text = read_text_file(html_path)
        if text is None:
            continue
        if 'data-review-overrides="css"' not in text:
            if "</head>" in text:
                text = text.replace("</head>", css_tag + "\n</head>", 1)
            else:
                text = css_tag + "\n" + text
        if 'data-review-overrides="js"' not in text:
            if "</body>" in text:
                text = text.replace("</body>", js_tag + "\n</body>", 1)
            else:
                text = text + "\n" + js_tag + "\n"
        write_text_file(html_path, text)
        stats["pages"] += 1


def add_static_files(root: Path, stats: dict) -> None:
    for name in ("review-overrides.css", "review-overrides.js", "404.html"):
        source = OVERRIDE_DIR / name
        if not source.is_file():
            fail(f"missing override file: {source}")
        shutil.copy2(source, root / name)
    # Empty, deterministic static endpoint used by the (visually hidden) search
    # script after it is detached from the WordPress Store API.
    write_text_file(root / "products.json", "[]\n")
    # A neutral fallback for any image reference that cannot be repaired.
    placeholder = root / "static-review-placeholder.svg"
    if not placeholder.is_file():
        make_placeholder(root, "static-review-placeholder.svg")


def validate_source(source: Path, output: Path) -> None:
    if not source.is_dir():
        fail(f"source directory not found: {source}")
    if not (source / "index.html").is_file():
        fail(f"source does not look like the scraped site (no index.html): {source}")
    if not (source / "wp-content").is_dir():
        fail(f"source does not contain wp-content: {source}")
    source_resolved = source.resolve()
    output_resolved = output.resolve()
    if output_resolved == source_resolved or source_resolved in output_resolved.parents or output_resolved in source_resolved.parents:
        fail("source and output must be separate directory trees")


def run_pipeline(source: Path, dest: Path, stats: dict) -> None:
    log(f"  copy -> {dest}")
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(source, dest, symlinks=True)
    log("  clean: server routes and crawl artifacts")
    clean_tree(dest, stats)

    # HTML: remove crawl/backend markup, detach absolute hosts, canonicalize.
    html_files = sorted(dest.rglob("*.html"))
    log(f"  html: {len(html_files)} pages")
    for index, path in enumerate(html_files, 1):
        text = read_text_file(path)
        if text is None:
            continue
        text = clean_html(text)
        text = strip_hosts(text)
        base = posixpath.dirname(relpath(path, dest))
        text = canonicalize_html(text, base, dest, stats)
        write_text_file(path, text)
        if index % 20 == 0 or index == len(html_files):
            log(f"    html {index}/{len(html_files)}")

    # CSS: resolve url()/@import references relative to the stylesheet.
    css_files = sorted(dest.rglob("*.css"))
    log(f"  css: {len(css_files)} files")
    for path in css_files:
        text = read_text_file(path)
        if text is None:
            continue
        text = clean_common_text(text)
        base = posixpath.dirname(relpath(path, dest))
        text = canonicalize_css_text(text, base, dest, stats)
        write_text_file(path, text)

    # JS/JSON/XML/SVG/maps: remove hosts and detach the theme search endpoint.
    other_files = sorted(
        p for p in dest.rglob("*")
        if p.is_file() and p.suffix.lower() in (TEXT_SUFFIXES - HTML_SUFFIXES - CSS_SUFFIXES)
    )
    log(f"  scripts/data: {len(other_files)} files")
    for path in other_files:
        text = read_text_file(path)
        if text is None:
            continue
        text = clean_common_text(text)
        if path.suffix.lower() in JS_SUFFIXES:
            text = text.replace("/wp-json/wc/store/v1/products", "/products.json")
        write_text_file(path, text)

    log("  import map + stable overrides")
    repair_importmap(dest, stats)
    inject_overrides(dest, stats)
    add_static_files(dest, stats)
    log("  pipeline stages complete")


def build_manifest(source: Path, output: Path, source_hash: str, output_hash: str,
                   stats: dict) -> None:
    files = sum(1 for p in output.rglob("*") if p.is_file())
    manifest = {
        "source": relpath(source, REPO) if source.is_relative_to(REPO) else str(source),
        "source_sha256": source_hash,
        "output": relpath(output, REPO) if output.is_relative_to(REPO) else str(output),
        "output_sha256": output_hash,
        "files": files,
        "pages": stats["pages"],
        "canonical_url_contract": {
            "internal_urls": "root-relative",
            "page_urls": "trailing slash",
            "index_html_in_page_links": False,
        },
        "resolved_assets": sorted(set(stats["resolved"])),
        "placeholders": sorted(set(stats["placeholders"])),
        "removed": sorted(set(stats["removed"])),
        "warnings": sorted(set(stats["warnings"])),
    }
    write_text_file(REPO / "build-manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


def swap_output(temp: Path, output: Path) -> None:
    backup = REPO / ".build-public.old"
    if backup.exists():
        shutil.rmtree(backup)
    if output.exists():
        output.rename(backup)
    try:
        temp.rename(output)
    except Exception:
        if backup.exists() and not output.exists():
            backup.rename(output)
        raise
    if backup.exists():
        shutil.rmtree(backup)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check-repeatable", action="store_true",
                        help="build twice and compare content-only tree hashes")
    args = parser.parse_args()

    source = args.source if args.source.is_absolute() else (REPO / args.source)
    output = args.output if args.output.is_absolute() else (REPO / args.output)
    validate_source(source, output)

    source_hash, _ = sha256_tree(source)
    temp = REPO / ".build-public.tmp"
    stats = {
        "removed": [], "resolved": [], "placeholders": [], "missing": [],
        "warnings": [], "pages": 0,
    }

    log(f"source: {source}")
    log(f"source sha256: {source_hash}")
    run_pipeline(source, temp, stats)

    if stats["missing"]:
        for item in sorted(set(stats["missing"])):
            log(f"  missing: {item}")
        fail("unresolved local references; inspect the list above")

    if args.check_repeatable:
        check_dir = REPO / ".build-public.check"
        check_stats = {
            "removed": [], "resolved": [], "placeholders": [], "missing": [],
            "warnings": [], "pages": 0,
        }
        run_pipeline(source, check_dir, check_stats)
        temp_hash, _ = sha256_tree(temp)
        check_hash, _ = sha256_tree(check_dir)
        if temp_hash != check_hash:
            fail(f"repeatability check failed: {temp_hash} != {check_hash}")
        shutil.rmtree(check_dir)
        log(f"repeatability: OK ({temp_hash})")

    swap_output(temp, output)
    output_hash, _ = sha256_tree(output)
    build_manifest(source, output, source_hash, output_hash, stats)

    log(f"output: {output}")
    log(f"output sha256: {output_hash}")
    log(f"pages: {stats['pages']}  files: {sum(1 for p in output.rglob('*') if p.is_file())}")
    if stats["resolved"]:
        log(f"repaired asset references: {len(set(stats['resolved']))}")
    if stats["placeholders"]:
        log(f"generated placeholders: {len(set(stats['placeholders']))}")
    log("build complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
