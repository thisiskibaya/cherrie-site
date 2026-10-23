/**
 * Bakly Block — progressive enhancement.
 * Stateless, dependency-free. All content remains visible without JS.
 * Respects prefers-reduced-motion.
 */
( function () {
	'use strict';

	var reduce = window.matchMedia( '(prefers-reduced-motion: reduce)' );

	// --- 1. Hero product carousel: Swiper crossfade deck + thumbnail rail + autoplay ---
	function initHeroCarousel() {
		var root = document.querySelector( '.bakly-carousel' );
		if ( ! root || root.dataset.baklyHeroInit ) return;
		var slidesEl = root.querySelector( '.bakly-hero-slides' );
		var thumbs = root.querySelectorAll( '.bakly-thumb' );
		if ( ! slidesEl || ! window.Swiper || thumbs.length < 2 ) return;
		var slides = slidesEl.querySelectorAll( '.swiper-slide' );
		if ( slides.length < 2 ) return;
		if ( reduce.matches ) return;

		var interval = parseInt( root.getAttribute( 'data-interval' ) || '5000', 10 );

		function syncUi( sw ) {
			var current = sw.realIndex % thumbs.length;
			thumbs.forEach( function ( thumb, j ) {
				thumb.classList.toggle( 'is-active', j === current );
				thumb.setAttribute( 'aria-selected', j === current ? 'true' : 'false' );
				thumb.setAttribute( 'tabindex', j === current ? '0' : '-1' );
			} );
			slides.forEach( function ( slide ) {
				var idx = parseInt( slide.getAttribute( 'data-swiper-slide-index' ), 10 );
				slide.setAttribute( 'aria-hidden', idx === sw.realIndex ? 'false' : 'true' );
			} );
		}

		var swiper = new window.Swiper( slidesEl, {
			effect: 'fade',
			fadeEffect: { crossFade: true },
			loop: true,
			speed: 600,
			autoHeight: true,
			autoplay: {
				delay: interval,
				disableOnInteraction: false,
				pauseOnMouseEnter: true
			},
			a11y: {
				slideLabelMessage: '{{index}} / {{slidesLength}}'
			},
			on: {
				init: function ( sw ) { syncUi( sw ); },
				slideChange: function ( sw ) { syncUi( sw ); }
			}
		} );

		root.dataset.baklyHeroInit = '1';

		thumbs.forEach( function ( thumb, i ) {
			thumb.addEventListener( 'click', function () {
				swiper.slideToLoop( i );
			} );
		} );
	}

	// --- 2. Scroll-snap carousel stepper (testimonials, products, social) ---
	function initCarousel( scopeSel ) {
		document.querySelectorAll( scopeSel ).forEach( function ( scope ) {
			if ( reduce.matches ) return;
			var track = scope.querySelector( '.bakly-carousel-track' );
			if ( ! track ) return;
			var slides = Array.prototype.slice.call( track.children );
			if ( slides.length < 2 ) return;

			var prev = document.createElement( 'button' );
			var next = document.createElement( 'button' );
			prev.className = 'bakly-carousel-arrow bakly-carousel-prev';
			next.className = 'bakly-carousel-arrow bakly-carousel-next';
			prev.type = 'button'; next.type = 'button';
			prev.setAttribute( 'aria-label', 'Previous' );
			next.setAttribute( 'aria-label', 'Next' );
			prev.textContent = '\u2039';
			next.textContent = '\u203A';

			var wrap = document.createElement( 'div' );
			wrap.className = 'bakly-carousel';
			track.parentNode.insertBefore( wrap, track );
			wrap.appendChild( prev );
			wrap.appendChild( track );
			wrap.appendChild( next );

			function updateArrows() {
				var atStart = track.scrollLeft <= 0;
				var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
				prev.disabled = atStart;
				next.disabled = atEnd;
			}

			prev.addEventListener( 'click', function () {
				track.scrollBy( { left: -track.clientWidth, behavior: 'smooth' } );
			} );
			next.addEventListener( 'click', function () {
				track.scrollBy( { left: track.clientWidth, behavior: 'smooth' } );
			} );
			track.addEventListener( 'scroll', updateArrows, { passive: true } );
			updateArrows();
		} );
	}

	// --- 3. Countdown timer (promo callout) ---
	function initCountdown() {
		var scope = document.querySelector( '.bakly-countdown' );
		if ( ! scope ) return;
		var targetEl = scope.hasAttribute( 'data-countdown' ) ? scope : scope.querySelector( '[data-countdown]' );
		if ( ! targetEl ) return;
		var target = targetEl.getAttribute( 'data-countdown' );
		if ( ! target ) return;
		var end = new Date( target ).getTime();
		if ( isNaN( end ) ) return;

		var nums = {};
		scope.querySelectorAll( '[data-countdown-part]' ).forEach( function ( el ) {
			nums[ el.getAttribute( 'data-countdown-part' ) ] = el;
		} );

		function pad( n ) { return String( n ).padStart( 2, '0' ); }

		function tick() {
			var diff = Math.max( 0, end - Date.now() );
			var days = Math.floor( diff / 86400000 );
			var hours = Math.floor( diff / 3600000 ) % 24;
			var minutes = Math.floor( diff / 60000 ) % 60;
			var seconds = Math.floor( diff / 1000 ) % 60;
			if ( nums.days ) nums.days.textContent = pad( days );
			if ( nums.hours ) nums.hours.textContent = pad( hours );
			if ( nums.minutes ) nums.minutes.textContent = pad( minutes );
			if ( nums.seconds ) nums.seconds.textContent = pad( seconds );
		}
		tick();
		if ( reduce.matches ) return;
		setInterval( tick, 1000 );
	}

	// --- 5. Newsletter form (client-side demo, no backend) ---
	function initNewsletter() {
		var form = document.querySelector( '.bakly-newsletter-form-el' );
		if ( ! form ) return;
		form.addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			var input = form.querySelector( 'input[type="email"]' );
			var note = form.parentNode.querySelector( '.bakly-newsletter-note' );
			if ( ! input || ! input.value || ! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( input.value ) ) {
				if ( note ) {
					note.textContent = 'Please enter a valid email address.';
					note.classList.add( 'is-error' );
					note.removeAttribute( 'hidden' );
				}
				return;
			}
			if ( note ) {
				note.textContent = 'Thanks! You are on the list.';
				note.classList.remove( 'is-error' );
				note.removeAttribute( 'hidden' );
			}
			form.reset();
		} );
	}

	// --- 6. Header overlay fade (hide on scroll-down, reveal on scroll-up) ---
	function initHeaderScroll() {
		var header = document.querySelector( 'header.wp-block-template-part' );
		if ( ! header ) return;
		var lastY = window.scrollY;
		var ticking = false;
		function update() {
			ticking = false;
			var y = window.scrollY;
			if ( y > lastY && y > 60 ) {
				header.classList.add( 'is-header-faded' );
			} else if ( y < lastY || y <= 60 ) {
				header.classList.remove( 'is-header-faded' );
			}
			lastY = y;
		}
		window.addEventListener( 'scroll', function () {
			if ( ! ticking ) {
				ticking = true;
				window.requestAnimationFrame( update );
			}
		}, { passive: true } );
		header.addEventListener( 'focusin', function () {
			header.classList.remove( 'is-header-faded' );
		} );
		update();
	}

	function initShopFilters() {
		var btn = document.querySelector( '.bakly-filters-toggle' );
		var panel = document.getElementById( 'bakly-filters' );
		if ( ! btn || ! panel || btn.dataset.baklyFiltersBound ) {
			return;
		}
		btn.dataset.baklyFiltersBound = '1';
		btn.addEventListener( 'click', function () {
			var open = panel.classList.toggle( 'is-open' );
			btn.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		} );
	}

	function initSearchOverlay() {
		var btn = document.querySelector( '.bakly-search-toggle' );
		var panel = document.getElementById( 'bakly-search-panel' );
		if ( ! btn || ! panel || btn.dataset.baklySearchBound ) {
			return;
		}
		btn.dataset.baklySearchBound = '1';
		var input = panel.querySelector( '.bakly-search-input' );
		var results = panel.querySelector( '.bakly-search-results' );
		var controller = null;
		var timer = null;
		function esc( s ) {
			return String( s ).replace( /[<>&"]/g, '' );
		}
		function setOpen( open ) {
			panel.classList.toggle( 'is-open', open );
			btn.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
			if ( open && input ) {
				input.focus();
			}
			if ( ! open && results ) {
				results.innerHTML = '';
			}
		}
		btn.addEventListener( 'click', function () {
			setOpen( ! panel.classList.contains( 'is-open' ) );
		} );
		document.addEventListener( 'click', function ( e ) {
			if ( panel.classList.contains( 'is-open' ) && ! panel.contains( e.target ) && ! btn.contains( e.target ) ) {
				setOpen( false );
			}
		} );
		panel.addEventListener( 'click', function ( e ) {
			if ( e.target.closest( 'a' ) ) {
				setOpen( false );
			}
		} );
		panel.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Escape' && panel.classList.contains( 'is-open' ) ) {
				e.stopPropagation();
				setOpen( false );
				btn.focus();
			}
		} );
		if ( ! input || ! results ) {
			return;
		}
		input.addEventListener( 'input', function () {
			window.clearTimeout( timer );
			var q = input.value.trim();
			if ( q.length < 2 ) {
				results.innerHTML = '';
				if ( controller ) {
					controller.abort();
				}
				return;
			}
			timer = window.setTimeout( function () {
				if ( controller ) {
					controller.abort();
				}
				controller = new AbortController();
				fetch( '/products.json?search=' + encodeURIComponent( q ) + '&per_page=6&catalog_visibility=visible', { signal: controller.signal } )
					.then( function ( r ) {
						return r.ok ? r.json() : [];
					} )
					.then( function ( items ) {
						if ( input.value.trim() !== q ) {
							return;
						}
						if ( ! items.length ) {
							results.innerHTML = '<p class="bakly-search-empty">No bakes matched &ldquo;' + esc( q ) + '&rdquo;. Try the full search below.</p>';
							return;
						}
						results.innerHTML = items.map( function ( p ) {
							var img = p.images && p.images[ 0 ] ? p.images[ 0 ].thumbnail : '';
							var price = '';
							if ( p.prices && typeof p.prices.price === 'number' && p.prices.currency_symbol ) {
								price = p.prices.currency_symbol + ( p.prices.price / Math.pow( 10, p.prices.currency_minor_unit || 2 ) ).toFixed( 2 );
							}
							return '<a class="bakly-search-hit" href="' + p.permalink + '">' +
								( img ? '<img src="' + img + '" alt="">' : '<span class="bakly-search-thumb-empty"></span>' ) +
								'<span class="bakly-search-hit-name">' + esc( p.name ) + '</span>' +
								( price ? '<span class="bakly-search-hit-price">' + esc( price ) + '</span>' : '' ) +
								'</a>';
						} ).join( '' ) +
						'<a class="bakly-search-all" href="/?s=' + encodeURIComponent( q ) + '&post_type=product">View all results for &ldquo;' + esc( q ) + '&rdquo;</a>';
					} )
					.catch( function () {} );
			}, 300 );
		} );
	}

	// --- 6b. Hero header state: transparent over the hero, frosted once past it ---
	function initHeroHeader() {
		var header = document.querySelector( 'header.wp-block-template-part' );
		var main = header ? header.querySelector( '.bakly-header-main' ) : null;
		var hero = document.querySelector( '.bakly-hero-showcase, .bakly-cinematic-hero' );
		if ( ! header || ! main || ! hero ) {
			return;
		}
		var cine = hero.classList.contains( 'bakly-cinematic-hero' );
		var ticking = false;
		function update() {
			ticking = false;
			if ( cine ) {
				main.classList.remove( 'is-hero' );
				main.classList.add( 'is-frosted' );
				return;
			}
			var rect = hero.getBoundingClientRect();
			var past = rect.bottom <= main.offsetHeight + 8;
			if ( past ) {
				main.classList.remove( 'is-hero' );
				main.classList.add( 'is-frosted' );
			} else {
				main.classList.remove( 'is-frosted' );
				main.classList.add( 'is-hero' );
			}
		}
		window.addEventListener( 'scroll', function () {
			if ( ! ticking ) {
				ticking = true;
				window.requestAnimationFrame( update );
			}
		}, { passive: true } );
		window.addEventListener( 'resize', function () {
			if ( ! ticking ) {
				ticking = true;
				window.requestAnimationFrame( update );
			}
		} );
		update();
	}

	// --- 7. Scroll reveal: parallax fade-up for opt-in [data-bakly-reveal] ---
	function initReveal() {
		if ( ! window.gsap || ! window.ScrollTrigger ) return;
		var gsap = window.gsap;
		if ( gsap.registerPlugin ) {
			gsap.registerPlugin( window.ScrollTrigger );
		}
		var narrow = window.matchMedia( '(max-width: 781px)' );
		function offsetFor( dir ) {
			if ( narrow.matches ) return { x: 0, y: 48 };
			if ( 'left' === dir ) return { x: -64, y: 24 };
			if ( 'right' === dir ) return { x: 64, y: 24 };
			return { x: 0, y: 56 };
		}
		Array.prototype.forEach.call( document.querySelectorAll( '[data-bakly-reveal]' ), function ( el ) {
			if ( el.dataset.baklyRevealInit ) return;
			el.dataset.baklyRevealInit = '1';
			var off = offsetFor( el.getAttribute( 'data-bakly-reveal' ) || 'up' );
			gsap.from( el, {
				x: off.x,
				y: off.y,
				opacity: 0,
				duration: 0.9,
				ease: 'power3.out',
				scrollTrigger: { trigger: el, start: 'top 85%', once: true }
			} );
		} );
	}

	function onReady() {
		initCountdown();
		initNewsletter();
		initHeaderScroll();
		initHeroHeader();
		initShopFilters();
		initSearchOverlay();
		if ( reduce.matches ) return;
		initHeroCarousel();
		initCarousel( '.bakly-social-grid' );
		initReveal();
	}

	function ready( fn ) {
		if ( document.readyState !== 'loading' ) { fn(); } else { document.addEventListener( 'DOMContentLoaded', fn ); }
	}
	ready( onReady );
} )();