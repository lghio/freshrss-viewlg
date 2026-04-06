/**
 * ViewLG FreshRSS Extension
 *
 * Combines:
 *   1. ThreePanesView – side-by-side article list + article content panes
 *   2. Per-feed article highlight colors – user-defined background colors
 *      applied to article rows in the list
 */
(function () {
	'use strict';

	/* =========================================================================
	   CONFIG – read settings injected by extension.php via injectConfig()
	   ========================================================================= */

	var cfg = {
		threePanes:        true,
		defaultReaderMode: 'summary',
		checkFrameUrl:     '',
		feedIdColors:      {},
		feedNameColors:    {},
		uiColors:          {}
	};

	function readConfig() {
		var el = document.getElementById('cv_config');
		if (!el) return;

		cfg.threePanes        = el.getAttribute('data-three-panes') !== 'false';
		cfg.defaultReaderMode = el.getAttribute('data-default-reader') === 'full' ? 'full' : 'summary';
		cfg.checkFrameUrl     = el.getAttribute('data-check-frame-url') || '';

		try {
			cfg.feedIdColors = JSON.parse(el.getAttribute('data-feed-id-colors') || '{}');
		} catch (e) {
			cfg.feedIdColors = {};
		}

		try {
			cfg.feedNameColors = JSON.parse(el.getAttribute('data-feed-name-colors') || '{}');
		} catch (e) {
			cfg.feedNameColors = {};
		}

		try {
			cfg.uiColors = JSON.parse(el.getAttribute('data-ui-colors') || '{}');
		} catch (e) {
			cfg.uiColors = {};
		}
	}

	/* =========================================================================
	   HIGHLIGHT COLORS
	   Two complementary strategies:
	     A) Inject a <style> tag using [data-feed-id] selectors (modern FreshRSS)
	     B) Walk every .flux_header and read .website text (like ColorfulList)
	        – guarantees compatibility with older FreshRSS builds
	   ========================================================================= */

	/**
	 * Strategy A: inject CSS rules targeting data-feed-id attributes.
	 * FreshRSS adds data-feed-id to .flux list items since v1.x.
	 */
	function injectColorCSS() {
		var colors = cfg.feedIdColors;
		if (!colors || Object.keys(colors).length === 0) return;

		var css = '';
		for (var feedId in colors) {
			if (!Object.prototype.hasOwnProperty.call(colors, feedId)) continue;
			var color = colors[feedId];
			if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue;

			css += '.flux[data-feed-id="' + feedId + '"] .flux_header,'
				+ '.flux[data-feed-id="' + feedId + '"] .flux_header:hover {'
				+ 'background-color:' + color + ' !important;'
				+ '}\n';
		}

		if (!css) return;

		var styleEl = document.getElementById('cv-dynamic-styles');
		if (!styleEl) {
			styleEl = document.createElement('style');
			styleEl.id = 'cv-dynamic-styles';
			document.head.appendChild(styleEl);
		}
		styleEl.textContent = css;
	}

	/**
	 * Strategy B: walk visible article headers and piggyback on .website text,
	 * exactly as the ColorfulList extension does – works even when data-feed-id
	 * is absent.
	 */
	function colorizeByName() {
		var nameColors = cfg.feedNameColors;
		if (!nameColors || Object.keys(nameColors).length === 0) return;

		document.querySelectorAll('#stream .flux_header').forEach(function (header) {
			var websiteEl = header.querySelector('.website');
			if (!websiteEl) return;
			var feedName = websiteEl.textContent.trim();
			if (nameColors[feedName]) {
				header.style.backgroundColor = nameColors[feedName];
			}
		});
	}

	/**
	 * Run both color strategies and watch for dynamically injected articles
	 * (auto-load / infinite scroll).
	 */
	function applyColors() {
		injectColorCSS();  // CSS strategy (handles new articles automatically)
		colorizeByName();  // JS walk strategy
	}

	function monitorStream(callback) {
		var target = document.getElementById('stream');
		if (!target) return;
		new MutationObserver(function (mutationsList) {
			for (var i = 0; i < mutationsList.length; i++) {
				if (mutationsList[i].type === 'childList') {
					callback();
					return;
				}
			}
		}).observe(target, { childList: true, subtree: false });
	}

	/* =========================================================================
	   THREE-PANE LAYOUT  (port of xExtension-ThreePanesView by nicofrand)
	   ========================================================================= */

	function initThreePanes() {
		if (!cfg.threePanes) return;
		if (!window.context) {
			// FreshRSS not yet initialised – retry
			setTimeout(initThreePanes, 100);
			return;
		}

		// Only activate in normal list view and on wide-enough screens
		if (window.context.current_view !== 'normal' || window.innerWidth < 800) return;

		document.body.classList.add('cv-three-panes');

		var stream = document.getElementById('stream');
		if (!stream) return;

		// Grab content of the currently open article (if any)
		var currentFlux = stream.querySelector('.flux.current');
		var initialHtml = currentFlux
			? currentFlux.querySelector('.flux_content').innerHTML
			: '';

		// Build wrapper: [stream | splitter | threepanesview]
		stream.insertAdjacentHTML('beforebegin', '<div id="threepanesviewcontainer"></div>');
		var wrapper = document.getElementById('threepanesviewcontainer');
		wrapper.appendChild(stream);
		wrapper.insertAdjacentHTML('beforeend',
			'<div id="threepanesview">'
			+ '<div id="cv-nav-bar">'
			+ '<button id="cv-btn-prev"   class="cv-nav-btn" title="Article précédent" disabled>&#8593;</button>'
			+ '<button id="cv-btn-next"   class="cv-nav-btn" title="Article suivant" disabled>&#8595;</button>'
			+ '<button id="cv-btn-read"   class="cv-nav-btn" title="Marquer lu / non lu" disabled>Lu</button>'
			+ '<button id="cv-btn-reader" class="cv-nav-btn" title="Afficher la page originale" disabled>Entier</button>'
			+ '<button id="cv-btn-expand" class="cv-nav-btn cv-btn-expand" title="Ouvrir sur le site d\'origine" disabled>&#10064;</button>'
			+ '</div>'
			+ '<div class="flux">' + initialHtml + '</div>'
			+ '</div>');

		// Let FreshRSS core wire its own events on the new panel
		if (typeof init_stream === 'function') {
			init_stream(document.getElementById('threepanesview'));
		}

		// FreshRSS core tracks which element to follow for keyboard navigation
		if (typeof box_to_follow !== 'undefined') {
			// eslint-disable-next-line no-undef
			box_to_follow = stream;
		}

		// Re-dispatch scroll events from the list pane to window
		// (FreshRSS normally listens on window)
		stream.addEventListener('scroll', function (evt) {
			window.dispatchEvent(new UIEvent(evt.type, evt));
		});

		// ---------------------------------------------------------------
		// Dynamic height – fill available vertical space
		// ---------------------------------------------------------------
		var _resize = function () {
			var topOffset = wrapper.offsetTop;
			if (topOffset > 500) {
				// CSS not fully applied yet; try again
				setTimeout(_resize, 10);
				return;
			}
			var available = window.innerHeight - topOffset;
			wrapper.style.height = available + 'px';

			// Also size the mark-as-read aside panel
			var menuForm   = document.getElementById('mark-read-aside');
			var navEntries = document.getElementById('nav_entries');
			if (menuForm) {
				var subtract = 0;
				if (menuForm.previousElementSibling) {
					subtract += menuForm.previousElementSibling.clientHeight;
				}
				if (navEntries) {
					subtract += navEntries.clientHeight;
				}
				menuForm.style.height = (available - subtract) + 'px';
			}
		};

		_resize();
		window.addEventListener('resize', _resize);

		// ---------------------------------------------------------------
		// Draggable split bar
		// ---------------------------------------------------------------

		// Restore saved width (% of container); default 50 %
		var savedPct = parseFloat(localStorage.getItem('cv-split-left-width') || '35');
		savedPct = Math.min(Math.max(savedPct, 10), 90);
		stream.style.flex = '0 0 ' + savedPct.toFixed(1) + '%';

		// Insert the drag handle between the two panes
		var splitterEl = document.createElement('div');
		splitterEl.id = 'cv-splitter';
		wrapper.insertBefore(splitterEl, document.getElementById('threepanesview'));

		var _isDragging = false;
		var _dragStartX, _dragStartW;

		splitterEl.addEventListener('mousedown', function (e) {
			_isDragging  = true;
			_dragStartX  = e.clientX;
			_dragStartW  = stream.getBoundingClientRect().width;
			document.body.classList.add('cv-resizing');
			e.preventDefault();
		});

		document.addEventListener('mousemove', function (e) {
			if (!_isDragging) return;
			var delta      = e.clientX - _dragStartX;
			var containerW = wrapper.getBoundingClientRect().width;
			var newPct     = Math.min(Math.max((_dragStartW + delta) / containerW * 100, 10), 90);
			stream.style.flex = '0 0 ' + newPct.toFixed(1) + '%';
		});

		document.addEventListener('mouseup', function () {
			if (!_isDragging) return;
			_isDragging = false;
			document.body.classList.remove('cv-resizing');
			var containerW = wrapper.getBoundingClientRect().width;
			var pct = stream.getBoundingClientRect().width / containerW * 100;
			try {
				localStorage.setItem('cv-split-left-width', pct.toFixed(1));
			} catch (e) { /* storage quota */ }
		});

		// ---------------------------------------------------------------
		// Right-pane content management
		// ---------------------------------------------------------------
		var panel        = document.getElementById('threepanesview');
		var panelContent = panel.querySelector('.flux');

		// State for the RSS ↔ full-page toggle
		var _currentRssHtml    = '';
		var _currentArticleUrl = '';
		var _isFullMode        = false;

		// ---------------------------------------------------------------
		// Nav bar – prev / next / expand
		// ---------------------------------------------------------------
		function getCurrentArticle() {
			return stream.querySelector('.flux.current');
		}

		function getArticles() {
			return Array.prototype.slice.call(stream.querySelectorAll('.flux'));
		}

		function navigateToArticle(articleEl) {
			if (!articleEl) return;
			// Simulate a click on the article header to let FreshRSS handle
			// marking-as-read, keyboard state, etc.
			var headerEl = articleEl.querySelector('.flux_header');
			if (headerEl) {
				headerEl.click();
			}
		}

		function updateNavButtons() {
			var current  = getCurrentArticle();
			var articles = getArticles();
			var idx      = articles.indexOf(current);
			var btnPrev  = document.getElementById('cv-btn-prev');
			var btnNext  = document.getElementById('cv-btn-next');
			var btnRead  = document.getElementById('cv-btn-read');
			if (btnPrev) btnPrev.disabled = (idx <= 0);
			if (btnNext) btnNext.disabled = (idx < 0 || idx >= articles.length - 1);
			if (btnRead) {
				btnRead.disabled = !current;
				if (current) {
					// Mirror the icon from the article's own read button
					var readLink = current.querySelector('a.read');
					var iconEl   = readLink && readLink.querySelector('.icon');
					if (iconEl) {
						btnRead.innerHTML = iconEl.outerHTML;
					} else {
						var isUnread = current.classList.contains('not_read');
						btnRead.textContent = isUnread ? '✉' : '✉';
					}
					var isUnread = current.classList.contains('not_read');
					btnRead.title = isUnread ? 'Marquer comme lu' : 'Marquer comme non lu';
					btnRead.classList.toggle('cv-nav-btn--active', !isUnread);
				} else {
					btnRead.innerHTML = '';
					btnRead.title = 'Marquer lu / non lu';
					btnRead.classList.remove('cv-nav-btn--active');
				}
			}
		}

		document.getElementById('cv-btn-prev').addEventListener('click', function () {
			var current  = getCurrentArticle();
			var articles = getArticles();
			var idx      = articles.indexOf(current);
			if (idx > 0) navigateToArticle(articles[idx - 1]);
		});

		document.getElementById('cv-btn-next').addEventListener('click', function () {
			var current  = getCurrentArticle();
			var articles = getArticles();
			var idx      = articles.indexOf(current);
			if (idx >= 0 && idx < articles.length - 1) navigateToArticle(articles[idx + 1]);
		});

		document.getElementById('cv-btn-expand').addEventListener('click', function () {
			if (_currentArticleUrl) {
				window.open(_currentArticleUrl, '_blank', 'noopener,noreferrer');
			}
		});
		document.getElementById('cv-btn-read').addEventListener('click', function () {
			var current = getCurrentArticle();
			if (!current || typeof mark_read !== 'function') return;
			mark_read(current, false, false);
			// update button state after FreshRSS toggles the class
			setTimeout(updateNavButtons, 100);
		});

		var btnReader = document.getElementById('cv-btn-reader');
		var btnExpand = document.getElementById('cv-btn-expand');

		// Load URL in iframe; auto-fallback to RSS if site blocks iframes
		function loadFullMode(url) {
			function doFallback() {
				_isFullMode = false;
				panelContent.innerHTML = _currentRssHtml;
				btnReader.textContent = 'Entier';
				btnReader.classList.remove('cv-nav-btn--active');
				var notice = document.createElement('p');
				notice.className = 'cv-iframe-blocked';
				notice.innerHTML = 'Ce site bloque l\'affichage en iframe. '
					+ '<a href="' + url + '" target="_blank" rel="noopener noreferrer">Ouvrir dans un onglet</a>.';
				panelContent.insertBefore(notice, panelContent.firstChild);
			}

			function doLoad() {
				var iframe = document.createElement('iframe');
				panelContent.innerHTML = '';
				panelContent.appendChild(iframe);
				var _handled = false;
				function onBlocked() {
					if (_handled) return;
					_handled = true;
					doFallback();
				}
				iframe.addEventListener('error', onBlocked);
				iframe.addEventListener('load', function () {
					try {
						if (iframe.contentWindow.location.href === 'about:blank') onBlocked();
					} catch (e) { /* cross-origin OK */ }
				});
				iframe.src = encodeURI(url);
			}

			// Server-side pre-check: fetch X-Frame-Options / CSP headers via PHP proxy
			if (cfg.checkFrameUrl) {
				panelContent.innerHTML = '<p class="cv-loading">Vérification…</p>';
				fetch(cfg.checkFrameUrl + '&url=' + encodeURIComponent(url), { credentials: 'same-origin' })
					.then(function (r) { return r.json(); })
					.then(function (data) {
						if (data.canFrame === false) { doFallback(); } else { doLoad(); }
					})
					.catch(doLoad);
			} else {
				doLoad();
			}
		}

		// Set initial label to reflect the configured default
		if (cfg.defaultReaderMode === 'full') {
			btnReader.textContent = 'Résumé';
			btnReader.classList.add('cv-nav-btn--active');
		}
		btnReader.addEventListener('click', function () {
			_isFullMode = !_isFullMode;
			if (_isFullMode) {
				loadFullMode(_currentArticleUrl);
				btnReader.textContent  = 'Résumé';
				btnReader.classList.add('cv-nav-btn--active');
			} else {
				panelContent.innerHTML = _currentRssHtml;
				btnReader.textContent  = 'Entier';
				btnReader.classList.remove('cv-nav-btn--active');
			}
		});

		// Update button states whenever an article opens
		document.addEventListener('freshrss:openArticle', updateNavButtons);
		// Also update when stream changes (new articles loaded or read status changes)
		new MutationObserver(updateNavButtons).observe(stream, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
		updateNavButtons();

		var setContent = function (html, articleId) {
			// Restore the wrapper height if something else removed it
			if (!(wrapper.getAttribute('style') || '').includes('height')) {
				_resize();
			}
			panelContent.innerHTML = html;
			if (articleId) {
				panelContent.setAttribute('id', articleId);
			}
			panelContent.scrollTop = 0;
		};

		var onArticleOpened = function (articleEl) {
			// Scroll the list pane to show the opened article
			articleEl.scrollIntoView({ block: 'nearest', inline: 'nearest', scrollMode: 'if-needed' });

			var articleId           = articleEl.getAttribute('id');
			var articleHeaderEl     = articleEl.querySelector('.flux_header');
			var articleContentEl    = articleEl.querySelector('.flux_content');

			// Copy data-* attributes from the header so share buttons work
			var extraDataAttrs = '';
			if (articleHeaderEl) {
				for (var ds in articleHeaderEl.dataset) {
					if (!Object.prototype.hasOwnProperty.call(articleHeaderEl.dataset, ds)) continue;
					extraDataAttrs += ' ' + ds + '="' + articleHeaderEl.dataset[ds] + '"';
				}
			}

			var headerHtml  = articleHeaderEl
				? articleHeaderEl.outerHTML.replace('>', extraDataAttrs + '>')
				: '';
			var contentHtml = articleContentEl ? articleContentEl.innerHTML : '';

			// Mirror any highlight color applied to the article row
			var computedStyle = window.getComputedStyle(articleEl);
			var bgColor  = computedStyle.backgroundColor;
			var bgImage  = computedStyle.backgroundImage;
			var fgColor  = computedStyle.color;

			setContent(headerHtml + contentHtml, articleId);

			// Apply highlight color directly (avoids CSP-blocked inline <style>)
			if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
				panelContent.style.backgroundColor = bgColor;
				panelContent.style.backgroundImage = bgImage;
				panelContent.style.color           = fgColor;
			} else {
				panelContent.style.removeProperty('background-color');
				panelContent.style.removeProperty('background-image');
				panelContent.style.removeProperty('color');
			}

			// Store RSS snapshot and article URL for the toggle button
			_currentRssHtml    = panelContent.innerHTML;
			_currentArticleUrl = (articleEl.querySelector('a.item-element.title') || {}).href || '';

			// Apply default reader mode
			if (cfg.defaultReaderMode === 'full' && _currentArticleUrl) {
				_isFullMode = true;
				loadFullMode(_currentArticleUrl);
				btnReader.textContent  = 'Résumé';
				btnReader.classList.add('cv-nav-btn--active');
			} else {
				_isFullMode = false;
				btnReader.textContent = 'Entier';
				btnReader.classList.remove('cv-nav-btn--active');
			}
			btnReader.disabled = !_currentArticleUrl;
			if (btnExpand) btnExpand.disabled = !_currentArticleUrl;

			// De-duplicate element IDs to avoid conflicts between panes
			panelContent.querySelectorAll('[id]').forEach(function (node) {
				var ref = node.getAttribute('id');
				if (!ref) return;
				var newRef = '3panes-' + ref;
				node.setAttribute('id', newRef);
				panelContent.querySelectorAll('[href="#' + ref + '"]').forEach(function (elt) {
					elt.setAttribute('href', '#' + newRef);
				});
			});
		};

		// Modern FreshRSS fires this event when an article is opened
		document.addEventListener('freshrss:openArticle', function (evt) {
			onArticleOpened(evt.target);
		});

		// Legacy fallback for older FreshRSS without the openArticle event
		stream.addEventListener('click', function (evt) {
			// External link: open in the right pane via iframe
			if (evt.target.matches('.flux li.link *') && !evt.ctrlKey) {
				evt.preventDefault();
				var linkEl = evt.target.closest('a');
				var url = linkEl ? linkEl.getAttribute('href') : '';
				if (url) {
					setContent('<iframe src="' + encodeURI(url) + '"></iframe>', null);
				}
				return;
			}

			// Fallback article open (no freshrss:openArticle support)
			if (typeof freshrssOpenArticleEvent === 'undefined') {
				var closestArticle = evt.target.closest('.flux');
				if (closestArticle && stream.contains(closestArticle)) {
					onArticleOpened(closestArticle);
				}
			}
		});
	}

	/* =========================================================================
	   BOOT
	   ========================================================================= */

	function boot() {
		readConfig();
		applyColors();

		// Three-pane init waits for window.context internally via setTimeout
		initThreePanes();

		// Re-run strategy B whenever new articles are inserted into the stream
		monitorStream(colorizeByName);
	}

	// Handle both "page already loaded" and "page still loading" cases
	if (document.readyState === 'loading') {
		window.addEventListener('load', boot);
	} else {
		boot();
	}

	// Re-read config after FreshRSS fires its own global context ready event
	document.addEventListener('freshrss:globalContextLoaded', function () {
		readConfig();
		applyColors();
	});

}());
