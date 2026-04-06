<?php

declare(strict_types=1);

final class ViewLGExtension extends Minz_Extension
{
	#[\Override]
	public function init(): void
	{
		parent::init();

		$this->registerHook('nav_entries', [$this, 'injectConfig']);
		Minz_View::appendStyle($this->getFileUrl('customview.css'));
		if ($this->hasFile('colors.css')) {
			Minz_View::appendStyle($this->getFileUrl('colors.css', '', false));
		}
		Minz_View::appendScript($this->getFileUrl('customview.js'));
		Minz_View::appendScript($this->getFileUrl('configure.js'));
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
							if (strpos($ancestors, '*') === false) {
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

		// Always load feeds for the settings page
		$_SESSION['cv_feeds'] = $this->getFeeds();

		if (!Minz_Request::isPost()) {
			return;
		}

		// Read existing config so we only overwrite what we receive
		$conf = $this->getUserConfiguration();

		// Three-pane layout toggle
		$conf['three_panes_enabled'] = Minz_Request::paramBoolean('cv_three_panes_enabled', false);

		// Default reader mode
		$readerMode = Minz_Request::param('cv_default_reader_mode', 'summary');
		$conf['default_reader_mode'] = ($readerMode === 'full') ? 'full' : 'summary';

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
		$uiColorKeys = ['list_bg', 'list_item_hover', 'list_item_hover_text', 'list_hover_title_bg', 'list_hover_title_text', 'list_item_selected', 'content_bg', 'content_text', 'border', 'splitter'];
		$uiColorsRaw = Minz_Request::paramArray('cv_ui_colors') ?? [];
		$sanitizedUi = [];
		foreach ($uiColorKeys as $key) {
			$val = (string) ($uiColorsRaw[$key] ?? '');
			if (preg_match('/^#[0-9a-fA-F]{6}$/', $val)) {
				$sanitizedUi[$key] = strtolower($val);
			}
		}
		$conf['ui_colors'] = $sanitizedUi;

		// setUserConfiguration persists via $conf->extensions[$name] and calls save()
		$this->setUserConfiguration($conf);

		// Generate a per-user CSS file served as a trusted 'self' resource
		$this->saveFile('colors.css', $this->generateColorCss($sanitizedUi));
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
		$defaultReaderAttr = ($defaultReaderMode === 'full') ? 'full' : 'summary';
		$checkFrameUrl     = Minz_Url::display(['c' => 'extension', 'a' => 'configure', 'params' => ['e' => $this->getName(), 'cv_action' => 'check_frame']]);
		$idColorsJson   = htmlspecialchars((string) json_encode($feedIdColors, JSON_THROW_ON_ERROR), ENT_QUOTES);
		$nameColorsJson = htmlspecialchars((string) json_encode($feedNameColors, JSON_THROW_ON_ERROR), ENT_QUOTES);
		$uiColorsJson   = htmlspecialchars((string) json_encode($uiColors, JSON_THROW_ON_ERROR), ENT_QUOTES);

		return '<div id="cv_config"'
			. ' data-three-panes="'      . $threePanesAttr    . '"'
			. ' data-default-reader="'   . $defaultReaderAttr . '"'
			. ' data-check-frame-url="'  . $checkFrameUrl     . '"'
			. ' data-feed-id-colors="'   . $idColorsJson      . '"'
			. ' data-feed-name-colors="' . $nameColorsJson    . '"'
			. ' data-ui-colors="'        . $uiColorsJson      . '"'
			. '></div>';
	}

	// -------------------------------------------------------------------------
	// CSS generation
	// -------------------------------------------------------------------------

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
			$css .= 'body.cv-three-panes #stream .flux.current .flux_header{background-color:' . $c['list_item_selected'] . "!important}\n";
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
}
