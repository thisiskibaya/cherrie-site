(function () {
	'use strict';

	var KEY = 'baklyCakeEnquiry';

	function prefill() {
		var message = '';
		try {
			message = window.sessionStorage.getItem( KEY ) || '';
		} catch ( e ) {}
		if ( ! message ) {
			return;
		}
		var field = document.querySelector( 'textarea[name="your-message"]' );
		if ( field && ! field.value ) {
			field.value = message;
		}
		try {
			window.sessionStorage.removeItem( KEY );
		} catch ( e ) {}
		document.addEventListener( 'wpcf7mailsent', function () {
			try {
				window.sessionStorage.removeItem( KEY );
			} catch ( e ) {}
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', prefill );
	} else {
		prefill();
	}
} )();
