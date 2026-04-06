/**
 * ViewLG Extension – Configure page script.
 *
 * Loaded in the main page <head> via extension.php so it is always trusted
 * ('self') and not affected by FreshRSS's CSP.  The configure form itself is
 * injected later via AJAX; we use a MutationObserver to detect it.
 *
 * NO inline styles are set from PHP (CSP blocks them).  Instead every element
 * that needs an initial colour carries a data-color attribute; this script
 * reads it and sets element.style.background – which is allowed when executed
 * from a trusted external script.
 */
(function () {
	'use strict';

	/* =========================================================================
	   Theme presets (must match configure.phtml PHP array)
	   ========================================================================= */

	var CV_THEMES = {
		light: {
			list_bg:               '#fafafa',
			list_item_hover:       '#f0f0f0',
			list_item_hover_text:  '#222222',
			list_hover_title_bg:   '#f0f0f0',
			list_hover_title_text: '#111111',
			list_item_selected:    '#dceeff',
			content_bg:            '#ffffff',
			content_text:          '#222222',
			border:                '#dddddd',
			splitter:              '#999999'
		},
		dark: {
			list_bg:               '#1e2228',
			list_item_hover:       '#2a2f3a',
			list_item_hover_text:  '#e8e8e8',
			list_hover_title_bg:   '#2a2f3a',
			list_hover_title_text: '#ffffff',
			list_item_selected:    '#1e395a',
			content_bg:            '#252b35',
			content_text:          '#d4d4d4',
			border:                '#3a3f4b',
			splitter:              '#4a5060'
		},
		nord: {
			list_bg:               '#2e3440',
			list_item_hover:       '#3b4252',
			list_item_hover_text:  '#e5e9f0',
			list_hover_title_bg:   '#3b4252',
			list_hover_title_text: '#eceff4',
			list_item_selected:    '#5e81ac',
			content_bg:            '#3b4252',
			content_text:          '#d8dee9',
			border:                '#4c566a',
			splitter:              '#4c566a'
		},
		lg: {
			list_bg:               '#d6d6d9',
			list_item_hover:       '#18387b',
			list_item_hover_text:  '#cfcfcf',
			list_hover_title_bg:   '#2b13a4',
			list_hover_title_text: '#d4d4d4',
			list_item_selected:    '#dceeff',
			content_bg:            '#060033',
			content_text:          '#cccccc',
			border:                '#dddddd',
			splitter:              '#999999'
		}
	};

	/* =========================================================================
	   State
	   ========================================================================= */

	var _tracked = {};   // picker id → last known value

	/* =========================================================================
	   Helpers
	   ========================================================================= */

	function setSwatch(el, color) {
		if (el) el.style.background = color || '';
	}

	function setPreview(el, enabled, color) {
		if (el) el.style.backgroundColor = enabled ? (color || '') : '';
	}

	/* =========================================================================
	   Row updaters
	   ========================================================================= */

	function updateFeedRow(feedId, value) {
		var cb      = document.getElementById('cv_enable_'  + feedId);
		var preview = document.getElementById('cv_preview_' + feedId);
		var swatch  = document.getElementById('cv_swatch_'  + feedId);
		var hexEl   = document.getElementById('cv_hex_'     + feedId);
		setSwatch(swatch, value);
		setPreview(preview, cb ? cb.checked : true, value);
		if (hexEl) hexEl.value = value;
	}

	function updateUiRow(key, value) {
		var cb      = document.getElementById('cv_ui_en_'      + key);
		var preview = document.getElementById('cv_ui_preview_' + key);
		var swatch  = document.getElementById('cv_ui_swatch_'  + key);
		var hexEl   = document.getElementById('cv_ui_hex_'     + key);
		setSwatch(swatch, value);
		setPreview(preview, cb ? cb.checked : true, value);
		if (hexEl) hexEl.value = value;
	}

	/* =========================================================================
	   Theme applier
	   ========================================================================= */

	function applyUiTheme(themeKey) {
		var theme = CV_THEMES[themeKey];
		if (!theme) return;
		for (var key in theme) {
			if (!Object.prototype.hasOwnProperty.call(theme, key)) continue;
			var cb      = document.getElementById('cv_ui_en_'      + key);
			var picker  = document.getElementById('cv_ui_color_'   + key);
			var preview = document.getElementById('cv_ui_preview_' + key);
			var swatch  = document.getElementById('cv_ui_swatch_'  + key);
			if (!picker) continue;
			if (cb) cb.checked = true;
			picker.value       = theme[key];
			_tracked[picker.id] = theme[key];
			setSwatch(swatch, theme[key]);
			setPreview(preview, true, theme[key]);
		}
	}

	/* =========================================================================
	   Polling – detects picker value changes without relying on events
	   (events can be swallowed by FreshRSS's own handlers)
	   ========================================================================= */

	(function poll() {
		document.querySelectorAll('.cv-overlay-picker').forEach(function (picker) {
			var val = picker.value;
			if (_tracked[picker.id] === val) return;
			_tracked[picker.id] = val;

			var feedId = picker.getAttribute('data-feed-id');
			if (feedId) {
				var cb = document.getElementById('cv_enable_' + feedId);
				if (cb) cb.checked = true;
				updateFeedRow(feedId, val);
				return;
			}

			var uiKey = picker.getAttribute('data-ui-key');
			if (uiKey) {
				var cbUi = document.getElementById('cv_ui_en_' + uiKey);
				if (cbUi) cbUi.checked = true;
				updateUiRow(uiKey, val);
			}
		});
		requestAnimationFrame(poll);
	}());

	/* =========================================================================
	   Init – wires all event listeners and applies initial colours
	   ========================================================================= */

	function initConfigureForm() {
		var settings = document.querySelector('.cv-settings:not([data-cv-inited])');
		if (!settings) return false;

		// Mark this DOM instance so we never double-init the same element
		settings.setAttribute('data-cv-inited', '1');
		_tracked = {};

		/* Apply initial colours stored as data-color (set by PHP, CSP-safe from JS) */
		settings.querySelectorAll('[data-color]').forEach(function (el) {
			el.style.background = el.getAttribute('data-color');
		});

		/* Apply initial background-color on .cv-preview elements that have data-color */
		settings.querySelectorAll('.cv-preview[data-color]').forEach(function (el) {
			el.style.backgroundColor = el.getAttribute('data-color');
		});

		/* Seed tracker with current picker values */
		settings.querySelectorAll('.cv-overlay-picker').forEach(function (picker) {
			_tracked[picker.id] = picker.value;
		});

		/* Feed colour rows */
		settings.querySelectorAll('.cv-enable-cb').forEach(function (cb) {
			var feedId = cb.getAttribute('data-feed-id');
			var p = document.getElementById('cv_color_' + feedId);
			if (p) updateFeedRow(feedId, p.value);
			cb.addEventListener('change', function () {
				var p2 = document.getElementById('cv_color_' + feedId);
				if (p2) updateFeedRow(feedId, p2.value);
			});
		});

		/* UI colour rows */
		settings.querySelectorAll('.cv-ui-enable-cb').forEach(function (cb) {
			var key = cb.getAttribute('data-ui-key');
			var p = document.getElementById('cv_ui_color_' + key);
			if (p) updateUiRow(key, p.value);
			cb.addEventListener('change', function () {
				var p2 = document.getElementById('cv_ui_color_' + key);
				if (p2) updateUiRow(key, p2.value);
			});
		});

		/* Hex text inputs – typing a valid #rrggbb updates the picker + row */
		var hexRe = /^#[0-9a-fA-F]{6}$/;
		settings.querySelectorAll('.cv-hex-input').forEach(function (hexEl) {
			hexEl.addEventListener('input', function () {
				var val = hexEl.value.trim();
				if (!hexRe.test(val)) return;
				var feedId = hexEl.getAttribute('data-feed-id');
				var uiKey  = hexEl.getAttribute('data-ui-key');
				if (feedId) {
					var picker = document.getElementById('cv_color_' + feedId);
					if (picker) { picker.value = val; _tracked[picker.id] = val; }
					updateFeedRow(feedId, val);
				} else if (uiKey) {
					var pickerUi = document.getElementById('cv_ui_color_' + uiKey);
					if (pickerUi) { pickerUi.value = val; _tracked[pickerUi.id] = val; }
					updateUiRow(uiKey, val);
				}
			});
			/* Select all on focus for easy copy/paste */
			hexEl.addEventListener('focus', function () { hexEl.select(); });
		});

		/* ---------------------------------------------------------------
		   Form submit: disable pickers for unchecked rows so they are NOT
		   included in the POST body (disabled inputs are never submitted).
		   PHP then uses presence of the key as the "enabled" signal.
		   --------------------------------------------------------------- */
		var form = settings.querySelector('form');
		if (form) {
			form.addEventListener('submit', function () {
				document.querySelectorAll('.cv-ui-enable-cb').forEach(function (cb) {
					var key    = cb.getAttribute('data-ui-key');
					var picker = document.getElementById('cv_ui_color_' + key);
					if (picker && !cb.checked) {
						picker.disabled = true;
					}
				});
			});
		}

		/* Theme buttons */
		settings.querySelectorAll('.cv-theme-btn').forEach(function (btn) {
			btn.addEventListener('click', function () {
				applyUiTheme(btn.getAttribute('data-theme'));
			});
		});

		/* Reset button */
		var resetBtn = settings.querySelector('.cv-theme-reset');
		if (resetBtn) {
			resetBtn.addEventListener('click', function () {
				document.querySelectorAll('.cv-ui-enable-cb').forEach(function (cb) {
					var key = cb.getAttribute('data-ui-key');
					cb.checked = false;
					setPreview(document.getElementById('cv_ui_preview_' + key), false, '');
				});
			});
		}

		return true;
	}

	/* =========================================================================
	   Boot – always watch for AJAX injection; also try immediately in case
	   the form was server-rendered (direct URL navigation or post-save reload)
	   ========================================================================= */

	var obs = new MutationObserver(function () {
		if (initConfigureForm()) {
			// Form found and inited – disconnect and re-arm for next injection
			obs.disconnect();
			obs.observe(document.body, { childList: true, subtree: true });
		}
	});

	obs.observe(document.body, { childList: true, subtree: true });

	// Also try right now (form may already be in the DOM)
	initConfigureForm();

}());
