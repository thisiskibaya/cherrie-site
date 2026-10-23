/*
 * Stable review-site runtime overrides.
 *
 * This file deliberately does not depend on any hashed theme filename. It is
 * loaded after the theme scripts and only does three things:
 *   1. prevents forms from trying to reach a WordPress backend,
 *   2. applies the cinematic-hero ScrollTrigger stability fix,
 *   3. acts as a last-resort guard for any stale backend link.
 */
(function () {
	'use strict';

	var STATIC_NOTE = 'This is a static review site. Please contact us directly to order or subscribe.';

	function showStaticNote(form) {
		if (!form || !form.parentNode) {
			return;
		}
		form.setAttribute('data-static-review', 'true');
		var existing = form.parentNode.querySelector('.bakly-static-note');
		if (existing) {
			return;
		}
		var note = document.createElement('p');
		note.className = 'bakly-static-note';
		note.setAttribute('role', 'status');
		note.textContent = STATIC_NOTE;
		form.parentNode.insertBefore(note, form.nextSibling);
	}

	// Capture runs before the theme/CF7 submit handlers, so the browser never
	// navigates and no AJAX request is started.
	document.addEventListener('submit', function (event) {
		var form = event.target;
		if (!form || form.nodeName !== 'FORM') {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		showStaticNote(form);
	}, true);

	function applyHeroFix() {
		var ST = window.ScrollTrigger;
		if (!ST) {
			return false;
		}
		try {
			if (typeof ST.normalizeScroll === 'function') {
				ST.normalizeScroll(true);
			}
			if (typeof ST.getAll === 'function') {
				ST.getAll().forEach(function (trigger) {
					if (trigger && trigger.vars) {
						trigger.vars.invalidateOnRefresh = true;
					}
				});
			}
			if (typeof ST.refresh === 'function') {
				ST.refresh();
			}
		} catch (error) {
			// A visual enhancement must never break the static page.
		}
		return true;
	}

	if (!applyHeroFix()) {
		var attempts = 0;
		var wait = window.setInterval(function () {
			attempts += 1;
			if (applyHeroFix() || attempts > 60) {
				window.clearInterval(wait);
			}
		}, 100);
	}

	window.addEventListener('load', applyHeroFix, { once: true });

	var refreshTimer = 0;
	function refreshHero() {
		window.clearTimeout(refreshTimer);
		refreshTimer = window.setTimeout(applyHeroFix, 180);
	}
	window.addEventListener('resize', refreshHero, { passive: true });
	window.addEventListener('orientationchange', refreshHero, { passive: true });

	// Defensive fallback: canonicalization should have retargeted these links,
	// but a stale fragment of third-party markup should never navigate to a
	// backend route on the static host.
	document.addEventListener('click', function (event) {
		var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
		if (!link) {
			return;
		}
		if (link.origin && window.location.origin && link.origin !== window.location.origin) {
			return;
		}
		var href = link.getAttribute('href') || '';
		var destination = '';
		if (/(?:wp-json|wp-admin|xmlrpc|wp-login|wp-comments-post)/i.test(href)) {
			destination = '/';
		} else if (/(?:my-account|lost-password)/i.test(href)) {
			destination = '/contact/';
		} else if (/(?:^|\/)(?:cart|checkout)(?:\/|$|\?)/i.test(href)) {
			destination = '/shop/';
		}
		if (destination) {
			event.preventDefault();
			window.location.assign(destination);
		}
	}, true);
}());
