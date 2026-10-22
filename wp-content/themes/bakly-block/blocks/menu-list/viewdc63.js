( function () {
	'use strict';
	function init( root ) {
		var tablist = root.querySelector( '.bakly-menu-tabs' );
		if ( ! tablist ) { return; }
		var tabs = Array.prototype.slice.call( tablist.querySelectorAll( '[role="tab"]' ) );
		if ( tabs.length < 2 ) { return; }
		var panels = tabs.map( function ( tab ) {
			return document.getElementById( tab.getAttribute( 'aria-controls' ) );
		} );

		function activate( tab ) {
			tabs.forEach( function ( t, i ) {
				var on = t === tab;
				t.classList.toggle( 'is-active', on );
				t.setAttribute( 'aria-selected', on ? 'true' : 'false' );
				t.tabIndex = on ? 0 : -1;
				if ( panels[ i ] ) {
					panels[ i ].classList.toggle( 'is-active', on );
					if ( on ) { panels[ i ].removeAttribute( 'hidden' ); }
					else { panels[ i ].setAttribute( 'hidden', '' ); }
				}
			} );
		}

		tabs.forEach( function ( tab ) {
			tab.addEventListener( 'click', function () { activate( tab ); } );
			tab.addEventListener( 'keydown', function ( e ) {
				var idx = tabs.indexOf( tab );
				var next = null;
				if ( e.key === 'ArrowRight' || e.key === 'ArrowDown' ) { next = tabs[ ( idx + 1 ) % tabs.length ]; }
				else if ( e.key === 'ArrowLeft' || e.key === 'ArrowUp' ) { next = tabs[ ( idx - 1 + tabs.length ) % tabs.length ]; }
				else if ( e.key === 'Home' ) { next = tabs[ 0 ]; }
				else if ( e.key === 'End' ) { next = tabs[ tabs.length - 1 ]; }
				if ( next ) {
					e.preventDefault();
					next.focus();
					activate( next );
				}
			} );
		} );
		activate( tablist.querySelector( '.is-active' ) || tabs[ 0 ] );
	}
	document.querySelectorAll( '[data-menu-tabs]' ).forEach( init );
} )();