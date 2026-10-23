#!/usr/bin/env python3
"""Verify the static review build.

This is deliberately independent of build.py: it re-parses the generated HTML
and CSS, resolves every local reference, and enforces the URL contract.  It
exits non-zero if anything still points at a crawl host, a removed backend
route, a missing file, or an index.html page URL.

Usage:
    python3 scripts/verify.py
    python3 scripts/verify.py --output public
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import sys
from pathlib import Path
from urllib.parse import unquote

REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO / "public"

TEXT_SUFFIXES = {".html", ".htm", ".css", ".js", ".mjs", ".json", ".xml", ".svg", ".map", ".txt"}
HTML_SUFFIXES = {".html", ".htm"}
CSS_SUFFIXES = {".css"}
JS_SUFFIXES = {".js", ".mjs"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"}
CRAWL_HOST_RE = re.compile(r"(?:bakery\.local|cherrie-site\.vercel\.app)", re.I)
REMOVED_ROUTE_RE = re.compile(
    r"(?:^|/)(?:wp-admin|wp-json|my-account|cart|checkout|feed|comments|"
    r"wp-login|xmlrpc|wp-comments-post|author/admin)(?:/|$)",
    re.I,
)
HEX_INDEX_RE = re.compile(r"^index[0-9a-f]{4}\.html$", re.I)

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
    r"<script\b[^>]*id=[\"']wp-importmap[\"'][^>]*>(?P<value>.*?)</script\s*>",
    re.I | re.S,
)
MODULEPRELOAD_RE = re.compile(
    r"<link\b[^>]*rel=[\"']modulepreload[\"'][^>]*>",
    re.I | re.S,
)
MODULE_SCRIPT_RE = re.compile(
    r"<script\b[^>]*\btype=[\"']module[\"'][^>]*>",
    re.I | re.S,
)


def read_text(path: Path) -> str | None:
    raw = path.read_bytes()
    if b"\x00" in raw[:512]:
        return None
    try:
        return raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="ignore").replace("\r\n", "\n").replace("\r", "\n")


def sha256_tree(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def is_special(value: str) -> bool:
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


def split_ref(value: str) -> tuple[str, str]:
    """Return (path, suffix) where suffix includes ?query and/or #fragment."""
    if "#" in value:
        value, fragment = value.split("#", 1)
        suffix = "#" + fragment
    else:
        suffix = ""
    if "?" in value:
        value, query = value.split("?", 1)
        suffix = "?" + query + suffix
    return value, suffix


def join_base(base: str, path: str) -> str:
    joined = posixpath.join("/", base, path)
    normalized = posixpath.normpath(joined)
    return normalized.lstrip("/") if normalized != "/" else ""


class Verifier:
    def __init__(self, root: Path):
        self.root = root
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.checked_refs = 0
        self.page_count = 0
        self.css_count = 0
        self.importmap_count = 0
        self.removed_route_refs = 0

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def check_all_text_for_hosts(self) -> None:
        for path in sorted(p for p in self.root.rglob("*") if p.is_file()):
            if path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            text = read_text(path)
            if text is None:
                continue
            rel = path.relative_to(self.root).as_posix()
            for match in CRAWL_HOST_RE.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                self.error(f"{rel}:{line}: crawl/production host remains: {match.group(0)}")

    def check_removed_tree(self) -> None:
        for name in ("wp-admin", "wp-json", "my-account", "cart", "checkout",
                     "author", "feed", "comments"):
            if (self.root / name).exists():
                self.error(f"removed route directory still exists: {name}/")
        for path in sorted(self.root.glob("index*.html")):
            if path.name != "index.html" and HEX_INDEX_RE.match(path.name):
                self.error(f"HTTrack duplicate page still exists: {path.name}")
        for path in sorted(self.root.rglob("*.php")):
            self.error(f"PHP file still exists: {path.relative_to(self.root).as_posix()}")
        for path in sorted((self.root / "wp-content" / "uploads").rglob("*.html")):
            self.error(f"HTML error page still exists in uploads: {path.relative_to(self.root).as_posix()}")
        for pattern in ("*.readme", "*.tmp", "*.whtt", "hts-*", "backblue.gif", "fade.gif"):
            for path in sorted(self.root.rglob(pattern)):
                self.error(f"crawl artifact still exists: {path.relative_to(self.root).as_posix()}")

    def check_required_files(self) -> None:
        required = [
            "index.html", "404.html", "review-overrides.css", "review-overrides.js",
            "products.json", "static-review-placeholder.svg",
        ]
        for name in required:
            if not (self.root / name).is_file():
                self.error(f"required output file missing: {name}")
        products = self.root / "products.json"
        if products.is_file():
            try:
                data = json.loads(read_text(products) or "")
                if not isinstance(data, list):
                    self.error("products.json must be a JSON array")
            except Exception as exc:
                self.error(f"products.json is not valid JSON: {exc}")
        modules = sorted((self.root / "wp-includes/js/dist/script-modules/interactivity").glob("index.min*.js"))
        if not modules:
            self.error("interactivity module is missing from wp-includes")

    def check_raw_internal_url(self, rel_file: str, value: str, kind: str) -> str | None:
        """Validate the raw form and return the path part for resolution."""
        stripped = value.strip()
        if is_special(stripped):
            return None
        if stripped.startswith("//"):
            host = host_of(stripped)
            if host and CRAWL_HOST_RE.search(host):
                self.error(f"{rel_file}: internal host URL is not root-relative: {stripped}")
            return None
        if re.match(r"^[a-z][a-z0-9+.-]*://", stripped, re.I):
            host = host_of(stripped)
            if host and CRAWL_HOST_RE.search(host):
                self.error(f"{rel_file}: internal host URL is not root-relative: {stripped}")
            return None
        if re.match(r"^[a-z][a-z0-9+.-]*:", stripped, re.I):
            return None
        if stripped.startswith("?"):
            self.error(f"{rel_file}: query-only URL was not canonicalized: {stripped}")
            return None
        if not stripped.startswith("/"):
            self.error(f"{rel_file}: internal URL is not root-relative: {stripped}")
            return None
        path, _ = split_ref(stripped)
        if path.endswith("/index.html") or path == "/index.html" or path.endswith("/index.htm") or path == "/index.htm":
            self.error(f"{rel_file}: internal page URL contains index.html: {stripped}")
        if REMOVED_ROUTE_RE.search(path):
            self.removed_route_refs += 1
            self.error(f"{rel_file}: URL points at a removed route: {stripped}")
        if ".." in path.split("/"):
            self.error(f"{rel_file}: URL still contains a parent segment: {stripped}")
        return path

    def resolve(self, rel_file: str, value: str, base: str, kind: str) -> None:
        self.checked_refs += 1
        path = self.check_raw_internal_url(rel_file, value, kind)
        if path is None:
            return
        if path in {"", "/"}:
            rel = "index.html"
        else:
            rel = unquote(path.lstrip("/"))
        target = self.root / rel
        if kind == "href":
            if target.is_dir():
                target = target / "index.html"
            elif not target.is_file():
                # Extensionless hrefs are page URLs; try the directory form.
                dir_target = target / "index.html"
                if dir_target.is_file():
                    target = dir_target
        if target.is_file():
            return
        if kind == "asset" and target.suffix.lower() in {".html", ".htm"}:
            self.error(f"{rel_file}: asset reference points at HTML: {value}")
        self.error(f"{rel_file}: local reference does not exist: {value}")

    def scan_css_text(self, rel_file: str, css: str, base: str) -> None:
        for match in CSS_URL_RE.finditer(css):
            value = match.group("value").strip()
            if not value or value.startswith(("#", "%23")):
                continue
            if value.lower().startswith(("data:", "about:")):
                continue
            self.resolve(rel_file, value, base, "asset")
        for match in CSS_IMPORT_RE.finditer(css):
            value = match.group("value").strip()
            if not value or value.lower().startswith(("data:", "http://", "https://", "//")):
                continue
            host = host_of(value)
            if host and CRAWL_HOST_RE.search(host):
                self.error(f"{rel_file}: internal host @import is not root-relative: {value}")
                continue
            self.resolve(rel_file, value, base, "asset")

    def check_module_map(self, rel_file: str, text: str) -> None:
        needs_importmap = bool(MODULE_SCRIPT_RE.search(text)) or "data-wp-interactive" in text
        match = IMPORTMAP_RE.search(text)
        if not match:
            if needs_importmap:
                self.error(f"{rel_file}: module scripts are present but wp-importmap is missing")
            return
        self.importmap_count += 1
        try:
            data = json.loads(match.group("value"))
        except Exception as exc:
            self.error(f"{rel_file}: wp-importmap is not valid JSON: {exc}")
            return
        imports = data.get("imports") if isinstance(data, dict) else None
        target = imports.get("@wordpress/interactivity") if isinstance(imports, dict) else None
        if not isinstance(target, str) or not target.startswith("/"):
            self.error(f"{rel_file}: @wordpress/interactivity import is missing or not root-relative")
        else:
            self.resolve(rel_file, target, posixpath.dirname(rel_file), "asset")

        for link in MODULEPRELOAD_RE.findall(text):
            href = re.search(r"\bhref\s*=\s*([\"'])(.*?)\1", link, re.I | re.S)
            if href:
                self.resolve(rel_file, href.group(2), posixpath.dirname(rel_file), "asset")

    def check_html(self, path: Path) -> None:
        text = read_text(path)
        if text is None:
            return
        rel_file = path.relative_to(self.root).as_posix()
        self.page_count += 1
        base = posixpath.dirname(rel_file)

        for match in ATTR_RE.finditer(text):
            prefix = match.group("prefix").lower()
            kind = "href" if ("href=" in prefix or "action=" in prefix) else "asset"
            self.resolve(rel_file, match.group("value"), base, kind)

        for match in SRCSET_RE.finditer(text):
            value = match.group("value")
            if "data:" in value.lower():
                continue
            for part in value.split(","):
                part = part.strip()
                if not part:
                    continue
                url = part.split(None, 1)[0]
                self.resolve(rel_file, url, base, "asset")

        for match in STYLE_ATTR_RE.finditer(text):
            self.scan_css_text(rel_file, match.group("value"), base)
        for match in STYLE_BLOCK_RE.finditer(text):
            self.scan_css_text(rel_file, match.group("value"), base)

        if rel_file != "404.html":
            if 'data-review-overrides="css"' not in text:
                self.error(f"{rel_file}: review-overrides.css was not injected")
            if 'data-review-overrides="js"' not in text:
                self.error(f"{rel_file}: review-overrides.js was not injected")

        if re.search(r"<link\b[^>]*(?:canonical|shortlink)", text, re.I):
            self.error(f"{rel_file}: obsolete canonical/shortlink tag remains")
        if "/wp-json/" in text or "admin-ajax.php" in text:
            self.warn(f"{rel_file}: HTML still mentions a WordPress backend endpoint")
        self.check_module_map(rel_file, text)

    def check_css(self, path: Path) -> None:
        text = read_text(path)
        if text is None:
            return
        rel_file = path.relative_to(self.root).as_posix()
        self.css_count += 1
        self.scan_css_text(rel_file, text, posixpath.dirname(rel_file))

    def check_manifest(self) -> None:
        manifest_path = REPO / "build-manifest.json"
        if not manifest_path.is_file():
            self.warn("build-manifest.json is missing")
            return
        try:
            manifest = json.loads(read_text(manifest_path) or "")
        except Exception as exc:
            self.error(f"build-manifest.json is not valid JSON: {exc}")
            return
        expected = manifest.get("output_sha256")
        if self.root == DEFAULT_OUTPUT and expected:
            actual = sha256_tree(self.root)
            if actual != expected:
                self.error(f"build-manifest.json output hash does not match public/: {actual} != {expected}")

    def run(self) -> int:
        self.check_all_text_for_hosts()
        self.check_removed_tree()
        self.check_required_files()
        for path in sorted(self.root.rglob("*.html")):
            self.check_html(path)
        for path in sorted(self.root.rglob("*.css")):
            self.check_css(path)
        self.check_manifest()

        if self.removed_route_refs:
            self.warn(f"{self.removed_route_refs} references to removed routes were reported")
        print(f"output: {self.root}")
        print(f"pages: {self.page_count}")
        print(f"CSS files: {self.css_count}")
        print(f"local references checked: {self.checked_refs}")
        print(f"import maps: {self.importmap_count}")
        print(f"errors: {len(self.errors)}")
        print(f"warnings: {len(self.warnings)}")
        for message in self.warnings:
            print(f"WARN  {message}")
        for message in self.errors:
            print(f"ERROR {message}")
        return 1 if self.errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    root = args.output if args.output.is_absolute() else (REPO / args.output)
    if not root.is_dir():
        print(f"verify: output directory not found: {root}", file=sys.stderr)
        return 2
    return Verifier(root).run()


if __name__ == "__main__":
    raise SystemExit(main())
