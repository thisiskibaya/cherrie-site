( function () {
	'use strict';
	function init( root ) {
		if ( root.dataset.baklyStoryInit ) { return; }
		var slidesEl = root.querySelector( '.bakly-about-story__slides' );
		var tabs = Array.prototype.slice.call( root.querySelectorAll( '.bakly-about-story__dots [role="tab"]' ) );
		var previous = root.querySelector( '[data-story-prev]' );
		var next = root.querySelector( '[data-story-next]' );
		if ( ! slidesEl || ! window.Swiper || ! previous || ! next ) { return; }
		if ( slidesEl.querySelectorAll( '.swiper-slide' ).length < 2 ) { return; }
		function allSlides() { return Array.prototype.slice.call( slidesEl.querySelectorAll( '.swiper-slide' ) ); }
		root.dataset.baklyStoryInit = '1';
		var reduce = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

		function sync( sw ) {
			var current = sw.realIndex % tabs.length;
			tabs.forEach( function ( tab, i ) {
				var active = i === current;
				tab.classList.toggle( 'is-active', active );
				tab.setAttribute( 'aria-selected', active ? 'true' : 'false' );
				tab.tabIndex = active ? 0 : -1;
			} );
			allSlides().forEach( function ( slide ) {
				var idx = parseInt( slide.getAttribute( 'data-swiper-slide-index' ), 10 );
				var active = idx === sw.realIndex;
				slide.classList.toggle( 'is-active', active );
				slide.setAttribute( 'aria-hidden', active ? 'false' : 'true' );
			} );
		}

		var swiper = new window.Swiper( slidesEl, {
			loop: true,
			speed: reduce ? 0 : 600,
			autoplay: reduce ? false : { delay: 5000, disableOnInteraction: false, pauseOnMouseEnter: true },
			a11y: { slideLabelMessage: '{{index}} / {{slidesLength}}' },
			on: {
				init: function ( sw ) { sync( sw ); },
				slideChange: function ( sw ) { sync( sw ); }
			}
		} );

		previous.addEventListener( 'click', function () { swiper.slidePrev(); } );
		next.addEventListener( 'click', function () { swiper.slideNext(); } );
		tabs.forEach( function ( tab, index ) {
			tab.addEventListener( 'click', function () { swiper.slideToLoop( index ); } );
			tab.addEventListener( 'keydown', function ( event ) {
				var target = null;
				if ( event.key === 'ArrowRight' || event.key === 'ArrowDown' ) { target = ( swiper.realIndex + 1 ) % tabs.length; }
				if ( event.key === 'ArrowLeft' || event.key === 'ArrowUp' ) { target = ( swiper.realIndex - 1 + tabs.length ) % tabs.length; }
				if ( event.key === 'Home' ) { target = 0; }
				if ( event.key === 'End' ) { target = tabs.length - 1; }
				if ( target !== null ) { event.preventDefault(); swiper.slideToLoop( target ); tab.focus(); }
			} );
		} );

		sync( swiper );
	}
	document.querySelectorAll( '[data-story-slider]' ).forEach( init );
} )();
