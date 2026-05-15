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

	/* Mapping ui-key → cssVar-key pour dériver les couleurs du panneau liste
	   depuis les variables CSS du thème quand elles ne sont pas surchargées. */
	var UI_DERIVE_FROM_CSSVAR = {
		list_bg:                 'sid-bg',
		list_text:               'sid-font-color',
		list_item_hover:         'unread-article-background-color-hover',
		list_item_hover_text:    'font-color',
		list_hover_title_bg:     'unread-article-background-color-hover',
		list_hover_title_text:   'font-color',
		list_item_selected:      'sid-active',
		list_item_selected_text: 'sid-active-font',
		content_bg:              'sid-bg-alt',
		content_text:            'font-color-grey',
		border:                  'sid-sep',
		splitter:                'sid-sep'
	};

	var CV_THEMES = {
		light: {
			ui: {
				list_bg:               '#fafafa',
				list_item_hover:       '#f0f0f0',
				list_item_hover_text:  '#222222',
				list_hover_title_bg:   '#f0f0f0',
				list_hover_title_text: '#111111',
				list_item_selected:    '#dceeff',
				list_item_selected_text: '#222222',
				content_bg:            '#ffffff',
				content_text:          '#222222',
				border:                '#dddddd',
				splitter:              '#999999'
			},
			cssVars: {}  // hérite tout du thème FreshRSS actif
		},
		dark: {
			ui: {
				// list_bg = sid-bg, content_bg = sid-bg-alt, border = sid-sep → dérivés
				list_text:               '#d4d4d4',     // sid-font-color=#c8c8c8 (différent)
				list_item_hover:         '#2a2f3a',     // hover-bg=#1e2a3a (différent)
				list_item_hover_text:    '#e8e8e8',     // font-color=#d4d4d4 (différent)
				list_hover_title_bg:     '#2a2f3a',     // hover-bg=#1e2a3a (différent)
				list_hover_title_text:   '#ffffff',     // font-color=#d4d4d4 (différent)
				list_item_selected:      '#1e395a',     // sid-active=#4a7fd4 (différent)
				list_item_selected_text: '#d4d4d4',     // sid-active-font=#ffffff (différent)
				content_text:            '#d4d4d4',     // font-color-grey=#888888 (différent)
				splitter:                '#4a5060'      // sid-sep=#3a3f4b (différent)
			},
			cssVars: {
				'sid-bg':                                    '#1e2228',
				'sid-bg-alt':                               '#252b35',
				'sid-bg-dark':                              '#141418',
				'sid-font-color':                           '#c8c8c8',
				'sid-sep':                                  '#3a3f4b',
				'sid-active':                               '#4a7fd4',
				'sid-active-font':                          '#ffffff',
				'main-first':                               '#4a7fd4',
				'main-first-alt':                           '#3a6fc4',
				'main-first-light':                         '#1e2a3a',
				'main-first-darker':                        '#0a0d12',
				'unread-article-background-color':          '#1a2535',
				'unread-article-background-color-hover':    '#1e2a3a',
				'unread-article-border-color':              '#d4520a',
				'unread-bg':                                '#1a2535',
				'unread-font-color':                        '#4a7fd4',
				'favorite-article-background-color':        '#2a2010',
				'favorite-article-background-color-hover':  '#2e2412',
				'favorite-article-border-color':            '#c98800',
				'fav-bg':                                   '#d4a000',
				'font-color':                               '#d4d4d4',
				'font-color-grey':                          '#888888',
				'font-color-link':                          '#6a9fd4',
				'font-color-link-hover':                    '#8ab4e4',
				'background-color-grey':                    '#2a2f3a'
			}
		},
		nord: {
			ui: {
				// Toutes les autres clés sont dérivées de cssVars via UI_DERIVE_FROM_CSSVAR
				list_item_hover_text:   '#e5e9f0',   // font-color=#eceff4 (légèrement différent)
				content_bg:             '#3b4252'    // sid-bg-alt=#272c36 (différent)
			},
			cssVars: {
				'sid-bg':                                    '#2e3440',
				'sid-bg-alt':                               '#272c36',
				'sid-bg-dark':                              '#1e2228',
				'sid-font-color':                           '#eceff4',
				'sid-sep':                                  '#4c566a',
				'sid-active':                               '#5e81ac',
				'sid-active-font':                          '#eceff4',
				'main-first':                               '#5e81ac',
				'main-first-alt':                           '#4e71ac',
				'main-first-light':                         '#e0e8f0',
				'main-first-darker':                        '#1a2030',
				'unread-article-background-color':          '#2e3440',
				'unread-article-background-color-hover':    '#3b4252',
				'unread-article-border-color':              '#bf616a',
				'unread-bg':                                '#2e3440',
				'unread-font-color':                        '#88c0d0',
				'favorite-article-background-color':        '#3b3440',
				'favorite-article-background-color-hover':  '#403848',
				'favorite-article-border-color':            '#ebcb8b',
				'fav-bg':                                   '#ebcb8b',
				'font-color':                               '#eceff4',
				'font-color-grey':                          '#d8dee9',
				'font-color-link':                          '#88c0d0',
				'font-color-link-hover':                    '#8fbcbb',
				'background-color-grey':                    '#2e3440'
			}
		},
		lg: {
			ui: {
				// Toutes les autres clés sont dérivées de cssVars via UI_DERIVE_FROM_CSSVAR
				list_item_hover_text:   '#e5e9f0',   // font-color=#eceff4 (légèrement différent)
				content_bg:             '#3b4252'    // sid-bg-alt=#272c36 (différent)
			},
			cssVars: {
				'sid-bg':                                   '#2e3440',
				'sid-bg-alt':                               '#272c36',
				'sid-bg-dark':                              '#1e2228',
				'sid-font-color':                           '#eceff4',
				'sid-sep':                                  '#4c566a',
				'sid-active':                               '#5e81ac',
				'sid-active-font':                          '#eceff4',
				'main-first':                               '#5e81ac',
				'main-first-alt':                           '#4e71ac',
				'main-first-light':                         '#e0e8f0',
				'main-first-darker':                        '#1a2030',
				'unread-article-background-color':          '#2e3440',
				'unread-article-background-color-hover':    '#3b4252',
				'unread-article-border-color':              '#bf616a',
				'unread-bg':                                '#2e3440',
				'unread-font-color':                        '#88c8d0',
				'favorite-article-background-color':        '#3b3440',
				'favorite-article-background-color-hover':  '#403848',
				'favorite-article-border-color':            '#cbcb8b',
				'fav-bg':                                   '#cbcb8b',
				'font-color':                               '#eceff4',
				'font-color-grey':                          '#d8dee9',
				'font-color-link':                          '#88c8d0',
				'font-color-link-hover':                    '#6fbcbb',
				'background-color-grey':                    '#2e3440'
			}
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

	function updateCssVarRow(key, value) {
		var cb      = document.getElementById('cv_cv_en_'      + key);
		var preview = document.getElementById('cv_cv_preview_' + key);
		var swatch  = document.getElementById('cv_cv_swatch_'  + key);
		var hexEl   = document.getElementById('cv_cv_hex_'     + key);
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

		var cssVars = theme.cssVars || {};

		// Construire l'ui effectif : dériver depuis cssVars, puis surcharger avec theme.ui explicite
		var effectiveUi = {};
		for (var dk in UI_DERIVE_FROM_CSSVAR) {
			if (!Object.prototype.hasOwnProperty.call(UI_DERIVE_FROM_CSSVAR, dk)) continue;
			var cvKey = UI_DERIVE_FROM_CSSVAR[dk];
			if (cssVars[cvKey]) effectiveUi[dk] = cssVars[cvKey];
		}
		var explicitUi = theme.ui || {};
		for (var ek in explicitUi) {
			if (!Object.prototype.hasOwnProperty.call(explicitUi, ek)) continue;
			effectiveUi[ek] = explicitUi[ek];
		}

		// Apply UI panel colors (section 2)
		for (var key in effectiveUi) {
			if (!Object.prototype.hasOwnProperty.call(effectiveUi, key)) continue;
			var cb      = document.getElementById('cv_ui_en_'      + key);
			var picker  = document.getElementById('cv_ui_color_'   + key);
			var preview = document.getElementById('cv_ui_preview_' + key);
			var swatch  = document.getElementById('cv_ui_swatch_'  + key);
			if (!picker) continue;
			if (cb) cb.checked = true;
			picker.value        = effectiveUi[key];
			_tracked[picker.id] = effectiveUi[key];
			setSwatch(swatch, effectiveUi[key]);
			setPreview(preview, true, effectiveUi[key]);
		}

		// Apply CSS variable overrides (section 3)
		// First uncheck all cssvar rows, then set only those provided by the theme
		document.querySelectorAll('.cv-cssvar-enable-cb').forEach(function (cb) {
			cb.checked = false;
			var k = cb.getAttribute('data-cssvar-key');
			setPreview(document.getElementById('cv_cv_preview_' + k), false, '');
		});
		for (var vkey in cssVars) {
			if (!Object.prototype.hasOwnProperty.call(cssVars, vkey)) continue;
			var vcb      = document.getElementById('cv_cv_en_'      + vkey);
			var vpicker  = document.getElementById('cv_cv_color_'   + vkey);
			var vpreview = document.getElementById('cv_cv_preview_' + vkey);
			var vswatch  = document.getElementById('cv_cv_swatch_'  + vkey);
			var vhex     = document.getElementById('cv_cv_hex_'     + vkey);
			if (!vpicker) continue;
			if (vcb) vcb.checked = true;
			vpicker.value        = cssVars[vkey];
			_tracked[vpicker.id] = cssVars[vkey];
			setSwatch(vswatch, cssVars[vkey]);
			setPreview(vpreview, true, cssVars[vkey]);
			if (vhex) vhex.value = cssVars[vkey];
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
				return;
			}

			var cssvarKey = picker.getAttribute('data-cssvar-key');
			if (cssvarKey) {
				var cbCv = document.getElementById('cv_cv_en_' + cssvarKey);
				if (cbCv) cbCv.checked = true;
				updateCssVarRow(cssvarKey, val);
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

		/* CSS variable override rows */
		settings.querySelectorAll('.cv-cssvar-enable-cb').forEach(function (cb) {
			var key = cb.getAttribute('data-cssvar-key');
			var p = document.getElementById('cv_cv_color_' + key);
			if (p) updateCssVarRow(key, p.value);
			cb.addEventListener('change', function () {
				var p2 = document.getElementById('cv_cv_color_' + key);
				if (p2) updateCssVarRow(key, p2.value);
			});
		});

		/* Hex text inputs – typing a valid #rrggbb updates the picker + row */
		var hexRe = /^#[0-9a-fA-F]{6}$/;
		settings.querySelectorAll('.cv-hex-input').forEach(function (hexEl) {
			hexEl.addEventListener('input', function () {
				var val = hexEl.value.trim();
				if (!hexRe.test(val)) return;
				var feedId    = hexEl.getAttribute('data-feed-id');
				var uiKey     = hexEl.getAttribute('data-ui-key');
				var cssvarKey = hexEl.getAttribute('data-cssvar-key');
				if (feedId) {
					var picker = document.getElementById('cv_color_' + feedId);
					if (picker) { picker.value = val; _tracked[picker.id] = val; }
					updateFeedRow(feedId, val);
				} else if (uiKey) {
					var pickerUi = document.getElementById('cv_ui_color_' + uiKey);
					if (pickerUi) { pickerUi.value = val; _tracked[pickerUi.id] = val; }
					updateUiRow(uiKey, val);
				} else if (cssvarKey) {
					var pickerCv = document.getElementById('cv_cv_color_' + cssvarKey);
					if (pickerCv) { pickerCv.value = val; _tracked[pickerCv.id] = val; }
					updateCssVarRow(cssvarKey, val);
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
				document.querySelectorAll('.cv-cssvar-enable-cb').forEach(function (cb) {
					var key    = cb.getAttribute('data-cssvar-key');
					var picker = document.getElementById('cv_cv_color_' + key);
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
				document.querySelectorAll('.cv-cssvar-enable-cb').forEach(function (cb) {
					var key = cb.getAttribute('data-cssvar-key');
					cb.checked = false;
					setPreview(document.getElementById('cv_cv_preview_' + key), false, '');
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
