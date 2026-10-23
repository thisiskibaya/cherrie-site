import { store, getContext, getElement } from '@wordpress/interactivity';

let focusArmed = false;

const priceOf = ( id, catalog ) => {
	const entry = catalog ? catalog[ id ] : null;
	return entry ? parseFloat( entry.price ) || 0 : 0;
};

const idsOf = ( context, group ) => {
	const map = context.selections || {};
	return Array.isArray( map[ group ] ) ? map[ group ] : [];
};

const ruleOf = ( state, group ) => ( state.rules || {} )[ group ] || {};

const stepComplete = ( context, state ) => {
	const group = ( state.stepKeys || [] )[ context.step ];
	if ( ! group ) {
		return true;
	}
	const rule = ruleOf( state, group );
	if ( rule.required && idsOf( context, group ).length < 1 ) {
		return false;
	}
	if ( rule.type === 'checkbox' && rule.max > 0 && idsOf( context, group ).length > rule.max ) {
		return false;
	}
	return true;
};

const { state } = store( 'bakly/product-builder', {
	state: {
		get selectedIds() {
			const context = getContext();
			const map = context.selections || {};
			return Object.keys( map ).reduce( ( ids, group ) => ids.concat( idsOf( context, group ) ), [] );
		},
		get total() {
			return ( state.basePrice || 0 ) + state.selectedIds.reduce( ( sum, id ) => sum + priceOf( id, state.catalog ), 0 );
		},
		get totalText() {
			return ( state.currency || '' ) + state.total.toFixed( 2 );
		},
		get progressText() {
			const context = getContext();
			return state.labels.stepOf
				.replace( '%1$d', String( context.step + 1 ) )
				.replace( '%2$d', String( context.stepCount ) );
		},
		get isCurrentStep() {
			const context = getContext();
			return context.step === context.stepIndex;
		},
		get isChecked() {
			const context = getContext();
			return idsOf( context, context.group ).indexOf( context.optionId ) !== -1;
		},
		get isDisabled() {
			const context = getContext();
			const rule = ruleOf( state, context.group );
			if ( ! rule.max || state.isChecked ) {
				return false;
			}
			return idsOf( context, context.group ).length >= rule.max;
		},
		get isStepCapped() {
			const context = getContext();
			const rule = ruleOf( state, context.group );
			return !! rule.max && idsOf( context, context.group ).length >= rule.max;
		},
		get isCurrentStepCapped() {
			const context = getContext();
			const rule = ruleOf( state, state.stepKeys[ context.step ] );
			return !! rule.max && idsOf( context, state.stepKeys[ context.step ] ).length >= rule.max;
		},
		get canGoBack() {
			return getContext().step > 0;
		},
		get isLastStep() {
			const context = getContext();
			return context.step >= context.stepCount - 1;
		},
		get isNotLastStep() {
			const context = getContext();
			return context.step < context.stepCount - 1;
		},
		get hasError() {
			return !! getContext().error;
		},
		get missingRequired() {
			const context = getContext();
			return Object.keys( state.rules || {} ).filter( ( group ) => ruleOf( state, group ).required && idsOf( context, group ).length < 1 );
		},
		get isComplete() {
			return state.missingRequired.length === 0;
		}
	},
	actions: {
		select( event ) {
			const context = getContext();
			const input = event.target;
			const group = input.dataset.baklyGroup;
			const optionId = parseInt( input.value, 10 );
			const rule = ruleOf( state, group );
			const current = idsOf( context, group ).slice();
			let next;

			if ( rule.type === 'radio' ) {
				next = input.checked ? [ optionId ] : [];
			} else if ( input.checked ) {
				next = current.indexOf( optionId ) === -1 ? current.concat( [ optionId ] ) : current;
			} else {
				next = current.filter( ( id ) => id !== optionId );
			}

			if ( rule.max > 0 && next.length > rule.max ) {
				next = next.slice( 0, rule.max );
			}

			context.selections = Object.assign( {}, context.selections, { [ group ]: next } );
			context.error = '';
		},
		toggleRadio( event ) {
			const context = getContext();
			const input = event.target;
			const group = input.dataset.baklyGroup;
			const rule = ruleOf( state, group );
			if ( rule.type !== 'radio' ) {
				return;
			}
			const optionId = parseInt( input.value, 10 );
			if ( idsOf( context, group ).indexOf( optionId ) === -1 ) {
				return;
			}
			context.selections = Object.assign( {}, context.selections, { [ group ]: [] } );
			context.error = '';
		},
		next() {
			const context = getContext();
			if ( ! stepComplete( context, state ) ) {
				context.error = state.labels.requiredSelection;
				return;
			}
			context.error = '';
			if ( context.step < context.stepCount - 1 ) {
				context.step = context.step + 1;
			}
		},
		back() {
			const context = getContext();
			if ( context.step > 0 ) {
				context.step = context.step - 1;
			}
			context.error = '';
		},
		gotoStep( event ) {
			const context = getContext();
			const target = parseInt( event.target.dataset.baklyStep, 10 );
			if ( isNaN( target ) || target < 0 || target >= context.stepCount ) {
				return;
			}
			context.step = target;
			context.error = '';
		},
		enquiry( event ) {
			const button = event.target.closest( '[data-bakly-enquiry]' );
			if ( ! button ) {
				return;
			}
			const context = getContext();
			if ( ! state.isComplete ) {
				context.step = 0;
				context.error = state.labels.requiredSelection;
				return;
			}
			const lines = [ ( state.labels.totalPrefix || 'Estimated total: ' ) + state.totalText ];
			( state.steps || [] ).forEach( ( step ) => {
				const picked = idsOf( context, step.key ).map( ( id ) => {
					const entry = state.catalog[ id ] || {};
					return entry.name || ( '#' + id );
				} );
				if ( picked.length ) {
					lines.push( step.label.replace( /^[\d]+\.\s*/, '' ) + ': ' + picked.join( ', ' ) );
				}
			} );
			try {
				window.sessionStorage.setItem( 'baklyCakeEnquiry', lines.join( '\n' ) );
			} catch ( e ) {}
			window.location.href = button.dataset.contactUrl || '/contact/';
		},
		addToCart() {
			const context = getContext();
			if ( ! state.isComplete ) {
				context.step = 0;
				context.error = state.labels.requiredSelection;
				return;
			}
			const layout = document.querySelector( '.bakly-single-layout' ) || document;
			const form = layout.querySelector( 'form.variations_form, form.cart' );
			if ( ! form ) {
				return;
			}
			const size = form.querySelector( 'select[name="attribute_pa_size"]' );
			if ( size && ! size.value ) {
				context.error = state.labels.chooseSize;
				size.focus();
				return;
			}
			context.error = '';
			const button = form.querySelector( 'button[name="add-to-cart"], button[type="submit"]' );
			if ( button ) {
				button.click();
			} else {
				form.submit();
			}
		}
	},
	callbacks: {
		focusStep() {
			if ( ! focusArmed ) {
				focusArmed = true;
				return;
			}
			const { ref } = getElement();
			const panel = ref.querySelector( '.bakly-builder-step.is-active .bakly-builder-step-label' );
			if ( panel ) {
				panel.setAttribute( 'tabindex', '-1' );
				panel.focus( { preventScroll: true } );
			}
		}
	}
} );

(function () {
	'use strict';

	function initBuilder(root) {
		if (!root || root.dataset.baklyReady === '1') {
			return;
		}
		root.dataset.baklyReady = '1';

		var mirror = document.getElementById('bakly-build-input');
		var form = root.closest('.bakly-single-layout') ? root.closest('.bakly-single-layout').querySelector('form.variations_form, form.cart') : null;
		var variations = [];
		var variationSource = document.querySelector('[data-product_variations]');

		if (variationSource) {
			try {
				variations = JSON.parse(variationSource.getAttribute('data-product_variations')) || [];
			} catch (e) {
				variations = [];
			}
		}

		function selectedIds() {
			return Array.prototype.slice.call(root.querySelectorAll('.bakly-builder-opt-input:checked')).map(function (input) {
				return parseInt(input.value, 10);
			});
		}

		function syncMirror() {
			if (!mirror) {
				return;
			}
			mirror.value = JSON.stringify(selectedIds().map(function (id) {
				return { id: id, qty: 1 };
			}));
		}

		function syncBasePrice() {
			if (!variations.length) {
				return;
			}
			var sizeSelect = form ? form.querySelector('select[name="attribute_pa_size"]') : null;
			if (!sizeSelect || !sizeSelect.value) {
				return;
			}
			for (var i = 0; i < variations.length; i++) {
				var attrs = variations[i].attributes || {};
				if (attrs.attribute_pa_size === sizeSelect.value) {
					state.basePrice = parseFloat(variations[i].display_price) || 0;
					return;
				}
			}
		}

		root.addEventListener('change', syncMirror);
		document.addEventListener('change', function (event) {
			if (form && event.target && event.target.name === 'attribute_pa_size') {
				syncBasePrice();
			}
		}, true);

		if (form) {
			form.addEventListener('submit', syncMirror);
		}

		syncBasePrice();
		syncMirror();
	}

	document.querySelectorAll('.bakly-product-builder').forEach(initBuilder);
})();