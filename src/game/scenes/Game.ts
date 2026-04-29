import { Scene } from 'phaser';
import { io, Socket } from 'socket.io-client';

import { GameCommandProcessor } from '../commands/GameCommandProcessor';
import { Card, CardHolder, CardHolderConfig, EnergyHolder, EnergyHolderConfig, EnergyToken, PlayerId } from '../entities';
import {
    clearClientSessionState,
    sendFrontendProtocolPacket,
    BackendEntitiesSetup,
    BackendProtocolPacket,
    FrontendProtocolPacket,
    parseBackendEntitiesSetup,
    subscribeToRouterSessionEvents,
    getBackendBaseUrl,
    getRouterBaseUrl,
    checkServiceHealth,
    ROOM_BACKEND_BASE_URL_STORAGE_KEY,
    ROUTER_SESSION_ID_STORAGE_KEY,
} from '../Network';
import { parseBackendProtocolPacket, ParsedBackendProtocolPacket } from '../protocol/backendResponseAdapter';
import { BoardInteractionController } from '../ui/BoardInteractionController';
import { CardPreviewController } from '../ui/CardPreviewController';
import { InputOverlayController } from '../ui/InputOverlayController';
import { PhaseHudController } from '../ui/PhaseHudController';
import { PlayerStatsHudController } from '../ui/PlayerStatsHudController';
import { SurrenderController } from '../ui/SurrenderController';
import { registerUiClickSoundForScene } from '../ui/clickSfx';
import { createVolumeControlForScene, preloadVolumeControlAssets } from '../ui/volumeControl';
import { fitTextToTwoLines } from '../ui/overlays/textFit';
import { fitTextToSingleLine } from '../ui/overlays/textFit';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    ENTITY_VISUALS,
    GAME_CARD_TYPE_FILL_COLORS,
    GAME_CARD_ACTION_BUTTON_LAYOUT,
    GAME_DEPTHS,
    GAME_EXPLOSION,
    GAME_HP_PULSE_ANIMATION,
    GAME_INIT_COUNTDOWN_OVERLAY,
    GAME_WINNER_OVERLAY_AUDIO,
    GAME_LAYOUT,
    GAME_OVERLAY_DEPTHS,
    GAME_SCENE_VISUALS,
    GAME_SHUFFLE_ANIMATION,
    GAME_SURRENDER_BUTTON_LAYOUT,
    ENERGY_TOKEN_DEPTHS,
    CARDHOLDER_BASE_WIDTH,
    GAME_STATUS_TEXT_LAYOUT,
    MAX_BENCH_CARDS,
    CARDHOLDER_HEIGHT_MULTIPLIER,
    ENERGYHOLDER_LAYOUT,
    CARDHOLDER_SPACING_MULTIPLIERS,
    GAME_CENTER_X,
    GAME_CENTER_Y,
    GAME_HEIGHT,
    GAME_WIDTH,
    PLAYER_TURN_ATTRIBUTE_DEFAULTS,
    UI_SCALE
} from '../config';

type ViewMode = PlayerId | 'spectator';
type GamePhase = 'no-input' | 'phase2' | 'atk';
type PhaseHudGamePhase = GamePhase | 'init';
type CardActionKey = 'atk1' | 'atk2' | 'active';
type OverlayPreviewContext = 'input' | 'reveal' | null;
type PlayerTurnAttributeKey = keyof typeof PLAYER_TURN_ATTRIBUTE_DEFAULTS;
type PlayerTurnAttributes = Record<PlayerTurnAttributeKey, number>;
type InitStage = 'init' | 'live';
const SHUFFLE_DECK_SOUND_KEY = 'shuffle-deck';
const SHUFFLE_DECK_SOUND_PATH = 'sfx/shuffle_deck.wav';
const SHUFFLE_DECK_FALLBACK_DURATION_MS = 900;
const REVEAL_SOUND_KEY = 'reveal';
const REVEAL_SOUND_PATH = 'sfx/reveal.mp3';
const ENERGY_TOKEN_ATTACH_SOUND_KEY = 'energy-token-attach';
const ENERGY_TOKEN_ATTACH_SOUND_PATH = 'sfx/play_chip.ogg';
const SPARKLE_SOUND_KEY = 'sparkle';
const SPARKLE_SOUND_PATH = 'sfx/sparkle.mp3';
const PUNCH_SOUND_KEY = 'punch';
const PUNCH_SOUND_PATH = 'sfx/punch.mp3';
const HEAVY_PUNCH_SOUND_KEY = 'heavy-punch';
const HEAVY_PUNCH_SOUND_PATH = 'sfx/heavy_punch.mp3';
const CARD_SLIDE_SOUND_KEY = 'card-slide';
const CARD_SLIDE_SOUND_PATH = 'sfx/card_slide.ogg';
const CARD_SHOVE_SOUND_KEY = 'card-shove';
const CARD_SHOVE_SOUND_PATH = 'sfx/card_shove.ogg';
const COUNTDOWN_LOW_BEEP_SOUND_KEY = 'countdown-lowbeep';
const COUNTDOWN_LOW_BEEP_SOUND_PATH = 'sfx/lowbeep.mp3';
const COUNTDOWN_HIGH_BEEP_SOUND_KEY = 'countdown-highbeep';
const COUNTDOWN_HIGH_BEEP_SOUND_PATH = 'sfx/highbeep.mp3';
const CRIT_PARTICLE_TEXTURE_KEY = 'crit-particle';
const CRIT_PARTICLE_TEXTURE_PATH = 'icons/crit.png';
const REGENERATION_PARTICLE_TEXTURE_KEY = 'regeneration-particle';
const REGENERATION_PARTICLE_TEXTURE_PATH = 'icons/regeneration.png';
type PlayerSetupProfile = {
    username: string;
    attributes: Partial<PlayerTurnAttributes>;
};
type QueuedNotifyReplayCommand = {
    command: string;
    payload: Record<string, unknown> | null;
};
type BackendAnimationKeyframe = {
    key: string;
    kind: 'sound' | 'particles';
    cardId: string | null;
};
type BackendAnimationPayload = {
    target: string | null;
    keyframes: BackendAnimationKeyframe[];
};
type CardHpPulseAnimationState = {
    baseScaleX: number;
    baseScaleY: number;
    overlay: Phaser.GameObjects.Rectangle;
    pulseTween: Phaser.Tweens.Tween;
    overlayTween: Phaser.Tweens.Tween;
};

const getBackendSocketUrl = (): string => {
    return getBackendBaseUrl();
};

export class Game extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;

    cards: Card[];
    cardById: Record<string, Card>;
    cardByBody: Map<Phaser.GameObjects.Rectangle, Card>;
    selectedCard: Card | null;
    overlayPreviewContext: OverlayPreviewContext;
    activelyDraggedCardIds: Set<string>;
    dragOriginZoneByCardId: Map<string, string>;
    dragStartPositionByCardId: Map<string, { x: number; y: number }>;
    dragDistanceByCardId: Map<string, number>;
    hpPulseAnimationByCardId: Map<string, CardHpPulseAnimationState>;

    cardHolders: CardHolder[];
    cardHolderById: Record<string, CardHolder>;

    energyHolders: EnergyHolder[];
    energyHolderById: Record<string, EnergyHolder>;

    energyTokens: EnergyToken[];
    energyTokenById: Record<string, EnergyToken>;
    energyTokenByBody: Map<Phaser.GameObjects.GameObject, EnergyToken>;
    activelyDraggedEnergyTokenIds: Set<string>;
    energyDragStartPositionById: Map<string, { x: number; y: number }>;
    energyDragDistanceById: Map<string, number>;
    activeSceneAnimationCount: number;

    energyZoneIdByOwner: Record<PlayerId, string>;
    activeViewMode: ViewMode;
    gamePhase: GamePhase;
    roundNumber: number;
    playerTurn: PlayerId;
    playerTurnAttributesByPlayer: Record<PlayerId, PlayerTurnAttributes>;
    playerSetupProfileById: Record<PlayerId, PlayerSetupProfile>;
    baseCardHolderPositionById: Record<string, { x: number; y: number }>;
    baseEnergyHolderPositionById: Record<string, { x: number; y: number }>;

    objectWidth: number;
    objectHeight: number;

    commandProcessor: GameCommandProcessor;
    boardInputEnabled: boolean;
    inputLockOverlay: Phaser.GameObjects.Rectangle;
    initStartCountdownOverlay: Phaser.GameObjects.Rectangle;
    initStartCountdownText: Phaser.GameObjects.Text;
    initStartCountdownTimer: Phaser.Time.TimerEvent | null;
    initStartCountdownTween: Phaser.Tweens.Tween | null;
    initStartCountdownBackdropTween: Phaser.Tweens.Tween | null;
    initStartCountdownAnimationLocked: boolean;
    initStartCountdownAckGateActive: boolean;
    opponentDisconnectBackdrop: Phaser.GameObjects.Rectangle;
    opponentDisconnectText: Phaser.GameObjects.Text;
    inputOverlayController: InputOverlayController;
    boardInteractionController: BoardInteractionController;
    cardPreviewController: CardPreviewController;
    surrenderController: SurrenderController;
    playerStatsHudController: PlayerStatsHudController;
    phaseHudController: PhaseHudController;
    scannerCommandInProgress: boolean;
    commandExecutionInProgress: boolean;
    pendingBackendEvents: Array<{
        eventType: string;
        responseData: Record<string, unknown>;
        context: Record<string, unknown>;
    }>;
    backendEventSequence: number;
    protocolAck: number;
    protocolClientId: string;
    protocolClientSlot: PlayerId | null;
    protocolReconnectToken: string | null;
    routerSessionId: string | null;
    waitingForOpponent: boolean;
    pregameInitStage: InitStage;
    initSetupConfirmed: boolean;
    opponentInitSetupConfirmed: boolean;
    inputAcknowledged: boolean;
    pendingInputCommand: string | null;
    pendingNotifyCommand: string | null;
    pendingNotifyCommandQueue: QueuedNotifyReplayCommand[];
    awaitingRemoteNotifyAck: boolean;
    remoteInputLockActive: boolean;
    opponentDisconnected: boolean;
    opponentDisconnectCountdownSeconds: number;
    opponentDisconnectCountdownTimer: Phaser.Time.TimerEvent | null;
    protocolSocket: Socket | null;
    protocolSocketFallbackToHttp: boolean;
    protocolRecoveryInProgress: boolean;
    protocolSendChain: Promise<void>;
    serviceHealthTimer: Phaser.Time.TimerEvent | null;
    serviceHealthCheckInFlight: boolean;
    hasRedirectedToMainMenu: boolean;
    authSessionUnsubscribe: (() => void) | null;
    matchEndedAwaitingExit: boolean;
    pageHideHandler: ((event: Event) => void) | null;
    beforeUnloadHandler: ((event: Event) => void) | null;
    clientUnloadSignalSent: boolean;
    lastRevealSoundPlayedAtMs: number;

    cardActionButtons: Array<{
        key: CardActionKey;
        body: Phaser.GameObjects.Arc;
        label: Phaser.GameObjects.Text;
    }>;
    cardActionSourceByKey: Partial<Record<CardActionKey, Card | null>>;
    phaseStateActionButton: {
        body: Phaser.GameObjects.Rectangle;
        label: Phaser.GameObjects.Text;
        action: 'phase2-attack' | 'atk-skip' | 'init-done' | null;
    } | null;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('board-background', 'background/base_board.png');
        this.load.image('logo', 'logo.png');
        this.load.image('minecraftfont', 'minecraftfont.png');
        this.load.image('font2bitmap', 'font2bitmap.png');
        this.load.image(CRIT_PARTICLE_TEXTURE_KEY, CRIT_PARTICLE_TEXTURE_PATH);
        this.load.image(REGENERATION_PARTICLE_TEXTURE_KEY, REGENERATION_PARTICLE_TEXTURE_PATH);
        this.load.image(GAME_SURRENDER_BUTTON_LAYOUT.iconKey, GAME_SURRENDER_BUTTON_LAYOUT.iconPath);
        this.load.audio(SHUFFLE_DECK_SOUND_KEY, SHUFFLE_DECK_SOUND_PATH);
        this.load.audio(REVEAL_SOUND_KEY, REVEAL_SOUND_PATH);
        this.load.audio(ENERGY_TOKEN_ATTACH_SOUND_KEY, ENERGY_TOKEN_ATTACH_SOUND_PATH);
        this.load.audio(SPARKLE_SOUND_KEY, SPARKLE_SOUND_PATH);
        this.load.audio(PUNCH_SOUND_KEY, PUNCH_SOUND_PATH);
        this.load.audio(HEAVY_PUNCH_SOUND_KEY, HEAVY_PUNCH_SOUND_PATH);
        this.load.audio(CARD_SLIDE_SOUND_KEY, CARD_SLIDE_SOUND_PATH);
        this.load.audio(CARD_SHOVE_SOUND_KEY, CARD_SHOVE_SOUND_PATH);
        this.load.audio(COUNTDOWN_LOW_BEEP_SOUND_KEY, COUNTDOWN_LOW_BEEP_SOUND_PATH);
        this.load.audio(COUNTDOWN_HIGH_BEEP_SOUND_KEY, COUNTDOWN_HIGH_BEEP_SOUND_PATH);
        this.load.audio(GAME_WINNER_OVERLAY_AUDIO.soundKey, GAME_WINNER_OVERLAY_AUDIO.soundPath);
        preloadVolumeControlAssets(this);
        InputOverlayController.preloadDiceAssets(this);
    }

    create ()
    {
        registerUiClickSoundForScene(this);
        createVolumeControlForScene(this, { placement: 'bottom-left' });

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(GAME_SCENE_VISUALS.backgroundColor);
        this.camera.roundPixels = false;
        this.camera.fadeIn(220, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'board-background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(GAME_SCENE_VISUALS.backgroundAlpha);

        this.boardInputEnabled = true;
        const inputLockDepth = GAME_OVERLAY_DEPTHS.inputLock;
        this.inputLockOverlay = this.add.rectangle(GAME_CENTER_X, GAME_CENTER_Y, GAME_WIDTH, GAME_HEIGHT, GAME_SCENE_VISUALS.inputLockColor, GAME_SCENE_VISUALS.inputLockAlpha)
            .setDepth(inputLockDepth)
            .setInteractive({ useHandCursor: false })
            .setVisible(false);
        this.inputLockOverlay.on('pointerdown', (
            _pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData
        ) => {
            event.stopPropagation();
        });
        this.createInitStartCountdownOverlay();
        this.opponentDisconnectBackdrop = this.add.rectangle(
            GAME_CENTER_X,
            GAME_CENTER_Y,
            Math.round(GAME_WIDTH * 0.72),
            Math.round(GAME_HEIGHT * 0.24),
            0x0f172a,
            0.92
        )
            .setStrokeStyle(2, 0xffffff, 0.85)
            .setDepth(GAME_OVERLAY_DEPTHS.opponentDisconnectBackdrop)
            .setVisible(false);
        this.opponentDisconnectText = this.add.text(GAME_CENTER_X, GAME_CENTER_Y, 'Other player disconnected. Waiting for reconnection...').setFontSize(Math.max(
                GAME_STATUS_TEXT_LAYOUT.opponentDisconnectFontSizeMin,
                Math.round(GAME_STATUS_TEXT_LAYOUT.opponentDisconnectFontSizeBase * UI_SCALE)
            ))
            .setOrigin(0.5)
            .setAlign('center')
            .setWordWrapWidth(Math.round(GAME_WIDTH * 0.64))
            .setDepth(GAME_OVERLAY_DEPTHS.opponentDisconnectText)
            .setVisible(false);
        this.inputOverlayController = new InputOverlayController(this, this.inputLockOverlay);
        this.boardInteractionController = new BoardInteractionController(this, this);
        this.cardPreviewController = new CardPreviewController(this);
        this.surrenderController = new SurrenderController(this, {
            onArm: (seconds) => {
                this.appendTerminalLine(`${this.getViewModeLabel(this.activeViewMode)} surrender armed for ${seconds}s. Click again to confirm.`);
            },
            onConfirm: () => {
                const winningPlayerLabel = this.activeViewMode === 'p1' ? 'PLAYER 2' : 'PLAYER 1';
                const loserView = this.activeViewMode === 'p1'
                    ? 'player-1'
                    : (this.activeViewMode === 'p2' ? 'player-2' : null);
                const winnerView = loserView === 'player-1'
                    ? 'player-2'
                    : (loserView === 'player-2' ? 'player-1' : null);
                this.appendTerminalLine(`${winningPlayerLabel} won by surrender.`);
                this.emitBackendEvent('surrender_result', {
                    winner: winningPlayerLabel,
                    loser: this.getViewModeLabel(this.activeViewMode),
                    winner_view: winnerView,
                    loser_view: loserView,
                });
            },
            onTimeout: () => {
                this.appendTerminalLine('Surrender confirmation timed out.');
                this.emitBackendEvent('surrender_timeout', {
                    view_mode: this.getViewModeLabel(this.activeViewMode)
                });
            },
            canInteract: () => this.boardInputEnabled,
        });
        this.playerStatsHudController = new PlayerStatsHudController(this);
        this.phaseHudController = new PhaseHudController(this);
        this.commandProcessor = new GameCommandProcessor(this);
        this.scannerCommandInProgress = false;
        this.commandExecutionInProgress = false;
        this.pendingBackendEvents = [];
        this.backendEventSequence = 0;
        this.protocolAck = 0;
        this.protocolClientId = this.loadOrCreateProtocolClientId();
        this.protocolClientSlot = this.loadProtocolClientSlot();
        this.protocolReconnectToken = this.loadProtocolReconnectToken();
        this.routerSessionId = this.loadRouterSessionId();
        this.waitingForOpponent = false;
        this.pregameInitStage = 'init';
        this.initSetupConfirmed = false;
        this.opponentInitSetupConfirmed = false;
        this.inputAcknowledged = false;
        this.pendingInputCommand = null;
        this.pendingNotifyCommand = null;
        this.pendingNotifyCommandQueue = [];
        this.awaitingRemoteNotifyAck = false;
        this.remoteInputLockActive = false;
        this.opponentDisconnected = false;
        this.opponentDisconnectCountdownSeconds = 0;
        this.opponentDisconnectCountdownTimer = null;
        this.protocolSocket = null;
        this.protocolSocketFallbackToHttp = false;
        this.protocolRecoveryInProgress = false;
        this.protocolSendChain = Promise.resolve();
        this.serviceHealthTimer = null;
        this.serviceHealthCheckInFlight = false;
        this.hasRedirectedToMainMenu = false;
        this.authSessionUnsubscribe = null;
        this.matchEndedAwaitingExit = false;
        this.pageHideHandler = null;
        this.beforeUnloadHandler = null;
        this.clientUnloadSignalSent = false;
        this.lastRevealSoundPlayedAtMs = Number.NEGATIVE_INFINITY;

        if (this.routerSessionId) {
            this.startAuthSessionPush(this.routerSessionId);
        }

        const xRatio = GAME_WIDTH / BASE_WIDTH;
        const yRatio = GAME_HEIGHT / BASE_HEIGHT;

        // Card size inherits from configured game dimensions.
        this.objectWidth = Math.round(CARD_BASE_WIDTH * xRatio * BOARD_SCALE);
        this.objectHeight = Math.round(CARD_BASE_HEIGHT * yRatio * BOARD_SCALE);

        const holderConfigs = this.buildCardHolderConfigs(BOARD_SCALE);
        this.cardHolders = [];
        this.cardHolderById = {};
        this.baseCardHolderPositionById = {};
        this.baseEnergyHolderPositionById = {};
        this.activeViewMode = 'spectator';
        this.gamePhase = 'phase2';
        this.roundNumber = 0;
        this.playerTurn = 'p1';
        this.playerTurnAttributesByPlayer = {
            p1: this.createDefaultPlayerTurnAttributes(),
            p2: this.createDefaultPlayerTurnAttributes()
        };
        this.playerSetupProfileById = {
            p1: { username: 'PLAYER 1', attributes: {} },
            p2: { username: 'PLAYER 2', attributes: {} }
        };

        for (const config of holderConfigs) {
            const holder = new CardHolder(this, config);
            this.cardHolders.push(holder);
            this.cardHolderById[holder.id] = holder;
            this.baseCardHolderPositionById[holder.id] = { x: holder.x, y: holder.y };
        }

        this.energyTokens = [];
        this.energyTokenById = {};
        this.energyTokenByBody = new Map();
        this.activelyDraggedEnergyTokenIds = new Set();
        this.energyDragStartPositionById = new Map();
        this.energyDragDistanceById = new Map();
        this.activeSceneAnimationCount = 0;
        this.energyZoneIdByOwner = {
            p1: 'shared-energy',
            p2: 'shared-energy'
        };
        this.energyHolders = [];
        this.energyHolderById = {};

        this.createEnergyHolders();
        for (const holder of this.energyHolders) {
            this.baseEnergyHolderPositionById[holder.id] = { x: holder.x, y: holder.y };
        }

        this.cards = [];
        this.cardById = {};
        this.cardByBody = new Map();
        this.selectedCard = null;
        this.overlayPreviewContext = null;
        this.activelyDraggedCardIds = new Set();
        this.dragOriginZoneByCardId = new Map();
        this.dragStartPositionByCardId = new Map();
        this.dragDistanceByCardId = new Map();
        this.hpPulseAnimationByCardId = new Map();

        this.createCardPreviewPanel();
        this.createCardActionButtons();
        this.cardActionSourceByKey = { atk1: null, atk2: null, active: null };
        this.phaseStateActionButton = null;
        this.createSurrenderButton();
        this.createPlayerStatsHud();
        this.createPhaseHud();

        void this.initializeProtocolSession();
        this.registerWindowUnloadSignals();
        this.startServiceHealthMonitor();

        this.events.once('shutdown', () => {
            this.stopInitStartCountdownAnimation();
            this.clearAllCardHpPulseAnimations();
            this.stopServiceHealthMonitor();
            this.stopAuthSessionPush();
            this.unregisterWindowUnloadSignals();
            if (this.protocolSocket) {
                this.protocolSocket.removeAllListeners();
                this.protocolSocket.disconnect();
                this.protocolSocket = null;
            }
        });

        this.applyBoardView(this.activeViewMode);
        this.boardInteractionController.register();
    }

    public isInteractionLockedByAnimation (): boolean
    {
        // This lock is only for in-flight animation/replay visuals.
        // Input gating is controlled separately via boardInputEnabled.
        if (this.activeSceneAnimationCount > 0) {
            return true;
        }

        return this.cards.some((card) => card.isCurrentlyFlipping());
    }

    private startServiceHealthMonitor (): void
    {
        if (this.serviceHealthTimer) {
            return;
        }

        this.serviceHealthTimer = this.time.addEvent({
            delay: 5000,
            loop: true,
            callback: () => {
                void this.checkCoreServiceHealth();
            }
        });
    }

    private stopServiceHealthMonitor (): void
    {
        if (!this.serviceHealthTimer) {
            return;
        }

        this.serviceHealthTimer.remove(false);
        this.serviceHealthTimer = null;
    }

    private async checkCoreServiceHealth (): Promise<void>
    {
        if (this.hasRedirectedToMainMenu || this.serviceHealthCheckInFlight || this.matchEndedAwaitingExit) {
            return;
        }

        this.serviceHealthCheckInFlight = true;
        try {
            const routerHealthy = await checkServiceHealth(getRouterBaseUrl());
            if (!routerHealthy) {
                this.redirectToMainMenuAfterServiceFailure('router_unreachable', 'Router unavailable. Returning to main menu.');
                return;
            }

            if (this.protocolSocketFallbackToHttp) {
                const backendHealthy = await checkServiceHealth(getBackendBaseUrl());
                if (!backendHealthy) {
                    this.redirectToMainMenuAfterServiceFailure('room_unreachable', 'Game server unavailable. Returning to main menu.');
                }
            }
        }
        finally {
            this.serviceHealthCheckInFlight = false;
        }
    }

    private redirectToMainMenuAfterServiceFailure (reason: string, message: string): void
    {
        if (this.hasRedirectedToMainMenu) {
            return;
        }

        this.hasRedirectedToMainMenu = true;
        console.warn('[Protocol] redirecting to MainMenu after service failure', { reason });
        this.stopServiceHealthMonitor();
        this.stopAuthSessionPush();

        if (reason === 'session_superseded') {
            clearClientSessionState();
        }
        else if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('avge_protocol_client_slot');
            window.sessionStorage.removeItem('avge_protocol_reconnect_token');
            window.sessionStorage.removeItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY);
        }

        if (this.protocolSocket) {
            this.protocolSocket.removeAllListeners();
            this.protocolSocket.disconnect();
            this.protocolSocket = null;
        }

        this.scene.start('MainMenu', {
            systemMessage: message,
            failureReason: reason,
        });
    }

    private startAuthSessionPush (sessionId: string): void
    {
        this.stopAuthSessionPush();
        this.authSessionUnsubscribe = subscribeToRouterSessionEvents(sessionId, ({ reason, message }) => {
            if (reason !== 'session_superseded') {
                return;
            }

            this.handleSessionSupersededLogout(message);
        });
    }

    private stopAuthSessionPush (): void
    {
        if (!this.authSessionUnsubscribe) {
            return;
        }

        this.authSessionUnsubscribe();
        this.authSessionUnsubscribe = null;
    }

    private handleSessionSupersededLogout (message?: string): void
    {
        if (this.hasRedirectedToMainMenu) {
            return;
        }

        this.hasRedirectedToMainMenu = true;
        this.stopServiceHealthMonitor();
        this.stopAuthSessionPush();
        clearClientSessionState();

        if (this.protocolSocket) {
            this.protocolSocket.removeAllListeners();
            this.protocolSocket.disconnect();
            this.protocolSocket = null;
        }

        this.scene.start('Login', {
            systemMessage: typeof message === 'string' && message.trim().length > 0
                ? message
                : 'Signed out: account opened on another client.'
        });
    }

    public markMatchEndedAwaitingExit (): void
    {
        if (this.matchEndedAwaitingExit) {
            return;
        }

        this.matchEndedAwaitingExit = true;
        this.stopServiceHealthMonitor();
        this.setInputAcknowledged(false);
    }

    public returnToMainMenuAfterMatchEnd (): void
    {
        this.matchEndedAwaitingExit = false;
        this.hasRedirectedToMainMenu = true;
        this.stopServiceHealthMonitor();
        this.stopAuthSessionPush();

        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('avge_protocol_client_slot');
            window.sessionStorage.removeItem('avge_protocol_reconnect_token');
            window.sessionStorage.removeItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY);
        }

        if (this.protocolSocket) {
            this.protocolSocket.removeAllListeners();
            this.protocolSocket.disconnect();
            this.protocolSocket = null;
        }

        this.scene.start('MainMenu');
    }

    public setBoardInputEnabled (enabled: boolean, showLockOverlayWhenDisabled = true): void
    {
        this.boardInputEnabled = enabled;

        if (!enabled) {
            const overlayAlpha = showLockOverlayWhenDisabled
                ? GAME_SCENE_VISUALS.inputLockAlpha
                : 0;
            const showOverlay = showLockOverlayWhenDisabled && overlayAlpha > 0;
            this.inputLockOverlay
                .setFillStyle(GAME_SCENE_VISUALS.inputLockColor, overlayAlpha)
                .setVisible(showOverlay);
        }
        else {
            this.inputLockOverlay
                .setFillStyle(GAME_SCENE_VISUALS.inputLockColor, GAME_SCENE_VISUALS.inputLockAlpha)
                .setVisible(false);
        }

        if (enabled && this.inputOverlayController?.hasActiveOverlay()) {
            this.inputOverlayController.stopActiveOverlay();
            this.overlayPreviewContext = null;
            this.refreshCardActionButtons();
        }

        if (!enabled) {
            this.clearCardSelection();
            this.activelyDraggedCardIds.clear();
            this.dragOriginZoneByCardId.clear();
            this.dragStartPositionByCardId.clear();
            this.dragDistanceByCardId.clear();
            this.activelyDraggedEnergyTokenIds.clear();
            this.energyDragStartPositionById.clear();
            this.energyDragDistanceById.clear();
            return;
        }

        if (!this.isInteractionLockedByAnimation() && !this.initStartCountdownAckGateActive) {
            this.flushPendingBackendEvents();
        }
    }

    private beginSceneAnimation (): void
    {
        this.activeSceneAnimationCount += 1;
        console.info('[ACK_TRACE][Game] animation_begin', {
            activeAnimations: this.activeSceneAnimationCount,
            pendingEvents: this.pendingBackendEvents.length
        });
    }

    private endSceneAnimation (): void
    {
        this.activeSceneAnimationCount = Math.max(0, this.activeSceneAnimationCount - 1);
        console.info('[ACK_TRACE][Game] animation_end', {
            activeAnimations: this.activeSceneAnimationCount,
            pendingEvents: this.pendingBackendEvents.length
        });
        if (this.activeSceneAnimationCount === 0) {
            this.flushPendingBackendEvents();
        }
    }

    private flushPendingBackendEvents (): void
    {
        if (this.pendingBackendEvents.length === 0) {
            return;
        }

        if (this.commandExecutionInProgress || this.isInteractionLockedByAnimation() || this.initStartCountdownAckGateActive) {
            return;
        }

        const pending = this.pendingBackendEvents.splice(0, this.pendingBackendEvents.length);
        console.info('[ACK_TRACE][Game] flush_pending_events', {
            flushedCount: pending.length,
            activeAnimations: this.activeSceneAnimationCount,
            commandExecutionInProgress: this.commandExecutionInProgress
        });
        for (const item of pending) {
            const isAck = item.eventType === 'terminal_log' && String(item.responseData.line ?? '').trim().toLowerCase() === 'ack backend_update_processed';
            console.info('[ACK_TRACE][Game] flush_send_event', {
                eventType: item.eventType,
                isAck,
                command: isAck ? item.responseData.command ?? null : null
            });
            this.dispatchFrontendEvent(item.eventType, item.responseData, item.context);
        }
    }

    public setCommandExecutionInProgress (inProgress: boolean): void
    {
        this.commandExecutionInProgress = inProgress;
        if (!inProgress && !this.isInteractionLockedByAnimation() && !this.initStartCountdownAckGateActive) {
            this.flushPendingBackendEvents();
        }
    }

    private createEnergyHolders (): void
    {
        const p2Discard = this.cardHolderById['p2-discard'];
        const p1Discard = this.cardHolderById['p1-discard'];

        const holderWidth = Math.round(this.objectWidth * ENERGYHOLDER_LAYOUT.widthMultiplier);
        const holderHeight = Math.round(this.objectHeight * ENERGYHOLDER_LAYOUT.heightMultiplier);
        const xOffset = Math.round(this.objectWidth * ENERGYHOLDER_LAYOUT.xOffsetMultiplier);
        const verticalSpread = Math.round(this.objectHeight * ENERGYHOLDER_LAYOUT.verticalSpreadMultiplier);

        const p2EnergyX = p2Discard.x - xOffset;
        const p1EnergyX = p1Discard.x - xOffset;
        const p2EnergyY = p2Discard.y - verticalSpread;
        const p1EnergyY = p1Discard.y + verticalSpread;

        const sharedZoneId = this.energyZoneIdByOwner.p1;
        const sharedX = Math.round((p1EnergyX + p2EnergyX) / 2);
        const sharedY = Math.round((p1EnergyY + p2EnergyY) / 2);

        const createHolder = (config: EnergyHolderConfig) => {
            const holder = new EnergyHolder(this, config);
            this.energyHolders.push(holder);
            this.energyHolderById[holder.id] = holder;
            return holder;
        };

        const sharedHolder = createHolder({ id: sharedZoneId, label: 'SHARED ENERGY', x: sharedX, y: sharedY, width: holderWidth, height: holderHeight, color: 0x4361ee });
        // Hard-cutover shared-pool model: discard and shared energy resolve to
        // the same visible holder and drop zone.
        this.energyHolderById['energy-discard'] = sharedHolder;
    }

    private async initializeProtocolSession (): Promise<void>
    {
        this.setInputAcknowledged(false);
        if (!this.initializeProtocolSocket()) {
            this.enqueueProtocolPacket('register_client', {
                requested_slot: this.protocolClientSlot,
                reconnect_token: this.protocolReconnectToken,
                session_id: this.routerSessionId,
            });
        }
    }

    private emitClientUnloadingSignal (): void
    {
        if (this.clientUnloadSignalSent) {
            return;
        }

        const socket = this.protocolSocket;
        if (socket === null || socket.connected !== true) {
            return;
        }

        this.clientUnloadSignalSent = true;
        socket.emit('client_unloading', {
            requested_slot: this.protocolClientSlot,
            reconnect_token: this.protocolReconnectToken,
            session_id: this.routerSessionId,
        });
    }

    private registerWindowUnloadSignals (): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.pageHideHandler !== null || this.beforeUnloadHandler !== null) {
            return;
        }

        this.pageHideHandler = (_event: Event) => {
            this.emitClientUnloadingSignal();
        };

        this.beforeUnloadHandler = (_event: Event) => {
            this.emitClientUnloadingSignal();
        };

        window.addEventListener('pagehide', this.pageHideHandler);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }

    private unregisterWindowUnloadSignals (): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.pageHideHandler !== null) {
            window.removeEventListener('pagehide', this.pageHideHandler);
            this.pageHideHandler = null;
        }

        if (this.beforeUnloadHandler !== null) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }
    }

    private initializeProtocolSocket (): boolean
    {
        if (this.protocolSocketFallbackToHttp) {
            return false;
        }

        if (this.protocolSocket !== null) {
            return true;
        }

        const socket = io(getBackendSocketUrl(), {
            // Polling is more stable with the local Flask/Werkzeug room server.
            transports: ['polling'],
            upgrade: false,
            reconnection: false,
        });

        this.protocolSocket = socket;

        socket.on('connect', () => {
            this.clientUnloadSignalSent = false;
            this.enqueueProtocolPacket('register_client', {
                requested_slot: this.protocolClientSlot,
                reconnect_token: this.protocolReconnectToken,
                session_id: this.routerSessionId,
            });
        });

        socket.on('connect_error', (error: unknown) => {
            console.warn('[Protocol] socket connect failed, falling back to HTTP /protocol', error);
            this.activateHttpProtocolFallback();
        });

        socket.on('registration_ok', (payload: unknown) => {
            const data = typeof payload === 'object' && payload !== null
                ? payload as {
                    slot?: unknown;
                    reconnect_token?: unknown;
                    both_players_connected?: unknown;
                    waiting_for_init?: unknown;
                }
                : {};

            if (data.slot === 'p1' || data.slot === 'p2') {
                this.protocolClientSlot = data.slot;
            }

            if (typeof data.reconnect_token === 'string' && data.reconnect_token.trim().length > 0) {
                this.protocolReconnectToken = data.reconnect_token.trim();
            }

            this.waitingForOpponent = data.both_players_connected !== true;
            if (data.waiting_for_init === true) {
                this.pregameInitStage = 'init';
            }
            if (this.waitingForOpponent) {
                this.appendTerminalLine('Waiting for opponent to connect...');
                this.setOpponentDisconnectedState(true, 'Opponent is connecting...');
            }
            else {
                this.setOpponentDisconnectedState(false);
            }

            this.persistProtocolClientSession();

            // Always request a fresh environment snapshot after registration.
            // This prevents reconnect limbo where holder zones render but
            // entities were not replayed for the new socket session.
            this.enqueueProtocolPacket('request_environment', {});
        });

        socket.on('registration_error', (payload: unknown) => {
            console.warn('[Protocol] registration_error', payload);
            this.setInputAcknowledged(true);
        });

        socket.on('protocol_packets', (payload: unknown) => {
            const data = typeof payload === 'object' && payload !== null
                ? payload as {
                    packets?: unknown;
                    blocked_pending_peer_ack?: unknown;
                }
                : {};

            const packets = Array.isArray(data.packets)
                ? data.packets as BackendProtocolPacket[]
                : [];

            const blockedPendingPeerAck = data.blocked_pending_peer_ack === true;

            this.processBackendProtocolPackets(packets);

            if (blockedPendingPeerAck) {
                this.setInputAcknowledged(false);
            }
            else if (packets.length === 0) {
                this.setInputAcknowledged(true);
            }
        });

        socket.on('protocol_error', (payload: unknown) => {
            const data = typeof payload === 'object' && payload !== null
                ? payload as {
                    error?: unknown;
                    packet_type?: unknown;
                    status?: unknown;
                }
                : {};

            const errorMessage = typeof data.error === 'string' && data.error.trim().length > 0
                ? data.error.trim()
                : 'Protocol request failed.';
            const packetType = typeof data.packet_type === 'string' ? data.packet_type.trim() : '';
            const statusCode = typeof data.status === 'number' && Number.isFinite(data.status)
                ? Math.trunc(data.status)
                : null;

            console.warn('[Protocol] protocol_error', payload);

            const packetLabel = packetType.length > 0 ? packetType : 'request';
            const statusSuffix = statusCode !== null ? ` (${statusCode})` : '';
            this.appendTerminalLine(`Server rejected ${packetLabel}${statusSuffix}: ${errorMessage}`);

            this.setInputAcknowledged(true);

            if (packetType === 'init_setup_done') {
                this.appendTerminalLine('Refreshing init state from server...');
                this.enqueueProtocolPacket('request_environment', {});
                this.enqueueProtocolPacket('ready', {});
            }
        });

        socket.on('opponent_disconnected', (payload: unknown) => {
            const data = typeof payload === 'object' && payload !== null
                ? payload as { grace_seconds?: unknown }
                : {};
            const graceSeconds = typeof data.grace_seconds === 'number' && Number.isFinite(data.grace_seconds)
                ? Math.max(0, Math.round(data.grace_seconds))
                : 0;
            this.waitingForOpponent = true;
            this.setOpponentDisconnectedState(true, 'Other player disconnected. Waiting for reconnection...', graceSeconds);
        });

        socket.on('opponent_reconnected', (_payload: unknown) => {
            this.waitingForOpponent = false;
            this.setOpponentDisconnectedState(false);
        });

        socket.on('disconnect', () => {
            if (this.matchEndedAwaitingExit) {
                this.appendTerminalLine('Match ended. Waiting for Main Menu confirmation...');
                return;
            }
            this.redirectToMainMenuAfterServiceFailure('room_disconnected', 'Game server disconnected. Returning to main menu.');
        });

        return true;
    }

    private activateHttpProtocolFallback (): void
    {
        if (this.matchEndedAwaitingExit) {
            return;
        }

        if (this.protocolSocketFallbackToHttp) {
            return;
        }

        this.protocolSocketFallbackToHttp = true;
        if (this.protocolSocket !== null) {
            this.protocolSocket.removeAllListeners();
            this.protocolSocket.disconnect();
            this.protocolSocket = null;
        }

        this.enqueueProtocolPacket('register_client', {
            requested_slot: this.protocolClientSlot,
            reconnect_token: this.protocolReconnectToken,
            session_id: this.routerSessionId,
        });
    }

    private loadOrCreateProtocolClientId (): string
    {
        const fallback = `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        if (typeof window === 'undefined') {
            return fallback;
        }

        const key = 'avge_protocol_client_id';
        const existing = window.sessionStorage.getItem(key);
        if (typeof existing === 'string' && existing.trim().length > 0) {
            return existing.trim();
        }

        const generated =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : fallback;
        window.sessionStorage.setItem(key, generated);
        return generated;
    }

    private loadProtocolClientSlot (): PlayerId | null
    {
        if (typeof window === 'undefined') {
            return null;
        }
        const raw = window.sessionStorage.getItem('avge_protocol_client_slot');
        return raw === 'p1' || raw === 'p2' ? raw : null;
    }

    private loadProtocolReconnectToken (): string | null
    {
        if (typeof window === 'undefined') {
            return null;
        }
        const raw = window.sessionStorage.getItem('avge_protocol_reconnect_token');
        return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
    }

    private loadRouterSessionId (): string | null
    {
        if (typeof window === 'undefined') {
            return null;
        }

        const raw = window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
        return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
    }

    private persistProtocolClientSession (): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        if (this.protocolClientSlot) {
            window.sessionStorage.setItem('avge_protocol_client_slot', this.protocolClientSlot);
        }
        else {
            window.sessionStorage.removeItem('avge_protocol_client_slot');
        }

        if (this.protocolReconnectToken) {
            window.sessionStorage.setItem('avge_protocol_reconnect_token', this.protocolReconnectToken);
        }
        else {
            window.sessionStorage.removeItem('avge_protocol_reconnect_token');
        }
    }

    private setInputAcknowledged (acknowledged: boolean): void
    {
        const allowInitInteractionWhileDisconnected = this.canInteractDuringInitOpponentDisconnect();
        if (acknowledged && (
            this.awaitingRemoteNotifyAck
            || this.pendingNotifyCommand !== null
            || this.pendingNotifyCommandQueue.length > 0
            || this.remoteInputLockActive
            || (this.opponentDisconnected && !allowInitInteractionWhileDisconnected)
        )) {
            acknowledged = false;
        }

        this.inputAcknowledged = acknowledged;
        if (!acknowledged) {
            const shouldShowLockOverlay =
                this.awaitingRemoteNotifyAck
                || this.pendingNotifyCommand !== null
                || this.inputOverlayController?.hasActiveOverlay() === true;
            this.setBoardInputEnabled(false, shouldShowLockOverlay);
            return;
        }

        if (!this.inputOverlayController.hasActiveOverlay()) {
            this.setBoardInputEnabled(true);
        }
    }

    private enqueueProtocolPacket (
        packetType: FrontendProtocolPacket['PacketType'],
        body: Record<string, unknown>
    ): void
    {
        if (this.protocolSocket !== null && this.protocolSocket.connected) {
            if (packetType === 'register_client') {
                this.protocolSocket.emit('register_client_or_play', {
                    slot: this.protocolClientSlot,
                    reconnect_token: this.protocolReconnectToken,
                    session_id: this.routerSessionId,
                });
                return;
            }

            const payload = {
                ACK: this.protocolAck,
                Body: body,
            };

            this.protocolSocket.emit(packetType, payload);
            return;
        }

        this.protocolSendChain = this.protocolSendChain
            .then(async () => {
                const response = await sendFrontendProtocolPacket({
                    ACK: this.protocolAck,
                    PacketType: packetType,
                    Body: body,
                    client_id: this.protocolClientId,
                    client_slot: this.protocolClientSlot ?? undefined,
                    reconnect_token: this.protocolReconnectToken ?? undefined,
                });

                if (response.requestFailed) {
                    this.redirectToMainMenuAfterServiceFailure('room_unreachable', 'Game server unavailable. Returning to main menu.');
                    return;
                }

                if (response.clientSlot) {
                    this.protocolClientSlot = response.clientSlot;
                }
                if (response.reconnectToken) {
                    this.protocolReconnectToken = response.reconnectToken;
                }
                this.persistProtocolClientSession();

                if (packetType === 'register_client') {
                    const wasWaiting = this.waitingForOpponent;
                    this.waitingForOpponent = Boolean(response.waitingForOpponent);
                    if (response.waitingForInit === true) {
                        this.pregameInitStage = 'init';
                    }
                    if (this.waitingForOpponent && !wasWaiting) {
                        this.appendTerminalLine('Waiting for opponent to connect...');
                    }
                }

                this.processBackendProtocolPackets(response.packets);

                if (response.blockedPendingPeerAck) {
                    this.setInputAcknowledged(false);
                }
                else if (response.packets.length === 0) {
                    this.setInputAcknowledged(true);
                }
            })
            .catch((error) => {
                console.warn('[Protocol] Failed to send packet', { packetType, body, error });
            });
    }

    private processBackendProtocolPackets (packets: BackendProtocolPacket[]): void
    {
        for (const packet of packets) {
            if (packet.PacketType !== 'environment' && packet.SEQ !== this.protocolAck) {
                this.handleProtocolMismatch(packet);
                return;
            }

            this.protocolAck = packet.SEQ + 1;

            const parsedPacket = parseBackendProtocolPacket(packet);
            if (!parsedPacket) {
                this.handleProtocolMismatch(packet);
                return;
            }

            if (parsedPacket.kind === 'environment') {
                this.waitingForOpponent = false;
                this.setOpponentDisconnectedState(false);
                const setup = parseBackendEntitiesSetup(parsedPacket.body);
                if (!setup) {
                    this.handleProtocolMismatch(packet);
                    return;
                }

                if (this.cards.length > 0 || this.energyTokens.length > 0) {
                    this.resetBoardEntitiesForAuthoritativeEnvironment();
                }
                this.playRevealSound(320);
                this.applyBackendEntitySetup(setup);
                if (this.pendingNotifyCommand || this.pendingInputCommand || this.pendingNotifyCommandQueue.length > 0) {
                    this.setInputAcknowledged(false);
                }
                else {
                    this.setInputAcknowledged(true);
                }
                this.enqueueProtocolPacket('ready', {});
                continue;
            }

            if (parsedPacket.kind === 'init_state') {
                this.applyInitStatePacket(parsedPacket.body);
                continue;
            }

            this.applyBackendCommandPacket(parsedPacket);
        }
    }

    private executeBackendReplayCommand (command: string): string | null
    {
        let replayError: string | null = null;
        this.scannerCommandInProgress = true;
        this.setInputAcknowledged(false);
        try {
            this.commandProcessor.execute(command);
        }
        catch (error) {
            replayError = error instanceof Error ? (error.stack ?? error.message) : String(error);
            console.error('[Protocol] command execution failed', {
                command,
                error: replayError,
            });
        }
        finally {
            this.scannerCommandInProgress = false;
        }

        return replayError;
    }

    private drainQueuedNotifyCommands (): void
    {
        while (
            this.pendingNotifyCommandQueue.length > 0
            && this.pendingNotifyCommand === null
            && !this.awaitingRemoteNotifyAck
            && !this.inputOverlayController.hasActiveOverlay()
        ) {
            const nextEntry = this.pendingNotifyCommandQueue.shift();
            if (!nextEntry) {
                continue;
            }

            const nextCommand = nextEntry.command;

            const replayError = this.executeBackendReplayCommand(nextCommand);
            this.executeBackendAnimationPayload(nextCommand, nextEntry.payload);
            this.awaitingRemoteNotifyAck = true;

            if (this.inputOverlayController.hasActiveOverlay()) {
                this.pendingNotifyCommand = nextCommand;
                this.setInputAcknowledged(false);
                return;
            }

            this.awaitingRemoteNotifyAck = false;
            this.setInputAcknowledged(false);
            this.emitBackendEvent('terminal_log', {
                line: 'ACK backend_update_processed',
                command: nextCommand,
                apply_error: replayError,
            });
        }
    }

    private applyBackendCommandPacket (packet: Extract<ParsedBackendProtocolPacket, { kind: 'command' }>): void
    {
        const command = packet.command;
        if (packet.category === 'query_notify') {
            this.pendingNotifyCommandQueue.push({ command, payload: packet.payload });
            this.setInputAcknowledged(false);
            this.drainQueuedNotifyCommands();
            return;
        }

        const replayError = this.executeBackendReplayCommand(command);
        this.executeBackendAnimationPayload(command, packet.payload);

        if (packet.category === 'query_input') {
            this.pendingInputCommand = command;
            this.setInputAcknowledged(true);
            return;
        }

        const action = command.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
        const isUnlockInput = action === 'unlock-input' || action === 'unlock_input';
        if (packet.category === 'lock_state' && isUnlockInput) {
            this.awaitingRemoteNotifyAck = false;
            this.setInputAcknowledged(true);
            this.emitBackendEvent('terminal_log', {
                line: 'ACK backend_update_processed',
                command,
                apply_error: replayError,
            });
            return;
        }

        if (packet.category === 'other') {
            console.warn('[Protocol] Unknown backend command response category.', {
                category: packet.category,
                command,
                commandId: packet.commandId,
            });
        }

        this.emitBackendEvent('terminal_log', {
            line: 'ACK backend_update_processed',
            command,
            apply_error: replayError,
        });
    }

    private normalizeBackendAnimationKind (raw: unknown): 'sound' | 'particles' | null
    {
        if (typeof raw !== 'string') {
            return null;
        }

        const normalized = raw.trim().toLowerCase();
        if (normalized === 'sound') {
            return 'sound';
        }
        if (normalized === 'particles') {
            return 'particles';
        }

        return null;
    }

    private parseBackendAnimationPayload (payload: Record<string, unknown> | null): BackendAnimationPayload | null
    {
        if (!payload) {
            return null;
        }

        if (typeof payload.animation !== 'object' || payload.animation === null) {
            return null;
        }

        const animationCandidate = payload.animation as Record<string, unknown>;
        const rawKeyframes = animationCandidate.keyframes;
        if (!Array.isArray(rawKeyframes) || rawKeyframes.length === 0) {
            return null;
        }

        const keyframes: BackendAnimationKeyframe[] = [];
        for (const rawKeyframe of rawKeyframes) {
            let key: unknown;
            let kindRaw: unknown;
            let cardIdRaw: unknown;

            if (Array.isArray(rawKeyframe)) {
                key = rawKeyframe[0];
                kindRaw = rawKeyframe[1];
                cardIdRaw = rawKeyframe[2];
            }
            else if (typeof rawKeyframe === 'object' && rawKeyframe !== null) {
                const keyframeObject = rawKeyframe as Record<string, unknown>;
                key = keyframeObject.key;
                kindRaw = keyframeObject.kind ?? keyframeObject.type;
                cardIdRaw = keyframeObject.card_id ?? keyframeObject.cardId;
            }
            else {
                continue;
            }

            if (typeof key !== 'string' || key.trim().length === 0) {
                continue;
            }

            const kind = this.normalizeBackendAnimationKind(kindRaw);
            if (!kind) {
                continue;
            }

            const cardId = typeof cardIdRaw === 'string' && cardIdRaw.trim().length > 0
                ? cardIdRaw.trim()
                : null;

            keyframes.push({
                key: key.trim(),
                kind,
                cardId,
            });
        }

        if (keyframes.length === 0) {
            return null;
        }

        const rawTarget = animationCandidate.target;
        return {
            target: typeof rawTarget === 'string' && rawTarget.trim().length > 0
                ? rawTarget.trim().toLowerCase()
                : null,
            keyframes,
        };
    }

    private isBackendAnimationTargetActiveView (target: string | null): boolean
    {
        if (target === null) {
            return true;
        }

        const normalizedTarget = target.trim().toLowerCase();
        if (normalizedTarget === 'both' || normalizedTarget === 'all') {
            return true;
        }

        if (normalizedTarget === 'player-1' || normalizedTarget === 'p1' || normalizedTarget === 'player1') {
            return this.activeViewMode === 'p1';
        }

        if (normalizedTarget === 'player-2' || normalizedTarget === 'p2' || normalizedTarget === 'player2') {
            return this.activeViewMode === 'p2';
        }

        return true;
    }

    private resolveCardByIdCaseInsensitive (rawCardId: string): Card | null
    {
        const direct = this.cardById[rawCardId] ?? this.cardById[rawCardId.toUpperCase()] ?? this.cardById[rawCardId.toLowerCase()];
        if (direct) {
            return direct;
        }

        const target = rawCardId.trim().toLowerCase();
        if (!target) {
            return null;
        }

        const matchedId = Object.keys(this.cardById).find((key) => key.toLowerCase() === target);
        return matchedId ? this.cardById[matchedId] : null;
    }

    private findCardReferencedByCommand (command: string): Card | null
    {
        const tokens = command
            .trim()
            .split(/\s+/)
            .filter((token) => token.length > 0);
        if (tokens.length < 2) {
            return null;
        }

        const candidateCount = Math.min(tokens.length, 5);
        for (let i = 1; i < candidateCount; i += 1) {
            const card = this.resolveCardByIdCaseInsensitive(tokens[i]);
            if (card) {
                return card;
            }
        }

        return null;
    }

    private executeBackendAnimationPayload (command: string, payload: Record<string, unknown> | null): void
    {
        const animation = this.parseBackendAnimationPayload(payload);
        if (!animation) {
            return;
        }

        if (!this.isBackendAnimationTargetActiveView(animation.target)) {
            return;
        }

        const commandCard = this.findCardReferencedByCommand(command);
        for (const keyframe of animation.keyframes) {
            if (keyframe.kind === 'sound') {
                const played = this.playCommandSoundAsSceneAnimation(keyframe.key);
                if (!played) {
                    console.warn('[Protocol] animation sound key missing', { key: keyframe.key, command });
                }
                continue;
            }

            if (keyframe.kind === 'particles') {
                const particleCard = (keyframe.cardId ? this.resolveCardByIdCaseInsensitive(keyframe.cardId) : null)
                    ?? commandCard;
                if (!particleCard) {
                    console.warn('[Protocol] animation particles target card missing', {
                        key: keyframe.key,
                        cardId: keyframe.cardId,
                        command,
                    });
                    continue;
                }

                const textureKey = this.resolveBoomTextureKey(keyframe.key);
                if (!textureKey) {
                    console.warn('[Protocol] animation particles key missing', { key: keyframe.key, command });
                    continue;
                }

                this.playBoomExplosion(particleCard, textureKey);
            }
        }
    }

    private handleProtocolMismatch (packet: BackendProtocolPacket): void
    {
        if (this.protocolRecoveryInProgress) {
            return;
        }

        this.protocolRecoveryInProgress = true;
        this.setInputAcknowledged(false);
        console.warn('[Protocol] mismatch detected, restarting scene for resync', {
            expectedAck: this.protocolAck,
            packetSeq: packet.SEQ,
            packetType: packet.PacketType,
        });
        this.scene.restart();
    }

    private resetBoardEntitiesForAuthoritativeEnvironment (): void
    {
        this.clearCardSelection();
        this.clearAllCardHpPulseAnimations();
        if (this.pendingNotifyCommand === null && this.inputOverlayController.hasActiveOverlay()) {
            this.inputOverlayController.stopActiveOverlay();
        }

        for (const card of this.cards) {
            card.destroy();
        }
        for (const token of this.energyTokens) {
            token.destroy();
        }

        this.cards = [];
        this.cardById = {};
        this.cardByBody = new Map();
        this.energyTokens = [];
        this.energyTokenById = {};
        this.energyTokenByBody = new Map();

        for (const holder of this.cardHolders) {
            holder.cards.length = 0;
        }

        for (const holder of this.energyHolders) {
            holder.tokens.length = 0;
            holder.hidePileCountDisplays();
        }

        this.activelyDraggedCardIds.clear();
        this.dragOriginZoneByCardId.clear();
        this.dragStartPositionByCardId.clear();
        this.dragDistanceByCardId.clear();
        this.activelyDraggedEnergyTokenIds.clear();
        this.energyDragStartPositionById.clear();
        this.energyDragDistanceById.clear();
        this.pendingInputCommand = null;
        this.protocolRecoveryInProgress = false;
    }

    private canInteractDuringInitOpponentDisconnect (): boolean
    {
        return this.opponentDisconnected
            && this.isPregameInitActive()
            && !this.initSetupConfirmed;
    }

    private setOpponentDisconnectedState (disconnected: boolean, message?: string, graceSeconds = 0): void
    {
        this.opponentDisconnected = disconnected;
        this.stopOpponentDisconnectCountdown();

        if (disconnected) {
            const label = typeof message === 'string' && message.trim().length > 0
                ? message.trim()
                : 'Other player disconnected. Waiting for reconnection...';
            this.safeSetOpponentDisconnectText(label);
            if (this.canRenderOpponentDisconnectUi()) {
                this.opponentDisconnectBackdrop.setVisible(true);
                this.opponentDisconnectText.setVisible(true);
            }
            else {
                console.warn('[Protocol] disconnect UI unavailable, using terminal fallback only.');
                this.appendTerminalLine(label);
            }

            if (graceSeconds > 0) {
                this.startOpponentDisconnectCountdown(label, graceSeconds);
            }
            this.setInputAcknowledged(this.canInteractDuringInitOpponentDisconnect());
            return;
        }

        if (this.canRenderOpponentDisconnectUi()) {
            this.opponentDisconnectBackdrop.setVisible(false);
            this.opponentDisconnectText.setVisible(false);
        }
        this.setInputAcknowledged(true);
    }

    private stopOpponentDisconnectCountdown (): void
    {
        if (this.opponentDisconnectCountdownTimer) {
            this.opponentDisconnectCountdownTimer.remove(false);
            this.opponentDisconnectCountdownTimer = null;
        }
        this.opponentDisconnectCountdownSeconds = 0;
    }

    private startOpponentDisconnectCountdown (baseMessage: string, graceSeconds: number): void
    {
        this.opponentDisconnectCountdownSeconds = graceSeconds;
        this.safeSetOpponentDisconnectText(`${baseMessage}\nAuto-win in ${this.opponentDisconnectCountdownSeconds}s`);
        this.appendTerminalLine(`Opponent disconnected. Auto-win in ${this.opponentDisconnectCountdownSeconds}s if they do not reconnect.`);

        this.opponentDisconnectCountdownTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (!this.opponentDisconnected) {
                    this.stopOpponentDisconnectCountdown();
                    return;
                }

                this.opponentDisconnectCountdownSeconds = Math.max(0, this.opponentDisconnectCountdownSeconds - 1);
                this.safeSetOpponentDisconnectText(`${baseMessage}\nAuto-win in ${this.opponentDisconnectCountdownSeconds}s`);
                this.appendTerminalLine(`Opponent reconnect timer: ${this.opponentDisconnectCountdownSeconds}s remaining.`);

                if (this.opponentDisconnectCountdownSeconds <= 0) {
                    this.appendTerminalLine('Reconnect grace period expired. Awaiting backend winner resolution...');
                    this.stopOpponentDisconnectCountdown();
                }
            }
        });
    }

    private canRenderOpponentDisconnectUi (): boolean
    {
        return Boolean(
            this.opponentDisconnectBackdrop
            && this.opponentDisconnectBackdrop.active
            && this.opponentDisconnectBackdrop.scene
            && this.opponentDisconnectText
            && this.opponentDisconnectText.active
            && this.opponentDisconnectText.scene
        );
    }

    private safeSetOpponentDisconnectText (text: string): void
    {
        if (!this.canRenderOpponentDisconnectUi()) {
            return;
        }

        try {
            this.opponentDisconnectText.setText(text);
        }
        catch (error) {
            console.warn('[Protocol] Failed to update disconnect overlay text.', error);
        }
    }

    private applyBackendEntitySetup (setup: BackendEntitiesSetup): void
    {
        this.roundNumber = setup.roundNumber;

        if (setup.playerTurn === 'p1' || setup.playerTurn === 'p2') {
            this.playerTurn = setup.playerTurn;
        }

        if (setup.gamePhase === 'no-input' || setup.gamePhase === 'phase2' || setup.gamePhase === 'atk') {
            this.gamePhase = setup.gamePhase;
        }

        this.applyBackendPlayerSetup(setup);

        const sortedCards = setup.cards.slice().sort((a, b) => {
            const aAttached = a.attachedToCardId ? 1 : 0;
            const bAttached = b.attachedToCardId ? 1 : 0;
            return aAttached - bAttached;
        });

        for (const cardDef of sortedCards) {
            const result = this.createCardFromCommand({
                id: cardDef.id,
                ownerId: cardDef.ownerId,
                cardType: cardDef.cardType,
                holderId: cardDef.holderId,
                color: GAME_CARD_TYPE_FILL_COLORS[cardDef.cardType],
                AVGECardType: cardDef.AVGECardType,
                AVGECardClass: cardDef.AVGECardClass,
                hasAtk1: cardDef.hasAtk1 ?? false,
                hasActive: cardDef.hasActive ?? false,
                hasPassive: cardDef.hasPassive,
                hasAtk2: cardDef.hasAtk2 ?? false,
                atk1Name: cardDef.atk1Name,
                activeName: cardDef.activeName,
                atk2Name: cardDef.atk2Name,
                atk1Cost: cardDef.atk1Cost,
                atk2Cost: cardDef.atk2Cost,
                retreatCost: cardDef.retreatCost,
                hp: cardDef.hp,
                maxHp: cardDef.maxHp,
                statusEffect: cardDef.statusEffect,
                width: this.objectWidth,
                height: this.objectHeight,
                flipped: false,
                attachedToCardId: cardDef.attachedToCardId,
                deferLayoutAndRedraw: true
            });

            if (!result.ok) {
                this.appendTerminalLine(`setup card skipped (${cardDef.id}): ${result.error}`);
            }
        }

        const sortedEnergy = setup.energyTokens.slice().sort((a, b) => {
            const aAttached = a.attachedToCardId ? 1 : 0;
            const bAttached = b.attachedToCardId ? 1 : 0;
            return aAttached - bAttached;
        });

        for (const tokenDef of sortedEnergy) {
            const result = this.createEnergyTokenFromCommand({
                id: tokenDef.id,
                ownerId: tokenDef.ownerId,
                holderId: tokenDef.holderId,
                radius: this.getDefaultEnergyTokenRadius(),
                attachedToCardId: tokenDef.attachedToCardId,
                deferLayout: true
            });

            if (!result.ok) {
                this.appendTerminalLine(`setup energy skipped (${tokenDef.id}): ${result.error}`);
            }
        }

        const payloadView =
            setup.playerView === 'p1' || setup.playerView === 'p2' || setup.playerView === 'spectator'
                ? setup.playerView
                : null;
        const slotView = this.protocolClientSlot === 'p1' || this.protocolClientSlot === 'p2'
            ? this.protocolClientSlot
            : null;
        const assignedView: ViewMode = payloadView ?? slotView ?? this.activeViewMode;
        this.applyBoardView(assignedView);
    }

    public getDefaultEnergyTokenRadius (): number
    {
        return Math.max(GAME_LAYOUT.energyTokenRadiusMin, Math.round(this.objectWidth * GAME_LAYOUT.energyTokenRadiusWidthRatio));
    }

    private buildCardHolderConfigs (scale: number): CardHolderConfig[]
    {
        // Scale the board around the configured game center from the base layout size.
        const xRatio = GAME_WIDTH / BASE_WIDTH;
        const yRatio = GAME_HEIGHT / BASE_HEIGHT;

        // Use full-screen coordinate mapping for holder spacing so zones are not center-cramped.
        const scaleX = (value: number) => Math.round(((value - (BASE_WIDTH / 2)) * xRatio) + GAME_CENTER_X);
        const scaleY = (value: number) => Math.round(((value - (BASE_HEIGHT / 2)) * yRatio) + GAME_CENTER_Y);
        const scaleSizeX = (value: number) => Math.round(value * xRatio * scale);
        const spacing = CARD_BASE_HEIGHT;

        const holderWidth = (holderType: keyof typeof CARDHOLDER_BASE_WIDTH) => scaleSizeX(CARDHOLDER_BASE_WIDTH[holderType]);

        const baseCenterX = BASE_WIDTH / 2;
        const baseCenterY = BASE_HEIGHT / 2;
        const topActiveY = baseCenterY - (spacing * CARDHOLDER_SPACING_MULTIPLIERS.activeRowOffset);
        const bottomActiveY = baseCenterY + (spacing * CARDHOLDER_SPACING_MULTIPLIERS.activeRowOffset);
        const benchYOffset = spacing * CARDHOLDER_SPACING_MULTIPLIERS.benchFromActive;
        const handYOffset = spacing * CARDHOLDER_SPACING_MULTIPLIERS.handFromBench;
        const sideXOffset = spacing * CARDHOLDER_SPACING_MULTIPLIERS.sideFromActiveX;

        const topBenchY = topActiveY - benchYOffset;
        const topHandY = topBenchY - handYOffset;
        const bottomBenchY = bottomActiveY + benchYOffset;
        const bottomHandY = bottomBenchY + handYOffset;
        const leftSideX = baseCenterX - sideXOffset;
        const rightSideX = baseCenterX + sideXOffset;
        const stadiumX = leftSideX - (spacing * GAME_LAYOUT.energyStadiumOffsetMultiplier);

        return [
            // Opponent side (top)
            { id: 'p2-hand', label: 'P2 HAND', x: scaleX(baseCenterX), y: scaleY(topHandY), width: holderWidth('hand'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x264653 },
            { id: 'p2-bench', label: 'P2 BENCH', x: scaleX(baseCenterX), y: scaleY(topBenchY), width: holderWidth('bench'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x2a9d8f },
            { id: 'p2-active', label: 'P2 ACTIVE', x: scaleX(baseCenterX), y: scaleY(topActiveY), width: holderWidth('active'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe9c46a },
            { id: 'p2-discard', label: 'P2 DISCARD', x: scaleX(leftSideX), y: scaleY(topActiveY), width: holderWidth('discard'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xf4a261 },
            { id: 'p2-deck', label: 'P2 DECK', x: scaleX(rightSideX), y: scaleY(topActiveY), width: holderWidth('deck'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe76f51 },
            { id: 'stadium', label: 'STADIUM', x: scaleX(stadiumX), y: scaleY(baseCenterY), width: holderWidth('stadium'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x6d597a },

            // Player side (bottom)
            { id: 'p1-active', label: 'P1 ACTIVE', x: scaleX(baseCenterX), y: scaleY(bottomActiveY), width: holderWidth('active'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe9c46a },
            { id: 'p1-discard', label: 'P1 DISCARD', x: scaleX(leftSideX), y: scaleY(bottomActiveY), width: holderWidth('discard'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xf4a261 },
            { id: 'p1-deck', label: 'P1 DECK', x: scaleX(rightSideX), y: scaleY(bottomActiveY), width: holderWidth('deck'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0xe76f51 },
            { id: 'p1-bench', label: 'P1 BENCH', x: scaleX(baseCenterX), y: scaleY(bottomBenchY), width: holderWidth('bench'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x2a9d8f },
            { id: 'p1-hand', label: 'P1 HAND', x: scaleX(baseCenterX), y: scaleY(bottomHandY), width: holderWidth('hand'), height: this.objectHeight * CARDHOLDER_HEIGHT_MULTIPLIER, color: 0x264653 }
        ];
    }

    private createCardPreviewPanel (): void
    {
        this.cardPreviewController.create(this.objectWidth, this.objectHeight);
    }

    private createInitStartCountdownOverlay (): void
    {
        const overlayDepth = Math.max(
            GAME_OVERLAY_DEPTHS.overlayBase + GAME_INIT_COUNTDOWN_OVERLAY.depthOffset,
            this.inputLockOverlay.depth + 1
        );

        this.initStartCountdownOverlay = this.add.rectangle(
            GAME_CENTER_X,
            GAME_CENTER_Y,
            GAME_WIDTH,
            GAME_HEIGHT,
            GAME_SCENE_VISUALS.inputLockColor,
            GAME_INIT_COUNTDOWN_OVERLAY.backdropAlpha
        )
            .setDepth(overlayDepth)
            .setInteractive({ useHandCursor: false })
            .setVisible(false)
            .setAlpha(0);

        this.initStartCountdownOverlay.on('pointerdown', (
            _pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData
        ) => {
            event.stopPropagation();
        });

        const numberFontSize = Math.max(
            GAME_INIT_COUNTDOWN_OVERLAY.fontSizeMin,
            Math.round(GAME_INIT_COUNTDOWN_OVERLAY.numberFontSizeBase * UI_SCALE)
        );

        this.initStartCountdownText = this.add.text(GAME_CENTER_X, GAME_CENTER_Y, '')
            .setFontSize(numberFontSize)
            .setOrigin(0.5)
            .setAlign('center')
            .setDepth(overlayDepth + 1)
            .setTint(GAME_INIT_COUNTDOWN_OVERLAY.numberTint)
            .setVisible(false)
            .setAlpha(0);

        this.initStartCountdownTimer = null;
        this.initStartCountdownTween = null;
        this.initStartCountdownBackdropTween = null;
        this.initStartCountdownAnimationLocked = false;
        this.initStartCountdownAckGateActive = false;
    }

    private stopInitStartCountdownAnimation (): void
    {
        if (this.initStartCountdownTimer) {
            this.initStartCountdownTimer.remove(false);
            this.initStartCountdownTimer = null;
        }

        if (this.initStartCountdownTween) {
            this.initStartCountdownTween.remove();
            this.initStartCountdownTween = null;
        }

        if (this.initStartCountdownBackdropTween) {
            this.initStartCountdownBackdropTween.remove();
            this.initStartCountdownBackdropTween = null;
        }

        this.initStartCountdownOverlay
            .setVisible(false)
            .setAlpha(0);
        this.initStartCountdownText
            .setVisible(false)
            .setAlpha(0)
            .setScale(1);

        const hadAckGate = this.initStartCountdownAckGateActive;
        this.initStartCountdownAckGateActive = false;

        if (this.initStartCountdownAnimationLocked) {
            this.initStartCountdownAnimationLocked = false;
            this.endSceneAnimation();
            return;
        }

        if (hadAckGate && !this.commandExecutionInProgress && !this.isInteractionLockedByAnimation()) {
            this.flushPendingBackendEvents();
        }
    }

    private playInitStartCountdownAnimation (): void
    {
        this.stopInitStartCountdownAnimation();
        this.initStartCountdownAnimationLocked = true;
        this.beginSceneAnimation();

        this.initStartCountdownOverlay
            .setVisible(true)
            .setAlpha(0);
        this.initStartCountdownText
            .setVisible(true)
            .setText('')
            .setAlpha(0)
            .setScale(1);

        this.initStartCountdownBackdropTween = this.tweens.add({
            targets: this.initStartCountdownOverlay,
            alpha: GAME_INIT_COUNTDOWN_OVERLAY.backdropAlpha,
            duration: GAME_INIT_COUNTDOWN_OVERLAY.backdropFadeInMs,
            ease: 'Sine.easeOut'
        });

        let messageIndex = 0;
        const runStep = (): void => {
            if (messageIndex >= GAME_INIT_COUNTDOWN_OVERLAY.messages.length) {
                this.initStartCountdownBackdropTween = this.tweens.add({
                    targets: this.initStartCountdownOverlay,
                    alpha: 0,
                    duration: GAME_INIT_COUNTDOWN_OVERLAY.backdropFadeOutMs,
                    ease: 'Sine.easeIn',
                    onComplete: () => {
                        this.stopInitStartCountdownAnimation();
                    }
                });
                return;
            }

            const message = GAME_INIT_COUNTDOWN_OVERLAY.messages[messageIndex];
            const isFinalStep = messageIndex === GAME_INIT_COUNTDOWN_OVERLAY.messages.length - 1;
            const holdDuration = isFinalStep
                ? GAME_INIT_COUNTDOWN_OVERLAY.fightHoldMs
                : GAME_INIT_COUNTDOWN_OVERLAY.numberHoldMs;
            const baseFontSize = isFinalStep
                ? GAME_INIT_COUNTDOWN_OVERLAY.fightFontSizeBase
                : GAME_INIT_COUNTDOWN_OVERLAY.numberFontSizeBase;
            const fontSize = Math.max(
                GAME_INIT_COUNTDOWN_OVERLAY.fontSizeMin,
                Math.round(baseFontSize * UI_SCALE)
            );

            this.initStartCountdownText
                .setText(message)
                .setFontSize(fontSize)
                .setTint(isFinalStep ? GAME_INIT_COUNTDOWN_OVERLAY.fightTint : GAME_INIT_COUNTDOWN_OVERLAY.numberTint)
                .setScale(GAME_INIT_COUNTDOWN_OVERLAY.popStartScale)
                .setAlpha(0);

            const countdownSoundKey = isFinalStep
                ? COUNTDOWN_HIGH_BEEP_SOUND_KEY
                : COUNTDOWN_LOW_BEEP_SOUND_KEY;
            const countdownSoundVolume = isFinalStep
                ? GAME_INIT_COUNTDOWN_OVERLAY.highBeepVolume
                : GAME_INIT_COUNTDOWN_OVERLAY.lowBeepVolume;
            if (this.cache.audio.exists(countdownSoundKey) && this.isSfxPlaybackAllowed()) {
                this.sound.play(countdownSoundKey, { volume: countdownSoundVolume });
            }

            const popDuration = GAME_INIT_COUNTDOWN_OVERLAY.popDurationMs;
            const fadeOutDuration = GAME_INIT_COUNTDOWN_OVERLAY.fadeOutDurationMs;
            const holdAfterPopMs = Math.max(0, holdDuration - popDuration - fadeOutDuration);

            this.tweens.killTweensOf(this.initStartCountdownText);
            messageIndex += 1;

            this.initStartCountdownTween = this.tweens.add({
                targets: this.initStartCountdownText,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                duration: popDuration,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.initStartCountdownTween = this.tweens.add({
                        targets: this.initStartCountdownText,
                        alpha: 0,
                        duration: fadeOutDuration,
                        delay: holdAfterPopMs,
                        ease: 'Sine.easeIn',
                        onComplete: () => {
                            runStep();
                        }
                    });
                }
            });
            this.initStartCountdownTimer = null;
        };

        runStep();
    }

    private createCardActionButtons (): void
    {
        const radius = Math.max(12, Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonRadiusBase / BASE_WIDTH) * GAME_WIDTH));
        const leftMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.leftMarginBase / BASE_WIDTH) * GAME_WIDTH);
        const bottomMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.bottomMarginBase / BASE_HEIGHT) * GAME_HEIGHT);
        const fontSize = Math.max(10, Math.round(GAME_CARD_ACTION_BUTTON_LAYOUT.fontSize * UI_SCALE));

        const defs: Array<{ key: CardActionKey; text: string }> = [
            { key: 'atk1', text: 'ATK1' },
            { key: 'atk2', text: 'ATK2' },
            { key: 'active', text: 'ACTIVE' }
        ];

        this.cardActionButtons = defs.map((def) => {
            const x = leftMargin + radius;
            const y = GAME_HEIGHT - bottomMargin - radius;

            const body = this.add.circle(
                x,
                y,
                radius,
                GAME_CARD_ACTION_BUTTON_LAYOUT.fillColor,
                GAME_CARD_ACTION_BUTTON_LAYOUT.fillAlpha
            )
                .setStrokeStyle(
                    GAME_CARD_ACTION_BUTTON_LAYOUT.strokeWidth,
                    GAME_CARD_ACTION_BUTTON_LAYOUT.strokeColor,
                    GAME_CARD_ACTION_BUTTON_LAYOUT.strokeAlpha
                )
                .setDepth(GAME_DEPTHS.terminalInputText)
                .setInteractive({ useHandCursor: true })
                .setVisible(false);

            const label = this.add.text(x, y, def.text).setFontSize(fontSize)
                .setOrigin(0.5)
                .setAlign('center')
                .setTint(GAME_CARD_ACTION_BUTTON_LAYOUT.textTint)
                .setDepth(GAME_DEPTHS.terminalInputText + 1)
                .setVisible(false);

            body.on('pointerdown', () => {
                this.handleCardActionButtonClick(def.key);
            });

            body.on('pointerover', () => {
                this.tweens.killTweensOf([body, label]);
                body.setFillStyle(0x1e293b, 0.98);
                label.setTint(0xfef08a);
                this.tweens.add({
                    targets: [body, label],
                    scaleX: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverScale,
                    scaleY: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverScale,
                    duration: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverDurationMs,
                    ease: 'Sine.easeOut'
                });
            });

            body.on('pointerout', () => {
                this.tweens.killTweensOf([body, label]);
                body.setFillStyle(GAME_CARD_ACTION_BUTTON_LAYOUT.fillColor, GAME_CARD_ACTION_BUTTON_LAYOUT.fillAlpha);
                label.setTint(GAME_CARD_ACTION_BUTTON_LAYOUT.textTint);
                this.tweens.add({
                    targets: [body, label],
                    scaleX: 1,
                    scaleY: 1,
                    duration: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverDurationMs,
                    ease: 'Sine.easeOut'
                });
            });

            return { key: def.key, body, label };
        });
    }

    private createSurrenderButton (): void
    {
        this.surrenderController.create();
        this.refreshSurrenderButton();
    }

    private refreshSurrenderButton (): void
    {
        const effectiveViewMode: ViewMode = this.isPregameInitActive() ? 'spectator' : this.activeViewMode;
        const handHolder =
            effectiveViewMode === 'p1' || effectiveViewMode === 'p2'
                ? this.cardHolderById[`${effectiveViewMode}-hand`]
                : undefined;
        this.surrenderController.refresh(effectiveViewMode, handHolder);
        this.refreshCardActionButtons();
    }

    private createPlayerStatsHud (): void
    {
        this.playerStatsHudController.create();
        this.refreshPlayerStatsHud();
    }

    private createPhaseHud (): void
    {
        this.phaseHudController.create();
        this.createPhaseStateActionButton();
        this.refreshPhaseHud();
    }

    private createPhaseStateActionButton (): void
    {
        const fontSize = Math.max(
            GAME_STATUS_TEXT_LAYOUT.phaseStateActionFontSizeMin,
            Math.round(GAME_STATUS_TEXT_LAYOUT.phaseStateActionFontSizeBase * UI_SCALE)
        );
        const body = this.add.rectangle(0, 0, 10, 10, 0x0b132b, 0.9)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setDepth(314)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        const label = this.add.text(0, 0, '-> attack').setFontSize(fontSize)
            .setOrigin(1, 0)
            .setTint(0xffffff)
            .setDepth(315)
            .setVisible(false);

        body.on('pointerdown', () => {
            this.handlePhaseStateActionButtonClick();
        });

        body.on('pointerover', () => {
            body.setFillStyle(0x1e293b, 0.98);
            label.setTint(0xfef08a);
        });

        body.on('pointerout', () => {
            body.setFillStyle(0x0b132b, 0.9);
            label.setTint(0xffffff);
        });

        this.phaseStateActionButton = {
            body,
            label,
            action: null
        };
    }

    private handlePhaseStateActionButtonClick (): void
    {
        if (!this.boardInputEnabled) {
            return;
        }

        if (!this.phaseStateActionButton || !this.phaseStateActionButton.action) {
            return;
        }

        this.appendTerminalLine(`Phase action clicked: ${this.phaseStateActionButton.action}`);

        if (this.phaseStateActionButton.action === 'phase2-attack') {
            this.emitBackendEvent('phase2_attack_button_clicked', {
                view_mode: this.getViewModeLabel(this.activeViewMode),
                player_turn: this.getPlayerTurnLabel(this.playerTurn),
                game_phase: this.gamePhase
            });
            return;
        }

        if (this.phaseStateActionButton.action === 'atk-skip') {
            this.emitBackendEvent('atk_skip_button_clicked', {
                view_mode: this.getViewModeLabel(this.activeViewMode),
                player_turn: this.getPlayerTurnLabel(this.playerTurn),
                game_phase: this.gamePhase
            });
            return;
        }

        if (this.phaseStateActionButton.action === 'init-done') {
            this.submitInitSetupDone();
        }
    }

    private createDefaultPlayerTurnAttributes (): PlayerTurnAttributes
    {
        return {
            ENERGY_ADD_REMAINING_IN_TURN: PLAYER_TURN_ATTRIBUTE_DEFAULTS.ENERGY_ADD_REMAINING_IN_TURN,
            KO_COUNT: PLAYER_TURN_ATTRIBUTE_DEFAULTS.KO_COUNT,
            SUPPORTER_USES_REMAINING_IN_TURN: PLAYER_TURN_ATTRIBUTE_DEFAULTS.SUPPORTER_USES_REMAINING_IN_TURN,
            SWAP_REMAINING_IN_TURN: PLAYER_TURN_ATTRIBUTE_DEFAULTS.SWAP_REMAINING_IN_TURN,
            ATTACKS_LEFT: PLAYER_TURN_ATTRIBUTE_DEFAULTS.ATTACKS_LEFT
        };
    }

    public formatPlayerTurnAttributeLabel (attributeKey: PlayerTurnAttributeKey): string
    {
        return attributeKey.toLowerCase().replace(/_/g, ' ');
    }

    public parsePlayerTurnAttributeKey (rawAttribute: string): PlayerTurnAttributeKey | null
    {
        const normalized = rawAttribute.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (normalized in PLAYER_TURN_ATTRIBUTE_DEFAULTS) {
            return normalized as PlayerTurnAttributeKey;
        }

        return null;
    }

    private refreshPlayerStatsHud (): void
    {
        this.playerStatsHudController.refresh(
            this.activeViewMode,
            this.playerTurnAttributesByPlayer,
            {
                p1: this.getPlayerUsername('p1'),
                p2: this.getPlayerUsername('p2'),
            }
        );
    }

    private refreshPhaseHud (): void
    {
        const displayedPhase: PhaseHudGamePhase = this.isPregameInitActive()
            ? 'init'
            : this.gamePhase;
        const turnDisplayName =
            (this.activeViewMode === 'p1' || this.activeViewMode === 'p2') && this.activeViewMode === this.playerTurn
                ? 'YOURS'
                : this.getPlayerUsername(this.playerTurn);
        this.phaseHudController.refresh(this.activeViewMode, displayedPhase, turnDisplayName, this.roundNumber);
        this.refreshPhaseStateActionButton();
    }

    private refreshPhaseStateActionButton (): void
    {
        const button = this.phaseStateActionButton;
        if (!button) {
            return;
        }

        const panelBounds = this.phaseHudController.getPanelBounds();
        if (!panelBounds) {
            button.body.setVisible(false);
            button.label.setVisible(false);
            button.action = null;
            return;
        }

        const isCurrentTurnView = this.activeViewMode === this.playerTurn;
        const isPlayerView = this.activeViewMode === 'p1' || this.activeViewMode === 'p2';
        if (this.isPregameInitActive()) {
            if (!isPlayerView) {
                button.body.setVisible(false);
                button.label.setVisible(false);
                button.action = null;
                return;
            }

            const buttonText = this.initSetupConfirmed ? 'Waiting...' : 'Done';
            this.renderPhaseStateActionButton(buttonText, this.initSetupConfirmed ? null : 'init-done');
            return;
        }

        if (!isCurrentTurnView) {
            button.body.setVisible(false);
            button.label.setVisible(false);
            button.action = null;
            return;
        }

        let buttonText = '';
        let nextAction: 'phase2-attack' | 'atk-skip' | null = null;
        if (this.gamePhase === 'phase2') {
            if (this.roundNumber === 0) {
                buttonText = '-> end turn';
                nextAction = 'phase2-attack';
            }
            else {
                buttonText = '-> attack';
                nextAction = 'phase2-attack';
            }
        }
        else if (this.gamePhase === 'atk') {
            buttonText = '->skip';
            nextAction = 'atk-skip';
        }

        this.renderPhaseStateActionButton(buttonText, nextAction);
    }

    private renderPhaseStateActionButton (
        buttonText: string,
        nextAction: 'phase2-attack' | 'atk-skip' | 'init-done' | null
    ): void
    {
        const button = this.phaseStateActionButton;
        if (!button) {
            return;
        }

        const panelBounds = this.phaseHudController.getPanelBounds();
        if (!panelBounds) {
            button.body.setVisible(false);
            button.label.setVisible(false);
            button.action = null;
            return;
        }

        if (!buttonText) {
            button.body.setVisible(false);
            button.label.setVisible(false);
            button.action = null;
            return;
        }

        const xPadding = Math.max(10, Math.round(10 * UI_SCALE));
        const yPadding = Math.max(8, Math.round(8 * UI_SCALE));
        const minWidth = Math.max(120, Math.round(120 * UI_SCALE));
        const maxWidth = Math.max(minWidth, Math.round(panelBounds.width));
        const textPreferred = Math.max(
            GAME_STATUS_TEXT_LAYOUT.phaseStateActionFontSizeMin,
            Math.round(GAME_STATUS_TEXT_LAYOUT.phaseStateActionFitFontSizeBase * UI_SCALE)
        );
        const textMin = Math.max(
            GAME_STATUS_TEXT_LAYOUT.phaseStateActionFitFontSizeMin,
            Math.round(textPreferred * 0.72)
        );
        const maxTextWidth = Math.max(24, maxWidth - (xPadding * 2));
        const fittedSize = fitTextToSingleLine({
            scene: this,
            text: buttonText,
            preferredSize: textPreferred,
            minSize: textMin,
            maxWidth: maxTextWidth
        });

        button.label.setFontSize(fittedSize);
        button.label.setText(buttonText);

        const width = Math.max(minWidth, Math.min(maxWidth, button.label.width + (xPadding * 2)));
        const height = Math.max(28, Math.round(button.label.height + (yPadding * 2)));
        const x = panelBounds.right;
        const y = panelBounds.bottom + Math.max(8, Math.round(8 * UI_SCALE));

        button.body
            .setPosition(x, y)
            .setSize(width, height)
            .setVisible(true);

        // Keep interactive hit area in sync with dynamic button sizing.
        button.body.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
        const phaseActionInput = button.body.input as Phaser.Types.Input.InteractiveObject | undefined;
        if (phaseActionInput) {
            phaseActionInput.cursor = 'pointer';
        }

        button.label
            .setPosition(x - xPadding, y + yPadding)
            .setVisible(true);

        button.action = nextAction;
    }

    private applyInitStatePacket (body: Record<string, unknown>): void
    {
        const stageRaw = body.stage;
        const stage: InitStage = stageRaw === 'live' ? 'live' : 'init';
        const previousStage = this.pregameInitStage;
        this.pregameInitStage = stage;

        const selfReady = body.self_ready === true;
        const opponentReady = body.opponent_ready === true;
        this.initSetupConfirmed = selfReady;
        this.opponentInitSetupConfirmed = opponentReady;

        if (stage === 'init') {
            this.stopInitStartCountdownAnimation();
            this.waitingForOpponent = false;
            this.setOpponentDisconnectedState(false);
            this.setInputAcknowledged(true);
            if (selfReady) {
                this.appendTerminalLine('Init setup submitted. Waiting for opponent...');
            }
            else {
                this.appendTerminalLine('Arrange your starting board, then click Done.');
            }
        }
        else if (previousStage === 'init') {
            this.appendTerminalLine('Both players finished setup. Starting game...');
            this.initStartCountdownAckGateActive = true;
            this.playInitStartCountdownAnimation();
        }

        this.applyCardVisibilityByView();
        this.refreshSurrenderButton();
        this.refreshPhaseHud();
    }

    private submitInitSetupDone (): void
    {
        if (!this.isPregameInitActive()) {
            return;
        }

        if (this.activeViewMode !== 'p1' && this.activeViewMode !== 'p2') {
            this.appendTerminalLine('Init setup is only available in player view.');
            return;
        }

        const owner = this.activeViewMode;
        const activeHolder = this.cardHolderById[`${owner}-active`];
        const benchHolder = this.cardHolderById[`${owner}-bench`];
        if (!activeHolder || !benchHolder) {
            this.appendTerminalLine('Could not resolve your board zones for init setup.');
            return;
        }

        const activeCharacters = activeHolder.cards.filter((card) => card.getCardType() === 'character');
        if (activeCharacters.length !== 1) {
            this.appendTerminalLine('Init setup requires exactly 1 active character.');
            return;
        }

        const benchCharacterIds = benchHolder.cards
            .filter((card) => card.getCardType() === 'character')
            .map((card) => card.id);

        if (benchCharacterIds.length > MAX_BENCH_CARDS) {
            this.appendTerminalLine(`Init setup allows up to ${MAX_BENCH_CARDS} bench characters.`);
            return;
        }

        this.appendTerminalLine('Submitting init setup...');
        this.setInputAcknowledged(false);

        this.enqueueProtocolPacket('init_setup_done', {
            active_card_id: activeCharacters[0].id,
            bench_card_ids: benchCharacterIds,
        });
    }

    public isPregameInitActive (): boolean
    {
        return this.pregameInitStage === 'init';
    }

    public isInitWaitingForOpponent (): boolean
    {
        return this.isPregameInitActive() && this.initSetupConfirmed && !this.opponentInitSetupConfirmed;
    }

    public onPregameInitLocalMove (): void
    {
        if (!this.isPregameInitActive()) {
            return;
        }
        this.refreshPhaseStateActionButton();
    }

    private applyBackendPlayerSetup (setup: BackendEntitiesSetup): void
    {
        const players = setup.players;
        if (!players) {
            return;
        }

        const applyPlayer = (playerId: PlayerId): void => {
            const payload = players[playerId];
            if (!payload) {
                return;
            }

            if (typeof payload.username === 'string' && payload.username.trim().length > 0) {
                this.playerSetupProfileById[playerId].username = payload.username.trim();
            }

            if (payload.attributes && typeof payload.attributes === 'object') {
                const defaults = this.createDefaultPlayerTurnAttributes();
                const merged: PlayerTurnAttributes = {
                    ...defaults,
                    ...this.playerTurnAttributesByPlayer[playerId]
                };

                const keys = Object.keys(defaults) as PlayerTurnAttributeKey[];
                for (const key of keys) {
                    const rawValue = payload.attributes[key];
                    if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
                        continue;
                    }
                    merged[key] = rawValue;
                }

                this.playerTurnAttributesByPlayer[playerId] = merged;
                this.playerSetupProfileById[playerId].attributes = {
                    ...this.playerSetupProfileById[playerId].attributes,
                    ...payload.attributes
                };
            }
        };

        applyPlayer('p1');
        applyPlayer('p2');
    }

    private getPlayerUsername (playerId: PlayerId): string
    {
        return this.playerSetupProfileById[playerId]?.username ?? this.getPlayerTurnLabel(playerId);
    }

    private normalizeCardActionLabel (rawName: string | null, fallback: string): string
    {
        if (typeof rawName !== 'string') {
            return fallback;
        }

        const normalized = rawName
            .trim()
            .replace(/_+/g, ' ')
            .replace(/\s+/g, ' ');

        return normalized.length > 0 ? normalized : fallback;
    }

    private getCardActionButtonLabel (card: Card, actionKey: CardActionKey): string
    {
        if (actionKey === 'atk1') {
            return this.normalizeCardActionLabel(card.getAttackOneName(), 'ATK1');
        }

        if (actionKey === 'atk2') {
            return this.normalizeCardActionLabel(card.getAttackTwoName(), 'ATK2');
        }

        return this.normalizeCardActionLabel(card.getActiveAbilityName(), 'ACTIVE');
    }

    private handleCardActionButtonClick (actionKey: CardActionKey): void
    {
        if (!this.boardInputEnabled) {
            return;
        }

        if (this.isInitWaitingForOpponent()) {
            return;
        }

        const card = this.cardActionSourceByKey[actionKey] ?? this.selectedCard;
        if (!card) {
            return;
        }

        const actionName = actionKey === 'active' ? 'activate-ability' : actionKey;
        const message = `${card.id} ${actionName}`;

        this.appendTerminalLine(message);
        this.emitBackendEvent('card_action', {
            action: actionName,
            card_id: card.id,
            card_type: card.getCardType(),
            owner_id: card.getOwnerId(),
            zone_id: card.getZoneId(),
            message
        });
    }

    private getCurrentTurnActiveCharacterCard (): Card | null
    {
        const activeHolder = this.cardHolderById[`${this.playerTurn}-active`];
        if (!activeHolder) {
            return null;
        }

        for (const holderCard of activeHolder.cards) {
            if (holderCard.getCardType() === 'character') {
                return holderCard;
            }
        }

        return null;
    }

    private refreshCardActionButtons (): void
    {
        if (!this.cardActionButtons || this.cardActionButtons.length === 0) {
            return;
        }

        this.cardActionSourceByKey = { atk1: null, atk2: null, active: null };

        if (!this.boardInputEnabled) {
            for (const button of this.cardActionButtons) {
                button.body.setVisible(false);
                button.label.setVisible(false);
                button.body.setScale(1);
                button.label.setScale(1);
            }
            return;
        }

        if (this.isInitWaitingForOpponent()) {
            for (const button of this.cardActionButtons) {
                button.body.setVisible(false);
                button.label.setVisible(false);
                button.body.setScale(1);
                button.label.setScale(1);
            }
            return;
        }

        if (this.activeViewMode === 'spectator') {
            for (const button of this.cardActionButtons) {
                button.body.setVisible(false);
                button.label.setVisible(false);
                button.body.setScale(1);
                button.label.setScale(1);
            }
            return;
        }

        if (this.overlayPreviewContext) {
            for (const button of this.cardActionButtons) {
                button.body.setVisible(false);
                button.label.setVisible(false);
                button.body.setScale(1);
                button.label.setScale(1);
            }
            return;
        }

        const selectedCard = this.selectedCard;
        const selectedIsActiveSlot = Boolean(selectedCard && selectedCard.getZoneId() === `${selectedCard.getOwnerId()}-active`);
        const currentTurnActiveCard = this.getCurrentTurnActiveCharacterCard();
        const attackCard = selectedCard && selectedIsActiveSlot
            ? selectedCard
            : (this.gamePhase === 'atk' ? currentTurnActiveCard : null);
        const canControlTurnActions = this.activeViewMode === this.playerTurn;

        const abilityCard = selectedCard;
        const abilityIsEligibleZone = abilityCard
            ? (abilityCard.getZoneId() === `${this.activeViewMode}-deck` || abilityCard.getZoneId() === `${this.activeViewMode}-active`)
            : false;
        const canUseAbilityCardActions = Boolean(abilityCard && abilityCard.getOwnerId() === this.activeViewMode);
        const showAtk1 = Boolean(attackCard && this.gamePhase === 'atk' && canControlTurnActions && attackCard.getCardType() === 'character' && attackCard.getOwnerId() === this.playerTurn && attackCard.hasAttackOne());
        const showAtk2 = Boolean(attackCard && this.gamePhase === 'atk' && canControlTurnActions && attackCard.getCardType() === 'character' && attackCard.getOwnerId() === this.playerTurn && attackCard.hasAttackTwo());
        const showActive = Boolean(!this.isPregameInitActive() && abilityCard && canUseAbilityCardActions && abilityCard.getCardType() === 'character' && abilityIsEligibleZone && abilityCard.hasActiveAbility());

        const radius = Math.max(12, Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonRadiusBase / BASE_WIDTH) * GAME_WIDTH));
        const leftMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.leftMarginBase / BASE_WIDTH) * GAME_WIDTH);
        const bottomMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.bottomMarginBase / BASE_HEIGHT) * GAME_HEIGHT);
        const gap = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonGapBase / BASE_WIDTH) * GAME_WIDTH);
        const diameter = radius * 2;
        const labelPreferredSize = Math.max(10, Math.round(GAME_CARD_ACTION_BUTTON_LAYOUT.fontSize * UI_SCALE));
        const labelMinSize = Math.max(7, Math.round(labelPreferredSize * 0.55));
        const labelMaxWidth = Math.max(24, diameter - Math.max(8, Math.round(8 * UI_SCALE)));
        const defaultAnchorX = leftMargin + radius;
        const defaultAnchorY = GAME_HEIGHT - bottomMargin - radius;

        const clampButtonPosition = (x: number, y: number): { x: number; y: number } => {
            return {
                x: Phaser.Math.Clamp(Math.round(x), radius + 2, GAME_WIDTH - radius - 2),
                y: Phaser.Math.Clamp(Math.round(y), radius + 2, GAME_HEIGHT - radius - 2),
            };
        };

        const buttonByKey = new Map<CardActionKey, { key: CardActionKey; body: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }>();

        for (const button of this.cardActionButtons) {
            const visible =
                (button.key === 'atk1' && showAtk1) ||
                (button.key === 'atk2' && showAtk2) ||
                (button.key === 'active' && showActive);

            const labelSourceCard = button.key === 'active' ? abilityCard : attackCard;
            if (visible && labelSourceCard) {
                const fittedLabel = fitTextToTwoLines({
                    scene: this,
                    text: this.getCardActionButtonLabel(labelSourceCard, button.key),
                    preferredSize: labelPreferredSize,
                    minSize: labelMinSize,
                    maxWidth: labelMaxWidth,
                });
                button.label.setText(fittedLabel.text);
                button.label.setFontSize(fittedLabel.fontSize);
            }

            button.body.setScale(1);
            button.label.setScale(1);
            button.body.setVisible(visible);
            button.label.setVisible(visible);

            if (visible) {
                if (button.key === 'active') {
                    this.cardActionSourceByKey.active = abilityCard;
                }
                else {
                    this.cardActionSourceByKey[button.key] = attackCard;
                }
            }

            buttonByKey.set(button.key, button);
        }

        const setButtonPosition = (buttonKey: CardActionKey, x: number, y: number): void => {
            const button = buttonByKey.get(buttonKey);
            if (!button || !button.body.visible) {
                return;
            }

            const clamped = clampButtonPosition(x, y);
            button.body.setPosition(clamped.x, clamped.y);
            button.label.setPosition(clamped.x, clamped.y);
        };

        if (attackCard && (showAtk1 || showAtk2)) {
            const bounds = attackCard.getBounds();
            const lateralOffset = Math.round((bounds.width * 0.5) + radius + Math.max(gap, Math.round(8 * UI_SCALE)));
            const anchorY = attackCard.y;
            setButtonPosition('atk1', attackCard.x - lateralOffset, anchorY);
            setButtonPosition('atk2', attackCard.x + lateralOffset, anchorY);
        }

        if (showActive) {
            const surrenderMetrics = this.surrenderController.getButtonMetrics();
            if (surrenderMetrics && surrenderMetrics.visible) {
                setButtonPosition('active', surrenderMetrics.x, surrenderMetrics.y - (diameter + gap));
            }
            else {
                setButtonPosition('active', defaultAnchorX, defaultAnchorY);
            }
        }
    }

    private showCardPreview (card: Card, options?: { forceFaceUp?: boolean }): void
    {
        this.cardPreviewController.show(card, {
            ownerUsername: this.getPlayerUsername(card.getOwnerId()),
            forceFaceUp: options?.forceFaceUp === true,
        });
        this.refreshCardActionButtons();
    }

    private hideCardPreview (): void
    {
        this.cardPreviewController.hide();
        this.refreshCardActionButtons();
    }

    private appendTerminalLine (line: string): void
    {
        console.info(`[Command] ${line}`);

        // While replaying backend scanner commands, avoid echoing every corrected
        // local line back to backend. A single ACK is emitted per processed update.
        if (this.scannerCommandInProgress) {
            return;
        }

        this.emitBackendEvent('terminal_log', {
            line
        });
    }

    public scrollTerminalToLatest (): void
    {
        // Frontend terminal was removed; keep method for command processor compatibility.
    }

    private emitBackendEvent (eventType: string, responseData: Record<string, unknown>): void
    {
        const phaseNavigationEvent = eventType === 'phase2_attack_button_clicked' || eventType === 'atk_skip_button_clicked';
        const immediateInputEvent = eventType === 'input_result' || eventType === 'input_state_change' || eventType === 'notify' || eventType === 'reveal';
        const isAckEvent = eventType === 'terminal_log' && String(responseData.line ?? '').trim().toLowerCase() === 'ack backend_update_processed';
        const eventSequence = this.backendEventSequence + 1;
        this.backendEventSequence = eventSequence;

        // Avoid echo loops: when a scanner command from backend mutates frontend state,
        // do not send those resulting events back to backend.
        if (this.scannerCommandInProgress && eventType !== 'terminal_log') {
            if (isAckEvent) {
                console.info('[ACK_TRACE][Game] scanner_replay_ack_allowed', {
                    seq: eventSequence,
                    command: responseData.command ?? null
                });
            }
            return;
        }

        const context = {
            scene: 'Game',
            view_mode: this.activeViewMode,
            game_phase: this.gamePhase,
            player_turn: this.playerTurn
        };

        if (isAckEvent) {
            // ACK packets should usually be emitted immediately, but they must
            // wait for in-flight scene animations (for example HP pulse/hurt
            // effects). Otherwise backend can advance to the next command
            // before both clients finish visualizing the current one.
            if (this.commandExecutionInProgress || this.isInteractionLockedByAnimation() || this.initStartCountdownAckGateActive) {
                this.pendingBackendEvents.push({
                    eventType,
                    responseData,
                    context
                });
                return;
            }

            this.dispatchFrontendEvent(eventType, responseData, context);
            return;
        }

        if (eventType === 'terminal_log' && this.commandExecutionInProgress) {
            this.pendingBackendEvents.push({
                eventType,
                responseData,
                context
            });
            return;
        }

        if (!phaseNavigationEvent && !immediateInputEvent && this.isInteractionLockedByAnimation()) {
            this.pendingBackendEvents.push({
                eventType,
                responseData,
                context
            });
            return;
        }

        this.dispatchFrontendEvent(eventType, responseData, context);
    }

    private dispatchFrontendEvent (
        eventType: string,
        responseData: Record<string, unknown>,
        context: Record<string, unknown>
    ): void
    {
        const isAckEvent = eventType === 'terminal_log' && String(responseData.line ?? '').trim().toLowerCase() === 'ack backend_update_processed';
        if (eventType === 'terminal_log' && !isAckEvent) {
            return;
        }

        if (eventType === 'input_result' && this.pendingInputCommand) {
            this.setInputAcknowledged(false);
            this.enqueueProtocolPacket('update_frontend', {
                command: this.pendingInputCommand,
                input_response: responseData,
                context,
            });
            this.pendingInputCommand = null;
            this.drainQueuedNotifyCommands();
            return;
        }

        if (eventType === 'notify') {
            const notifyCommand =
                (typeof responseData.command === 'string' && responseData.command.trim().length > 0 ? responseData.command : null)
                ?? this.pendingNotifyCommand;

            if (!notifyCommand) {
                return;
            }

            this.awaitingRemoteNotifyAck = false;
            this.setInputAcknowledged(false);
            this.enqueueProtocolPacket('update_frontend', {
                command: notifyCommand,
                notify_response: responseData,
                context,
            });
            this.pendingNotifyCommand = null;
            this.drainQueuedNotifyCommands();
            return;
        }

        if (eventType === 'reveal') {
            const revealCommand =
                (typeof responseData.command === 'string' && responseData.command.trim().length > 0 ? responseData.command : null)
                ?? this.pendingNotifyCommand;

            if (revealCommand) {
                this.awaitingRemoteNotifyAck = false;
                this.setInputAcknowledged(false);
                this.enqueueProtocolPacket('update_frontend', {
                    command: revealCommand,
                    notify_response: responseData,
                    context,
                });
                this.pendingNotifyCommand = null;
                this.drainQueuedNotifyCommands();
                return;
            }
        }

        if (isAckEvent) {
            this.enqueueProtocolPacket('update_frontend', {
                command: responseData.command,
                apply_error: responseData.apply_error ?? null,
                context,
            });
            return;
        }

        if (this.pendingNotifyCommand) {
            // Hold non-notify frontend events while waiting for notify
            // dismissal ACK to avoid starving notify response delivery.
            return;
        }

        this.setInputAcknowledged(false);
        this.enqueueProtocolPacket('frontend_event', {
            event_type: eventType,
            response_data: responseData,
            context,
        });
    }

    public clearOverlayPreviewIfActive (): void
    {
        if (!this.overlayPreviewContext) {
            return;
        }

        this.overlayPreviewContext = null;
        this.hideCardPreview();
    }

    public resetDraggingCards (ownerId?: PlayerId): number
    {
        let resetCount = 0;
        const draggingCardIds = Array.from(this.activelyDraggedCardIds);

        for (const cardId of draggingCardIds) {
            const card = this.cardById[cardId];
            if (!card) {
                this.activelyDraggedCardIds.delete(cardId);
                this.dragOriginZoneByCardId.delete(cardId);
                this.dragStartPositionByCardId.delete(cardId);
                this.dragDistanceByCardId.delete(cardId);
                continue;
            }

            if (ownerId && card.getOwnerId() !== ownerId) {
                continue;
            }

            this.activelyDraggedCardIds.delete(cardId);
            this.dragOriginZoneByCardId.delete(cardId);
            this.dragStartPositionByCardId.delete(cardId);
            this.dragDistanceByCardId.delete(cardId);
            resetCount += 1;
        }

        if (resetCount > 0) {
            this.layoutAllHolders();
            this.redrawAllCardMarks();
        }

        return resetCount;
    }

    public getCardFromGameObject (gameObject: Phaser.GameObjects.Rectangle): Card | undefined
    {
        return this.cardByBody.get(gameObject);
    }

    private selectCard (card: Card): void
    {
        if (this.selectedCard === card) {
            this.selectedCard.setDepth(GAME_DEPTHS.cardSelected);
            this.selectedCard.redrawMarks();
            this.showCardPreview(this.selectedCard);
            return;
        }

        if (this.selectedCard) {
            const previouslySelectedCard = this.selectedCard;
            this.selectedCard.setSelected(false);
            this.scheduleAttachmentResync(previouslySelectedCard);
        }

        // Restore baseline holder depths before applying the temporary selection depth.
        this.layoutAllHolders();

        this.selectedCard = card;
        this.selectedCard.setSelected(true);
        this.selectedCard.setDepth(GAME_DEPTHS.cardSelected);
        this.selectedCard.redrawMarks();
        this.showCardPreview(this.selectedCard);
        this.scheduleAttachmentResync(this.selectedCard);
    }

    private clearCardSelection (): void
    {
        if (!this.selectedCard) {
            return;
        }

        const deselectedCard = this.selectedCard;
        this.selectedCard.setSelected(false);
        this.selectedCard = null;
        this.hideCardPreview();

        // Return all cards to their normal holder-controlled depths.
        this.layoutAllHolders();
        this.redrawAllCardMarks();
        this.scheduleAttachmentResync(deselectedCard);
    }

    private scheduleAttachmentResync (card: Card): void
    {
        // Selection animation runs for ~140ms, so keep attached entities synced through the tween.
        this.time.addEvent({
            delay: GAME_LAYOUT.selectionResyncDelayMs,
            repeat: GAME_LAYOUT.selectionResyncRepeats,
            callback: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawCardAndAttachments(card);
            }
        });
    }

    private layoutAllHolders (): void
    {
        const preferredHorizontalStep = this.objectWidth + Math.round((GAME_LAYOUT.holderExtraHorizontalStepBase / BASE_WIDTH) * GAME_WIDTH);

        for (const holder of this.cardHolders) {
            if (holder.id === 'stadium') {
                continue;
            }

            holder.layoutHorizontal(this.objectWidth, preferredHorizontalStep, (card) => {
                this.updateAttachedChildrenPositions(card);
            });
        }

        this.layoutStadiumStack();
        this.layoutEnergyTokensInZone(this.energyZoneIdByOwner.p1);
        this.applyCardVisibilityByView();
    }

    private applyBoardView (viewMode: ViewMode): void
    {
        this.activeViewMode = viewMode;
        this.surrenderController.disarm(false);
        const mirrorTopBottom = viewMode === 'p2';

        for (const holder of this.cardHolders) {
            const basePosition = this.baseCardHolderPositionById[holder.id];
            if (!basePosition) {
                continue;
            }

            const { x, y } = this.transformBoardPositionForView(basePosition.x, basePosition.y, mirrorTopBottom);
            holder.setPosition(x, y);
        }

        for (const holder of this.energyHolders) {
            const basePosition = this.baseEnergyHolderPositionById[holder.id];
            if (!basePosition) {
                continue;
            }

            const { x, y } = this.transformBoardPositionForView(basePosition.x, basePosition.y, mirrorTopBottom);
            holder.setPosition(x, y);
        }

        this.layoutAllHolders();
        this.redrawAllCardMarks();
        this.updateZoneLabelsForView();
        this.applyZoneVisibilityByView();
        this.refreshSurrenderButton();
        this.refreshPlayerStatsHud();
        this.refreshPhaseHud();
    }

    private transformBoardPositionForView (x: number, y: number, mirrorTopBottom: boolean): { x: number; y: number }
    {
        if (!mirrorTopBottom) {
            return { x, y };
        }

        // Mirror only top/bottom so left/right semantics stay stable for both players.
        return {
            x,
            y: ((GAME_CENTER_Y * 2) - y),
        };
    }

    private isZoneVisibleInSpectator (zoneId: string): boolean
    {
        return zoneId === 'stadium'
            || zoneId === 'p1-bench'
            || zoneId === 'p1-active'
            || zoneId === 'p2-bench'
            || zoneId === 'p2-active';
    }

    private applyZoneVisibilityByView (): void
    {
        const spectatorView = this.activeViewMode === 'spectator';

        for (const holder of this.cardHolders) {
            const visible = spectatorView ? this.isZoneVisibleInSpectator(holder.id) : true;
            holder.background.setVisible(visible);
            holder.labelText.setVisible(visible);
        }

        for (const holder of this.energyHolders) {
            const visible = spectatorView ? this.isZoneVisibleInSpectator(holder.id) : true;
            holder.background.setVisible(visible);
            holder.labelText.setVisible(visible);
            if (!visible) {
                holder.hidePileCountDisplays();
            }
        }

        for (const token of this.energyTokens) {
            const visible = spectatorView ? this.isZoneVisibleInSpectator(token.getZoneId()) : true;
            token.body.setVisible(visible);
        }
    }

    public isZoneVisibleToView (zoneId: string, ownerId: PlayerId, viewMode: ViewMode = this.activeViewMode): boolean
    {
        if (viewMode === 'spectator') {
            return this.isZoneVisibleInSpectator(zoneId);
        }

        if (this.isPregameInitActive()) {
            const isOwnerView = ownerId === viewMode;
            const isHand = zoneId === `${ownerId}-hand`;
            const isBench = zoneId === `${ownerId}-bench`;
            const isActive = zoneId === `${ownerId}-active`;
            const isStadium = zoneId === 'stadium';
            return isStadium || (isOwnerView && (isHand || isBench || isActive));
        }

        const isOwnerView = ownerId === viewMode;
        const isHand = zoneId === `${ownerId}-hand`;
        const isBench = zoneId === `${ownerId}-bench`;
        const isActive = zoneId === `${ownerId}-active`;
        const isStadium = zoneId === 'stadium';

        return isStadium ||
            (isOwnerView && (isHand || isBench || isActive)) ||
            (!isOwnerView && (isBench || isActive));
    }

    private applyCardVisibilityByView (): void
    {
        for (const card of this.cards) {
            const zoneId = card.getZoneId();
            const cardOwner = card.getOwnerId();
            const zoneVisible = this.isZoneVisibleToView(zoneId, cardOwner);

            if (this.activeViewMode === 'spectator') {
                card.setVisibility(zoneVisible);
                continue;
            }

            card.setVisibility(true);
            card.setTurnedOver(!zoneVisible);
        }
    }

    public canActOnCard (card: Card): boolean
    {
        if (this.scannerCommandInProgress) {
            return true;
        }

        if (!this.boardInputEnabled) {
            return false;
        }

        if (this.activeViewMode === 'spectator') {
            return false;
        }

        if (card.isTurnedOver()) {
            return false;
        }

        if (this.isInitWaitingForOpponent()) {
            return false;
        }

        return card.getOwnerId() === this.activeViewMode;
    }

    private canPreviewCard (card: Card): boolean
    {
        if (card.isTurnedOver()) {
            return false;
        }

        return true;
    }

    public canDragCardByPhase (card: Card): boolean
    {
        if (this.isInitWaitingForOpponent()) {
            return false;
        }

        if (this.isPregameInitActive()) {
            if (this.activeViewMode !== 'p1' && this.activeViewMode !== 'p2') {
                return false;
            }

            if (card.getOwnerId() !== this.activeViewMode) {
                return false;
            }

            if (card.getCardType() !== 'character') {
                return false;
            }

            const zoneId = card.getZoneId();
            return zoneId === `${this.activeViewMode}-hand`
                || zoneId === `${this.activeViewMode}-bench`;
        }

        if (this.gamePhase !== 'phase2') {
            return false;
        }

        if (card.getZoneId().endsWith('-active')) {
            return false;
        }

        return card.getOwnerId() === this.playerTurn;
    }

    public canActOnToken (token: EnergyToken): boolean
    {
        if (this.scannerCommandInProgress) {
            return true;
        }

        if (!this.boardInputEnabled) {
            return false;
        }

        if (this.activeViewMode === 'spectator') {
            return false;
        }

        if (this.isInitWaitingForOpponent()) {
            return false;
        }

        const attachedToCardId = token.getAttachedToCardId();
        if (attachedToCardId) {
            const attachedCard = this.cardById[attachedToCardId];
            if (!attachedCard) {
                return false;
            }

            if (attachedCard.getOwnerId() !== this.activeViewMode) {
                return false;
            }
        }

        return this.activeViewMode === 'p1' || this.activeViewMode === 'p2';
    }

    public canDragTokenByPhase (token: EnergyToken): boolean
    {
        if (this.isInitWaitingForOpponent()) {
            return false;
        }

        if (this.isPregameInitActive()) {
            return false;
        }

        if (this.gamePhase !== 'phase2') {
            return false;
        }

        if (this.activeViewMode !== this.playerTurn) {
            return false;
        }

        const sharedEnergyZoneId = this.energyZoneIdByOwner.p1;
        return token.getZoneId() === sharedEnergyZoneId || token.getZoneId() === 'energy-discard';
    }

    public parseGamePhaseArg (rawPhase: string): GamePhase | null
    {
        const normalized = rawPhase.toLowerCase();
        if (normalized === 'no-input') {
            return 'no-input';
        }

        if (normalized === 'phase2') {
            return 'phase2';
        }

        if (normalized === 'atk') {
            return 'atk';
        }

        return null;
    }

    public parsePlayerTurnArg (rawTurn: string): PlayerId | null
    {
        const normalized = rawTurn.toLowerCase();
        if (normalized === 'p1' || normalized === 'player-1' || normalized === 'player1') {
            return 'p1';
        }

        if (normalized === 'p2' || normalized === 'player-2' || normalized === 'player2') {
            return 'p2';
        }

        return null;
    }

    public getPlayerTurnLabel (playerTurn: PlayerId): string
    {
        return playerTurn === 'p1' ? 'PLAYER 1' : 'PLAYER 2';
    }

    public setGamePhase (nextPhase: GamePhase): void
    {
        this.gamePhase = nextPhase;
        this.refreshCardActionButtons();
        this.refreshPhaseHud();

        if (nextPhase !== 'phase2') {
            this.activelyDraggedCardIds.clear();
            this.dragOriginZoneByCardId.clear();
            this.dragStartPositionByCardId.clear();
            this.dragDistanceByCardId.clear();
            this.activelyDraggedEnergyTokenIds.clear();
            this.energyDragStartPositionById.clear();
            this.energyDragDistanceById.clear();
        }
    }

    public setPlayerTurn (nextTurn: PlayerId): void
    {
        this.playerTurn = nextTurn;
        this.refreshPhaseHud();
    }

    public parseViewModeArg (rawMode: string): ViewMode | null
    {
        if (rawMode === 'spectator' || rawMode === 'spec') {
            return 'spectator';
        }

        if (rawMode === 'p1' || rawMode === 'player-1' || rawMode === 'player1') {
            return 'p1';
        }

        if (rawMode === 'p2' || rawMode === 'player-2' || rawMode === 'player2') {
            return 'p2';
        }

        return null;
    }

    public parseCardTypeArg (rawType: string): 'character' | 'tool' | 'item' | 'stadium' | 'supporter' | null
    {
        const normalized = rawType.toLowerCase();
        if (normalized === 'character' || normalized === 'tool' || normalized === 'item' || normalized === 'stadium' || normalized === 'supporter') {
            return normalized;
        }

        return null;
    }

    public createEnergyTokenFromCommand (options: {
        id: string;
        ownerId: string;
        holderId: string;
        radius: number;
        attachedToCardId: string | null;
        deferLayout?: boolean;
    }): { ok: boolean; error?: string; token?: EnergyToken }
    {
        if (this.energyTokenById[options.id]) {
            return { ok: false, error: `Energy token already exists: ${options.id}` };
        }

        const holder = this.energyHolderById[options.holderId];
        if (!holder) {
            return { ok: false, error: `Unknown energy holder: ${options.holderId}` };
        }

        const parent = options.attachedToCardId ? this.cardById[options.attachedToCardId] : null;
        if (options.attachedToCardId && !parent) {
            return { ok: false, error: `Unknown card: ${options.attachedToCardId}` };
        }

        if (parent && parent.getCardType() !== 'character') {
            return { ok: false, error: `Energy can only attach to character cards: ${parent.id}` };
        }

        const sharedEnergyZoneId = this.energyZoneIdByOwner.p1;
        const isSharedEnergyAlias = options.holderId === sharedEnergyZoneId || options.holderId === 'energy-discard';
        if (parent && !isSharedEnergyAlias) {
            return { ok: false, error: `Attached energy must be created in ${sharedEnergyZoneId}.` };
        }

        const token = new EnergyToken(this, {
            id: options.id,
            ownerId: options.ownerId,
            x: holder.x,
            y: holder.y,
            radius: options.radius,
            zoneId: options.holderId
        });

        this.energyTokens.push(token);
        this.energyTokenById[options.id] = token;
        this.energyTokenByBody.set(token.body, token);
        this.input.setDraggable(token.body);
        holder.addToken(token);

        if (parent) {
            this.attachEnergyTokenToCard(token, parent);
        }

        if (options.deferLayout !== true) {
            this.layoutEnergyTokensInZone(options.holderId);
        }
        return { ok: true, token };
    }

    public createCardFromCommand (options: {
        id: string;
        ownerId: PlayerId;
        cardType: 'character' | 'tool' | 'item' | 'stadium' | 'supporter';
        holderId: string;
        color: number;
        AVGECardType: string;
        AVGECardClass: string;
        hasAtk1: boolean;
        hasActive: boolean;
        hasPassive?: boolean;
        hasAtk2: boolean;
        atk1Name?: string | null;
        activeName?: string | null;
        atk2Name?: string | null;
        atk1Cost?: number;
        atk2Cost?: number;
        retreatCost?: number;
        hp: number;
        maxHp: number;
        statusEffect: Record<string, number>;
        width: number;
        height: number;
        flipped: boolean;
        attachedToCardId: string | null;
        deferLayoutAndRedraw?: boolean;
    }): { ok: boolean; error?: string; card?: Card }
    {
        if (this.cardById[options.id]) {
            return { ok: false, error: `Card already exists: ${options.id}` };
        }

        const holder = this.cardHolderById[options.holderId];
        if (!holder) {
            return { ok: false, error: `Unknown card holder: ${options.holderId}` };
        }

        if (options.cardType !== 'tool' && options.attachedToCardId) {
            return { ok: false, error: 'Only tool cards can be created attached to another card.' };
        }

        const parentCard = options.attachedToCardId ? this.cardById[options.attachedToCardId] : null;
        if (options.attachedToCardId && !parentCard) {
            return { ok: false, error: `Unknown attached card: ${options.attachedToCardId}` };
        }

        if (parentCard && parentCard.getCardType() !== 'character' && parentCard.getCardType() !== 'tool') {
            return { ok: false, error: `Tool attachment target must be character or tool: ${parentCard.id}` };
        }

        if (parentCard && parentCard.getOwnerId() !== options.ownerId) {
            return { ok: false, error: 'Attached tool owner must match target card owner.' };
        }

        if (parentCard && this.getAttachedChildren(parentCard.id).length > 0) {
            return { ok: false, error: `Tool attachment target already has a tool attached: ${parentCard.id}` };
        }

        const card = new Card(this, {
            id: options.id,
            cardType: options.cardType,
            ownerId: options.ownerId,
            x: holder.x,
            y: holder.y,
            width: options.width,
            height: options.height,
            color: options.color,
            AVGECardType: options.AVGECardType,
            AVGECardClass: options.AVGECardClass,
            statusEffect: options.statusEffect,
            zoneId: options.holderId,
            has_atk_1: options.hasAtk1,
            has_active: options.hasActive,
            has_passive: options.hasPassive,
            retreat_cost: options.retreatCost,
            has_atk_2: options.hasAtk2,
            atk_1_name: options.atk1Name,
            active_name: options.activeName,
            atk_2_name: options.atk2Name,
            atk_1_cost: options.atk1Cost,
            atk_2_cost: options.atk2Cost,
        });

        this.cards.push(card);
        this.cardById[card.id] = card;
        this.cardByBody.set(card.body, card);
        holder.addCard(card);
        this.input.setDraggable(card.body);

        card.body.on('pointerdown', () => {
            if (!this.canPreviewCard(card)) {
                return;
            }

            this.selectCard(card);
        });

        if (options.cardType === 'character') {
            card.setHpValues(options.hp, options.maxHp);
        }

        if (options.flipped) {
            card.setTurnedOver(true);
        }

        if (parentCard) {
            this.removeCardFromAllHolders(card);
            card.setZoneId(parentCard.getZoneId());
            this.attachCardToCard(card, parentCard);
        }

        if (options.deferLayoutAndRedraw !== true) {
            this.layoutAllHolders();
            this.redrawAllCardMarks();
        }

        return { ok: true, card };
    }

    private getViewModeLabel (viewMode: ViewMode): string
    {
        if (viewMode === 'spectator') {
            return 'SPECTATOR';
        }

        return this.getPlayerUsername(viewMode);
    }

    private updateZoneLabelsForView (): void
    {
        const parseOwnedZone = (zoneId: string): { ownerId: PlayerId; pileName: string } | null => {
            const match = /^(p1|p2)-([a-z]+)$/.exec(zoneId);
            if (!match) {
                return null;
            }
            const ownerId = match[1] as PlayerId;
            const pileName = match[2];
            return { ownerId, pileName };
        };

        const resolvePerspectiveLabel = (ownerId: PlayerId, pileName: string): string => {
            if (this.activeViewMode === 'spectator') {
                return `${ownerId} ${pileName}`.toUpperCase();
            }

            const perspective = ownerId === this.activeViewMode ? 'your' : 'opponent';
            return `${perspective} ${pileName}`.toUpperCase();
        };

        const setCardHolderLabel = (holder: CardHolder, label: string): void => {
            const preferredSize = Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(ENTITY_VISUALS.cardHolderLabelBaseSize * UI_SCALE));
            const fitted = fitTextToTwoLines({
                scene: this,
                text: label,
                preferredSize,
                minSize: Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(preferredSize * 0.72)),
                maxWidth: Math.max(10, Math.round(holder.width * 0.9))
            });
            holder.labelText
                .setAlign('center')
                .setText(fitted.text)
                .setFontSize(fitted.fontSize);
        };

        const setEnergyHolderLabel = (holder: EnergyHolder, label: string): void => {
            const preferredSize = Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(ENTITY_VISUALS.energyHolderLabelBaseSize * UI_SCALE));
            const fitted = fitTextToTwoLines({
                scene: this,
                text: label,
                preferredSize,
                minSize: Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(preferredSize * 0.72)),
                maxWidth: Math.max(10, Math.round(holder.width * 0.9))
            });
            holder.labelText
                .setAlign('center')
                .setText(fitted.text)
                .setFontSize(fitted.fontSize);
        };

        for (const holder of this.cardHolders) {
            if (holder.id === 'stadium') {
                setCardHolderLabel(holder, 'STADIUM');
                continue;
            }

            const ownedZone = parseOwnedZone(holder.id);
            if (!ownedZone) {
                setCardHolderLabel(holder, holder.id.replace(/-/g, ' ').toUpperCase());
                continue;
            }

            setCardHolderLabel(holder, resolvePerspectiveLabel(ownedZone.ownerId, ownedZone.pileName));
        }

        for (const holder of this.energyHolders) {
            if (holder.id === 'energy-discard') {
                setEnergyHolderLabel(holder, 'ENERGY DISCARD');
                continue;
            }

            const ownedZone = parseOwnedZone(holder.id);
            if (!ownedZone) {
                setEnergyHolderLabel(holder, holder.id.replace(/-/g, ' ').toUpperCase());
                continue;
            }

            setEnergyHolderLabel(holder, resolvePerspectiveLabel(ownedZone.ownerId, ownedZone.pileName));
        }
    }

    private redrawAllCardMarks (): void
    {
        for (const card of this.cards) {
            card.redrawMarks();
        }

        if (this.selectedCard) {
            this.showCardPreview(this.selectedCard);
        }
    }

    public redrawCardAndAttachments (card: Card): void
    {
        const stack: Card[] = [card];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                continue;
            }

            if (visited.has(current.id)) {
                continue;
            }

            visited.add(current.id);
            current.redrawMarks();

            const attachedChildren = this.getAttachedChildren(current.id);
            for (const child of attachedChildren) {
                stack.push(child);
            }
        }

        if (this.selectedCard) {
            this.showCardPreview(this.selectedCard);
        }
    }

    public findOverlappedCard (
        card: Card,
        filter?: (otherCard: Card) => boolean
    ): Card | null
    {
        const droppedBounds = card.getBounds();
        const cardId = card.id;
        const attachedToCardId = card.getAttachedToCardId();
        let bestMatch: Card | null = null;
        let bestOverlapArea = -1;

        for (const otherCard of this.cards) {
            if (otherCard === card) {
                continue;
            }

            const otherCardId = otherCard.id;
            const otherAttachedToCardId = otherCard.getAttachedToCardId();

            // Ignore cards in the same direct attachment link (parent <-> child).
            if (otherAttachedToCardId === cardId || attachedToCardId === otherCardId) {
                continue;
            }

            if (filter && !filter(otherCard)) {
                continue;
            }

            const otherBounds = otherCard.getBounds();
            if (!Phaser.Geom.Intersects.RectangleToRectangle(droppedBounds, otherBounds)) {
                continue;
            }

            const overlapLeft = Math.max(droppedBounds.left, otherBounds.left);
            const overlapRight = Math.min(droppedBounds.right, otherBounds.right);
            const overlapTop = Math.max(droppedBounds.top, otherBounds.top);
            const overlapBottom = Math.min(droppedBounds.bottom, otherBounds.bottom);
            const overlapWidth = Math.max(0, overlapRight - overlapLeft);
            const overlapHeight = Math.max(0, overlapBottom - overlapTop);
            const overlapArea = overlapWidth * overlapHeight;

            if (overlapArea > bestOverlapArea) {
                bestOverlapArea = overlapArea;
                bestMatch = otherCard;
            }
        }

        return bestMatch;
    }

    public animateCardToZone (
        card: Card,
        zoneId: string,
        onComplete: () => void
    ): void
    {
        const holder = this.cardHolderById[zoneId];
        card.setDepth(GAME_DEPTHS.cardDragging);
        this.beginSceneAnimation();

        this.tweens.add({
            targets: card.body,
            x: holder.x,
            y: holder.y,
            duration: GAME_LAYOUT.cardMoveDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.endSceneAnimation();
                onComplete();
            }
        });
    }

    public animateCardBetweenPoints (
        card: Card,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        onComplete: () => void
    ): void
    {
        card.setPosition(fromX, fromY);
        card.setDepth(GAME_DEPTHS.cardDragging);
        this.beginSceneAnimation();

        this.tweens.add({
            targets: card.body,
            x: toX,
            y: toY,
            duration: GAME_LAYOUT.cardMoveDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.endSceneAnimation();
                onComplete();
            }
        });
    }

    public animateCardHpChange (
        card: Card,
        nextHp: number,
        nextMaxHp: number
    ): void
    {
        const previousHp = card.getHp();

        card.setHpValues(nextHp, nextMaxHp);
        this.redrawAllCardMarks();

        const hpDelta = nextHp - previousHp;
        if (hpDelta === 0) {
            return;
        }

        this.clearCardHpPulseAnimation(card);
        this.beginSceneAnimation();

        const isDamage = hpDelta < 0;
        const baseScaleX = card.body.scaleX;
        const baseScaleY = card.body.scaleY;
        const overlayColor = isDamage ? 0xff3b30 : 0x22c55e;
        const initialBounds = card.getBounds();
        const overlay = this.add.rectangle(
            card.x,
            card.y,
            Math.max(1, initialBounds.width),
            Math.max(1, initialBounds.height),
            overlayColor,
            1
        )
            .setOrigin(0.5)
            .setDepth(card.depth + 0.02)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.8);

        const syncOverlayToCard = () => {
            const bounds = card.getBounds();
            overlay.setPosition(card.x, card.y);
            overlay.setDisplaySize(Math.max(1, bounds.width), Math.max(1, bounds.height));
            overlay.setDepth(card.depth + 0.02);
        };

        const pulseTween = this.tweens.add({
            targets: card.body,
            scaleX: baseScaleX * GAME_HP_PULSE_ANIMATION.scaleMultiplier,
            scaleY: baseScaleY * GAME_HP_PULSE_ANIMATION.scaleMultiplier,
            duration: GAME_HP_PULSE_ANIMATION.durationMs,
            ease: 'Sine.easeOut',
            yoyo: true,
            onUpdate: () => {
                syncOverlayToCard();
                this.updateAttachedChildrenPositions(card);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.clearCardHpPulseAnimation(card);
            }
        });

        const overlayTween = this.tweens.add({
            targets: overlay,
            alpha: GAME_HP_PULSE_ANIMATION.overlayAlpha,
            duration: GAME_HP_PULSE_ANIMATION.durationMs,
            ease: 'Sine.easeOut',
            yoyo: true,
        });

        this.hpPulseAnimationByCardId.set(card.id, {
            baseScaleX,
            baseScaleY,
            overlay,
            pulseTween,
            overlayTween,
        });
    }

    public attachCardToCard (child: Card, parent: Card): void
    {
        if (child === parent) {
            return;
        }

        this.detachCard(child);

        const parentId = parent.id;
        const parentZoneId = parent.getZoneId();

        child.setAttachedToCardId(parentId);
        child.setZoneId(parentZoneId);
        child.setScale(GAME_LAYOUT.cardMoveToolScale);
        this.updateAttachedCardPosition(child, parent);
    }

    public animateToolAttachToCard (child: Card, parent: Card, onComplete?: () => void): void
    {
        if (child === parent) {
            if (onComplete) {
                onComplete();
            }
            return;
        }

        this.detachCard(child);
        this.removeCardFromAllHolders(child);
        child.setZoneId(parent.getZoneId());
        child.setAttachedToCardId(parent.id);
        child.setDepth(GAME_DEPTHS.cardDragging);

        const parentBounds = parent.getBounds();
        const edgePadding = GAME_LAYOUT.toolAttachmentEdgePadding;
        const targetScale = GAME_LAYOUT.cardMoveToolScale;
        const targetWidth = child.body.width * targetScale;
        const targetHeight = child.body.height * targetScale;
        const targetX = parentBounds.right - (targetWidth / 2) - edgePadding;
        const targetY = parentBounds.bottom - (targetHeight / 2) - edgePadding;

        const tweenState = {
            x: child.x,
            y: child.y,
            scale: child.body.scaleX
        };

        this.beginSceneAnimation();
        this.tweens.add({
            targets: tweenState,
            x: targetX,
            y: targetY,
            scale: targetScale,
            duration: GAME_LAYOUT.cardMoveDurationMs,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                child.setPosition(tweenState.x, tweenState.y);
                child.setScale(tweenState.scale);
                this.updateAttachedChildrenPositions(child);
                this.redrawAllCardMarks();
            },
            onComplete: () => {
                this.updateAttachedCardPosition(child, parent);
                this.updateAttachedChildrenPositions(parent);
                this.redrawAllCardMarks();
                this.endSceneAnimation();
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    public getTopAttachmentTarget (baseCard: Card): Card
    {
        const attachedChildren = this.getAttachedChildren(baseCard.id);
        if (attachedChildren.length === 0) {
            return baseCard;
        }

        return attachedChildren.reduce((topCard, nextCard) => (nextCard.depth > topCard.depth ? nextCard : topCard));
    }

    private detachCard (card: Card): void
    {
        card.setAttachedToCardId(null);
        card.setScale(1);
    }

    private getAttachedChildren (parentCardId: string): Card[]
    {
        return this.cards.filter((card) => card.getAttachedToCardId() === parentCardId);
    }

    private clearCardHpPulseAnimation (card: Card): void
    {
        const active = this.hpPulseAnimationByCardId.get(card.id);
        if (!active) {
            return;
        }

        active.pulseTween.remove();
        active.overlayTween.remove();
        active.overlay.destroy();

        card.body.setScale(active.baseScaleX, active.baseScaleY);
        this.updateAttachedChildrenPositions(card);
        this.redrawAllCardMarks();

        this.hpPulseAnimationByCardId.delete(card.id);
        this.endSceneAnimation();
    }

    private clearAllCardHpPulseAnimations (): void
    {
        for (const card of this.cards) {
            this.clearCardHpPulseAnimation(card);
        }
    }

    private updateAttachedChildrenPositions (parent: Card): void
    {
        const parentCardId = parent.id;
        const children = this.getAttachedChildren(parentCardId);

        for (const child of children) {
            this.updateAttachedCardPosition(child, parent);
        }

        this.updateAttachedEnergyTokenPositions(parent);
    }

    private getAttachedEnergyTokens (parentCardId: string): EnergyToken[]
    {
        return this.energyTokens
            .filter((token) => token.getAttachedToCardId() === parentCardId)
            .sort((a, b) => this.compareEnergyTokenIds(a.id, b.id));
    }

    private compareEnergyTokenIds (a: string, b: string): number
    {
        const aNumeric = Number(a);
        const bNumeric = Number(b);
        const aIsNumeric = Number.isFinite(aNumeric);
        const bIsNumeric = Number.isFinite(bNumeric);

        if (aIsNumeric && bIsNumeric) {
            return aNumeric - bNumeric;
        }

        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }

    private updateAttachedEnergyTokenPositions (parent: Card): void
    {
        const attachedTokens = this.getAttachedEnergyTokens(parent.id);
        if (attachedTokens.length === 0) {
            return;
        }

        const parentBounds = parent.getBounds();
        const tokenWidth = attachedTokens[0].getDisplayWidth();
        const tokenHeight = attachedTokens[0].getDisplayHeight();
        const horizontalStep = tokenWidth * GAME_LAYOUT.energyTokenAttachedHorizontalStepRatio;

        const startX = parentBounds.left + (tokenWidth / 2) + GAME_LAYOUT.energyTokenAttachedPadding;
        const y = parentBounds.bottom - (tokenHeight / 2) - GAME_LAYOUT.energyTokenAttachedPadding;

        attachedTokens.forEach((token, index) => {
            token.setPosition(startX + (index * horizontalStep), y);
            const tentativeDepth = ENERGY_TOKEN_DEPTHS.minAttached + index;
            token.setDepth(Math.min(ENERGY_TOKEN_DEPTHS.maxBelowUi, tentativeDepth));
        });
    }

    public findOverlappedOwnedCharacterForToken (token: EnergyToken): Card | null
    {
        const tokenBounds = token.getBounds();
        const sharedEnergyZoneId = this.energyZoneIdByOwner.p1;
        const ownerId = this.playerTurn;

        if (token.getZoneId() !== sharedEnergyZoneId && token.getZoneId() !== 'energy-discard') {
            return null;
        }

        for (const card of this.cards) {
            if (card.getOwnerId() !== ownerId || card.getCardType() !== 'character') {
                continue;
            }

            const zoneId = card.getZoneId();
            if (zoneId !== `${ownerId}-bench` && zoneId !== `${ownerId}-active`) {
                continue;
            }

            if (Phaser.Geom.Intersects.RectangleToRectangle(tokenBounds, card.getBounds())) {
                return card;
            }
        }

        return null;
    }

    public attachEnergyTokenToCard (token: EnergyToken, parent: Card): void
    {
        token.setAttachedToCardId(parent.id);
        const ownerZoneId = this.energyZoneIdByOwner.p1;
        this.setEnergyTokenZone(token, ownerZoneId);
        this.layoutEnergyTokensInZone(ownerZoneId);
        this.updateAttachedEnergyTokenPositions(parent);
    }

    private layoutEnergyTokensInZone (zoneId: string): void
    {
        const holder = this.energyHolderById[zoneId];
        if (!holder) {
            return;
        }

        const zoneArea = holder.getBounds();

        const tokens = holder.tokens
            .filter((token) => !token.getAttachedToCardId())
            .sort((a, b) => this.compareEnergyTokenIds(a.id, b.id));

        if (tokens.length === 0) {
            holder.hidePileCountDisplays();
            return;
        }
        holder.hidePileCountDisplays();

        const tokenWidth = tokens[0].getDisplayWidth();
        const tokenHeight = tokens[0].getDisplayHeight();
        const columns = Math.max(1, GAME_LAYOUT.energyTokenZoneColumnsDefault);
        const rowsPerColumn = Math.max(1, GAME_LAYOUT.energyTokenZoneRowsPerColumn);
        const tokensPerBand = Math.max(1, columns * rowsPerColumn);

        // Keep a clean 5x20-style matrix with only slight overlap between tokens.
        const columnStep = Math.max(1, tokenWidth * GAME_LAYOUT.energyTokenZoneColumnStepRatio);
        const rowStep = Math.max(1, tokenHeight * GAME_LAYOUT.energyTokenZoneRowStepRatio);
        const gridWidth = tokenWidth + ((columns - 1) * columnStep);
        const gridHeight = tokenHeight + ((rowsPerColumn - 1) * rowStep);
        const startX = zoneArea.centerX - (gridWidth / 2) + (tokenWidth / 2);
        const startY = zoneArea.centerY - (gridHeight / 2) + (tokenHeight / 2);
        const overflowOffsetX = Math.max(2, tokenWidth * GAME_LAYOUT.energyTokenZoneOverflowOffsetRatio);
        const overflowOffsetY = Math.max(2, tokenHeight * GAME_LAYOUT.energyTokenZoneOverflowOffsetRatio);

        tokens.forEach((token, index) => {
            const bandIndex = Math.floor(index / tokensPerBand);
            const indexInBand = index % tokensPerBand;
            const columnIndex = Math.floor(indexInBand / rowsPerColumn);
            const rowIndex = indexInBand % rowsPerColumn;
            const x = startX + (columnIndex * columnStep) + (bandIndex * overflowOffsetX);
            const y = startY + (rowIndex * rowStep) + (bandIndex * overflowOffsetY);

            token.setPosition(x, y);
            token.setDepth(ENERGY_TOKEN_DEPTHS.minZone + index);
        });
    }

    public moveEnergyTokenToDiscard (token: EnergyToken): void
    {
        const attachedToCardId = token.getAttachedToCardId();
        if (attachedToCardId) {
            token.setAttachedToCardId(null);
        }

        this.setEnergyTokenZone(token, 'energy-discard');
        this.layoutEnergyTokensInZone('energy-discard');
    }

    public animateEnergyTokenToZone (token: EnergyToken, zoneId: string, onComplete?: () => void): void
    {
        const destinationHolder = this.energyHolderById[zoneId];
        if (!destinationHolder) {
            if (onComplete) {
                onComplete();
            }
            return;
        }

        const previousZoneId = token.getZoneId();
        const previousAttachedToCardId = token.getAttachedToCardId();
        if (previousAttachedToCardId) {
            token.setAttachedToCardId(null);
        }

        token.setDepth(ENERGY_TOKEN_DEPTHS.maxBelowUi);
        this.beginSceneAnimation();
        this.tweens.add({
            targets: token.body,
            x: destinationHolder.x,
            y: destinationHolder.y,
            duration: Math.round(GAME_LAYOUT.cardMoveDurationMs * 0.8),
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.setEnergyTokenZone(token, zoneId);
                this.layoutEnergyTokensInZone(previousZoneId);
                this.layoutEnergyTokensInZone(zoneId);

                if (previousAttachedToCardId) {
                    const previousParent = this.cardById[previousAttachedToCardId];
                    if (previousParent) {
                        this.updateAttachedEnergyTokenPositions(previousParent);
                    }
                }

                this.endSceneAnimation();
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    public animateAttachEnergyTokenToCard (token: EnergyToken, parent: Card, onComplete?: () => void): void
    {
        const ownerZoneId = this.energyZoneIdByOwner.p1;
        const previousZoneId = token.getZoneId();
        const previousAttachedToCardId = token.getAttachedToCardId();

        const existingAttached = this
            .getAttachedEnergyTokens(parent.id)
            .filter((candidate) => candidate !== token);
        const tokenWidth = token.getDisplayWidth();
        const tokenHeight = token.getDisplayHeight();
        const parentBounds = parent.getBounds();
        const horizontalStep = tokenWidth * GAME_LAYOUT.energyTokenAttachedHorizontalStepRatio;
        const startX = parentBounds.left + (tokenWidth / 2) + GAME_LAYOUT.energyTokenAttachedPadding;
        const targetX = startX + (existingAttached.length * horizontalStep);
        const targetY = parentBounds.bottom - (tokenHeight / 2) - GAME_LAYOUT.energyTokenAttachedPadding;

        token.setDepth(ENERGY_TOKEN_DEPTHS.maxBelowUi);
        this.beginSceneAnimation();
        this.tweens.add({
            targets: token.body,
            x: targetX,
            y: targetY,
            duration: Math.round(GAME_LAYOUT.cardMoveDurationMs * 0.8),
            ease: 'Sine.easeInOut',
            onComplete: () => {
                token.setAttachedToCardId(parent.id);
                this.setEnergyTokenZone(token, ownerZoneId);
                this.layoutEnergyTokensInZone(previousZoneId);
                this.layoutEnergyTokensInZone(ownerZoneId);
                this.updateAttachedEnergyTokenPositions(parent);

                if (previousAttachedToCardId && previousAttachedToCardId !== parent.id) {
                    const previousParent = this.cardById[previousAttachedToCardId];
                    if (previousParent) {
                        this.updateAttachedEnergyTokenPositions(previousParent);
                    }
                }

                this.endSceneAnimation();
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    public moveEnergyTokenToOwnerEnergy (token: EnergyToken): void
    {
        const attachedToCardId = token.getAttachedToCardId();
        if (attachedToCardId) {
            token.setAttachedToCardId(null);
        }

        const ownerEnergyZoneId = this.energyZoneIdByOwner.p1;
        this.setEnergyTokenZone(token, ownerEnergyZoneId);
        this.layoutEnergyTokensInZone('energy-discard');
        this.layoutEnergyTokensInZone(ownerEnergyZoneId);
    }

    private setEnergyTokenZone (token: EnergyToken, zoneId: string): void
    {
        const oldZoneId = token.getZoneId();
        if (oldZoneId === zoneId) {
            token.setZoneId(zoneId);
            return;
        }

        const oldHolder = this.energyHolderById[oldZoneId];
        if (oldHolder) {
            oldHolder.removeToken(token);
        }

        const newHolder = this.energyHolderById[zoneId];
        if (newHolder) {
            newHolder.addToken(token);
        }

        token.setZoneId(zoneId);
    }

    public resolveBoomTextureKey (rawAssetName?: string): string | null
    {
        if (!rawAssetName) {
            return 'logo';
        }

        const key = rawAssetName.toLowerCase();
        const aliases: Record<string, string> = {
            background: 'background',
            bg: 'background',
            'background/background_element.png': 'background',
            logo: 'logo',
            'logo.png': 'logo',
            minecraftfont: 'minecraftfont',
            'minecraftfont.png': 'minecraftfont',
            font2bitmap: 'font2bitmap',
            'font2bitmap.png': 'font2bitmap',
            crit: CRIT_PARTICLE_TEXTURE_KEY,
            'crit.png': CRIT_PARTICLE_TEXTURE_KEY,
            'icons/crit.png': CRIT_PARTICLE_TEXTURE_KEY,
            regeneration: REGENERATION_PARTICLE_TEXTURE_KEY,
            'regeneration.png': REGENERATION_PARTICLE_TEXTURE_KEY,
            'icons/regeneration.png': REGENERATION_PARTICLE_TEXTURE_KEY,
        };

        const resolved = aliases[key];
        if (!resolved) {
            return null;
        }

        return this.textures.exists(resolved) ? resolved : null;
    }

    public playBoomExplosion (card: Card, textureKey: string): void
    {
        const durationMs = GAME_EXPLOSION.durationMs;
        const count = GAME_EXPLOSION.count;
        const fallbackBaseScale = Math.max(GAME_EXPLOSION.minScale, this.objectWidth / GAME_EXPLOSION.scaleDivisor);
        const texture = this.textures.get(textureKey);
        const sourceImage = texture.getSourceImage() as { width?: number; height?: number } | undefined;
        const sourceWidth = Number(sourceImage?.width ?? 0);
        const sourceHeight = Number(sourceImage?.height ?? 0);
        const maxSourceDimension = Math.max(sourceWidth, sourceHeight);
        const targetParticleSizePx = Math.max(18, Math.round(this.objectWidth * 0.58));
        const normalizedScale = maxSourceDimension > 0
            ? targetParticleSizePx / maxSourceDimension
            : fallbackBaseScale;
        const baseScale = Math.max(GAME_EXPLOSION.minScale, normalizedScale);

        for (let i = 0; i < count; i += 1) {
            const image = this.add.image(card.x, card.y, textureKey)
                .setDepth(GAME_DEPTHS.explosionBase + i)
                .setScale(baseScale * Phaser.Math.FloatBetween(GAME_EXPLOSION.scaleMinMultiplier, GAME_EXPLOSION.scaleMaxMultiplier))
                .setAlpha(1)
                .setAngle(Phaser.Math.Between(GAME_EXPLOSION.initialRotationMin, GAME_EXPLOSION.initialRotationMax));

            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.FloatBetween(this.objectWidth * GAME_EXPLOSION.distanceMinWidthRatio, this.objectWidth * GAME_EXPLOSION.distanceMaxWidthRatio);
            const targetX = card.x + (Math.cos(angle) * distance);
            const targetY = card.y + (Math.sin(angle) * distance);

            this.beginSceneAnimation();
            this.tweens.add({
                targets: image,
                x: targetX,
                y: targetY,
                alpha: 0,
                angle: image.angle + Phaser.Math.Between(GAME_EXPLOSION.rotationDeltaMin, GAME_EXPLOSION.rotationDeltaMax),
                duration: durationMs,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    image.destroy();
                    this.endSceneAnimation();
                }
            });
        }
    }

    private updateAttachedCardPosition (child: Card, parent: Card): void
    {
        const parentBounds = parent.getBounds();
        const childBounds = child.getBounds();
        const edgePadding = GAME_LAYOUT.toolAttachmentEdgePadding;
        const x = parentBounds.right - (childBounds.width / 2) - edgePadding;
        const y = parentBounds.bottom - (childBounds.height / 2) - edgePadding;

        child.setPosition(x, y);
        child.setDepth(parent.depth + GAME_DEPTHS.attachmentDepthOffset);
    }

    public isDeckOrDiscardHolderId (holderId: string): boolean
    {
        const normalizedHolderId = holderId.trim().toLowerCase();
        return normalizedHolderId.endsWith('-deck') || normalizedHolderId.endsWith('-discard');
    }

    public playShuffleDeckSoundAndGetDurationMs (): number
    {
        // Backend animations now own shuffle sound playback; frontend keeps
        // this helper for duration-based shuffle visual timing only.
        return this.getShuffleDeckSoundDurationMs();
    }

    private isSfxPlaybackAllowed (): boolean
    {
        const soundManager = this.sound as Phaser.Sound.BaseSoundManager & {
            mute?: boolean;
            volume?: number;
        };
        if (soundManager.mute === true) {
            return false;
        }

        const masterVolume = typeof soundManager.volume === 'number' ? soundManager.volume : 1;
        return Number.isFinite(masterVolume) && masterVolume > 0.001;
    }

    public playRevealSound (minIntervalMs: number = 0): void
    {
        if (!this.cache.audio.exists(REVEAL_SOUND_KEY) || !this.isSfxPlaybackAllowed()) {
            return;
        }

        const nowMs = this.time.now;
        if (Number.isFinite(minIntervalMs) && minIntervalMs > 0) {
            const elapsedMs = nowMs - this.lastRevealSoundPlayedAtMs;
            if (Number.isFinite(elapsedMs) && elapsedMs < minIntervalMs) {
                return;
            }
        }

        this.sound.play(REVEAL_SOUND_KEY);
        this.lastRevealSoundPlayedAtMs = nowMs;
    }

    public playCommandSound (rawSoundKey: string): boolean
    {
        const resolved = this.resolveCommandSoundKey(rawSoundKey);
        if (!resolved) {
            return false;
        }

        if (!this.isSfxPlaybackAllowed()) {
            return true;
        }

        this.sound.play(resolved);
        return true;
    }

    private resolveCommandSoundKey (rawSoundKey: string): string | null
    {
        const requested = rawSoundKey.trim();
        if (!requested) {
            return null;
        }

        const normalizedRequested = requested.toLowerCase();
        const aliases: Record<string, string> = {
            'reveal.mp3': REVEAL_SOUND_KEY,
            'shuffle_deck.wav': SHUFFLE_DECK_SOUND_KEY,
            'shuffle-deck.wav': SHUFFLE_DECK_SOUND_KEY,
            'play_chip.ogg': ENERGY_TOKEN_ATTACH_SOUND_KEY,
            'play-chip.ogg': ENERGY_TOKEN_ATTACH_SOUND_KEY,
            'sparkle.mp3': SPARKLE_SOUND_KEY,
            sparkle: SPARKLE_SOUND_KEY,
            'punch.mp3': PUNCH_SOUND_KEY,
            'punch': PUNCH_SOUND_KEY,
            'heavy_punch.mp3': HEAVY_PUNCH_SOUND_KEY,
            'heavy-punch.mp3': HEAVY_PUNCH_SOUND_KEY,
            'heavy_punch': HEAVY_PUNCH_SOUND_KEY,
            'heavy-punch': HEAVY_PUNCH_SOUND_KEY,
            'card_slide.ogg': CARD_SLIDE_SOUND_KEY,
            'card-slide.ogg': CARD_SLIDE_SOUND_KEY,
            'card_slide': CARD_SLIDE_SOUND_KEY,
            'card-slide': CARD_SLIDE_SOUND_KEY,
            'card_shove.ogg': CARD_SHOVE_SOUND_KEY,
            'card-shove.ogg': CARD_SHOVE_SOUND_KEY,
            'card_shove': CARD_SHOVE_SOUND_KEY,
            'card-shove': CARD_SHOVE_SOUND_KEY,
        };
        const resolved = aliases[normalizedRequested] ?? requested;
        if (!this.cache.audio.exists(resolved)) {
            return null;
        }

        return resolved;
    }

    public playCommandSoundAsSceneAnimation (rawSoundKey: string): boolean
    {
        const resolved = this.resolveCommandSoundKey(rawSoundKey);
        if (!resolved) {
            return false;
        }

        if (!this.isSfxPlaybackAllowed()) {
            return true;
        }

        this.beginSceneAnimation();
        const maybeWebAudioContext = (this.sound as Phaser.Sound.BaseSoundManager & {
            context?: { state?: string; resume?: () => Promise<unknown> };
        }).context;
        if (maybeWebAudioContext?.state === 'suspended' && typeof maybeWebAudioContext.resume === 'function') {
            void maybeWebAudioContext.resume().catch(() => {
                // Best effort only; retry loop below still handles delayed readiness.
            });
        }

        let settled = false;
        const settle = () => {
            if (settled) {
                return;
            }

            settled = true;
            this.endSceneAnimation();
        };

        const maxAttempts = 8;
        const retryDelayMs = 120;
        const tryPlayAttempt = (attempt: number): void => {
            const sound = this.sound.add(resolved);
            let completed = false;

            const finish = () => {
                if (completed) {
                    return;
                }

                completed = true;
                sound.destroy();
                settle();
            };

            const durationCandidate = (sound as { duration?: number; totalDuration?: number }).duration
                ?? (sound as { totalDuration?: number }).totalDuration;
            const fallbackDelayMs = Number.isFinite(durationCandidate) && (durationCandidate ?? 0) > 0
                ? Math.max(1, Math.round((durationCandidate as number) * 1000) + 40)
                : 1200;

            sound.once('complete', finish);
            const played = sound.play();
            if (!played) {
                sound.destroy();
                if (attempt + 1 < maxAttempts) {
                    this.time.delayedCall(retryDelayMs, () => {
                        tryPlayAttempt(attempt + 1);
                    });
                    return;
                }

                settle();
                return;
            }

            this.time.delayedCall(fallbackDelayMs, finish);
        };

        tryPlayAttempt(0);
        return true;
    }

    private getShuffleDeckSoundDurationMs (): number
    {
        if (!this.cache.audio.exists(SHUFFLE_DECK_SOUND_KEY)) {
            return SHUFFLE_DECK_FALLBACK_DURATION_MS;
        }

        const sound = this.sound.add(SHUFFLE_DECK_SOUND_KEY);
        const durationCandidate = (sound as { duration?: number; totalDuration?: number }).duration
            ?? (sound as { totalDuration?: number }).totalDuration;
        sound.destroy();

        if (!Number.isFinite(durationCandidate) || (durationCandidate ?? 0) <= 0) {
            return SHUFFLE_DECK_FALLBACK_DURATION_MS;
        }

        return Math.max(1, Math.round((durationCandidate as number) * 1000));
    }

    private resolveShuffleAnimationTiming (cardCount: number, totalDurationMs?: number): {
        spreadDuration: number;
        settleDuration: number;
        cardDelayStepMs: number;
    }
    {
        const spreadDuration = Math.max(
            GAME_SHUFFLE_ANIMATION.spreadDurationMinMs,
            Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio)
        );
        const settleDuration = Math.max(
            GAME_SHUFFLE_ANIMATION.settleDurationMinMs,
            Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio)
        );
        const baseDelayStep = GAME_SHUFFLE_ANIMATION.cardDelayStepMs;

        if (!Number.isFinite(totalDurationMs) || (totalDurationMs ?? 0) <= 0) {
            return {
                spreadDuration,
                settleDuration,
                cardDelayStepMs: baseDelayStep,
            };
        }

        const cardsAfterFirst = Math.max(0, cardCount - 1);
        const targetDurationMs = Math.max(2, Math.round(totalDurationMs as number));
        const maxDelayBudgetMs = Math.round(targetDurationMs * 0.22);
        const cardDelayStepMs = cardsAfterFirst > 0
            ? Math.min(baseDelayStep, Math.floor(maxDelayBudgetMs / cardsAfterFirst))
            : 0;
        const totalDelayMs = cardDelayStepMs * cardsAfterFirst;
        const motionBudgetMs = Math.max(2, targetDurationMs - totalDelayMs);
        const spreadRatioNumerator = GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio;
        const spreadRatioDenominator = GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio
            + GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio;
        const spreadRatio = spreadRatioDenominator > 0
            ? (spreadRatioNumerator / spreadRatioDenominator)
            : 0.5;
        const syncedSpreadDuration = Math.max(1, Math.round(motionBudgetMs * spreadRatio));
        const syncedSettleDuration = Math.max(1, motionBudgetMs - syncedSpreadDuration);

        return {
            spreadDuration: syncedSpreadDuration,
            settleDuration: syncedSettleDuration,
            cardDelayStepMs,
        };
    }

    public playShuffleAnimationForPile (holder: CardHolder, totalDurationMs?: number): boolean
    {
        if (!this.isDeckOrDiscardHolderId(holder.id)) {
            return false;
        }

        const pileCards = holder.cards.slice();
        if (pileCards.length < GAME_SHUFFLE_ANIMATION.minCardsRequired) {
            return false;
        }

        const scatterX = Math.max(GAME_SHUFFLE_ANIMATION.scatterXMinPx, Math.round(this.objectWidth * GAME_SHUFFLE_ANIMATION.scatterXWidthRatio));
        const scatterY = Math.max(GAME_SHUFFLE_ANIMATION.scatterYMinPx, Math.round(this.objectHeight * GAME_SHUFFLE_ANIMATION.scatterYHeightRatio));
    const timing = this.resolveShuffleAnimationTiming(pileCards.length, totalDurationMs);

        this.beginSceneAnimation();
        let pendingCards = pileCards.length;

        pileCards.forEach((card, index) => {
            const startX = card.x;
            const startY = card.y;
            const shuffleX = startX + Phaser.Math.Between(-scatterX, scatterX);
            const shuffleY = startY + Phaser.Math.Between(-scatterY, scatterY);

            card.setDepth(GAME_DEPTHS.cardDragging + index);

            this.tweens.add({
                targets: card.body,
                x: shuffleX,
                y: shuffleY,
                duration: timing.spreadDuration,
                delay: index * timing.cardDelayStepMs,
                ease: 'Sine.easeOut',
                onUpdate: () => {
                    card.redrawMarks();
                    this.updateAttachedChildrenPositions(card);
                },
                onComplete: () => {
                    this.tweens.add({
                        targets: card.body,
                        x: startX,
                        y: startY,
                        duration: timing.settleDuration,
                        ease: 'Sine.easeInOut',
                        onUpdate: () => {
                            card.redrawMarks();
                            this.updateAttachedChildrenPositions(card);
                        },
                        onComplete: () => {
                            pendingCards -= 1;
                            if (pendingCards === 0) {
                                this.layoutAllHolders();
                                this.redrawAllCardMarks();
                                this.endSceneAnimation();
                            }
                        }
                    });
                }
            });
        });

        return true;
    }

    public playSingleCardShuffleAnimationForPile (card: Card, holder: CardHolder): boolean
    {
        if (!this.isDeckOrDiscardHolderId(holder.id)) {
            return false;
        }

        if (!holder.cards.includes(card)) {
            return false;
        }

        const scatterX = Math.max(GAME_SHUFFLE_ANIMATION.scatterXMinPx, Math.round(this.objectWidth * GAME_SHUFFLE_ANIMATION.scatterXWidthRatio));
        const scatterY = Math.max(GAME_SHUFFLE_ANIMATION.scatterYMinPx, Math.round(this.objectHeight * GAME_SHUFFLE_ANIMATION.scatterYHeightRatio));
        const spreadDuration = Math.max(GAME_SHUFFLE_ANIMATION.spreadDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio));
        const settleDuration = Math.max(GAME_SHUFFLE_ANIMATION.settleDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio));
        const startX = card.x;
        const startY = card.y;
        const shuffleX = startX + Phaser.Math.Between(-scatterX, scatterX);
        const shuffleY = startY + Phaser.Math.Between(-scatterY, scatterY);

        this.beginSceneAnimation();
        card.setDepth(GAME_DEPTHS.cardDragging + 1);

        this.tweens.add({
            targets: card.body,
            x: shuffleX,
            y: shuffleY,
            duration: spreadDuration,
            ease: 'Sine.easeOut',
            onUpdate: () => {
                card.redrawMarks();
                this.updateAttachedChildrenPositions(card);
            },
            onComplete: () => {
                this.tweens.add({
                    targets: card.body,
                    x: startX,
                    y: startY,
                    duration: settleDuration,
                    ease: 'Sine.easeInOut',
                    onUpdate: () => {
                        card.redrawMarks();
                        this.updateAttachedChildrenPositions(card);
                    },
                    onComplete: () => {
                        this.layoutAllHolders();
                        this.redrawAllCardMarks();
                        this.endSceneAnimation();
                    }
                });
            }
        });

        return true;
    }

    private removeCardFromAllHolders (card: Card): void
    {
        for (const holder of this.cardHolders) {
            holder.removeCard(card);
        }
    }

    private moveCardToZone (card: Card, zoneId: string, onComplete?: () => void, insertIndex?: number): void
    {
        const originZoneId = card.getZoneId();
        const wasVisible = this.isZoneVisibleToView(originZoneId, card.getOwnerId());
        const willBeVisible = this.isZoneVisibleToView(zoneId, card.getOwnerId());
        const requiresFaceFlipBeforeMove = wasVisible && !willBeVisible;

        const completeMove = () => {
            this.detachCard(card);
            this.removeCardFromAllHolders(card);
            const targetHolder = this.cardHolderById[zoneId];
            if (insertIndex !== undefined) {
                targetHolder.insertCard(card, insertIndex);
            }
            else {
                targetHolder.addCard(card);
            }
            card.setZoneId(zoneId);
            if (onComplete) {
                onComplete();
            }
        };

        if (requiresFaceFlipBeforeMove) {
            card.flip(() => {
                completeMove();
            });
            return;
        }

        completeMove();
    }

    public sendCardToOwnerDiscard (card: Card, onComplete?: () => void): void
    {
        const discardZone = `${card.getOwnerId()}-discard`;
        this.moveCardToZone(card, discardZone, onComplete);
    }

    private layoutStadiumStack (): void
    {
        const stadiumHolder = this.cardHolderById['stadium'];
        if (!stadiumHolder) {
            return;
        }

        stadiumHolder.cards.forEach((card, index) => {
            card.setPosition(stadiumHolder.x, stadiumHolder.y);
            card.setDepth(card.getSelected() ? GAME_DEPTHS.cardSelected : (GAME_DEPTHS.stadiumBase + index));
        });
    }

}
