/**
 * Cinematic Hero — frontend engine.
 *
 * Phase A (entrance): one master GSAP timeline fires once fonts are ready and
 * staggers the composition in — orbit arc draws, the centered kicker fades,
 * headline lines clip-reveal (y:130% -> 0 via the per-line masks), the central
 * object scales/fades up, and the "GET A TASTE" link rises.
 * SplitText is not vendored, so the reveal uses the per-line mask markup.
 *
 * Phase B (scrub): a ScrollTrigger timeline over the hero range travels the
 * headline up and out, parallaxes the central bottom-anchored object and lifts
 * a cream shade. The below-fold handoff clip-reveals through its OWN entry
 * scrub (same mask mechanic as the headline) as the reveal section scrolls
 * into view. scrollMode "scrub"
 * (default) scrubs with the scrollbar; "pinned" pins the stage for a
 * cinematic hold.
 *
 * Phase C (nav): as the backdrop darkens the block toggles body.bakly-hero-
 * scrolled so the persistent header can compact + reveal its secondary button.
 *
 * Nothing is hidden behind JS: reduced-motion, no GSAP, or entrance off leave
 * every element visible and static (the static baseline lives in style.css).
 */
( function () {
	'use strict';

	var reduce = window.matchMedia( '(prefers-reduced-motion: reduce)' );

	function each( list, fn ) {
		Array.prototype.forEach.call( list, fn );
	}
	function q( root, sel ) {
		return root.querySelector( sel );
	}
	function qa( root, sel ) {
		return Array.prototype.slice.call( root.querySelectorAll( sel ) );
	}

	function setBg( root, stage, progress ) {
		var light = getComputedStyle( root ).getPropertyValue( '--bakly-cine-light' ) || '#F4EFE9';
		var shade = root.querySelector( '.bakly-cine__shade' );
		if ( shade ) {
			shade.style.opacity = progress.toFixed( 3 );
		}
		root.style.setProperty( '--bakly-cine-fg', light );
		root.classList.toggle( 'is-scrolled', progress > 0.45 );
		document.body.classList.toggle( 'bakly-hero-scrolled', progress > 0.45 );
	}


	function playEntrance( root, gsap ) {
		var arc = q( root, '.bakly-cine__orbit-arc' );
		var kicker = q( root, '.bakly-cine__kicker' );
		var lineInners = qa( root, '.bakly-cine__line-inner' );
		var object = q( root, '.bakly-cine__object' );
		var cta = q( root, '.bakly-cine__cta' );

		var tl = gsap.timeline( { defaults: { ease: 'power3.out' } } );

		if ( arc ) {
			var len = 2600;
			try {
				len = arc.getTotalLength ? arc.getTotalLength() : len;
			} catch ( e ) {}
			gsap.set( arc, { strokeDasharray: len, strokeDashoffset: len, opacity: 0.16 } );
			tl.to( arc, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }, 0 );
		}

		if ( kicker ) {
			tl.from( kicker, { opacity: 0, duration: 0.8 }, 0.15 );
		}

		if ( lineInners.length ) {
			tl.from( lineInners, { yPercent: 130, duration: 1.1, stagger: 0.12 }, 0.3 );
		}

		if ( object ) {
			tl.fromTo(
				object,
				{ scale: 0.82, opacity: 0, y: 40 },
				{ scale: 1, opacity: 1, y: 0, duration: 1.3 },
				0.45
			);
		}

		// The bottom link belongs to the first composition, then settles in with it.
		if ( cta ) {
			tl.from( cta, { opacity: 0, y: 14, duration: 0.7 }, 0.9 );
		}

		return tl;
	}

	function playScrub( root, gsap ) {
		var stage = q( root, '.bakly-cine__stage' );
		var lines = qa( root, '.bakly-cine__line' );
		var object = q( root, '.bakly-cine__object' );
		var kicker = q( root, '.bakly-cine__kicker' );
		var cta = q( root, '.bakly-cine__cta' );
		var revealSection = q( root, '.bakly-cine__reveal' );
		var revealInner = q( root, '.bakly-cine__reveal-title-inner' );
		var revealKicker = q( root, '.bakly-cine__reveal-kicker' );
		var mode = root.getAttribute( 'data-scroll-mode' ) || 'scrub';

		var tl = gsap.timeline( {
			scrollTrigger: {
				trigger: root,
				start: 'top top',
				end: 'bottom bottom',
				scrub: true,
				invalidateOnRefresh: true,
				pin: 'pinned' === mode ? stage : false,
				pinSpacing: 'pinned' === mode,
				anticipatePin: 1,
				onUpdate: function ( self ) {
					setBg( root, stage, self.progress );
				}
			}
		} );

		if ( lines.length ) {
			tl.fromTo( lines, { yPercent: 0, opacity: 1 }, { yPercent: -60, opacity: 0, ease: 'none', stagger: 0.04 }, 0 );
		}
		if ( kicker ) {
			tl.to( kicker, { opacity: 0, ease: 'none' }, 0 );
		}
		if ( object ) {
			tl.fromTo( object, { yPercent: 0 }, { yPercent: -22, ease: 'none' }, 0 );
		}
		// The bottom link fades late in the scrub while it is still on screen.
		if ( cta ) {
			tl.to( cta, { opacity: 0, ease: 'none' }, 0.85 );
		}

		if ( revealSection ) {
			var handoff = gsap.timeline( {
				scrollTrigger: {
					trigger: revealSection,
					start: 'top 100%',
					end: 'top 45%',
					scrub: true,
					invalidateOnRefresh: true
				}
			} );
			if ( revealInner ) {
				handoff.fromTo( revealInner, { yPercent: 130 }, { yPercent: 0, ease: 'none' }, 0 );
			}
			if ( revealKicker ) {
				handoff.fromTo( revealKicker, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' }, 0.1 );
			}
		}

		return tl;
	}

	function initRoot( root, gsap ) {
		if ( root.dataset.baklyCineInit ) {
			return;
		}
		root.dataset.baklyCineInit = '1';

		var entrance = root.getAttribute( 'data-entrance' ) === '1';

		function build() {
			if ( entrance ) {
				playEntrance( root, gsap );
			} else {
				var cta = q( root, '.bakly-cine__cta' );
				if ( cta ) { gsap.set( cta, { opacity: 1, y: 0 } );
				}
			}
			playScrub( root, gsap );
			if ( window.ScrollTrigger && window.ScrollTrigger.refresh ) {
				window.ScrollTrigger.refresh();
			}
		}

		function when() {
			if ( window.baklyPreloaderReady && typeof window.baklyPreloaderReady.then === 'function' ) {
				return window.baklyPreloaderReady;
			}
			if ( document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function' ) {
				return document.fonts.ready;
			}
			return Promise.resolve();
		}
		when().then( build );
	}

	function boot() {
		var roots = qa( document, '.bakly-cinematic-hero[data-bakly-cine="1"]' );
		if ( ! roots.length ) {
			return;
		}
		if ( reduce.matches || ! window.gsap || ! window.ScrollTrigger ) {
			// Static fallback: everything visible in place, nothing hidden.
			each( roots, function ( root ) {
				var cta = q( root, '.bakly-cine__cta' );
				if ( cta ) { cta.style.opacity = '1'; }
				var arc = q( root, '.bakly-cine__orbit-arc' );
				if ( arc ) { arc.style.strokeDashoffset = '0'; }
			} );
			return;
		}

		var gsap = window.gsap;
		if ( gsap.registerPlugin ) {
			gsap.registerPlugin( window.ScrollTrigger );
		}

		// Touch-only: normalizeScroll's default type is "wheel,touch", so
		// enabling it unconditionally would also take over desktop wheel
		// scrolling. allowNestedScroll keeps the mobile drawer scrollable.
		if ( window.ScrollTrigger.isTouch === 1 && typeof window.ScrollTrigger.normalizeScroll === 'function' ) {
			window.ScrollTrigger.normalizeScroll( { allowNestedScroll: true } );
		}

		// iOS portrait cannot suppress its address bar; skip auto refreshes
		// caused by a height-only resize.
		if ( typeof window.ScrollTrigger.config === 'function' ) {
			window.ScrollTrigger.config( { ignoreMobileResize: true } );
		}

		var refreshTimer = 0;
		var lastWidth = window.innerWidth;

		function scheduleRefresh() {
			window.clearTimeout( refreshTimer );
			refreshTimer = window.setTimeout( function () {
				if ( window.ScrollTrigger && typeof window.ScrollTrigger.refresh === 'function' ) {
					window.ScrollTrigger.refresh();
				}
			}, 200 );
		}

		function onViewportChange() {
			// A height-only change on a touch-only device IS the address bar;
			// reacting to it is what causes the mid-scroll hop.
			if ( window.ScrollTrigger.isTouch === 1 && window.innerWidth === lastWidth ) {
				return;
			}
			lastWidth = window.innerWidth;
			scheduleRefresh();
		}

		window.addEventListener( 'resize', onViewportChange );
		window.addEventListener( 'orientationchange', onViewportChange );

		each( roots, function ( root ) {
			initRoot( root, gsap );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', boot );
	} else {
		boot();
	}
} )();
