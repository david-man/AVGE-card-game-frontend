export const GAME_WIDTH = 1920 * 4;
export const GAME_HEIGHT = GAME_WIDTH/1920 * 1080;

export const GAME_CENTER_X = GAME_WIDTH / 2;
export const GAME_CENTER_Y = GAME_HEIGHT / 2;

export const UI_BASE_WIDTH = 1920;
export const UI_BASE_HEIGHT = 1080;
export const UI_SCALE = Math.min(GAME_WIDTH / UI_BASE_WIDTH, GAME_HEIGHT / UI_BASE_HEIGHT);
export const UI_MIN_FONT_SIZE = 30;
export const UI_FONT_FAMILY = 'MinecraftRegular, serif';
export const UI_TEXT_RENDER_MODE: 'bitmap' | 'vector' = 'bitmap';

// Reference size used for scene layout constants before scaling.
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

export const BOARD_SCALE = 0.8;

export const CARD_BASE_WIDTH = 60;
export const CARD_BASE_HEIGHT = 108;
export const CARD_BORDER_WIDTH = 8;
export const CARD_SELECTED_BORDER_WIDTH = 12;

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
	character: 0xe76f51,
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
	faceDownFillColor: 0x1f2937
} as const;

export const CARD_TEXT_LAYOUT = {
	idYOffset: 14,
	typeYOffset: 18,
	classTwoLineTypeGap: 10,
	classTwoLineYOffsetBoost: 6,
	hpPadding: 2,
	minIdFontSize: 10,
	minTypeFontSize: 8,
	minHpFontSize: 10,
	baseIdFontSize: 15,
	baseTypeFontSize: 11,
	baseHpFontSize: 9
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
	active: 80,
	discard: 90,
	deck: 90,
	stadium: 90
} as const;
export const MAX_BENCH_CARDS = 3;
export const CARDHOLDER_HEIGHT_MULTIPLIER = 1.2;

export const CARDHOLDER_SPACING_MULTIPLIERS = {
	activeRowOffset: 0.5,
	benchFromActive: 1.0,
	handFromBench: 1.0,
	sideFromActiveX: 3
} as const;

// Horizontal inner padding used when laying out cards inside holders.
export const CARDHOLDER_LAYOUT_SIDE_PADDING_MULTIPLIER = 0.35;

export const ENERGYHOLDER_LAYOUT = {
	widthMultiplier: 2,
	heightMultiplier: 2,
	xOffsetMultiplier: 2.25,
	verticalSpreadMultiplier: 0.95,
	stadiumClearanceWidthMultiplier: 0.2
} as const;

export const ENERGY_TOKEN_DEPTHS = {
	minZone: 16,
	minAttached: 210,
	maxBelowUi: 1000
} as const;

export const GAME_SCENE_VISUALS = {
	backgroundColor: 0x00ff00,
	backgroundAlpha: 0.5,
	inputLockColor: 0x7a7a7a,
	inputLockAlpha: 0.45,
	inputLockDepth: 299
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
	titleFontSize: 14,
	outputFontSize: 11,
	inputFontSize: 12,
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
	panelWidthBase: 200,
	panelHeightBase: 360,
	gapYBase: 20,
	sideMarginBase: 24,
	cardWidthMultiplier: 1.55,
	cardHeightMultiplier: 1.55,
	cardCenterYRatio: 0.285,
	idYOffsetRatio: 0.16,
	typeYOffsetRatio: 0.16,
	hpOffsetXRatio: 0.06,
	hpOffsetYRatio: 0.06,
	paragraphXRatio: 0.5,
	paragraphYRatio: 0.54,
	paragraphWidthRatio: 0.92,
	panelFillColor: 0x101828,
	panelFillAlpha: 0.92,
	panelStrokeWidth: 2,
	panelStrokeColor: 0xffffff,
	panelStrokeAlpha: 0.7,
	cardFillColor: 0x1f2937,
	cardFillAlpha: 1,
	idFontSize: 16,
	idFontSizeMin: 14,
	typeFontSize: 14,
	typeFontSizeMin: 12,
	hpFontSize: 11,
	hpFontSizeMin: 10,
	paragraphFontSize: 12,
	paragraphFontSizeMin: 9,
	flavorFontSizeDelta: -1,
	flavorFontSizeMin: 8,
	fitIdMinSize: 10,
	fitIdSizeRatio: 0.72,
	fitIdWidthRatio: 0.9,
	fitIdWidthMin: 12,
	fitTypeMinSize: 9,
	fitTypeSizeRatio: 0.72,
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

export const DECK_BUILDER_CURRENT_DECK_PREVIEW_TEXT_LAYOUT = {
	titleFontSizeBase: 18,
	titleFontSizeMin: 10,
	hintFontSizeBase: 11,
	hintFontSizeMin: 8,
	emptyStateFontSizeBase: 12,
	emptyStateFontSizeMin: 8,
	sectionHeaderFontSizeBase: 12,
	sectionHeaderFontSizeMin: 8,
	tileIconFontSizeBase: 18,
	tileIconFontSizeMin: 14,
	tileNameFontSizeBase: 10,
	tileNameFontSizeMin: 10,
	tileCountFontSizeBase: 10,
	tileCountFontSizeMin: 7
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
	countBadgeWidthBase: 22,
	countBadgeHeightBase: 18
} as const;

export const GAME_CARD_ACTION_BUTTON_LAYOUT = {
	leftMarginBase: 24,
	bottomMarginBase: 40,
	buttonRadiusBase: 28,
	buttonGapBase: 10,
	fontSize: 12,
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
	fontSize: 16,
	fillColor: 0x7f1d1d,
	fillAlpha: 0.92,
	strokeWidth: 2,
	strokeColor: 0xffffff,
	strokeAlpha: 0.75,
	textTint: 0xffffff,
	label: 'S',
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
	titleFontSizeRatio: 0.22,
	titleFontSizeMin: 18,
	hintFontSizeRatio: 0.15,
	hintFontSizeMin: 14,
	itemLabelFontSizeRatio: 0.13,
	itemLabelFontSizeMin: 11,
	itemSubLabelFontSizeRatio: 0.11,
	itemSubLabelFontSizeMin: 10,
	assignmentFontSizeRatio: 0.11,
	assignmentFontSizeMin: 10,
	numberLabelFontSizeRatio: 0.12,
	numberLabelFontSizeMin: 11,
	submitLabelFontSizeRatio: 0.14,
	submitLabelFontSizeMin: 12
} as const;

export const GAME_INPUT_OVERLAY_HEADER_LAYOUT = {
	messageGapRatio: 0.032,
	messageGapMin: 22,
	titleFontSizeRatio: 0.018,
	titleFontSizeMin: 20,
	hintFontSizeRatio: 0.014,
	hintFontSizeMin: 14,
	hintFitMinSize: 10
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
	adminColumnGapBase: 360,
	fontSize: 18,
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
	energyStadiumOffsetMultiplier: 1.8
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
	cardHolderLabelTint: 0xffffff,
	cardHolderLabelAlpha: 0.68,
	cardHolderLabelDepth: 2,
	energyHolderFillAlpha: 0.27,
	energyHolderStrokeWidth: 3,
	energyHolderStrokeColor: 0xffffff,
	energyHolderStrokeAlpha: 0.9,
	energyHolderDepth: 1,
	energyHolderLabelBaseSize: 14,
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
