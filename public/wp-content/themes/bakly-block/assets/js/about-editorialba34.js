( function () {
	'use strict';

	function boot() {
		var root = document.querySelector( '.bakly-about-editorial' );
		var reduce = window.matchMedia( '(prefers-reduced-motion: reduce)' );
		if ( ! root || reduce.matches || ! window.gsap || ! window.ScrollTrigger ) {
			return;
		}

		var gsap = window.gsap;
		gsap.registerPlugin( window.ScrollTrigger );

		var title = document.querySelector( '.bakly-single-page > .wp-block-post-title' );
		if ( title ) {
			gsap.fromTo( title, {
				autoAlpha: 0,
				y: 24
			}, {
				autoAlpha: 1,
				y: 0,
				duration: 1,
				ease: 'power2.out'
			} );
		}

		Array.prototype.forEach.call( root.querySelectorAll( '.bakly-about-reveal' ), function ( element ) {
			gsap.fromTo( element, {
				autoAlpha: 0,
				y: 32
			}, {
				autoAlpha: 1,
				y: 0,
				duration: 0.85,
				ease: 'power2.out',
				scrollTrigger: {
					trigger: element,
					start: 'top 88%',
					once: true
				}
			} );
		} );

		var parallaxDistance = window.matchMedia( '(max-width: 781px)' ).matches ? 2 : 5;
		Array.prototype.forEach.call( root.querySelectorAll( '.bakly-about-hero__image img, .bakly-about-feature__image img' ), function ( image ) {
			gsap.fromTo( image, {
				yPercent: -parallaxDistance
			}, {
				yPercent: parallaxDistance,
				ease: 'none',
				scrollTrigger: {
					trigger: image.closest( 'figure' ),
					start: 'top bottom',
					end: 'bottom top',
					scrub: 0.6
				}
			} );
		} );

		window.addEventListener( 'load', function () {
			window.ScrollTrigger.refresh();
		}, { once: true } );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', boot );
	} else {
		boot();
	}
} )();
