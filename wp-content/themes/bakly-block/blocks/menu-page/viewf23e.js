( function () {
	'use strict';

	var reduce = window.matchMedia( '(prefers-reduced-motion: reduce)' );

	function init( root ) {
		var sections = root.querySelectorAll( '[data-menu-section]' );
		var links = root.querySelectorAll( '[data-menu-link]' );
		if ( ! sections.length || ! links.length ) { return; }
		if ( ! window.gsap || ! window.ScrollTrigger ) { return; }

		var gsap = window.gsap;
		var ScrollTrigger = window.ScrollTrigger;
		var lenis = null;

		if ( window.Lenis && ! reduce.matches ) {
			lenis = new window.Lenis( { respectReducedMotion: true } );
			lenis.on( 'scroll', ScrollTrigger.update );
			gsap.ticker.add( function ( time ) {
				lenis.raf( time * 1000 );
			} );
			gsap.ticker.lagSmoothing( 0 );
		}

		var ctx = gsap.context( function () {
			root.querySelectorAll( '[data-marquee]' ).forEach( function ( marquee ) {
				var track = marquee.querySelector( '.bakly-marquee-track' );
				if ( ! track ) { return; }
				var halves = track.children;
				if ( halves.length > 1 ) {
					var fill = function () {
						var target = marquee.offsetWidth * 2;
						var guard = 0;
						while ( track.scrollWidth < target && guard < 8 ) {
							halves[ 0 ].innerHTML += halves[ 0 ].innerHTML;
							halves[ 1 ].innerHTML += halves[ 1 ].innerHTML;
							guard++;
						}
					};
					fill();
					if ( window.ResizeObserver ) {
						new window.ResizeObserver( fill ).observe( marquee );
					}
				}
				gsap.to( track, {
					xPercent: -25,
					ease: 'none',
					scrollTrigger: {
						trigger: marquee,
						start: 'top bottom',
						end: 'bottom top',
						scrub: 1.5
					}
				} );
			} );

			var lagBase = ( ! reduce.matches && document.querySelector( '[data-bakly-preloader]' ) ) ? 0.8 : 0;
			function inView( el ) {
				return el.getBoundingClientRect().top < window.innerHeight * 0.85;
			}

			root.querySelectorAll( '[data-reveal]' ).forEach( function ( el ) {
				gsap.fromTo( el, { autoAlpha: 0, y: 40 }, {
					autoAlpha: 1,
					y: 0,
					duration: 1,
					delay: inView( el ) ? lagBase : 0,
					ease: 'power3.out',
					scrollTrigger: {
						trigger: el,
						start: 'top 85%',
						once: true
					}
				} );
			} );

			root.querySelectorAll( '[data-reveal-group]' ).forEach( function ( group ) {
				var items = group.children;
				if ( ! items.length ) { return; }
				gsap.fromTo( items, { autoAlpha: 0, y: 30 }, {
					autoAlpha: 1,
					y: 0,
					duration: 0.8,
					stagger: 0.08,
					delay: inView( group ) ? lagBase : 0,
					ease: 'power3.out',
					scrollTrigger: {
						trigger: group,
						start: 'top 85%',
						once: true
					}
				} );
			} );

			sections.forEach( function ( section ) {
				var sectionLinks = Array.prototype.filter.call( links, function ( link ) {
					return ( link.getAttribute( 'href' ) || '' ) === '#' + section.id;
				} );
				if ( ! sectionLinks.length ) { return; }
				ScrollTrigger.create( {
					trigger: section,
					start: 'top center',
					end: 'bottom center',
					onToggle: function ( self ) {
						if ( ! self.isActive ) { return; }
						links.forEach( function ( l ) { l.classList.remove( 'is-active' ); } );
						sectionLinks.forEach( function ( l ) { l.classList.add( 'is-active' ); } );
						sectionLinks.forEach( function ( l ) {
							var bar = l.closest( '.bakly-menu-page__pills' );
							if ( ! bar ) { return; }
							bar.scrollTo( {
								left: l.offsetLeft - ( bar.clientWidth - l.offsetWidth ) / 2,
								behavior: reduce.matches ? 'auto' : 'smooth'
							} );
						} );
					}
				} );
			} );
		}, root );

		function go( e ) {
			var target = document.getElementById( ( e.currentTarget.getAttribute( 'href' ) || '' ).slice( 1 ) );
			if ( ! target ) { return; }
			e.preventDefault();
			if ( lenis ) {
				lenis.scrollTo( target, { offset: 0, duration: 1.4 } );
			} else {
				target.scrollIntoView( { behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' } );
			}
		}
		links.forEach( function ( link ) {
			link.addEventListener( 'click', go );
		} );
		root.querySelectorAll( '[data-menu-jump]' ).forEach( function ( link ) {
			link.addEventListener( 'click', go );
		} );

		root.setAttribute( 'data-enhanced', 'true' );
	}

	function boot() {
		document.querySelectorAll( '[data-menu-page]' ).forEach( init );
	}
	if ( window.baklyPreloaderReady && typeof window.baklyPreloaderReady.then === 'function' ) {
		window.baklyPreloaderReady.then( boot );
	} else {
		boot();
	}
} )();