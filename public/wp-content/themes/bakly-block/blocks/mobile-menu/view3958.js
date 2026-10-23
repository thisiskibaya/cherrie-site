import { store, getContext, getElement } from '@wordpress/interactivity';

let lastFocused = null;

function focusablesIn( el ) {
	return el.querySelectorAll( 'a[href], button:not([disabled])' );
}

function lockScroll( ctx ) {
	const html = document.documentElement;
	const prev = html.style.scrollBehavior;
	html.style.scrollBehavior = 'auto';
	const y = window.scrollY;
	ctx.scrollY = y;
	document.body.style.position = 'fixed';
	document.body.style.top = ( -y ) + 'px';
	document.body.style.left = '0';
	document.body.style.right = '0';
	document.body.style.width = '100%';
	html.style.scrollBehavior = prev;
}

function unlockScroll( ctx ) {
	const html = document.documentElement;
	const prev = html.style.scrollBehavior;
	html.style.scrollBehavior = 'auto';
	document.body.style.position = '';
	document.body.style.top = '';
	document.body.style.left = '';
	document.body.style.right = '';
	document.body.style.width = '';
	window.scrollTo( 0, ctx.scrollY || 0 );
	html.style.scrollBehavior = prev;
}

const { state, actions, effects } = store( 'bakly/mobile-menu', {
	state: {
		get isOpen() {
			return getContext().isOpen;
		},
		get ariaExpanded() {
			return getContext().isOpen ? 'true' : 'false';
		},
		get ariaHidden() {
			return getContext().isOpen ? 'false' : 'true';
		},
	},
	actions: {
		toggle() {
			const ctx = getContext();
			ctx.isOpen = ! ctx.isOpen;
		},
		close() {
			getContext().isOpen = false;
		},
		onKeydown( event ) {
			const ctx = getContext();
			if ( 'Escape' === event.key && ctx.isOpen ) {
				event.preventDefault();
				ctx.isOpen = false;
				return;
			}
			if ( 'Tab' !== event.key || ! ctx.isOpen ) {
				return;
			}
			const { ref } = getElement();
			const f = focusablesIn( ref );
			if ( ! f.length ) {
				return;
			}
			const first = f[ 0 ];
			const last = f[ f.length - 1 ];
			if ( ! ref.contains( document.activeElement ) ) {
				event.preventDefault();
				first.focus();
				return;
			}
			if ( event.shiftKey && document.activeElement === first ) {
				event.preventDefault();
				last.focus();
			} else if ( ! event.shiftKey && document.activeElement === last ) {
				event.preventDefault();
				first.focus();
			}
		},
		onFocusout( event ) {
			const ctx = getContext();
			if ( ! ctx.isOpen ) {
				return;
			}
			const { ref } = getElement();
			if ( ref.contains( event.relatedTarget ) ) {
				return;
			}
			const f = focusablesIn( ref );
			( f[ 0 ] || ref ).focus( { preventScroll: true } );
		},
	},
	effects: {
		dialog() {
			const ctx = getContext();
			const { ref } = getElement();
			if ( ctx.isOpen ) {
				lastFocused = document.activeElement;
				lockScroll( ctx );
				void ref.offsetHeight;
				ref.focus( { preventScroll: true } );
				setTimeout( () => {
					if ( ctx.isOpen && ! ref.contains( document.activeElement ) ) {
						ref.focus( { preventScroll: true } );
					}
				}, 80 );
			} else {
				if ( '' !== document.body.style.position ) {
					unlockScroll( ctx );
				}
				if ( lastFocused && document.contains( lastFocused ) ) {
					lastFocused.focus( { preventScroll: true } );
				}
				lastFocused = null;
			}
			const mq = window.matchMedia( '(min-width: ' + ctx.breakpoint + 'px)' );
			const onBreakpoint = () => {
				if ( mq.matches && ctx.isOpen ) {
					ctx.isOpen = false;
				}
			};
			mq.addEventListener( 'change', onBreakpoint );
			return () => mq.removeEventListener( 'change', onBreakpoint );
		},
	},
} );