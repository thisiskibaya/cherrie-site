(function () {
	'use strict';

	var ENQUIRY_KEY = 'baklyCakeEnquiry';
	var builderCount = 0;

	function initBuilder(root) {
		if (!root || root.dataset.baklyReady === '1') {
			return;
		}
		root.dataset.baklyReady = '1';
		builderCount += 1;

		var standalone = root.dataset.baklyStandalone === '1';
		var currency = root.dataset.currencySymbol || '';
		var dialog = root.querySelector('[data-bakly-product-dialog]');
		var modalTitle = root.querySelector('[data-bakly-modal-title]');
		var modalImage = root.querySelector('[data-bakly-modal-image]');
		var modalDescription = root.querySelector('[data-bakly-modal-description]');
		var modalTotal = root.querySelector('[data-bakly-modal-total]');
		var variationWrap = root.querySelector('[data-bakly-variation-wrap]');
		var variationOptions = root.querySelector('[data-bakly-variation-options]');
		var productConfirm = root.querySelector('[data-bakly-product-confirm]');
		var basePriceEl = root.querySelector('[data-bakly-base-price]');
		var addItemButton = root.querySelector('[data-bakly-add-item]');
		var configurator = root.querySelector('[data-bakly-configurator]');
		var configuratorTitle = root.querySelector('[data-bakly-configurator-title]');
		var configuratorImage = root.querySelector('[data-bakly-configurator-image]');
		var configuratorDescription = root.querySelector('[data-bakly-configurator-description]');
		var progress = root.querySelector('[data-bakly-progress]');
		var stepBack = root.querySelector('[data-bakly-step-back]');
		var stepNext = root.querySelector('[data-bakly-step-next]');
		var stepCount = root.querySelector('[data-bakly-step-count]');
		var backToCatalog = root.querySelector('[data-bakly-back-catalog]');
		var wizardSteps = Array.prototype.slice.call(root.querySelectorAll('.bakly-builder-step'));
		var inputs = Array.prototype.slice.call(root.querySelectorAll('.bakly-builder-opt-input'));
		var totalEl = root.querySelector('[data-bakly-total]');
		var totalMobileEl = root.querySelector('[data-bakly-total-mobile]');
		var errorEl = root.querySelector('[data-bakly-error]');
		var modalErrorEl = root.querySelector('[data-bakly-modal-error]');
		var stickybar = root.querySelector('[data-bakly-stickybar]');
		var orderItemsEl = root.querySelector('[data-bakly-order-items]');
		var orderEmptyEl = root.querySelector('[data-bakly-order-empty]');
		var pickupLocation = root.querySelector('[data-bakly-pickup-location]');
		var pickupDetails = root.querySelector('[data-bakly-pickup-details]');
		var pickupDate = root.querySelector('[data-bakly-pickup-date]');
		var pickupDateTrigger = root.querySelector('[data-bakly-pickup-date-trigger]');
		var pickupDateLabel = root.querySelector('[data-bakly-pickup-date-label]');
		var pickupDateHelp = root.querySelector('[data-bakly-pickup-date-help]');
		var pickupDateCalendar = root.querySelector('[data-bakly-pickup-date-calendar]');
		var pickupTime = root.querySelector('[data-bakly-pickup-time]');
		var enquiryButtons = Array.prototype.slice.call(root.querySelectorAll('[data-bakly-enquiry]'));
		var wpElement = window.wp && window.wp.element;
		var wpComponents = window.wp && window.wp.components;
		var form = standalone ? null : document.querySelector('form.variations_form');
		var variations = [];
		var variationSource = form ? form.getAttribute('data-product_variations') : '';
		var activeProduct = null;
		var editingIndex = -1;
		var pendingEditIndex = -1;
		var currentStep = 0;
		var configuredItems = [];
		var pageScrollState = null;
		var schedule = {};
		var calendarOpen = false;
		var calendarRoot = pickupDateCalendar && wpElement && wpElement.createRoot && wpComponents && wpComponents.DatePicker ? wpElement.createRoot(pickupDateCalendar) : null;

		try {
			schedule = JSON.parse(root.dataset.pickupSchedule || '{}') || {};
		} catch (e) {
			showError('Pickup availability could not be loaded. Please refresh and try again.');
		}

		if (variationSource) {
			try {
				variations = JSON.parse(variationSource) || [];
			} catch (e) {
				showError('The product options could not be loaded. Please refresh and try again.');
			}
		}

		function money(value) {
			return currency + (currency.length > 1 && !/\s$/.test(currency) ? ' ' : '') + Number(value).toFixed(2);
		}

		function lockPageScroll() {
			if (pageScrollState) {
				return;
			}
			var body = document.body;
			var html = document.documentElement;
			var properties = ['position', 'top', 'left', 'right', 'width'];
			var bodyStyles = {};
			properties.forEach(function (property) {
				bodyStyles[property] = {
					value: body.style.getPropertyValue(property),
					priority: body.style.getPropertyPriority(property)
				};
			});
			pageScrollState = {
				scrollY: window.scrollY,
				bodyStyles: bodyStyles,
				scrollBehavior: html.style.getPropertyValue('scroll-behavior'),
				scrollBehaviorPriority: html.style.getPropertyPriority('scroll-behavior')
			};
			html.style.setProperty('scroll-behavior', 'auto');
			body.style.setProperty('position', 'fixed');
			body.style.setProperty('top', -pageScrollState.scrollY + 'px');
			body.style.setProperty('left', '0');
			body.style.setProperty('right', '0');
			body.style.setProperty('width', '100%');
			if (pageScrollState.scrollBehavior) {
				html.style.setProperty('scroll-behavior', pageScrollState.scrollBehavior, pageScrollState.scrollBehaviorPriority);
			} else {
				html.style.removeProperty('scroll-behavior');
			}
		}

		function unlockPageScroll() {
			if (!pageScrollState) {
				return;
			}
			var body = document.body;
			var html = document.documentElement;
			var state = pageScrollState;
			html.style.setProperty('scroll-behavior', 'auto');
			Object.keys(state.bodyStyles).forEach(function (property) {
				var previous = state.bodyStyles[property];
				if (previous.value) {
					body.style.setProperty(property, previous.value, previous.priority);
				} else {
					body.style.removeProperty(property);
				}
			});
			if (state.scrollBehavior) {
				html.style.setProperty('scroll-behavior', state.scrollBehavior, state.scrollBehaviorPriority);
			} else {
				html.style.removeProperty('scroll-behavior');
			}
			pageScrollState = null;
			window.scrollTo(0, state.scrollY);
		}

		function closeConfigurator() {
			if (configurator && configurator.open) {
				configurator.close();
			}
			unlockPageScroll();
		}

		function showError(message, reveal, placement, focusTarget, placeBefore) {
			var target = configurator && configurator.open ? errorEl : (dialog && dialog.open ? modalErrorEl : errorEl);
			[errorEl, modalErrorEl].forEach(function (element) {
				if (!element) {
					return;
				}
				element.textContent = '';
				element.hidden = true;
			});
			if (!message || !target) {
				if (errorEl && errorEl.parentNode !== root) {
					root.insertBefore(errorEl, root.firstChild);
				}
				return;
			}
			if (target === errorEl) {
				if (placement && placeBefore && placeBefore.parentNode === placement) {
					placement.insertBefore(target, placeBefore);
				} else if (placement) {
					placement.appendChild(target);
				} else if (target.parentNode !== root) {
					root.insertBefore(target, root.firstChild);
				}
			}
			target.textContent = message;
			target.hidden = false;
			if (reveal) {
				target.scrollIntoView({ behavior: 'smooth', block: 'center' });
				(focusTarget || target).focus({ preventScroll: true });
			}
		}

		function parseProductVariations(product) {
			if (!product || !product.dataset || !product.dataset.variations) {
				return [];
			}
			try {
				return JSON.parse(product.dataset.variations) || [];
			} catch (e) {
				showError('The selected product options could not be loaded. Please choose another product.');
				return [];
			}
		}

		function selectedVariation() {
			if (standalone) {
				var selectedOption = variationOptions && variationOptions.querySelector('[data-bakly-variation-choice]:checked');
				var selectedId = selectedOption ? selectedOption.value : '';
				var available = parseProductVariations(activeProduct);
				for (var i = 0; i < available.length; i++) {
					if (String(available[i].id) === selectedId) {
						return available[i];
					}
				}
				return null;
			}

			if (!form || !variations.length) {
				return null;
			}
			var variationId = form.querySelector('input[name="variation_id"]');
			if (variationId && variationId.value) {
				for (var j = 0; j < variations.length; j++) {
					if (String(variations[j].variation_id) === variationId.value) {
						return {
							id: variations[j].variation_id,
							price: variations[j].display_price,
							label: selectedVariationLabel()
						};
					}
				}
			}
			var fields = Array.prototype.slice.call(form.querySelectorAll('[name^="attribute_"]'));
			for (var k = 0; k < variations.length; k++) {
				var attributes = variations[k].attributes || {};
				var matches = fields.length > 0;
				fields.forEach(function (field) {
					if (!field.value || (attributes[field.name] && attributes[field.name] !== field.value)) {
						matches = false;
					}
				});
				Object.keys(attributes).forEach(function (name) {
					if (attributes[name]) {
						var field = fields.filter(function (item) {
							return item.name === name;
						})[0];
						if (!field || field.value !== attributes[name]) {
							matches = false;
						}
					}
				});
				if (matches) {
					return {
						id: variations[k].variation_id,
						price: variations[k].display_price,
						label: selectedVariationLabel()
					};
				}
			}
			return null;
		}

		function selectedVariationLabel() {
			if (standalone) {
				var variation = selectedVariation();
				return variation ? variation.label : '';
			}
			if (!form) {
				return '';
			}
			var labels = [];
			Array.prototype.forEach.call(form.querySelectorAll('select[name^="attribute_"]'), function (select) {
				if (select.value && select.options[select.selectedIndex]) {
					labels.push(select.options[select.selectedIndex].textContent.trim());
				}
			});
			return labels.join(', ');
		}

		function basePrice() {
			if (standalone) {
				if (!activeProduct) {
					return null;
				}
				if (activeProduct.dataset.isVariable === '1') {
					var variation = selectedVariation();
					return variation ? parseFloat(variation.price) : null;
				}
				var simplePrice = parseFloat(activeProduct.dataset.basePrice);
				return isFinite(simplePrice) ? simplePrice : 0;
			}
			if (root.dataset.baseVariable === '1') {
				var productVariation = selectedVariation();
				return productVariation ? parseFloat(productVariation.price) : null;
			}
			var price = parseFloat(root.dataset.basePrice);
			return isFinite(price) ? price : 0;
		}

		function baseName() {
			return standalone ? (activeProduct ? activeProduct.dataset.productName : '') : (root.dataset.productTitle || '');
		}

		function selectedOptions() {
			return inputs.filter(function (input) {
				return input.checked;
			});
		}

		function optionTotal() {
			return selectedOptions().reduce(function (total, input) {
				return total + (parseFloat(input.dataset.price) || 0);
			}, 0);
		}

		function enforceCaps() {
			Array.prototype.forEach.call(root.querySelectorAll('.bakly-builder-step'), function (fieldset) {
				var max = parseInt(fieldset.dataset.baklyMax, 10) || 0;
				var count = fieldset.querySelectorAll('.bakly-builder-opt-input:checked').length;
				Array.prototype.forEach.call(fieldset.querySelectorAll('.bakly-builder-opt-input'), function (input) {
					input.disabled = input.type !== 'radio' && !input.checked && max > 0 && count >= max;
				});
				fieldset.classList.toggle('is-capped', max > 0 && count >= max);
			});
		}

		function validateOptions() {
			if (!baseName()) {
				return 'Please choose a starting product.';
			}
			if (basePrice() === null) {
				return 'Please choose an option for your product.';
			}
			var missingRequired = Array.prototype.some.call(root.querySelectorAll('.bakly-builder-step[data-bakly-required="1"]'), function (fieldset) {
				return !fieldset.querySelector('.bakly-builder-opt-input:checked');
			});
			if (missingRequired) {
				return 'Please complete the required cake options.';
			}
			var exceededLimit = Array.prototype.some.call(root.querySelectorAll('.bakly-builder-step'), function (fieldset) {
				var max = parseInt(fieldset.dataset.baklyMax, 10) || 0;
				return max > 0 && fieldset.querySelectorAll('.bakly-builder-opt-input:checked').length > max;
			});
			return exceededLimit ? 'Please remove options to meet the selection limits.' : '';
		}

		function renderWizard() {
			if (!configurator) {
				return;
			}
			wizardSteps.forEach(function (step, index) {
				step.hidden = index !== currentStep;
			});
			if (progress) {
				progress.innerHTML = '';
				wizardSteps.forEach(function (step, index) {
					var item = document.createElement('li');
					item.className = index === currentStep ? 'is-current' : (index < currentStep ? 'is-complete' : '');
					item.textContent = step.querySelector('.bakly-builder-step-label').textContent.replace(/^\d+\.\s*/, '').trim();
					progress.appendChild(item);
				});
			}
			if (stepCount) {
				stepCount.textContent = wizardSteps.length ? (currentStep + 1) + ' / ' + wizardSteps.length : '';
			}
			if (stepBack) {
				stepBack.hidden = currentStep === 0;
			}
			if (stepNext) {
				stepNext.hidden = !wizardSteps.length || currentStep >= wizardSteps.length - 1;
			}
			if (addItemButton) {
				addItemButton.hidden = wizardSteps.length > 0 && currentStep < wizardSteps.length - 1;
			}
		}

		function beginCustomization(product, variationId, editIndex) {
			if (!configurator || typeof configurator.showModal !== 'function') {
				showError('Cake customization is not available in this browser. Please refresh the page or contact the bakery.');
				return;
			}
			activeProduct = product;
			editingIndex = typeof editIndex === 'number' ? editIndex : -1;
			clearOptionSelection();
			if (editingIndex >= 0) {
				var existing = configuredItems[editingIndex];
				inputs.forEach(function (input) {
					input.checked = existing.optionIds.indexOf(input.value) !== -1;
				});
			}
			if (variationOptions && variationId) {
				var savedChoice = variationOptions.querySelector('[data-bakly-variation-choice][value="' + variationId + '"]');
				if (savedChoice) {
					savedChoice.checked = true;
				}
			}
			currentStep = 0;
			if (configuratorTitle) {
				configuratorTitle.textContent = (editingIndex >= 0 ? 'Edit ' : 'Customize ') + product.dataset.productName;
			}
			var productImage = standalone ? product.dataset.productImage : root.dataset.productImage;
			var productDescription = standalone ? product.dataset.productDescription : root.dataset.productDescription;
			if (configuratorImage) {
				configuratorImage.src = productImage || '';
				configuratorImage.alt = '';
				configuratorImage.hidden = !productImage;
			}
			if (configuratorDescription) {
				configuratorDescription.textContent = productDescription || '';
				configuratorDescription.hidden = !productDescription;
			}
			renderWizard();
			updateTotals();
			showError('');
			configurator.scrollTop = 0;
			configurator.showModal();
			lockPageScroll();
		}

		function itemFromCurrentSelection() {
			var selected = selectedOptions();
			var base = basePrice();
			var options = selected.map(function (input) {
				var label = input.closest('.bakly-builder-opt');
				var name = label ? label.querySelector('.bakly-builder-opt-name') : null;
				return {
					id: input.value,
					name: name ? name.textContent.trim() : '',
					price: parseFloat(input.dataset.price) || 0,
					group: input.closest('.bakly-builder-step').querySelector('.bakly-builder-step-label').textContent.replace(/^\d+\.\s*/, '').trim()
				};
			});
			var extra = options.reduce(function (sum, option) {
				return sum + option.price;
			}, 0);
			return {
				productId: standalone ? activeProduct.dataset.productId : root.dataset.baklyBuilder,
				variationId: selectedVariation() ? selectedVariation().id : '',
				name: baseName(),
				variation: selectedVariationLabel(),
				basePrice: base,
				options: options,
				optionIds: selected.map(function (input) { return input.value; }),
				total: base + extra
			};
		}

		function updateOrderList() {
			if (!orderItemsEl) {
				return;
			}
			Array.prototype.slice.call(orderItemsEl.children).forEach(function (child) {
				if (child !== orderEmptyEl) {
					child.remove();
				}
			});
			if (orderEmptyEl) {
				orderEmptyEl.hidden = configuredItems.length > 0;
			}
			configuredItems.forEach(function (item, index) {
				var row = document.createElement('article');
				row.className = 'bakly-builder-order-item';
				var detail = document.createElement('div');
				var title = document.createElement('strong');
				title.textContent = item.name + (item.variation ? ' — ' + item.variation : '');
				var options = document.createElement('p');
				options.textContent = item.options.map(function (option) {
					return option.name;
				}).join(', ') || 'No extras';
				var amount = document.createElement('span');
				amount.textContent = money(item.total);
				var remove = document.createElement('button');
				remove.type = 'button';
				remove.className = 'bakly-builder-remove-item';
				remove.textContent = 'Remove';
				remove.setAttribute('aria-label', 'Remove ' + item.name);
				remove.addEventListener('click', function () {
					configuredItems.splice(index, 1);
					updateOrderList();
					updateTotals();
				});
				var edit = document.createElement('button');
				edit.type = 'button';
				edit.className = 'bakly-builder-edit-item';
				edit.textContent = 'Edit';
				edit.setAttribute('aria-label', 'Reconfigure ' + item.name);
				edit.addEventListener('click', function () {
					var product = root.querySelector('[data-bakly-product][data-product-id="' + item.productId + '"]');
					if (!product) {
						showError('This product is no longer available. Please remove it and choose another.');
						return;
					}
					if (product.dataset.isVariable === '1') {
						openProductDialog(product, index);
						return;
					}
					beginCustomization(product, '', index);
				});
				var actions = document.createElement('div');
				actions.className = 'bakly-builder-order-actions';
				detail.appendChild(title);
				detail.appendChild(options);
				row.appendChild(detail);
				row.appendChild(amount);
				actions.appendChild(edit);
				actions.appendChild(remove);
				row.appendChild(actions);
				orderItemsEl.appendChild(row);
			});
		}

		function updateTotals() {
			enforceCaps();
			var total = configuredItems.reduce(function (sum, item) {
				return sum + item.total;
			}, 0);
			if (!standalone) {
				var productBase = basePrice();
				total = productBase === null ? null : productBase + optionTotal();
			}
			var value = total === null ? '—' : money(total);
			if (totalEl) {
				totalEl.textContent = value;
			}
			if (totalMobileEl) {
				totalMobileEl.textContent = value;
			}
			if (modalTotal) {
				var modalBase = basePrice();
				modalTotal.textContent = modalBase === null ? 'Choose a product option' : 'Product price: ' + money(modalBase);
			}
			if (stickybar) {
				stickybar.hidden = standalone ? configuredItems.length === 0 : total === null;
				root.classList.toggle('has-stickybar', !stickybar.hidden);
			}
		}

		function clearOptionSelection() {
			inputs.forEach(function (input) {
				input.checked = false;
				input.disabled = false;
			});
			enforceCaps();
		}

		function openProductDialog(product, editIndex) {
			activeProduct = product;
			pendingEditIndex = typeof editIndex === 'number' ? editIndex : -1;
			showError('');
			if (modalTitle) {
				modalTitle.textContent = product.dataset.productName;
			}
			if (modalImage) {
				modalImage.src = product.dataset.productImage || '';
				modalImage.alt = product.dataset.productName || '';
				modalImage.hidden = !product.dataset.productImage;
			}
			if (modalDescription) {
				modalDescription.textContent = product.dataset.productDescription || '';
				modalDescription.hidden = !product.dataset.productDescription;
			}
			if (variationOptions) {
				variationOptions.innerHTML = '';
				parseProductVariations(product).forEach(function (variation, index) {
					var label = document.createElement('label');
					label.className = 'bakly-builder-variation-card';
					var input = document.createElement('input');
					input.type = 'radio';
					input.name = 'bakly-builder-product-variation-' + builderCount;
					input.value = variation.id;
					input.dataset.baklyVariationChoice = '1';
					input.id = 'bakly-builder-variation-' + builderCount + '-' + product.dataset.productId + '-' + variation.id;
					var content = document.createElement('span');
					content.className = 'bakly-builder-variation-card-copy';
					var name = document.createElement('strong');
					name.textContent = variation.label || 'Option ' + (index + 1);
					var price = document.createElement('span');
					price.textContent = money(variation.price);
					content.appendChild(name);
					content.appendChild(price);
					label.htmlFor = input.id;
					label.appendChild(input);
					label.appendChild(content);
					variationOptions.appendChild(label);
				});
			}
			if (variationWrap) {
				variationWrap.hidden = product.dataset.isVariable !== '1';
			}
			if (basePriceEl) {
				basePriceEl.textContent = product.dataset.productDescription ? '' : 'Choose a product option to see its price.';
			}
			if (pendingEditIndex >= 0 && variationOptions) {
				var existing = configuredItems[pendingEditIndex];
				var savedChoice = variationOptions.querySelector('[data-bakly-variation-choice][value="' + existing.variationId + '"]');
				if (savedChoice) {
					savedChoice.checked = true;
				}
			}
			updateProductOptionSelection();
			updateTotals();
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal();
			} else {
				showError('Product options are not available in this browser.');
			}
		}

		function addCurrentItem() {
			var message = validateOptions();
			if (message) {
				var missingStep = wizardSteps.filter(function (step) {
					return step.dataset.baklyRequired === '1' && !step.querySelector('.bakly-builder-opt-input:checked');
				})[0] || null;
				var missingInput = missingStep && missingStep.querySelector('.bakly-builder-opt-input');
				showError(message, true, missingStep, missingInput, missingStep && missingStep.firstElementChild);
				return;
			}
			var configured = itemFromCurrentSelection();
			if (editingIndex >= 0) {
				configuredItems[editingIndex] = configured;
			} else {
				configuredItems.push(configured);
			}
			editingIndex = -1;
			updateOrderList();
			updateTotals();
			showError('');
			closeConfigurator();
			root.querySelector('.bakly-builder-order').scrollIntoView({ behavior: 'smooth', block: 'start' });
		}

		function confirmProductOptions() {
			var variation = selectedVariation();
			if (!variation) {
				showError('Please choose an available product option.', true);
				return;
			}
			var product = activeProduct;
			var editIndex = pendingEditIndex;
			pendingEditIndex = -1;
			if (dialog && dialog.open) {
				dialog.close();
			}
			beginCustomization(product, variation.id, editIndex);
		}

		function updateProductOptionSelection() {
			var variation = selectedVariation();
			if (basePriceEl) {
				basePriceEl.textContent = variation ? 'Selected option: ' + variation.label : 'Choose a product option to see its price.';
			}
			if (modalTotal) {
				modalTotal.textContent = variation ? 'Product price: ' + money(variation.price) : 'Choose a product option';
			}
			showError('');
		}

		function nextWizardStep() {
			var fieldset = wizardSteps[currentStep];
			if (fieldset && fieldset.dataset.baklyRequired === '1' && !fieldset.querySelector('.bakly-builder-opt-input:checked')) {
				showError('Please make a selection to continue.', true, fieldset, fieldset.querySelector('.bakly-builder-opt-input'), fieldset.firstElementChild);
				return;
			}
			if (currentStep < wizardSteps.length - 1) {
				currentStep += 1;
				showError('');
				renderWizard();
				configurator.scrollTo({ top: 0, behavior: 'smooth' });
			}
		}

		function previousWizardStep() {
			if (currentStep > 0) {
				currentStep -= 1;
				showError('');
				renderWizard();
				configurator.scrollTo({ top: 0, behavior: 'smooth' });
			}
		}

		function cancelCustomization() {
			closeConfigurator();
			editingIndex = -1;
			showError('');
		}

		function pickupWeekday(date) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
				return -1;
			}
			var parts = date.split('-').map(Number);
			var parsed = new Date(parts[0], parts[1] - 1, parts[2]);
			if (parsed.getFullYear() !== parts[0] || parsed.getMonth() !== parts[1] - 1 || parsed.getDate() !== parts[2]) {
				return -1;
			}
			return parsed.getDay();
		}

		function validPickupDate(date) {
			if (!date || date < pickupDate.min || date > pickupDate.max) {
				return false;
			}
			var day = pickupWeekday(date);
			return Array.isArray(schedule[String(day)]) && schedule[String(day)].length > 0;
		}

		function pickupDateString(date) {
			var year = date.getFullYear();
			var month = String(date.getMonth() + 1).padStart(2, '0');
			var day = String(date.getDate()).padStart(2, '0');
			return year + '-' + month + '-' + day;
		}

		function formatPickupDate(date) {
			var parts = date.split('-').map(Number);
			var parsed = new Date(parts[0], parts[1] - 1, parts[2]);
			return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
				weekday: 'short',
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			}).format(parsed);
		}

		function firstAvailablePickupDate() {
			var date = new Date(pickupDate.min + 'T12:00:00');
			var maximum = new Date(pickupDate.max + 'T12:00:00');
			while (date <= maximum) {
				var candidate = pickupDateString(date);
				if (validPickupDate(candidate)) {
					return candidate;
				}
				date.setDate(date.getDate() + 1);
			}
			return pickupDate.min;
		}

		function renderPickupCalendar() {
			if (!pickupDateTrigger || !pickupDateCalendar || !calendarRoot) {
				return;
			}
			pickupDateCalendar.hidden = !calendarOpen;
			pickupDateTrigger.setAttribute('aria-expanded', calendarOpen ? 'true' : 'false');
			if (!calendarOpen) {
				calendarRoot.render(null);
				return;
			}
			var initialDate = pickupDate.value || firstAvailablePickupDate();
			calendarRoot.render(wpElement.createElement(wpComponents.DatePicker, {
				currentDate: initialDate,
				startOfWeek: 1,
				isInvalidDate: function (date) {
					return !validPickupDate(pickupDateString(date));
				},
				onChange: function (date) {
					pickupDate.value = date.slice(0, 10);
					var formattedDate = formatPickupDate(pickupDate.value);
					pickupDateLabel.textContent = formattedDate;
					pickupDateTrigger.setAttribute('aria-label', 'Pickup date: ' + formattedDate + '. Change date.');
					updatePickupTimes();
					showError('');
					calendarOpen = false;
					renderPickupCalendar();
					pickupDateTrigger.focus();
				}
			}));
			window.requestAnimationFrame(function () {
				var calendarRect = pickupDateCalendar.getBoundingClientRect();
				var stickyTop = stickybar && !stickybar.hidden ? stickybar.getBoundingClientRect().top : window.innerHeight;
				var visibleBottom = Math.min(window.innerHeight, stickyTop) - 12;
				if (calendarRect.bottom > visibleBottom || calendarRect.top < 12) {
					var visibleCenter = (12 + visibleBottom) / 2;
					var targetTop = visibleCenter - calendarRect.height / 2;
					window.scrollBy({
						top: calendarRect.top - targetTop,
						behavior: 'smooth'
					});
				}
			});
		}

		function updatePickupTimes() {
			if (!pickupDate || !pickupTime) {
				return true;
			}
			pickupTime.innerHTML = '';
			var date = pickupDate.value;
			var valid = validPickupDate(date);
			var times = valid ? schedule[String(pickupWeekday(date))] : [];
			if (!valid) {
				var prompt = document.createElement('option');
				prompt.value = '';
				prompt.textContent = date ? 'No pickup slots on this date' : 'Choose a date first';
				pickupTime.appendChild(prompt);
				pickupTime.disabled = true;
				pickupTime.value = '';
				return false;
			}
			var selectPrompt = document.createElement('option');
			selectPrompt.value = '';
			selectPrompt.textContent = 'Choose a requested time';
			pickupTime.appendChild(selectPrompt);
			times.slice().sort().forEach(function (time) {
				var option = document.createElement('option');
				option.value = time;
				option.textContent = time;
				pickupTime.appendChild(option);
			});
			pickupTime.disabled = false;
			return true;
		}

		function validatePickup() {
			if (!pickupLocation) {
				return null;
			}
			if (!pickupLocation.value) {
				return { message: 'Please choose a pickup location.', field: pickupLocation };
			}
			if (!pickupDate || !validPickupDate(pickupDate.value)) {
				return { message: 'Please choose an available pickup date.', field: pickupDateTrigger };
			}
			if (!pickupTime || !pickupTime.value) {
				return { message: 'Please choose a requested pickup time.', field: pickupTime };
			}
			return null;
		}

		function buildEnquiry() {
			if (standalone) {
				if (configurator && configurator.open) {
					var inProgressTarget = addItemButton && !addItemButton.hidden ? addItemButton : stepNext;
					showError('Finish customizing or cancel this cake before sending your order.', true, configurator, inProgressTarget, configurator.firstElementChild);
					return;
				}
				if (!configuredItems.length) {
					var orderSection = root.querySelector('.bakly-builder-order');
					var orderItems = orderSection && orderSection.querySelector('[data-bakly-order-items]');
					showError('Add at least one customized cake to your request.', true, orderSection, orderItems, orderItems);
					return;
				}
			} else {
				var optionError = validateOptions();
				if (optionError) {
					var requiredStep = root.querySelector('.bakly-builder-step[data-bakly-required="1"]');
					var requiredInput = requiredStep && requiredStep.querySelector('.bakly-builder-opt-input');
					showError(optionError, true, requiredStep, requiredInput, requiredStep && requiredStep.firstElementChild);
					return;
				}
			}
			var pickupError = validatePickup();
			if (pickupError) {
				var pickupField = pickupError.field;
				showError(pickupError.message, true, pickupField.closest('.bakly-builder-field').parentNode, pickupField, pickupField.closest('.bakly-builder-field'));
				return;
			}

			var items = standalone ? configuredItems : [itemFromCurrentSelection()];
			var total = items.reduce(function (sum, item) {
				return sum + item.total;
			}, 0);
			var locationOption = pickupLocation && pickupLocation.options[pickupLocation.selectedIndex];
			var lines = ['Order request', ''];
			items.forEach(function (item, index) {
				lines.push((index + 1) + '. ' + item.name);
				if (item.variation) {
					lines.push('   Option: ' + item.variation);
				}
				item.options.forEach(function (option) {
					lines.push('   ' + option.group + ': ' + option.name + (option.price ? ' (' + money(option.price) + ')' : ''));
				});
				lines.push('   Estimated item total: ' + money(item.total));
			});
			lines.push('');
			lines.push('Estimated order total: ' + money(total));
			if (pickupLocation && pickupLocation.value) {
				lines.push('Pickup location: ' + locationOption.dataset.locationName);
				if (locationOption.dataset.locationAddress) {
					lines.push('Pickup address: ' + locationOption.dataset.locationAddress);
				}
				if (locationOption.dataset.locationDetails) {
					lines.push('Pickup details: ' + locationOption.dataset.locationDetails);
				}
				lines.push('Requested pickup date: ' + pickupDate.value);
				lines.push('Requested pickup time: ' + pickupTime.value);
			} else {
				lines.push('Pickup location and time: Not selected; please contact the customer to arrange.');
			}
			lines.push('');
			lines.push('Any pickup date and time are requests only and are not reserved until confirmed by the bakery.');

			var payload = {
				subject: 'Order enquiry: ' + (items.length === 1 ? items[0].name : items.length + ' items'),
				message: lines.join('\n')
			};
			try {
				window.sessionStorage.setItem(ENQUIRY_KEY, JSON.stringify(payload));
			} catch (e) {
				var summary = root.querySelector('.bakly-builder-summary');
				var enquiryButton = summary && summary.querySelector('[data-bakly-enquiry]');
				showError('Your enquiry could not be prepared in this browser. Please enable session storage and try again.', true, summary, enquiryButton, enquiryButton);
				return;
			}
			window.location.href = this.dataset.contactUrl || '/contact/';
		}

		root.querySelectorAll('[data-bakly-product]').forEach(function (button) {
			button.addEventListener('click', function () {
				if (button.dataset.isVariable === '1') {
					openProductDialog(button, -1);
				} else {
					beginCustomization(button, '', -1);
				}
			});
		});
		if (addItemButton) {
			addItemButton.addEventListener('click', addCurrentItem);
		}
		if (productConfirm) {
			productConfirm.addEventListener('click', confirmProductOptions);
		}
		if (stepNext) {
			stepNext.addEventListener('click', nextWizardStep);
		}
		if (stepBack) {
			stepBack.addEventListener('click', previousWizardStep);
		}
		if (backToCatalog) {
			backToCatalog.addEventListener('click', cancelCustomization);
		}
		if (configurator) {
			configurator.addEventListener('keydown', function (event) {
				if (event.key === 'Escape') {
					event.preventDefault();
					cancelCustomization();
				}
			});
			configurator.addEventListener('cancel', function (event) {
				event.preventDefault();
				cancelCustomization();
			});
		}
		root.querySelectorAll('[data-bakly-modal-close]').forEach(function (button) {
			button.addEventListener('click', function () {
				dialog.close();
			});
		});
		if (dialog) {
			dialog.addEventListener('click', function (event) {
				if (event.target === dialog) {
					dialog.close();
				}
			});
		}
		inputs.forEach(function (input) {
			input.addEventListener('change', function () {
				showError('');
				updateTotals();
			});
		});
		if (variationOptions) {
			variationOptions.addEventListener('change', updateProductOptionSelection);
		}
		if (form) {
			form.addEventListener('change', function () {
				updateTotals();
				showError('');
			});
		}
		if (pickupDateTrigger && calendarRoot) {
			pickupDateTrigger.addEventListener('click', function () {
				calendarOpen = !calendarOpen;
				renderPickupCalendar();
			});
			document.addEventListener('click', function (event) {
				if (calendarOpen && !pickupDateCalendar.contains(event.target) && !pickupDateTrigger.contains(event.target)) {
					calendarOpen = false;
					renderPickupCalendar();
				}
			});
			document.addEventListener('keydown', function (event) {
				if (calendarOpen && event.key === 'Escape') {
					calendarOpen = false;
					renderPickupCalendar();
					pickupDateTrigger.focus();
				}
			});
		} else if (pickupDateTrigger) {
			pickupDateTrigger.disabled = true;
			if (pickupDateHelp) {
				pickupDateHelp.textContent = 'The pickup calendar could not be loaded. Please refresh the page or contact the bakery.';
			}
		}
		if (pickupLocation) {
			pickupLocation.addEventListener('change', function () {
				var selectedLocation = pickupLocation.options[pickupLocation.selectedIndex];
				var details = selectedLocation ? selectedLocation.dataset.locationDetails || '' : '';
				if (pickupDetails) {
					pickupDetails.textContent = details;
					pickupDetails.hidden = !details;
				}
				showError('');
			});
		}
		if (pickupTime) {
			pickupTime.addEventListener('change', showError.bind(null, ''));
		}
		enquiryButtons.forEach(function (button) {
			button.addEventListener('click', buildEnquiry);
		});

		updatePickupTimes();
		if (pickupDate && pickupDate.value && pickupDateLabel) {
			pickupDateLabel.textContent = formatPickupDate(pickupDate.value);
		}
		updateOrderList();
		updateTotals();
		if (standalone) {
			renderWizard();
		}
	}

	function boot() {
		document.querySelectorAll('.bakly-cake-builder').forEach(initBuilder);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
