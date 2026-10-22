( function () {
	function initSection( section ) {
		if ( ! window.Swiper || section.dataset.baklySwiperInit ) {
			return;
		}
		var el = section.querySelector( '.swiper' );
		if ( ! el ) {
			return;
		}
		section.dataset.baklySwiperInit = '1';
		var delay = parseInt( el.getAttribute( 'data-autoplay-delay' ), 10 ) || 3500;
		var dots = Array.prototype.slice.call( section.querySelectorAll( '.bakly-testimonials-dots button' ) );
		var uniqueCount = dots.length;

		function syncDots( swiper ) {
			if ( ! uniqueCount ) {
				return;
			}
			var current = swiper.realIndex % uniqueCount;
			dots.forEach( function ( dot, i ) {
				dot.classList.toggle( 'is-active', i === current );
			} );
		}

		var swiper = new window.Swiper( el, {
			slidesPerView: 1,
			spaceBetween: 24,
			loop: true,
			speed: 650,
			grabCursor: true,
			autoHeight: false,
			autoplay: {
				delay: delay,
				disableOnInteraction: false,
				pauseOnMouseEnter: true
			},
			breakpoints: {
				640: { slidesPerView: 2, spaceBetween: 24 },
				900: { slidesPerView: 3, spaceBetween: 24 },
				1200: { slidesPerView: 4, spaceBetween: 24 }
			},
			a11y: {
				slideLabelMessage: '{{index}} / {{slidesLength}}'
			}
		} );

		if ( uniqueCount ) {
			dots.forEach( function ( dot ) {
				dot.addEventListener( 'click', function () {
					swiper.slideToLoop( parseInt( dot.getAttribute( 'data-index' ), 10 ) || 0 );
				} );
			} );
			swiper.on( 'slideChange', syncDots );
			syncDots( swiper );
		}
	}

	function boot() {
		var sections = document.querySelectorAll( '.bakly-testimonials-inner' );
		for ( var i = 0; i < sections.length; i++ ) {
			initSection( sections[ i ].closest( '.bakly-testimonials' ) || sections[ i ] );
		}
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', boot );
	} else {
		boot();
	}
} )();
