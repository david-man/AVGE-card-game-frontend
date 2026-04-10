export const GAME_WIDTH = 1920 * 3;
export const GAME_HEIGHT = GAME_WIDTH/1920 * 1080;

export const GAME_CENTER_X = GAME_WIDTH / 2;
export const GAME_CENTER_Y = GAME_HEIGHT / 2;

export const UI_BASE_WIDTH = 1920;
export const UI_BASE_HEIGHT = 1080;
export const UI_SCALE = Math.min(GAME_WIDTH / UI_BASE_WIDTH, GAME_HEIGHT / UI_BASE_HEIGHT);

// Reference size used for scene layout constants before scaling.
export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

export const BOARD_SCALE = 0.8;

export const CARD_BASE_WIDTH = 60;
export const CARD_BASE_HEIGHT = 108;

export const CARDHOLDER_BASE_WIDTH = {
	hand: 640,
	bench: 420,
	active: 80,
	discard: 90,
	deck: 90,
	stadium: 90
} as const;
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
	widthMultiplier: 2.05,
	heightMultiplier: 0.48,
	xOffsetMultiplier: 2.25
} as const;
