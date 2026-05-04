const DEFAULT_LOGICAL_WIDTH = 1920;
const DEFAULT_LOGICAL_HEIGHT = 1080;
const DEFAULT_VIEWPORT_ASPECT = DEFAULT_LOGICAL_WIDTH / DEFAULT_LOGICAL_HEIGHT;

const resolveViewportSize = (): { width: number; height: number } => {
	if (typeof window === 'undefined') {
		return {
			width: DEFAULT_LOGICAL_WIDTH,
			height: DEFAULT_LOGICAL_HEIGHT,
		};
	}

	const viewportWidth = window.visualViewport?.width;
	const viewportHeight = window.visualViewport?.height;
	const rawWidth = (typeof viewportWidth === 'number' && Number.isFinite(viewportWidth))
		? viewportWidth
		: (Number.isFinite(window.innerWidth) ? window.innerWidth : DEFAULT_LOGICAL_WIDTH);
	const rawHeight = (typeof viewportHeight === 'number' && Number.isFinite(viewportHeight))
		? viewportHeight
		: (Number.isFinite(window.innerHeight) ? window.innerHeight : DEFAULT_LOGICAL_HEIGHT);

	return {
		width: Math.max(1, Math.round(rawWidth)),
		height: Math.max(1, Math.round(rawHeight)),
	};
};

export const resolveResponsiveGameSize = (): { width: number; height: number } => {
	const viewportSize = resolveViewportSize();
	const viewportAspect = viewportSize.width / viewportSize.height;

	if (!Number.isFinite(viewportAspect) || viewportAspect <= 0) {
		return {
			width: DEFAULT_LOGICAL_WIDTH,
			height: DEFAULT_LOGICAL_HEIGHT,
		};
	}

	if (viewportAspect >= DEFAULT_VIEWPORT_ASPECT) {
		return {
			width: Math.max(DEFAULT_LOGICAL_WIDTH, Math.round(DEFAULT_LOGICAL_HEIGHT * viewportAspect)),
			height: DEFAULT_LOGICAL_HEIGHT,
		};
	}

	return {
		width: DEFAULT_LOGICAL_WIDTH,
		height: Math.max(DEFAULT_LOGICAL_HEIGHT, Math.round(DEFAULT_LOGICAL_WIDTH / viewportAspect)),
	};
};

// Baseline layout metrics for scene/UI positioning.
export const GAME_WIDTH = DEFAULT_LOGICAL_WIDTH;
export const GAME_HEIGHT = DEFAULT_LOGICAL_HEIGHT;

export const GAME_CENTER_X = GAME_WIDTH / 2;
export const GAME_CENTER_Y = GAME_HEIGHT / 2;

export const UI_BASE_WIDTH = 1920;
export const UI_BASE_HEIGHT = 1080;
export const UI_SCALE = Math.min(GAME_WIDTH / UI_BASE_WIDTH, GAME_HEIGHT / UI_BASE_HEIGHT);
export const UI_RECTANGLE_CORNER_RADIUS = 6;
export const UI_RECTANGLE_CORNER_RADIUS_MAX_WIDTH_RATIO = 0.1;
export const UI_MIN_FONT_SIZE = 6;
export const UI_TEXT_RESOLUTION_MAX = 2;
// Name of the TTF/OTF asset in public/assets used as the global UI font.
export const FONT_TTF = 'MinecraftRegular-Bmg3.otf';
// Optional external stylesheet source for web fonts.
// Accepts either a URL (https://...) or a full <link ... href="..."> snippet.
// When set, this takes precedence over FONT_TTF.
export const FONT_STYLESHEET = 'https://use.typekit.net/qbi2gcz.css';
export const UI_FONT_FAMILY_NAME = 'MinecraftRegular';
export const UI_FONT_FAMILY = `'headline-gothic-atf', '${UI_FONT_FAMILY_NAME}', serif`;

// Reference size used for scene layout constants before scaling.
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

export const BOARD_SCALE = 0.8;

export const CARD_BASE_WIDTH = 86;
export const CARD_BASE_HEIGHT = 120;
export const CARD_BORDER_WIDTH = 4;
export const CARD_SELECTED_BORDER_WIDTH = 8;

export const AVGE_CARD_TYPES = ['NONE', 'WW', 'PERC', 'PIANO', 'STRING', 'GUITAR', 'CHOIR', 'BRASS'] as const;
export type AVGECardType = typeof AVGE_CARD_TYPES[number];

export const AVGE_CARD_TYPE_BORDER_COLORS: Record<AVGECardType, number> = {
	NONE: 0xffffff,
	WW: 0x2a9d8f,
	PERC: 0x06402B,
	PIANO: 0x4c6ef5,
	STRING: 0x8e44ad,
	GUITAR: 0xff9f1c,
	CHOIR: 0xd62828,
	BRASS: 0xc19a00
} as const;

export const GAME_CARD_TYPE_FILL_COLORS: Record<'character' | 'tool' | 'item' | 'stadium' | 'supporter', number> = {
	character: 0xF0A047,
	tool: 0x457b9d,
	item: 0x2a9d8f,
	stadium: 0x6d597a,
	supporter: 0xb45309
} as const;

export const DECK_BUILDER_CATEGORY_FILL_COLORS: Record<'character' | 'item' | 'supporter' | 'stadium' | 'tool' | 'status_effect', number> = {
	character: GAME_CARD_TYPE_FILL_COLORS.character,
	item: GAME_CARD_TYPE_FILL_COLORS.item,
	supporter: GAME_CARD_TYPE_FILL_COLORS.supporter,
	stadium: GAME_CARD_TYPE_FILL_COLORS.stadium,
	tool: GAME_CARD_TYPE_FILL_COLORS.tool,
	status_effect: GAME_CARD_TYPE_FILL_COLORS.item
} as const;

export const CARD_DEFAULTS = {
	characterHp: 100,
	characterMaxHp: 100,
	borderColor: 0xffffff,
	baseScale: 1
} as const;

export const CARD_VISUALS = {
	faceDownFillColor: 0x1f2937,
	faceDownTextureKey: 'card-face-down',
	faceDownTexturePath: 'card/card_back.svg',
	faceDownTextureBleedPx: 4
} as const;

export const CARD_TEXT_LAYOUT = {
	classYOffset: 8,
	typeYOffset: 18,
	classTwoLineTypeGap: 10,
	classTwoLineYOffsetBoost: 6,
	hpPadding: 2,
	classFitMinSizeFloor: 6,
	classFitMinSizeRatio: 0.56,
	classFitMaxWidthRatio: 0.7,
	classFitMaxWidthMin: 10,
	classFitMaxLines: 3,
	typeFitMinSizeRatio: 0.72,
	typeFitMaxWidthRatio: 0.9,
	typeFitMaxWidthMin: 10,
	hpFitMinSizeRatio: 0.75,
	hpFitMaxWidthRatio: 0.56,
	hpFitMaxWidthMin: 10,
	statusBaseSizeRatioToHp: 0.95,
	statusFitMinSizeRatio: 0.75,
	statusFitMaxWidthRatio: 0.8,
	statusFitMaxWidthMin: 10,
	statusGapFromHpRatio: 0.7,
	statusGapFromHpMin: 1,
	labelDepthOffset: 0.01,
	classMinFontSize: 7.2,
	classBaseFontSize: 18,
	minTypeFontSize: 9.6,
	minHpFontSize: 12,
	baseTypeFontSize: 13.2,
	baseHpFontSize: 10.8
} as const;

export const CARD_TEXT_COLORS = {
	classTint: 0xEDEDED,
	typeTint: 0xD1D1D1,
	typeTagTintByCardType: {
		character: 0xD1D1D1,
		tool: 0xD1D1D1,
		item: 0xD1D1D1,
		stadium: 0xD1D1D1,
		supporter: 0xD1D1D1
	},
	hpTint: 0xEDEDED,
	statusTint: 0xEDEDED
} as const;

export const CARD_ANIMATION = {
	flipDurationMs: 110,
	selectionDurationMs: 140
} as const;

export const CARD_SELECTION_SCALE_MULTIPLIERS = {
	x: 1.0,
	y: 1.08
} as const;

export const CARDHOLDER_BASE_WIDTH = {
	hand: 640,
	bench: 420,
	active: 108,
	discard: 108,
	deck: 108,
	stadium: 108
} as const;
export const MAX_BENCH_CARDS = 3;
export const CARDHOLDER_HEIGHT_MULTIPLIER = 1.15;

export const CARDHOLDER_SPACING_MULTIPLIERS = {
	activeRowOffset: 0.5,
	benchFromActive: 1.0,
	handFromBench: 1.0,
	sideFromActiveX: 2
} as const;

// Horizontal inner padding used when laying out cards inside holders.
export const CARDHOLDER_LAYOUT_SIDE_PADDING_MULTIPLIER = 0.35;

export const ENERGYHOLDER_LAYOUT = {
	widthMultiplier: 2,
	heightMultiplier: 2.75,
	xOffsetMultiplier: 1.875,
	verticalSpreadMultiplier: 0.95,
	stadiumClearanceWidthMultiplier: 0.2
} as const;

export const ENERGY_TOKEN_DEPTHS = {
	minZone: 16,
	minAttached: 210,
	maxBelowUi: 1000
} as const;

export const GAME_SCENE_VISUALS = {
	backgroundColor: 0x000000,
	backgroundAlpha: 1,
	inputLockColor: 0x7a7a7a,
	inputLockAlpha: 0.45
} as const;

export const GAME_OVERLAY_DEPTHS = {
	inputLock: 315,
	opponentDisconnectBackdrop: 317,
	opponentDisconnectText: 318,
	overlayBase: 320
} as const;

export const GAME_INTERACTION = {
	minDragDistancePx: 8,
	minDragDistanceWidthRatio: 0.08,
	terminalInputMaxLength: 240,
	terminalWheelStep: 2,
	terminalCursorBlinkDelayMs: 450
} as const;

export const GAME_DEPTHS = {
	cardDragging: 200,
	cardSelected: 200,
	cardBase: 10,
	stadiumBase: 30,
	terminalPanel: 300,
	terminalText: 310,
	terminalInputStrip: 312,
	terminalInputText: 313,
	previewPanel: 1000,
	previewCard: 1001,
	previewText: 1001,
	explosionBase: 20000,
	attachmentDepthOffset: 0.5
} as const;

export const GAME_COMMAND_TERMINAL_LAYOUT = {
	panelWidthBase: 240,
	panelHeightBase: 360,
	marginBase: 24,
	textScaleMultiplier: 1.35,
	titleFontSize: 16.8,
	outputFontSize: 13.2,
	inputFontSize: 14.4,
	navGlyphFontSizeMin: 12,
	navGlyphFontSizeRatio: 1.08,
	leftPaddingRatio: 0.07,
	outputTopRatio: 0.2,
	inputStripHeightRatio: 0.15,
	inputStripMinHeight: 22,
	inputStripTopGapRatio: 0.03,
	outputBottomGapRatio: 0.03,
	inputYRatio: 0.09,
	inputStripWidthRatio: 0.94,
	panelFillColor: 0x0b132b,
	panelFillAlpha: 0.92,
	panelStrokeWidth: 2,
	panelStrokeColor: 0xffffff,
	panelStrokeAlpha: 0.7,
	outputTint: 0xd6e8ff,
	inputStripFillColor: 0x0f172a,
	inputStripFillAlpha: 0.95,
	inputStripStrokeWidth: 1,
	inputStripStrokeColor: 0xffffff,
	inputStripStrokeAlpha: 0.35,
	inputTextTint: 0xffffff,
	maxLines: 300,
	minVisibleLineCount: 4
} as const;

export const GAME_PREVIEW_LAYOUT = {
	panelWidthBase: 225,
	panelHeightBase: 450,
	gapYBase: 0,
	sideMarginBase: 0,
	cardWidthMultiplier: 1.55,
	cardHeightMultiplier: 1.55,
	cardCenterYRatio: 0.2,
	classYOffsetRatio: 0.08,
	typeYOffsetRatio: 0.16,
	hpOffsetXRatio: 0.06,
	hpOffsetYRatio: 0.06,
	paragraphXRatio: 0.5,
	paragraphYRatio: 0.4,
	paragraphWidthRatio: 0.95,
	panelFillColor: 0x101828,
	panelFillAlpha: 0.92,
	panelStrokeWidth: 2,
	panelStrokeColor: 0xffffff,
	panelStrokeAlpha: 0.7,
	cardFillColor: 0x1f2937,
	cardFillAlpha: 1,
	classFontSize: 19.2,
	classFontSizeMin: 16.8,
	typeFontSize: 18,
	typeFontSizeMin: 16.8,
	hpFontSize: 13.2,
	hpFontSizeMin: 12,
	paragraphFontSize: 19.2,
	paragraphFontSizeMin: 16.8,
	flavorFontSizeDelta: -1.2,
	flavorFontSizeMin: 16.8,
	fitClassMinSize: 10,
	fitClassSizeRatio: 0.75,
	fitClassWidthRatio: 0.8,
	fitClassWidthMin: 12,
	fitTypeMinSize: 9,
	fitTypeSizeRatio: 0.75,
	fitTypeWidthRatio: 0.9,
	fitTypeWidthMin: 12,
	fitHpMinSize: 8,
	fitHpSizeRatio: 0.75,
	fitHpWidthRatio: 0.6,
	fitHpWidthMin: 10,
	flavorTopGapBase: 6,
	flavorTopGapMin: 8,
	typeTint: 0xcde7ff,
	paragraphTint: 0xe2e8f0
} as const;

export const PRELOADER_TEXT_LAYOUT = {
	titleFontSizePx: 48,
	progressFontSizePx: 24,
	fileFontSizePx: 16.8
} as const;

export const LOGIN_TEXT_LAYOUT = {
	titleFontSizeBase: 64.8,
	titleFontSizeMin: 33.6,
	subtitleFontSizeBase: 24,
	subtitleFontSizeMin: 14.4,
	usernameFontSizeBase: 33.6,
	usernameFontSizeMin: 19.2,
	continueFontSizeBase: 33.6,
	continueFontSizeMin: 19.2,
	changeNameFontSizeBase: 28.8,
	changeNameFontSizeMin: 16.8
} as const;

export const MAIN_MENU_TEXT_LAYOUT = {
	titleFontSizeBase: 76.8,
	titleFontSizeMin: 38.4,
	subtitleFontSizeBase: 28.8,
	subtitleFontSizeMin: 16.8,
	accountFontSizeBase: 36,
	accountFontSizeMin: 10.8,
	startFontSizeBase: 43.2,
	startFontSizeMin: 24,
	deckBuilderFontSizeBase: 36,
	deckBuilderFontSizeMin: 21.6,
	disconnectTitleFontSizeBase: 40.8,
	disconnectTitleFontSizeMin: 21.6,
	disconnectContinueFontSizeBase: 31.2,
	disconnectContinueFontSizeMin: 19.2
} as const;

export const MAIN_MENU_LOGO_LAYOUT = {
	marginBase: 18,
	marginMin: 12,
	maxWidthRatio: 0.1,
	maxHeightRatio: 0.1,
	hoverScaleMultiplier: 1.04,
	hoverTweenDurationMs: 110,
	alpha: 0.92,
	hoverAlpha: 1
} as const;

export const MAIN_MENU_LOGO_ASSET = {
	key: 'standard-logo',
	filePath: 'logos/logo_red.svg'
} as const;

export const MAIN_MENU_TITLE_ASSET = {
	key: 'main-menu-title',
	filePath: 'logos/title.svg'
} as const;

export const MAIN_MENU_TITLE_LAYOUT = {
	xRatio: 0.5,
	yRatio: 0.34,
	targetHeightBase: 360,
	targetHeightMin: 38.4
} as const;

export const MAIN_MENU_LOGO_LINK = {
	url: 'https://www.brownavge.org/'
} as const;

export const MAIN_MENU_RULES_LINK = {
	url: 'https://docs.google.com/document/d/1x6Qk3EtcvDHMEH2NpCon_9Jsen7W8CRuM9hVGSNBsBU/edit?tab=t.0#heading=h.oah1g7t88a7u'
} as const;

export const MAIN_MENU_LAYOUT = {
	titleYRatio: 0.34,
	subtitleYRatio: 0.5,
	subtitleRightMarginBase: 24,
	subtitleBottomMarginBase: 24,
	accountMarginBase: 24,
	accountTopBase: 32,
	usernameButtonPaddingXBase: 12,
	usernameButtonPaddingYBase: 8,
	usernameButtonMinWidthBase: 190,
	usernameButtonMinHeightBase: 52,
	logoutRevealHideDelayMs: 140,
	logoutWidthBase: 180,
	logoutHeightBase: 60,
	accountUiDepth: 620,
	logoutBottomMarginBase: 900,
	buttonWidthBase: 280,
	buttonHeightBase: 84,
	buttonYRatio: 0.68,
	decksButtonOffsetYBase: 96,
	tutorialButtonWidthRatio: 0.47,
	tutorialRulesButtonGapBase: 16
} as const;

export const DECK_BUILDER_TEXT_LAYOUT = {
	titleFontSizeBase: 48,
	titleFontSizeMin: 24,
	subtitleFontSizeBase: 24,
	subtitleFontSizeMin: 14.4,
	pageIndicatorFontSizeBase: 19.2,
	pageIndicatorFontSizeMin: 12,
	pageNavFontSizeBase: 19.2,
	pageNavFontSizeMin: 12,
	actionFontSizeBase: 24,
	actionFontSizeMin: 14.4,
	slotTitleFontSizeBase: 19.2,
	slotTitleFontSizeMin: 12,
	slotLabelFontSizeBase: 15.6,
	slotLabelFontSizeMin: 10.8,
	categoryFontSizeBase: 14.4,
	categoryFontSizeMin: 9.6,
	characterTypeFontSizeBase: 12,
	characterTypeFontSizeMin: 8.4,
	rowIconFontSizeBase: 14.4,
	rowIconFontSizeMin: 9.6,
	rowCardNameFontSizeBase: 21.6,
	rowCardNameFontSizeMin: 12,
	rowAdjustFontSizeBase: 28.8,
	rowAdjustFontSizeMin: 16.8,
	rowCountFontSizeBase: 24,
	rowCountFontSizeMin: 14.4,
	searchTitleFontSizeBase: 43.2,
	searchTitleFontSizeMin: 21.6,
	searchHintFontSizeBase: 21.6,
	searchHintFontSizeMin: 14.4,
	searchQueryFontSizeBase: 27,
	searchQueryFontSizeMin: 16.2,
	searchButtonFontSizeBase: 21.6,
	searchButtonFontSizeMin: 14.4,
	searchRowNameFontSizeBase: 23.4,
	searchRowNameFontSizeMin: 14.4,
	searchRowMetaFontSizeBase: 18,
	searchRowMetaFontSizeMin: 12.6,
	searchRowAdjustFontSizeBase: 36,
	searchRowAdjustFontSizeMin: 21.6,
	searchRowCountFontSizeBase: 27,
	searchRowCountFontSizeMin: 16.2,
	searchPagerFontSizeBase: 23.4,
	searchPagerFontSizeMin: 14.4
} as const;

export const DECK_BUILDER_SEARCH_MENU_LAYOUT = {
	panelWidthBase: 930,
	panelHeightBase: 810,
	titleOffsetYBase: 45,
	hintOffsetYBase: 87,
	queryOffsetXBase: 33,
	queryOffsetYBase: 132,
	actionButtonOffsetYBase: 132,
	saveButtonOffsetXBase: 321,
	saveButtonWidthBase: 123,
	saveButtonHeightBase: 51,
	clearButtonOffsetXBase: 186,
	clearButtonWidthBase: 129,
	clearButtonHeightBase: 51,
	closeButtonOffsetXBase: 63,
	closeButtonWidthBase: 93,
	closeButtonHeightBase: 51,
	rowsStartOffsetYBase: 198,
	rowsBottomOffsetYBase: 687,
	rowGapMin: 57,
	nameOffsetXBase: 39,
	countOffsetXBase: 147,
	plusOffsetXBase: 54,
	rowInsetXBase: 42,
	rowHeightBase: 54,
	rowNameOffsetYBase: 10.5,
	rowMetaOffsetYBase: 13.5,
	plusButtonWidthBase: 54,
	plusButtonHeightBase: 45,
	pagerOffsetXBase: 144,
	pagerOffsetYBase: 750,
	pagerWidthBase: 138,
	pagerHeightBase: 54,
} as const;

export const DECK_BUILDER_TRANSFER_ICON_ASSETS = {
	renameKey: 'deck-builder-rename-icon',
	renamePath: 'icons/edit.png',
	exportKey: 'deck-builder-export-icon',
	exportPath: 'icons/export.png',
	importKey: 'deck-builder-import-icon',
	importPath: 'icons/import.png',
	resetKey: 'deck-builder-reset-icon',
	resetPath: 'icons/trash.png'
} as const;

export const DECK_BUILDER_TRANSFER_ICON_LAYOUT = {
	buttonSizeBase: 46,
	buttonOffsetXBase: 16,
	buttonGapXBase: 12,
	iconMaxSizeRatio: 0.58,
	hoverLabelOffsetYBase: 34,
	hoverLabelFontSizeBase: 18,
	hoverLabelFontSizeMin: 12,
	resetConfirmWindowSeconds: 5,
	resetCountdownFontSizeBase: 16.8,
	resetCountdownFontSizeMin: 12
} as const;

export const GAME_STATUS_TEXT_LAYOUT = {
	opponentDisconnectFontSizeBase: 19.2,
	opponentDisconnectFontSizeMin: 16.8,
	phaseStateActionFontSizeBase: 19.2,
	phaseStateActionFontSizeMin: 12,
	phaseStateActionFitFontSizeBase: 19.2,
	phaseStateActionFitFontSizeMin: 10.8
} as const;

export const GAME_INIT_COUNTDOWN_OVERLAY = {
	messages: ['3', '2', '1', 'Fight!'],
	backdropAlpha: 0.45,
	depthOffset: 8,
	numberFontSizeBase: 168,
	fightFontSizeBase: 204,
	fontSizeMin: 52.8,
	numberTint: 0xf8fafc,
	fightTint: 0xfacc15,
	popStartScale: 0.66,
	popDurationMs: 170,
	fadeOutDurationMs: 140,
	numberHoldMs: 1000,
	fightHoldMs: 1500,
	backdropFadeInMs: 120,
	backdropFadeOutMs: 180,
	lowBeepVolume: 0.7,
	highBeepVolume: 0.85
} as const;

export const PHASE_HUD_TEXT_LAYOUT = {
	fontSizeBase: 21.6,
	fontSizeMin: 12,
	valueFitMinSizeRatio: 0.72,
	valueFitMinSizeMin: 9
} as const;

export const DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT = {
	titleFontSizeBase: 21.6,
	titleFontSizeMin: 14.4,
	hintFontSizeBase: 21.6,
	hintFontSizeMin: 14.4,
	emptyStateFontSizeBase: 14.4,
	emptyStateFontSizeMin: 14.4,
	sectionHeaderFontSizeBase: 14.4,
	sectionHeaderFontSizeMin: 14.4,
	tileIconFontSizeBase: 14.4,
	tileIconFontSizeMin: 14.4,
	tileNameFontSizeBase: 14.4,
	tileNameFontSizeMin: 14.4,
	tileNameFitMinSizeRatio: 0.7,
	tileNameFitMinSizeFloor: 7,
	tileCountFontSizeBase: 14.4,
	tileCountFontSizeMin: 14.4
} as const;

export const DECK_BUILDER_CURRENT_DECK_PANEL_LAYOUT = {
	panelWidthBase: 480,
	panelHeightBase: 960,
	rightInsetBase: 0,
	titleOffsetYBase: 26,
	hintOffsetYBase: 50,
	innerPaddingXBase: 14,
	bottomPaddingBase: 16,
	tileWidthBase: 82,
	tileHeightBase: 88,
	tileGapXBase: 10,
	tileGapYBase: 12,
	sectionGapBase: 14,
	listTopOffsetBase: 24,
	emptyOffsetYBase: 20,
	sectionHeaderAdvanceYBase: 20,
	iconOffsetYRatio: 0.28,
	nameOffsetXRatio: 0.42,
	nameOffsetYRatio: 0.05,
	tileNameMaxWidthRatio: 0.84,
	countBadgeOffsetXRatio: 0.32,
	countBadgeOffsetYRatio: 0.36,
	removeButtonWidthBase: 30,
	removeButtonGlyph: '-',
	removeButtonGlyphFontFamily: 'Arial, sans-serif',
	removeButtonGlyphFontSizeMultiplier: 1.15,
	countBadgeWidthBase: 22,
	countBadgeHeightBase: 18
} as const;

export const GAME_CARD_ACTION_BUTTON_LAYOUT = {
	leftMarginBase: 24,
	bottomMarginBase: 40,
	buttonRadiusBase: 28,
	buttonGapBase: 10,
	fontSize: 14.4,
	fillColor: 0x172554,
	fillAlpha: 0.94,
	strokeWidth: 2,
	strokeColor: 0xffffff,
	strokeAlpha: 0.8,
	textTint: 0xffffff,
	hoverScale: 1.18,
	hoverDurationMs: 120
} as const;

export const GAME_SURRENDER_BUTTON_LAYOUT = {
	radiusBase: 22,
	handOffsetXBase: 14,
	handOffsetYBase: 0,
	confirmWindowMs: 5000,
	iconKey: 'game-surrender-icon',
	iconPath: 'icons/white-flag.png',
	iconMaxSizeRatio: 0.7,
	fontSize: 19.2,
	fillColor: 0x7f1d1d,
	fillAlpha: 0.92,
	strokeWidth: 2,
	strokeColor: 0xffffff,
	strokeAlpha: 0.75,
	textTint: 0xffffff,
	hoverLabel: 'Surrender?',
	hoverLabelOffsetYBase: 32,
	hoverLabelFontSizeBase: 16.8,
	hoverLabelFontSizeMin: 12,
	hoverLabelTint: 0xfef08a,
	depth: 316
} as const;

export const GAME_INPUT_SELECTION_OVERLAY = {
	cardWidthRatio: 0.07,
	cardWidthMin: 120,
	cardHeightRatio: 1.65,
	startYRatio: 0.26,
	rowGapRatio: 0.045,
	rowGapMin: 22,
	rowSpacingRatio: 0.012,
	rowSpacingMin: 16,
	itemLabelYOffsetRatio: 0.18,
	itemSubLabelYOffsetRatio: 0.14,
	assignmentLabelYOffsetRatio: 0.48,
	itemTextMaxWidthPadding: 12,
	noneRowGapMultiplier: 1,
	numbersRowGapMultiplier: 1,
	submitRowGapMultiplier: 1,
	numberButtonSizeRatio: 0.024,
	numberButtonSizeMin: 34,
	numberButtonGapRatio: 0.22,
	numberButtonGapMin: 8,
	submitWidthRatio: 0.12,
	submitWidthMin: 170,
	submitHeightRatio: 0.055,
	submitHeightMin: 42,
	titleFontSizeRatio: 0.26,
	titleFontSizeMin: 21.6,
	hintFontSizeRatio: 0.18,
	hintFontSizeMin: 16.8,
	attackLabelFontSizeRatio: 1.08,
	attackLabelFontSizeMin: 14.4,
	itemLabelFontSizeRatio: 0.16,
	itemLabelFontSizeMin: 13.2,
	itemSubLabelFontSizeRatio: 0.13,
	itemSubLabelFontSizeMin: 12,
	assignmentFontSizeRatio: 0.13,
	assignmentFontSizeMin: 12,
	numberLabelFontSizeRatio: 0.14,
	numberLabelFontSizeMin: 13.2,
	submitLabelFontSizeRatio: 0.17,
	submitLabelFontSizeMin: 14.4
} as const;

export const GAME_INPUT_REVEAL_OVERLAY = {
	maxCardWidthRatio: 0.11,
	emptyStateFontSizeWidthRatio: 0.05,
	emptyStateFontSizeMin: 26.4
} as const;

export const GAME_INPUT_OVERLAY_HEADER_LAYOUT = {
	messageGapRatio: 0.032,
	messageGapMin: 22,
	titleFontSizeRatio: 0.02,
	titleFontSizeMin: 24,
	hintFontSizeRatio: 0.02,
	hintFontSizeMin: 16.8,
	hintFitMinSize: 10
} as const;

export const GAME_WINNER_OVERLAY_AUDIO = {
	soundKey: 'winner-firework',
	soundPath: 'sfx/minecraft-firework.mp3',
	fireworkRepeatCount: 4,
	fireworkSeparationMs: 220,
	fireworkVolume: 0.8,
} as const;

export const PLAYER_TURN_ATTRIBUTE_DEFAULTS = {
	ENERGY_ADD_REMAINING_IN_TURN: 0,
	KO_COUNT: 0,
	SUPPORTER_USES_REMAINING_IN_TURN: 0,
	SWAP_REMAINING_IN_TURN: 0,
	ATTACKS_LEFT: 0
} as const;

export const GAME_PLAYER_STATS_HUD_LAYOUT = {
	leftMarginBase: 12,
	topMarginBase: 36,
	rowGapBase: 18,
	fontSize: 21.6,
	tint: 0xffffff,
	depth: 315
} as const;

export const GAME_LAYOUT = {
	holderExtraHorizontalStepBase: 18,
	selectionResyncDelayMs: 16,
	selectionResyncRepeats: 10,
	cardMoveDurationMs: 260,
	cardMoveToolScale: 0.55,
	toolAttachmentEdgePadding: 2,
	energyTokenAttachedHorizontalStepRatio: 0.25,
	energyTokenAttachedPadding: 2,
	energyTokenZoneStartXRatio: 0.14,
	energyTokenZoneStartYRatio: 0.26,
	energyTokenZoneRowGapRatio: 0.25,
	energyTokenZoneColGapRatio: 0.2,
	energyTokenZoneMinGapPx: 2,
	energyTokenZoneColumnsDefault: 5,
	energyTokenZoneRowsPerColumn: 20,
	energyTokenZoneColumnStepRatio: 1.2,
	energyTokenZoneRowStepRatio: 0.6,
	energyTokenZoneOverflowOffsetRatio: 0.05,
	energyTokenZoneColumnsDiscard: 4,
	energyTokenZonePileCount: 5,
	energyTokenZonePileSidePaddingRatio: 0.05,
	energyTokenZonePileYRatio: 0.62,
	energyTokenZonePileCountLabelYOffsetRatio: 0.7,
	energyTokenRadiusMin: 10,
	energyTokenRadiusWidthRatio: 0.14,
	energyTokenCountPerPlayer: 10,
	energyTokenP1IdStart: 1,
	energyTokenP2IdStart: 11,
	energyStadiumOffsetMultiplier: 2.15
} as const;

export const GAME_HP_PULSE_ANIMATION = {
	scaleMultiplier: 1.15,
	durationMs: 250,
	overlayAlpha: 0.8
} as const;

export const GAME_SHUFFLE_ANIMATION = {
	minCardsRequired: 2,
	scatterXMinPx: 8,
	scatterYMinPx: 6,
	scatterXWidthRatio: 0.2,
	scatterYHeightRatio: 0.1,
	spreadDurationMinMs: 90,
	spreadDurationMoveDurationRatio: 0.28,
	settleDurationMinMs: 120,
	settleDurationMoveDurationRatio: 0.34,
	cardDelayStepMs: 18
} as const;

export const GAME_EXPLOSION = {
	durationMs: 1000,
	count: 28,
	minScale: 0.08,
	scaleDivisor: 900,
	scaleMinMultiplier: 0.9,
	scaleMaxMultiplier: 1.3,
	distanceMinWidthRatio: 0.2,
	distanceMaxWidthRatio: 1.0,
	initialRotationMin: 0,
	initialRotationMax: 360,
	rotationDeltaMin: -180,
	rotationDeltaMax: 180
} as const;

export const ENTITY_VISUALS = {
	cardHolderFillAlpha: 0.22,
	cardHolderStrokeWidth: 3,
	cardHolderStrokeColor: 0xffffff,
	cardHolderStrokeAlpha: 0.9,
	cardHolderDepth: 1,
	cardHolderLabelBaseSize: 18,
	cardHolderLabelMinSize: 12,
	cardHolderPileLabelOutsideGapMinPx: 6,
	cardHolderPileLabelOutsideGapLabelSizeRatio: 0.45,
	cardHolderPileLabelNudgeWidthRatio: 0.3,
	cardHolderLabelTint: 0xffffff,
	cardHolderLabelAlpha: 0.68,
	cardHolderLabelDepth: 2,
	energyHolderFillAlpha: 0.27,
	energyHolderStrokeWidth: 3,
	energyHolderStrokeColor: 0xffffff,
	energyHolderStrokeAlpha: 0.9,
	energyHolderDepth: 1,
	energyHolderLabelBaseSize: 18,
	energyHolderLabelMinSize: 11,
	energyHolderLabelTint: 0xffffff,
	energyHolderLabelAlpha: 0.68,
	energyHolderLabelDepth: 2,
	energyHolderLabelTopGapBase: 20,
	energyTokenFillColor: 0xffd166,
	energyTokenFillAlpha: 1,
	energyTokenStrokeWidth: 3,
	energyTokenStrokeColor: 0xffffff,
	energyTokenStrokeAlpha: 1,
	energyTokenLabelTint: 0x1b1b1b,
	energyTokenLabelMinSize: 10,
	energyTokenLabelRadiusSizeMultiplier: 0.95,
	energyTokenLabelDepthOffset: 0.5
} as const;

export const VOLUME_CONTROL_LAYOUT = {
	margin: 48,
	iconSize: 28,
	trackGap: 12,
	trackWidth: 118,
	trackHeight: 8,
	knobRadius: 9,
	depth: 1600,
	sliderHitAreaPadX: 16,
	sliderHitAreaHeight: 40,
	iconHitRadiusMultiplier: 0.82,
	iconRingRadiusMultiplier: 0.9,
	iconRingStrokeWidth: 3,
	iconRingStrokeAlpha: 1,
} as const;
