<?php

declare(strict_types=1);

final class ViewLGExtension extends Minz_Extension
{
	#[\Override]
	public function init(): void
	{
		parent::init();

		$this->registerHook('nav_entries', [$this, 'injectConfig']);
		if ((bool) $this->getUserConfigurationValue('feed_discovery_enabled', false)) {
			$this->registerHook('check_url_before_add', [$this, 'discoverFeedUrl']);
		}
		Minz_View::appendStyle($this->getFileUrl('customview.css'));
		if ($this->hasFile('colors.css')) {
			Minz_View::appendStyle($this->getFileUrl('colors.css', '', false));
		}
		Minz_View::appendScript($this->getFileUrl('customview.js'));
		Minz_View::appendScript($this->getFileUrl('configure.js'));
	}

	// -------------------------------------------------------------------------
	// RSS feed URL discovery (hook: check_url_before_add)
	// -------------------------------------------------------------------------

	/**
	 * Called by FreshRSS before adding a feed.
	 * If the URL already serves a valid feed, returns it unchanged.
	 * Otherwise tries common RSS path suffixes and returns the first that works.
	 * Returns null only if every attempt fails (blocks the add).
	 */
	public function discoverFeedUrl(string $url): ?string
	{
		$url = trim($url);

		// 1. If the URL already looks like a direct feed, leave it alone
		if ($this->urlIsFeed($url)) {
			return $url;
		}

		// 2. Try to find a <link rel="alternate"> feed in the HTML
		$discovered = $this->discoverFromHtml($url);
		if ($discovered !== null) {
			return $discovered;
		}

		// 3. Brute-force common RSS path suffixes
		$base     = rtrim($url, '/');
		$suffixes = [
			'/feed',
			'/rss',
			'/feed.xml',
			'/rss.xml',
			'/index.xml',
			'/atom.xml',
			'/feed/rss2',
			'/feeds/posts/default',
		];

		foreach ($suffixes as $suffix) {
			$candidate = $base . $suffix;
			if ($this->urlIsFeed($candidate)) {
				return $candidate;
			}
		}

		// 4. Nothing found – return the original URL and let FreshRSS handle it
		return $url;
	}

	/**
	 * Fetch the URL headers + first bytes via cURL and decide if it is a feed
	 * (RSS / Atom / JSON Feed) by checking Content-Type and the first text bytes.
	 */
	private function urlIsFeed(string $url): bool
	{
		if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
			return false;
		}

		$ch = curl_init($url);
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_HEADER         => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_MAXREDIRS      => 3,
			CURLOPT_TIMEOUT        => 8,
			CURLOPT_RANGE          => '0-4096', // only fetch the first 4 KB
			CURLOPT_USERAGENT      => 'FreshRSS/ViewLG feed-discovery',
			CURLOPT_SSL_VERIFYPEER => false,
		]);
		$response = curl_exec($ch);
		curl_close($ch);

		if ($response === false || $response === '') {
			return false;
		}

		// Split headers from body
		$parts    = explode("\r\n\r\n", (string)$response, 2);
		$headers  = strtolower($parts[0] ?? '');
		$body     = ltrim($parts[1] ?? '');

		// Check Content-Type header
		$feedMimes = ['rss+xml', 'atom+xml', 'feed+json', 'text/xml', 'application/xml'];
		foreach ($feedMimes as $mime) {
			if (strpos($headers, $mime) !== false) {
				return true;
			}
		}

		// Check body start (handles servers that return text/html for feeds)
		if (preg_match('/^<(\?xml|rss|feed|channel)\b/i', $body)) {
			return true;
		}

		return false;
	}

	/**
	 * Fetch the HTML of a page and look for <link rel="alternate"> feed tags.
	 * Returns the first feed URL found, or null.
	 */
	private function discoverFromHtml(string $url): ?string
	{
		if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
			return null;
		}

		$ch = curl_init($url);
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_MAXREDIRS      => 3,
			CURLOPT_TIMEOUT        => 8,
			CURLOPT_RANGE          => '0-32768', // first 32 KB is enough to find <link> tags
			CURLOPT_USERAGENT      => 'FreshRSS/ViewLG feed-discovery',
			CURLOPT_SSL_VERIFYPEER => false,
		]);
		$html = (string) curl_exec($ch);
		curl_close($ch);

		if ($html === '') {
			return null;
		}

		// Match <link rel="alternate" type="application/rss+xml|atom+xml" href="...">
		if (preg_match(
			'/<link[^>]+rel=["\']alternate["\'][^>]+type=["\']application\/(rss|atom|feed)\+[^"\']*["\'][^>]+href=["\']([^"\']+)["\'][^>]*>/i',
			$html,
			$m
		)) {
			return $this->absolutiseUrl($m[2], $url);
		}

		// Also match reversed attribute order (href before type)
		if (preg_match(
			'/<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']alternate["\'][^>]+type=["\']application\/(rss|atom|feed)\+/i',
			$html,
			$m
		)) {
			return $this->absolutiseUrl($m[1], $url);
		}

		return null;
	}

	/** Convert a possibly relative feed URL to absolute using the base page URL. */
	private function absolutiseUrl(string $feedUrl, string $baseUrl): string
	{
		if (preg_match('/^https?:\/\//i', $feedUrl)) {
			return $feedUrl;
		}
		$parts = parse_url($baseUrl);
		$scheme = ($parts['scheme'] ?? 'https') . '://';
		$host   = $parts['host'] ?? '';
		$port   = isset($parts['port']) ? ':' . $parts['port'] : '';
		if (strpos($feedUrl, '/') === 0) {
			return $scheme . $host . $port . $feedUrl;
		}
		$path = isset($parts['path']) ? dirname($parts['path']) . '/' : '/';
		return $scheme . $host . $port . $path . $feedUrl;
	}

	public function handleConfigureAction(): void
	{
		// AJAX endpoint: vérification des headers X-Frame-Options avant chargement iframe
		if (Minz_Request::param('cv_action') === 'check_frame') {
			$url = (string) Minz_Request::param('url', '');
			$canFrame = true;
			if (filter_var($url, FILTER_VALIDATE_URL) && preg_match('/^https?:\/\//i', $url)) {
				$ch = curl_init($url);
				curl_setopt_array($ch, [
					CURLOPT_NOBODY         => true,
					CURLOPT_RETURNTRANSFER => true,
					CURLOPT_HEADER         => true,
					CURLOPT_FOLLOWLOCATION => true,
					CURLOPT_MAXREDIRS      => 3,
					CURLOPT_TIMEOUT        => 5,
					CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; FreshRSS)',
				]);
				$response = curl_exec($ch);
				curl_close($ch);
				if ($response !== false) {
					if (preg_match('/^X-Frame-Options:\s*(.+)$/im', (string)$response, $m)) {
						$xfo = strtolower(trim($m[1]));
						if ($xfo === 'deny' || $xfo === 'sameorigin') {
							$canFrame = false;
						}
					}
					if ($canFrame && preg_match('/^Content-Security-Policy:\s*(.+)$/im', (string)$response, $m)) {
						if (preg_match('/frame-ancestors\s+([^;]+)/i', $m[1], $fa)) {
							$ancestors = trim($fa[1]);
							// Only a bare '*' token means "any origin may frame this page".
							// A value like '*.substack.com' contains '*' but is NOT a wildcard.
							if (!preg_match('/(?:^|\s)\*(?:\s|$)/', $ancestors)) {
								$canFrame = false;
							}
						}
					}
				}
			} else {
				$canFrame = false;
			}
			header('Content-Type: application/json');
			echo json_encode(['canFrame' => $canFrame]);
			exit;
		}

		// AJAX endpoint: image proxy / cache
		if (Minz_Request::param('cv_action') === 'img') {
			$this->serveProxiedImage((string) Minz_Request::param('url', ''));
		}

		// AJAX endpoint: full-page proxy (bypasses X-Frame-Options / CSP)
		if (Minz_Request::param('cv_action') === 'page') {
			$this->serveProxiedPage((string) Minz_Request::param('url', ''), false, false);
		}
		
		// AJAX endpoint: full-page proxy sans scripts
		if (Minz_Request::param('cv_action') === 'page_noscript') {
			$this->serveProxiedPage((string) Minz_Request::param('url', ''), true, false);
		}

		// AJAX endpoint: full-page proxy avec extraction (Readability)
		if (Minz_Request::param('cv_action') === 'page_readability') {
			$this->serveProxiedPage((string) Minz_Request::param('url', ''), false, true);
		}

		// Always load feeds for the settings page
		$_SESSION['cv_feeds'] = $this->getFeeds();

		if (!Minz_Request::isPost()) {
			return;
		}

		// Read existing config so we only overwrite what we receive
		$conf = $this->getUserConfiguration();

		// Three-pane layout toggle
		$conf['three_panes_enabled'] = Minz_Request::paramBoolean('cv_three_panes_enabled', false);

		// Image caching toggle
		$conf['image_cache_enabled'] = Minz_Request::paramBoolean('cv_image_cache_enabled', false);

		// Feed discovery toggle
		$conf['feed_discovery_enabled'] = Minz_Request::paramBoolean('cv_feed_discovery_enabled', false);

		// Default reader mode
		$readerMode = Minz_Request::param('cv_default_reader_mode', 'summary');
		$validModes = ['summary', 'full', 'full_ns', 'readability'];
		$conf['default_reader_mode'] = in_array($readerMode, $validModes, true) ? $readerMode : 'summary';

		// Feed highlight colors
		$enabledFeeds  = Minz_Request::paramArray('cv_color_enabled') ?? [];
		$feedColorsRaw = Minz_Request::paramArray('cv_feed_colors')   ?? [];
		$sanitized = [];
		foreach ((array)$enabledFeeds as $feedId => $val) {
			$feedId = (int) $feedId;
			$color  = (string) ($feedColorsRaw[$feedId] ?? '');
			if ($feedId > 0 && preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
				$sanitized[$feedId] = strtolower($color);
			}
		}
		$conf['feed_colors'] = $sanitized;

		// UI theme colors (disabled inputs are not submitted → absence = unchecked)
		$uiColorKeys = ['list_bg', 'list_text', 'list_item_hover', 'list_item_hover_text', 'list_hover_title_bg', 'list_hover_title_text', 'list_item_selected', 'list_item_selected_text', 'content_bg', 'content_text', 'border', 'splitter'];
		$uiColorsRaw = Minz_Request::paramArray('cv_ui_colors') ?? [];
		$sanitizedUi = [];
		foreach ($uiColorKeys as $key) {
			$val = (string) ($uiColorsRaw[$key] ?? '');
			if (preg_match('/^#[0-9a-fA-F]{6}$/', $val)) {
				$sanitizedUi[$key] = strtolower($val);
			}
		}
		$conf['ui_colors'] = $sanitizedUi;

		// CSS variable overrides (FreshRSS theme variables)
		$cssVarAllKeys = [
			'sid-bg', 'sid-bg-alt', 'sid-bg-dark', 'sid-font-color', 'sid-sep', 'sid-active', 'sid-active-font',
			'main-first', 'main-first-alt', 'main-first-light', 'main-first-darker',
			'unread-article-background-color', 'unread-article-background-color-hover', 'unread-article-border-color',
			'favorite-article-background-color', 'favorite-article-background-color-hover', 'favorite-article-border-color',
			'unread-bg', 'unread-font-color', 'fav-bg',
			'font-color', 'font-color-grey', 'font-color-link', 'font-color-link-hover',
			'background-color-grey',
		];
		$cssVarsRaw    = Minz_Request::paramArray('cv_css_vars') ?? [];
		$sanitizedVars = [];
		foreach ($cssVarAllKeys as $key) {
			$val = (string) ($cssVarsRaw[$key] ?? '');
			if (preg_match('/^#[0-9a-fA-F]{6}$/', $val)) {
				$sanitizedVars[$key] = strtolower($val);
			}
		}
		$conf['css_vars'] = $sanitizedVars;

		// setUserConfiguration persists via $conf->extensions[$name] and calls save()
		$this->setUserConfiguration($conf);

		// Generate a per-user CSS file served as a trusted 'self' resource
		$this->saveFile('colors.css', $this->generateCssVars($sanitizedVars) . $this->generateColorCss($sanitizedUi));
	}

	/**
	 * Injected into the page via nav_entries hook.
	 * Returns a hidden <div> carrying all runtime config as data attributes
	 * so that customview.js can read them without extra AJAX calls.
	 */
	public function injectConfig(): string
	{
		$threePanesEnabled  = $this->getUserConfigurationValue('three_panes_enabled', true);
		$defaultReaderMode  = $this->getUserConfigurationValue('default_reader_mode', 'summary');

		$feedIdColors = $this->getUserConfigurationValue('feed_colors', []);
		if (!is_array($feedIdColors)) {
			$feedIdColors = [];
		}

		// Build feed-name → color fallback map
		$feedNameColors = [];
		if (!empty($feedIdColors)) {
			foreach ($this->getFeeds() as $feed) {
				$id = (int) $feed->id();
				if (isset($feedIdColors[$id])) {
					$feedNameColors[(string) $feed->name()] = $feedIdColors[$id];
				}
			}
		}

		$uiColors = $this->getUserConfigurationValue('ui_colors', []);
		if (!is_array($uiColors)) {
			$uiColors = [];
		}

		$threePanesAttr    = $threePanesEnabled ? 'true' : 'false';
		$defaultReaderAttr = htmlspecialchars($defaultReaderMode, ENT_QUOTES);
		$checkFrameUrl     = htmlspecialchars(Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName(), 'cv_action' => 'check_frame']], 'php', true), ENT_QUOTES);
		$idColorsJson   = htmlspecialchars((string) json_encode($feedIdColors, JSON_THROW_ON_ERROR), ENT_QUOTES);
		$nameColorsJson = htmlspecialchars((string) json_encode($feedNameColors, JSON_THROW_ON_ERROR), ENT_QUOTES);
		$uiColorsJson   = htmlspecialchars((string) json_encode($uiColors, JSON_THROW_ON_ERROR), ENT_QUOTES);

		$imageCacheEnabled = (bool) $this->getUserConfigurationValue('image_cache_enabled', false);
		$imageCacheAttr    = $imageCacheEnabled ? 'true' : 'false';
		$imageProxyUrl     = htmlspecialchars(Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName(), 'cv_action' => 'img']], 'php', true), ENT_QUOTES);
		$pageProxyUrl      = htmlspecialchars(Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName(), 'cv_action' => 'page']], 'php', true), ENT_QUOTES);
		$pageNsProxyUrl    = htmlspecialchars(Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName(), 'cv_action' => 'page_noscript']], 'php', true), ENT_QUOTES);
		$pageReadProxyUrl  = htmlspecialchars(Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName(), 'cv_action' => 'page_readability']], 'php', true), ENT_QUOTES);
		$settingsUrl       = htmlspecialchars(Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName()]], 'php', true), ENT_QUOTES);

		return '<div id="cv_config"'
			. ' data-three-panes="'      . $threePanesAttr    . '"'
			. ' data-default-reader="'   . $defaultReaderAttr . '"'
			. ' data-check-frame-url="'  . $checkFrameUrl     . '"'
			. ' data-feed-id-colors="'   . $idColorsJson      . '"'
			. ' data-feed-name-colors="' . $nameColorsJson    . '"'
			. ' data-ui-colors="'        . $uiColorsJson      . '"'
			. ' data-image-cache="'      . $imageCacheAttr    . '"'
			. ' data-image-proxy-url="'  . $imageProxyUrl     . '"'
			. ' data-page-proxy-url="'   . $pageProxyUrl      . '"'
			. ' data-page-ns-proxy-url="'. $pageNsProxyUrl   . '"'
			. ' data-page-read-proxy-url="'. $pageReadProxyUrl . '"'
			. ' data-settings-url="'     . $settingsUrl      . '"'
			. '></div>';
	}

	// -------------------------------------------------------------------------
	// CSS generation
	// -------------------------------------------------------------------------

	/**
	 * Generate :root { } overrides for FreshRSS theme CSS variables,
	 * plus direct !important rules for sidebar elements so they work
	 * on any theme (including Flat which uses no CSS variables).
	 */
	private function generateCssVars(array $vars): string
	{
		$hexRe   = '/^#[0-9a-fA-F]{6}$/';
		$allowed = [
			'sid-bg', 'sid-bg-alt', 'sid-bg-dark', 'sid-font-color', 'sid-sep', 'sid-active', 'sid-active-font',
			'main-first', 'main-first-alt', 'main-first-light', 'main-first-darker',
			'unread-article-background-color', 'unread-article-background-color-hover', 'unread-article-border-color',
			'favorite-article-background-color', 'favorite-article-background-color-hover', 'favorite-article-border-color',
			'unread-bg', 'unread-font-color', 'fav-bg',
			'font-color', 'font-color-grey', 'font-color-link', 'font-color-link-hover',
			'background-color-grey',
		];
		$rules = [];
		foreach ($allowed as $key) {
			if (!empty($vars[$key]) && preg_match($hexRe, $vars[$key])) {
				$rules[] = '--' . $key . ':' . $vars[$key];
			}
		}

		$css = '';
		if (!empty($rules)) {
			$css .= "/* ViewLG CSS variable overrides */\n:root{\n" . implode(";\n", $rules) . "\n}\n";
		}

		// Direct rules for sidebar — work on ALL themes including those without CSS variables
		$v = static function (string $key) use ($vars, $hexRe): string {
			return (!empty($vars[$key]) && preg_match($hexRe, $vars[$key])) ? $vars[$key] : '';
		};

		$sidBg         = $v('sid-bg');
		$sidBgAlt      = $v('sid-bg-alt');
		$sidBgDark     = $v('sid-bg-dark');
		$sidFont       = $v('sid-font-color');
		$sidSep        = $v('sid-sep');
		$sidActive     = $v('sid-active');
		$sidActiveFont = $v('sid-active-font');

		if ($sidBg) {
			$css .= "/* ViewLG sidebar direct overrides */\n";
			$css .= ".aside,#sidebar,#header{background-color:{$sidBg}!important}\n";
		}
		if ($sidBgAlt) {
			$css .= ".aside .category,.aside .tree-folder-items,.aside .nav-list{background-color:{$sidBgAlt}!important}\n";
		}
		if ($sidBgDark) {
			$css .= ".aside .item a:hover,.aside .item:hover,.nav-list .item a:hover{background-color:{$sidBgDark}!important}\n";
		}
		if ($sidFont) {
			$css .= ".aside,.aside *,#header,#header *{color:{$sidFont}!important}\n";
		}
		if ($sidSep) {
			$css .= ".aside .sep,.aside hr,.nav-list .sep{border-color:{$sidSep}!important;background-color:{$sidSep}!important}\n";
		}
		if ($sidActive) {
			$css .= ".aside .item.active>a,.aside .item.active{background-color:{$sidActive}!important}\n";
		}
		if ($sidActiveFont) {
			$css .= ".aside .item.active>a,.aside .item.active>a *{color:{$sidActiveFont}!important}\n";
		}

		return $css;
	}

	private function generateColorCss(array $c): string
	{
		$hexRe = '/^#[0-9a-fA-F]{6}$/';
		$css   = "/* ViewLG generated colors – do not edit */\n";

		if (!empty($c['list_bg']) && preg_match($hexRe, $c['list_bg'])) {
			$css .= 'body.cv-three-panes #stream{background-color:' . $c['list_bg'] . "!important}\n";
		}

		// Also target individual flux items so FreshRSS row whites don't bleed through
		if (!empty($c['list_bg']) && preg_match($hexRe, $c['list_bg'])) {
			$css .= 'body.cv-three-panes #stream .flux_header{background-color:' . $c['list_bg'] . "!important}\n";
		}

		if (!empty($c['list_text']) && preg_match($hexRe, $c['list_text'])) {
			$t = $c['list_text'];
			$css .= 'body.cv-three-panes #stream .flux_header,'
				. 'body.cv-three-panes #stream .flux_header *,'
				. 'body.cv-three-panes #stream .flux.not_read .flux_header,'
				. 'body.cv-three-panes #stream .flux.not_read .flux_header *,'
				. 'body.cv-three-panes #stream .day{color:' . $t . "!important}\n";
		}

		if (!empty($c['list_item_hover']) && preg_match($hexRe, $c['list_item_hover'])) {
			$css .= 'body.cv-three-panes #stream .flux_header:hover{background-color:' . $c['list_item_hover'] . "!important}\n";
		}

		if (!empty($c['list_item_hover_text']) && preg_match($hexRe, $c['list_item_hover_text'])) {
			$css .= 'body.cv-three-panes #stream .flux_header:hover,body.cv-three-panes #stream .flux_header:hover *{color:' . $c['list_item_hover_text'] . "!important}\n";
		}

		if (!empty($c['list_hover_title_bg']) && preg_match($hexRe, $c['list_hover_title_bg'])) {
			$css .= 'body.cv-three-panes #stream .flux_header:hover .item-element.title{background-color:' . $c['list_hover_title_bg'] . "!important}\n";
		}

		if (!empty($c['list_hover_title_text']) && preg_match($hexRe, $c['list_hover_title_text'])) {
			$css .= 'body.cv-three-panes #stream .flux_header:hover .item-element.title{color:' . $c['list_hover_title_text'] . "!important}\n";
		}

		if (!empty($c['list_item_selected']) && preg_match($hexRe, $c['list_item_selected'])) {
			$css .= 'body.cv-three-panes #stream .flux.current,'
				. 'body.cv-three-panes #stream .flux.current .flux_header,'
				. 'body.cv-three-panes #stream .flux.current>.flux_header{background:' . $c['list_item_selected'] . "!important}\n";
		}

		if (!empty($c['list_item_selected_text']) && preg_match($hexRe, $c['list_item_selected_text'])) {
			$css .= 'body.cv-three-panes #stream .flux.current,'
				. 'body.cv-three-panes #stream .flux.current *,'
				. 'body.cv-three-panes #stream .flux.current .flux_header,'
				. 'body.cv-three-panes #stream .flux.current .flux_header *{color:' . $c['list_item_selected_text'] . "!important}\n";
		}

		if (!empty($c['content_bg']) && preg_match($hexRe, $c['content_bg'])) {
			$css .= 'body.cv-three-panes #threepanesview{background-color:' . $c['content_bg'] . "!important}\n";
		}
		if (!empty($c['content_text']) && preg_match($hexRe, $c['content_text'])) {
			$css .= 'body.cv-three-panes #threepanesview{color:' . $c['content_text'] . "!important}\n";
		}
		if (!empty($c['border']) && preg_match($hexRe, $c['border'])) {
			$css .= 'body.cv-three-panes #threepanesview{border-left-color:' . $c['border'] . "!important}\n";
		}

		if (!empty($c['splitter']) && preg_match($hexRe, $c['splitter'])) {
			$css .= 'body.cv-three-panes #cv-splitter{background:' . $c['splitter'] . ";opacity:.6}\n";
			$css .= 'body.cv-three-panes #cv-splitter:hover,body.cv-resizing #cv-splitter{background:' . $c['splitter'] . ";opacity:1}\n";
		}

		return $css;
	}

	// -------------------------------------------------------------------------
	// Helpers used by configure.phtml
	// -------------------------------------------------------------------------

	public function getFeeds(): array
	{
		if (!class_exists('FreshRSS_Factory', false)) {
			return [];
		}
		$feedDao = FreshRSS_Factory::createFeedDao();
		if (!method_exists($feedDao, 'listFeeds')) {
			return [];
		}
		$feeds = $feedDao->listFeeds();
		usort($feeds, static function ($a, $b): int {
			return strnatcasecmp((string) $a->name(), (string) $b->name());
		});
		return $feeds;
	}

	public function getFeedColors(): array
	{
		$colors = $this->getUserConfigurationValue('feed_colors', []);
		return is_array($colors) ? $colors : [];
	}

	public function isThreePanesEnabled(): bool
	{
		return (bool) $this->getUserConfigurationValue('three_panes_enabled', true);
	}

	public function getUiColors(): array
	{
		$colors = $this->getUserConfigurationValue('ui_colors', []);
		return is_array($colors) ? $colors : [];
	}

	public function getCssVars(): array
	{
		$vars = $this->getUserConfigurationValue('css_vars', []);
		return is_array($vars) ? $vars : [];
	}

	// -------------------------------------------------------------------------
	// Image proxy / cache
	// -------------------------------------------------------------------------

	private function getImageCacheDir(): string
	{
		$login = '';
		if (class_exists('Minz_Session', false) && class_exists('FreshRSS_Context', false)) {
			try {
				if (FreshRSS_Context::hasUser()) {
					$login = FreshRSS_Context::user();
				}
			} catch (\Throwable $e) {}
		}
		$base = defined('DATA_PATH') ? DATA_PATH : sys_get_temp_dir();
		if ($login !== '') {
			return $base
				. DIRECTORY_SEPARATOR . 'users'
				. DIRECTORY_SEPARATOR . $login
				. DIRECTORY_SEPARATOR . 'extensions'
				. DIRECTORY_SEPARATOR . $this->getName()
				. DIRECTORY_SEPARATOR . 'imgcache';
		}
		return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'freshrss_viewlg_imgcache';
	}

	private function serveProxiedImage(string $url): void
	{
                try {
                        // Security: validate URL scheme and structure
                        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
                                http_response_code(400);
                                echo "Bad URL: " . htmlspecialchars($url);
                                exit;
                        }

                        $hash     = md5($url);
                        $cacheDir = $this->getImageCacheDir();
                        $dataFile = $cacheDir . DIRECTORY_SEPARATOR . $hash . '.data';
                        $metaFile = $cacheDir . DIRECTORY_SEPARATOR . $hash . '.meta';

                        // Serve from disk cache if available
                        if (is_file($dataFile) && is_file($metaFile)) {
                                $mime = trim((string) file_get_contents($metaFile));
                                header('Content-Type: ' . $mime);
                                header('Cache-Control: public, max-age=604800');
                                header('X-Content-Type-Options: nosniff');
                                readfile($dataFile);
                                exit;
                        }

                        // Fetch image from origin.
                        $parts   = parse_url($url);
                        $referer = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');
                        if (!empty($parts['port'])) {
                                $referer .= ':' . $parts['port'];
                        }
                        $referer .= '/';

                        $ch = curl_init($url);
                        curl_setopt_array($ch, [
                                CURLOPT_RETURNTRANSFER => true,
                                CURLOPT_FOLLOWLOCATION => true,
                                CURLOPT_MAXREDIRS      => 3,
                                CURLOPT_TIMEOUT        => 10,
                                CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                CURLOPT_REFERER        => $referer,
                                CURLOPT_SSL_VERIFYPEER => false,
                        ]);
                        $data = curl_exec($ch);
                        $info = curl_getinfo($ch);
                        curl_close($ch);

                        if ($data === false || (int) ($info['http_code'] ?? 0) >= 400) {
                                http_response_code(502);
                                echo "Proxy error: " . ($info['http_code'] ?? 'curl failed');
                                exit;
                        }

                        // Extract and validate MIME type – images only
                        $rawMime = (string) ($info['content_type'] ?? '');
                        $mime    = strtolower(trim((string) strtok($rawMime, ';')));
                        $allowed = [
                                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                                'image/avif', 'image/svg+xml', 'image/bmp', 'image/tiff',
                                'image/x-icon', 'image/vnd.microsoft.icon',
                        ];
                        if (!in_array($mime, $allowed, true)) {
                                http_response_code(403);
                                echo "Mime not allowed: " . htmlspecialchars($mime);
                                exit;
                        }

                        // Persist to disk cache
                        if (!is_dir($cacheDir)) {
                                if (!mkdir($cacheDir, 0755, true) && !is_dir($cacheDir)) {
                                        throw new \RuntimeException(sprintf('Directory "%s" was not created', $cacheDir));
                                }
                        }
                        if (file_put_contents($dataFile, $data) === false) {
                            throw new \RuntimeException("Failed writing to " . $dataFile);
                        }
                        file_put_contents($metaFile, $mime);

                        header('Content-Type: ' . $mime);
                        header('Cache-Control: public, max-age=604800');
                        header('X-Content-Type-Options: nosniff');
                        echo $data;
                        exit;
                } catch (\Throwable $e) {
                        http_response_code(500);
                        echo "Fatal Exception in serveProxiedImage: " . $e->getMessage() . " on line " . $e->getLine();
                        exit;
                }        }
	private function serveProxiedPage(string $url, bool $noScript = false, bool $readability = false): void
	{
		if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('/^https?:\/\//i', $url)) {
			http_response_code(400);
			exit;
		}

		$parts  = parse_url($url);
		$origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');
		if (!empty($parts['port'])) {
			$origin .= ':' . $parts['port'];
		}

		$ch = curl_init($url);
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_MAXREDIRS      => 5,
			CURLOPT_TIMEOUT        => 15,
			CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			CURLOPT_REFERER        => $origin . '/',
			CURLOPT_ENCODING       => '',   // accept any encoding; curl decodes automatically
			CURLOPT_SSL_VERIFYPEER => false,
			CURLOPT_HTTPHEADER     => [
				'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language: fr,en;q=0.9',
			],
		]);
		$html     = (string) curl_exec($ch);
		$info     = curl_getinfo($ch);
		$finalUrl = (string) ($info['url'] ?? $url);
		curl_close($ch);

		$httpCode = (int) ($info['http_code'] ?? 0);
		if ($html === '' || $httpCode >= 400) {
			http_response_code($httpCode ?: 502);
			exit;
		}

		// Recompute origin from the final (post-redirect) URL so relative paths resolve correctly
		$fp          = parse_url($finalUrl);
		$finalOrigin = ($fp['scheme'] ?? 'https') . '://' . ($fp['host'] ?? '');
		if (!empty($fp['port'])) {
			$finalOrigin .= ':' . $fp['port'];
		}

		// Inject <base href> so all relative URLs resolve against the original site
		$baseTag = '<base href="' . htmlspecialchars($finalOrigin . '/', ENT_QUOTES) . '">';
		if (preg_match('/<head(\s[^>]*)?>/', $html)) {
			$html = preg_replace('/(<head(\s[^>]*)?>)/i', '$1' . $baseTag, $html, 1);
		} else {
			$html = $baseTag . $html;
		}

		// Strip embedded security-policy meta tags.
		// The regex must match regardless of attribute order inside the tag, so we
		// use a lookahead that checks for the http-equiv value anywhere in the tag.
		$cspMetaRe = '/<meta(?=[^>]*http-equiv=["\']Content-Security-Policy["\'])[^>]*>\s*/i';
		$xfoMetaRe = '/<meta(?=[^>]*http-equiv=["\']X-Frame-Options["\'])[^>]*>\s*/i';
		$html = preg_replace($cspMetaRe, '', $html);
		$html = preg_replace($xfoMetaRe, '', $html);

		if ($noScript || $readability) {
			// Force videos to have standard controls since custom JS players are removed
			$html = preg_replace('/<video\b(?![^>]*controls)[^>]*>/is', '$0 controls="controls" ', $html);
		}

		if ($noScript) {
			$html = preg_replace('/<script\b[^>]*>(.*?)<\/script>/is', '', $html);
			$html = preg_replace('/on[a-z]+=["\'][^"\']*["\']/is', '', $html);
		}

		if ($readability) {
			$html .= '
			<script src="https://unpkg.com/@tehshrike/readability@0.2.0"></script>
			<script>
				document.addEventListener("DOMContentLoaded", function() {
					// Protéger les vidéos pour que Readability ne les supprime pas (à cause de classes contenant "card", "ad", etc.)
					document.querySelectorAll("video, iframe").forEach(function(v) {
						// Nettoyer les dimensions et styles forcés de Ghost et autres CMS
						v.removeAttribute("width");
						v.removeAttribute("height");
						v.removeAttribute("style");
						
						var p = v.parentElement;
						while(p && p !== document.body) {
							p.className = "";
							p.id = "";
							p.removeAttribute("style");
							p = p.parentElement;
						}
					});
					
					var article = new Readability(document).parse();
					if (article) {
						var bg = "#ffffff", fg = "#222222", link = "#0056b3", bodyBg = "#f4f4f4";
						try {
							if (window.parent && window.parent.document) {
								var pStyle = window.parent.getComputedStyle(window.parent.document.querySelector("#threepanesview") || window.parent.document.body);
								var a = window.parent.document.createElement("a");
								a.href = "#";
								window.parent.document.body.appendChild(a);
								link = window.parent.getComputedStyle(a).color || link;
								window.parent.document.body.removeChild(a);
								bg = pStyle.backgroundColor || bg;
								fg = pStyle.color || fg;
								
								// Estimate body background as slightly darker/lighter than pane background
								var rgb = bg.match(/\d+/g);
								if (rgb && rgb.length >= 3) {
									var r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
									var isDark = (r*0.299 + g*0.587 + b*0.114) < 128;
									var diff = isDark ? -10 : -10;
									bodyBg = "rgb(" + Math.max(0,r+diff) + "," + Math.max(0,g+diff) + "," + Math.max(0,b+diff) + ")";
								} else {
									bodyBg = window.parent.getComputedStyle(window.parent.document.body).backgroundColor || bodyBg;
								}
							}
						} catch(e) {}

						var css = "<style>body { background: "+bodyBg+"; color: "+fg+"; font-family: sans-serif; line-height: 1.6; margin: 0; padding: 20px; } a { color: "+link+"; } figure { margin: 1em 0; padding: 0; box-sizing: border-box; } img, video, iframe { max-width: 100% !important; height: auto !important; border-radius: 4px; display: block; margin: 0 auto; } video { width: 100% !important; background: #000; } .cv-container { max-width: 800px; margin: 0 auto; padding: 30px; background: "+bg+"; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); } .cv-title-link:hover { opacity: 0.8; }</style>";
						document.body.innerHTML = css + "<div class=\'cv-container\'><h1><a href=\'' . htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '\' target=\'_blank\' rel=\'noopener noreferrer\' class=\'cv-title-link\' style=\'color:inherit;text-decoration:none;transition:opacity 0.2s;\'>" + article.title + "</a></h1>" + article.content + "</div>";
					}
				});
			</script>';
		}

		// Remove any X-Frame-Options / CSP frame-ancestors headers that FreshRSS
		// (or PHP itself) may have set globally — without this, browsers block the
		// iframe even though the content is served from the same origin.
		header_remove('X-Frame-Options');
		header_remove('Content-Security-Policy');
		header_remove('X-Content-Security-Policy');
		header_remove('X-WebKit-CSP');

		// Explicitly send a CSP allowing this page to be framed by the same origin (FreshRSS)
		header("Content-Security-Policy: default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'; script-src * 'unsafe-inline' 'unsafe-eval';");

		header('Content-Type: text/html; charset=utf-8');
		header('Cache-Control: private, no-store');
		echo $html;
		exit;
	}
}
