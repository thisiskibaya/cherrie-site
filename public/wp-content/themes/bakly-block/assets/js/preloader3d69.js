/**
 * Bakly sitewide page preloader (front pages with load-time orchestration only).
 *
 * Server (functions.php) prints the overlay markup + head CSS only when the
 * page carries an orchestration block (cinematic hero / menu page), and an
 * inline one-liner adds html.bakly-preload-on — so with JS off the overlay
 * never shows (CSS hides it without the class). This script:
 *  - waits for fonts + overlay logo decode + a minimum brand beat, capped by
 *    a force-reveal failsafe;
 *  - on desktop, morphs the big overlay logo to the header logo slot (FLIP,
 *    transform-only) then cross-fades as the cream field wipes upward;
 *  - on mobile (or whenever the header slot is unmeasurable) it scales the
 *    logo down in place and fades before the wipe (user decision: mobile has
 *    no fixed logo target);
 *  - resolves window.baklyPreloaderReady and fires `bakly:preloader-done`
 *    exactly when the wipe starts, which is when the page's animation
 *    orchestrations (cinematic hero / menu page) are allowed to build;
 *  - reduced motion skips the loader entirely.
 */
( function () {
	'use strict';

	var BEAT_MS = 800;
	var CAP_MS = 2500;
	var MORPH_MS = 900;
	var WIPE_MS = 850;

	var reduce = window.matchMedia( '(prefers-reduced-motion: reduce)' );
	var html = document.documentElement;
	var overlay = document.querySelector( '[data-bakly-preloader]' );
	var mobile = window.matchMedia( '(max-width: 781px)' );
	var onEnd = null;

	function listeners( el, type, fn ) {
		el.addEventListener( type, fn, { once: true } );
		return fn;
	}

	// Lock release only: visibility is gated by .is-active on the overlay.
	function settle() {
		html.classList.remove( 'bakly-preload-on' );
	}

	function settleAll() {
		if ( onEnd ) { return; }
		onEnd = function () {};
		html.classList.remove( 'bakly-preload-on' );
	}

	function finish() {
		onEnd = onEnd || function () {};
		settle();
		if ( overlay && overlay.parentNode ) {
			overlay.parentNode.removeChild( overlay );
		}
	}

	function resolveHandoff() {
		if ( ! window.baklyPreloaderDone ) {
			window.baklyPreloaderDone = true;
			var ready = window.baklyPreloaderReady;
			if ( ready && typeof ready.resolveFn === 'function' ) {
				ready.resolveFn();
			}
			window.baklyPreloaderReady = Promise.resolve();
		}
		document.dispatchEvent( new CustomEvent( 'bakly:preloader-done' ) );
	}

	function beginWipe() {
		resolveHandoff();
		if ( ! overlay ) {
			finish();
			return;
		}
		var logo = overlay.querySelector( '.bakly-preloader__logo' );
		var field = overlay.querySelector( '.bakly-preloader__field' );
		onEnd = onEnd || function () {};
		overlay.classList.add( 'is-out' );
		if ( field ) {
			listeners( field, 'transitionend', function ( ev ) {
				if ( 'transform' === ev.propertyName ) { finish(); }
			} );
		}
		window.setTimeout( finish, WIPE_MS + 250 );
		if ( logo ) { logo.style.opacity = '0'; }
	}

	function morphToHeader() {
		var logo = overlay && overlay.querySelector( '.bakly-preloader__logo' );
		var target = document.querySelector( '.bakly-header-logo img' );
		if ( ! logo || ! target || mobile.matches || reduce.matches ) {
			return false;
		}
		var from = logo.getBoundingClientRect();
		if ( ! from.width ) { return false; }
		var to = target.getBoundingClientRect();
		if ( ! to.width ) { return false; }
		var dx = ( to.left + to.width / 2 ) - ( from.left + from.width / 2 );
		var dy = ( to.top + to.height / 2 ) - ( from.top + from.height / 2 );
		var scale = to.width / from.width;
		logo.style.transform = 'translate( -50%, -50% ) translate( ' + dx.toFixed( 1 ) + 'px, ' + dy.toFixed( 1 ) + 'px ) scale( ' + scale.toFixed( 4 ) + ' )';
		listeners( logo, 'transitionend', function ( ev ) {
			if ( 'transform' === ev.propertyName ) { beginWipe(); }
		} );
		// Transition may be coalesced/absent (or interrupted): hard dock.
		window.setTimeout( function () { beginWipe(); }, MORPH_MS + 150 );
		return true;
	}

	function exitInPlace() {
		var logo = overlay && overlay.querySelector( '.bakly-preloader__logo' );
		if ( logo ) {
			logo.style.opacity = '0';
			logo.style.transform = 'translate( -50%, -50% ) scale( 0.9 )';
		}
	}

	function wait( ms ) {
		return new Promise( function ( res ) { window.setTimeout( res, ms ); } );
	}

	function imageReady( img ) {
		if ( ! img ) { return true; }
		if ( img.complete && img.naturalWidth ) { return true; }
		return ( typeof img.decode === 'function' ? img.decode() : img.load ? img.load() : Promise.resolve() ).catch( function () {} );
	}

	function go() {
		if ( onEnd ) { return; }
		if ( ! morphToHeader() ) {
			if ( overlay ) { exitInPlace(); }
			window.setTimeout( function () { beginWipe(); }, 520 );
		}
	}

	function boot() {
		overlay = overlay || document.querySelector( '[data-bakly-preloader]' );
		if ( ! window.baklyPreloaderReady ) {
			var resFn;
			var p = new Promise( function ( res ) { resFn = res; } );
			p.resolveFn = resFn;
			window.baklyPreloaderReady = p;
		}
		if ( reduce.matches || ! overlay ) {
			settleAll();
			resolveHandoff();
			window.setTimeout( finish, 0 );
			return;
		}
		var overlayImg = overlay.querySelector( 'img' );
		var fonts = ( document.fonts && document.fonts.ready ) ? document.fonts.ready : Promise.resolve();
		Promise.all( [ fonts, imageReady( overlayImg ), wait( BEAT_MS ) ] ).then(
			go,
			function () { go(); }
		);
		window.setTimeout( go, CAP_MS );
	}

	if ( 'loading' === document.readyState ) {
		document.addEventListener( 'DOMContentLoaded', boot, { once: true } );
	} else {
		boot();
	}
} )();
