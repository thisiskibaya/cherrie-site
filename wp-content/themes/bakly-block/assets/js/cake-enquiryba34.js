(function () {
	'use strict';

	var KEY = 'baklyCakeEnquiry';

	function prefill() {
		var stored = '';
		try {
			stored = window.sessionStorage.getItem( KEY ) || '';
		} catch ( e ) {}
		if ( ! stored ) {
			return;
		}

		var payload = { message: stored };
		try {
			var decoded = JSON.parse( stored );
			if ( decoded && typeof decoded === 'object' ) {
				payload = decoded;
			}
		} catch ( e ) {}

		var messageField = document.querySelector( 'textarea[name="your-message"]' );
		var subjectField = document.querySelector( 'input[name="your-subject"], input[name="subject"]' );
		var filled = false;
		if ( messageField && ! messageField.value && payload.message ) {
			messageField.value = payload.message;
			messageField.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			filled = true;
		}
		if ( subjectField && ! subjectField.value && payload.subject ) {
			subjectField.value = payload.subject;
			subjectField.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			filled = true;
		}
		if ( ! filled ) {
			return;
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
