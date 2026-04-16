import { Scene } from 'phaser';
import { io, Socket } from 'socket.io-client';

import { GameCommandProcessor } from '../commands/GameCommandProcessor';
import { Card, CardHolder, CardHolderConfig, EnergyHolder, EnergyHolderConfig, EnergyToken, PlayerId } from '../entities';
import {
    sendFrontendProtocolPacket,
    BackendEntitiesSetup,
    BackendProtocolPacket,
    FrontendProtocolPacket,
    parseBackendEntitiesSetup,
    getBackendBaseUrl,
    getRouterBaseUrl,
    checkServiceHealth,
    ROOM_BACKEND_BASE_URL_STORAGE_KEY,
    ROUTER_SESSION_ID_STORAGE_KEY,
} from '../Network';
import { BoardInteractionController } from '../ui/BoardInteractionController';
import { CardPreviewController } from '../ui/CardPreviewController';
import { InputOverlayController } from '../ui/InputOverlayController';
import { PhaseHudController } from '../ui/PhaseHudController';
import { PlayerStatsHudController } from '../ui/PlayerStatsHudController';
import { SurrenderController } from '../ui/SurrenderController';
import { fitBitmapTextToTwoLines } from '../ui/overlays/bitmapTextFit';
import { fitBitmapTextToSingleLine } from '../ui/overlays/bitmapTextFit';
import {
    AVGECardType,
    BASE_HEIGHT,
    BASE_WIDTH,
    BOARD_SCALE,
    CARD_BASE_HEIGHT,
    CARD_BASE_WIDTH,
    ENTITY_VISUALS,
    GAME_CARD_ACTION_BUTTON_LAYOUT,
    GAME_DEPTHS,
    GAME_EXPLOSION,
    GAME_LAYOUT,
    GAME_SCENE_VISUALS,
    GAME_SHUFFLE_ANIMATION,
    ENERGY_TOKEN_DEPTHS,
    CARDHOLDER_BASE_WIDTH,
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

type ViewMode = PlayerId | 'admin' | 'spectator';
type GamePhase = 'no-input' | 'phase2' | 'atk';
type CardActionKey = 'atk1' | 'atk2' | 'active';
type OverlayPreviewContext = 'input' | 'reveal' | null;
type PlayerTurnAttributeKey = keyof typeof PLAYER_TURN_ATTRIBUTE_DEFAULTS;
type PlayerTurnAttributes = Record<PlayerTurnAttributeKey, number>;
type PlayerSetupProfile = {
    username: string;
    attributes: Partial<PlayerTurnAttributes>;
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
    opponentDisconnectBackdrop: Phaser.GameObjects.Rectangle;
    opponentDisconnectText: Phaser.GameObjects.BitmapText;
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
    inputAcknowledged: boolean;
    pendingInputCommand: string | null;
    pendingNotifyCommand: string | null;
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

    cardActionButtons: Array<{
        key: CardActionKey;
        body: Phaser.GameObjects.Arc;
        label: Phaser.GameObjects.BitmapText;
    }>;
    phaseStateActionButton: {
        body: Phaser.GameObjects.Rectangle;
        label: Phaser.GameObjects.BitmapText;
        action: 'phase2-attack' | 'atk-skip' | null;
    } | null;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
        this.load.image('logo', 'logo.png');
        this.load.image('minecraftfont', 'minecraftfont.png');
        this.load.image('font2bitmap', 'font2bitmap.png');
        this.load.image('pixelviolin', 'pixelviolin.jpg');
        this.load.bitmapFont('minogram', 'minogram_6x10.png', 'minogram_6x10.xml');
        InputOverlayController.preloadDiceAssets(this);
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(GAME_SCENE_VISUALS.backgroundColor);
        this.camera.roundPixels = true;
        this.camera.fadeIn(220, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(GAME_SCENE_VISUALS.backgroundAlpha);

        this.boardInputEnabled = true;
        const inputLockDepth = Math.max(GAME_SCENE_VISUALS.inputLockDepth, GAME_DEPTHS.previewText + 10);
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
        this.opponentDisconnectBackdrop = this.add.rectangle(
            GAME_CENTER_X,
            GAME_CENTER_Y,
            Math.round(GAME_WIDTH * 0.72),
            Math.round(GAME_HEIGHT * 0.24),
            0x0f172a,
            0.92
        )
            .setStrokeStyle(2, 0xffffff, 0.85)
            .setDepth(inputLockDepth + 2)
            .setVisible(false);
        this.opponentDisconnectText = this.add.bitmapText(
            GAME_CENTER_X,
            GAME_CENTER_Y,
            'minogram',
            'Other player disconnected. Waiting for reconnection...',
            Math.max(14, Math.round(16 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setCenterAlign()
            .setMaxWidth(Math.round(GAME_WIDTH * 0.64))
            .setDepth(inputLockDepth + 3)
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
            }
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
        this.inputAcknowledged = false;
        this.pendingInputCommand = null;
        this.pendingNotifyCommand = null;
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
            p1: 'p1-energy',
            p2: 'p2-energy'
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

        this.createCardPreviewPanel();
        this.createCardActionButtons();
        this.phaseStateActionButton = null;
        this.createSurrenderButton();
        this.createPlayerStatsHud();
        this.createPhaseHud();

        void this.initializeProtocolSession();
        this.startServiceHealthMonitor();

        this.events.once('shutdown', () => {
            this.stopServiceHealthMonitor();
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
        if (this.hasRedirectedToMainMenu || this.serviceHealthCheckInFlight) {
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

        this.scene.start('MainMenu', {
            systemMessage: message,
            failureReason: reason,
        });
    }

    public setBoardInputEnabled (enabled: boolean, showLockOverlayWhenDisabled = true): void
    {
        this.boardInputEnabled = enabled;

        if (!enabled) {
            const overlayAlpha = showLockOverlayWhenDisabled
                ? GAME_SCENE_VISUALS.inputLockAlpha
                : 0;
            this.inputLockOverlay
                .setFillStyle(GAME_SCENE_VISUALS.inputLockColor, overlayAlpha)
                .setVisible(true);
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

        if (!this.isInteractionLockedByAnimation()) {
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
        if (!inProgress && !this.isInteractionLockedByAnimation()) {
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

        const discardZoneId = 'energy-discard';
        const discardX = Math.round((p1EnergyX + p2EnergyX) / 2);
        const discardY = Math.round((p1EnergyY + p2EnergyY) / 2);

        const createHolder = (config: EnergyHolderConfig) => {
            const holder = new EnergyHolder(this, config);
            this.energyHolders.push(holder);
            this.energyHolderById[holder.id] = holder;
        };

        createHolder({ id: this.energyZoneIdByOwner.p2, label: 'P2 ENERGY', x: p2EnergyX, y: p2EnergyY, width: holderWidth, height: holderHeight, color: 0x4361ee });
        createHolder({ id: discardZoneId, label: 'ENERGY DISCARD', x: discardX, y: discardY, width: holderWidth, height: holderHeight, color: 0x6c757d });
        createHolder({ id: this.energyZoneIdByOwner.p1, label: 'P1 ENERGY', x: p1EnergyX, y: p1EnergyY, width: holderWidth, height: holderHeight, color: 0x3a0ca3 });
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

    private initializeProtocolSocket (): boolean
    {
        if (this.protocolSocketFallbackToHttp) {
            return false;
        }

        if (this.protocolSocket !== null) {
            return true;
        }

        const socket = io(getBackendSocketUrl(), {
            transports: ['websocket'],
            reconnection: false,
        });

        this.protocolSocket = socket;

        socket.on('connect', () => {
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
                }
                : {};

            if (data.slot === 'p1' || data.slot === 'p2') {
                this.protocolClientSlot = data.slot;
            }

            if (typeof data.reconnect_token === 'string' && data.reconnect_token.trim().length > 0) {
                this.protocolReconnectToken = data.reconnect_token.trim();
            }

            this.waitingForOpponent = data.both_players_connected !== true;
            if (this.waitingForOpponent) {
                this.appendTerminalLine('Waiting for opponent to connect...');
                this.setOpponentDisconnectedState(true, 'Other player disconnected. Waiting for reconnection...');
            }
            else {
                this.setOpponentDisconnectedState(false);
            }

            this.persistProtocolClientSession();
        });

        socket.on('registration_error', (payload: unknown) => {
            console.warn('[Protocol] registration_error', payload);
            this.setInputAcknowledged(true);
        });

        socket.on('protocol_packets', (payload: unknown) => {
            const data = typeof payload === 'object' && payload !== null
                ? payload as { packets?: unknown }
                : {};

            const packets = Array.isArray(data.packets)
                ? data.packets as BackendProtocolPacket[]
                : [];

            if (packets.length === 0) {
                this.setInputAcknowledged(true);
            }

            this.processBackendProtocolPackets(packets);
        });

        socket.on('protocol_error', (payload: unknown) => {
            console.warn('[Protocol] protocol_error', payload);
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
            this.redirectToMainMenuAfterServiceFailure('room_disconnected', 'Game server disconnected. Returning to main menu.');
        });

        return true;
    }

    private activateHttpProtocolFallback (): void
    {
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
        if (acknowledged && (this.awaitingRemoteNotifyAck || this.remoteInputLockActive || this.opponentDisconnected)) {
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
                    if (this.waitingForOpponent && !wasWaiting) {
                        this.appendTerminalLine('Waiting for opponent to connect...');
                    }
                }

                this.processBackendProtocolPackets(response.packets);

                if (response.packets.length === 0) {
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

            if (packet.PacketType === 'environment') {
                this.waitingForOpponent = false;
                this.setOpponentDisconnectedState(false);
                const setup = parseBackendEntitiesSetup(packet.Body);
                if (!setup) {
                    this.handleProtocolMismatch(packet);
                    return;
                }

                if (this.cards.length > 0 || this.energyTokens.length > 0) {
                    this.resetBoardEntitiesForAuthoritativeEnvironment();
                }
                this.applyBackendEntitySetup(setup);
                if (this.pendingNotifyCommand || this.pendingInputCommand) {
                    this.setInputAcknowledged(false);
                }
                else {
                    this.setInputAcknowledged(true);
                }
                this.enqueueProtocolPacket('ready', {});
                continue;
            }

            const command = packet.Body.command;
            if (typeof command !== 'string' || command.trim().length === 0) {
                continue;
            }

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
                    error: replayError
                });
            }
            finally {
                this.scannerCommandInProgress = false;
            }

            if (command.startsWith('input ')) {
                this.pendingInputCommand = command;
                this.setInputAcknowledged(true);
                continue;
            }

            if (command.startsWith('notify ')) {
                this.awaitingRemoteNotifyAck = true;
                if (this.inputOverlayController.hasActiveOverlay()) {
                    // Hold command completion ACK for notify until the notify
                    // overlay is dismissed and emits its notify frontend event.
                    this.pendingNotifyCommand = command;
                    this.setInputAcknowledged(false);
                }
                else {
                    this.setInputAcknowledged(false);
                    // Failsafe: if notify overlay did not become active, ACK
                    // immediately to prevent protocol deadlock.
                    this.emitBackendEvent('terminal_log', {
                        line: 'ACK backend_update_processed',
                        command,
                        apply_error: replayError,
                    });
                }
                continue;
            }

            if (command === 'unlock-input') {
                this.awaitingRemoteNotifyAck = false;
                this.setInputAcknowledged(true);
                this.emitBackendEvent('terminal_log', {
                    line: 'ACK backend_update_processed',
                    command,
                    apply_error: replayError,
                });
                continue;
            }

            this.emitBackendEvent('terminal_log', {
                line: 'ACK backend_update_processed',
                command,
                apply_error: replayError,
            });
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
            this.setInputAcknowledged(false);
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

        const cardTypeColors: Record<'character' | 'tool' | 'item' | 'stadium' | 'supporter', number> = {
            character: 0xe76f51,
            tool: 0x457b9d,
            item: 0x2a9d8f,
            stadium: 0x6d597a,
            supporter: 0xb45309
        };

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
                color: cardTypeColors[cardDef.cardType],
                AVGECardType: cardDef.AVGECardType,
                AVGECardClass: cardDef.AVGECardClass,
                hasAtk1: cardDef.hasAtk1,
                hasActive: cardDef.hasActive,
                hasAtk2: cardDef.hasAtk2,
                hp: cardDef.hp,
                maxHp: cardDef.maxHp,
                statusEffect: cardDef.statusEffect,
                width: this.objectWidth,
                height: this.objectHeight,
                flipped: false,
                attachedToCardId: cardDef.attachedToCardId
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
                attachedToCardId: tokenDef.attachedToCardId
            });

            if (!result.ok) {
                this.appendTerminalLine(`setup energy skipped (${tokenDef.id}): ${result.error}`);
            }
        }

        const assignedView =
            setup.playerView === 'admin' || setup.playerView === 'p1' || setup.playerView === 'p2' || setup.playerView === 'spectator'
                ? setup.playerView
                : this.activeViewMode;
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

            const label = this.add.bitmapText(x, y, 'minogram', def.text, fontSize)
                .setOrigin(0.5)
                .setTint(GAME_CARD_ACTION_BUTTON_LAYOUT.textTint)
                .setDepth(GAME_DEPTHS.terminalInputText + 1)
                .setVisible(false);

            body.on('pointerdown', () => {
                this.handleCardActionButtonClick(def.key);
            });

            body.on('pointerover', () => {
                this.tweens.killTweensOf([body, label]);
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
        const handHolder =
            this.activeViewMode === 'p1' || this.activeViewMode === 'p2'
                ? this.cardHolderById[`${this.activeViewMode}-hand`]
                : undefined;
        this.surrenderController.refresh(this.activeViewMode, handHolder);
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
        const fontSize = Math.max(10, Math.round(16 * UI_SCALE));
        const body = this.add.rectangle(0, 0, 10, 10, 0x0b132b, 0.9)
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0xffffff, 0.5)
            .setDepth(314)
            .setVisible(false)
            .setInteractive({ useHandCursor: true });

        const label = this.add.bitmapText(0, 0, 'minogram', '-> attack', fontSize)
            .setOrigin(1, 0)
            .setTint(0xffffff)
            .setDepth(315)
            .setVisible(false);

        body.on('pointerdown', () => {
            this.handlePhaseStateActionButtonClick();
        });

        this.phaseStateActionButton = {
            body,
            label,
            action: null
        };
    }

    private handlePhaseStateActionButtonClick (): void
    {
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
        const turnDisplayName =
            (this.activeViewMode === 'p1' || this.activeViewMode === 'p2') && this.activeViewMode === this.playerTurn
                ? 'YOURS'
                : this.getPlayerUsername(this.playerTurn);
        this.phaseHudController.refresh(this.activeViewMode, this.gamePhase, turnDisplayName, this.roundNumber);
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

        const isCurrentTurnView = this.activeViewMode === 'admin' || this.activeViewMode === this.playerTurn;
        if (!isCurrentTurnView) {
            button.body.setVisible(false);
            button.label.setVisible(false);
            button.action = null;
            return;
        }

        let buttonText = '';
        let nextAction: 'phase2-attack' | 'atk-skip' | null = null;
        if (this.gamePhase === 'phase2') {
            buttonText = '-> attack';
            nextAction = 'phase2-attack';
        }
        else if (this.gamePhase === 'atk') {
            buttonText = '->skip';
            nextAction = 'atk-skip';
        }

        if (!nextAction) {
            button.body.setVisible(false);
            button.label.setVisible(false);
            button.action = null;
            return;
        }

        const xPadding = Math.max(10, Math.round(10 * UI_SCALE));
        const yPadding = Math.max(8, Math.round(8 * UI_SCALE));
        const minWidth = Math.max(120, Math.round(120 * UI_SCALE));
        const maxWidth = Math.max(minWidth, Math.round(panelBounds.width));
        const textPreferred = Math.max(10, Math.round(16 * UI_SCALE));
        const textMin = Math.max(9, Math.round(textPreferred * 0.72));
        const maxTextWidth = Math.max(24, maxWidth - (xPadding * 2));
        const fittedSize = fitBitmapTextToSingleLine({
            scene: this,
            font: 'minogram',
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

        button.label
            .setPosition(x - xPadding, y + yPadding)
            .setVisible(true);

        button.action = nextAction;
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

    private handleCardActionButtonClick (actionKey: CardActionKey): void
    {
        const card = this.selectedCard;
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

    private refreshCardActionButtons (): void
    {
        if (!this.cardActionButtons || this.cardActionButtons.length === 0) {
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

        const card = this.selectedCard;
        const isEligibleZone = card ? /-(hand|bench|active)$/.test(card.getZoneId()) : false;
        const isActiveSlot = Boolean(card && card.getZoneId() === `${card.getOwnerId()}-active`);
        const canUseSelectedCardActions = Boolean(card && (this.activeViewMode === 'admin' || card.getOwnerId() === this.activeViewMode));
        const showAtk1 = Boolean(card && this.gamePhase === 'atk' && card.getCardType() === 'character' && isActiveSlot && card.hasAttackOne());
        const showAtk2 = Boolean(card && this.gamePhase === 'atk' && card.getCardType() === 'character' && isActiveSlot && card.hasAttackTwo());
        const showActive = Boolean(card && canUseSelectedCardActions && card.getCardType() === 'character' && isEligibleZone && card.hasActiveAbility());

        const radius = Math.max(12, Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonRadiusBase / BASE_WIDTH) * GAME_WIDTH));
        const leftMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.leftMarginBase / BASE_WIDTH) * GAME_WIDTH);
        const bottomMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.bottomMarginBase / BASE_HEIGHT) * GAME_HEIGHT);
        const gap = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonGapBase / BASE_WIDTH) * GAME_WIDTH);
        const diameter = radius * 2;
        const anchorLeftX = leftMargin;
        const anchorY = GAME_HEIGHT - bottomMargin - radius;

        const visibleButtons: Array<{ key: CardActionKey; body: Phaser.GameObjects.Arc; label: Phaser.GameObjects.BitmapText }> = [];
        for (const button of this.cardActionButtons) {
            const visible =
                (button.key === 'atk1' && showAtk1) ||
                (button.key === 'atk2' && showAtk2) ||
                (button.key === 'active' && showActive);
            button.body.setScale(1);
            button.label.setScale(1);
            button.body.setVisible(visible);
            button.label.setVisible(visible);

            if (visible) {
                visibleButtons.push(button);
            }
        }

        if (visibleButtons.length === 0) {
            return;
        }

        const startX = anchorLeftX + radius;

        visibleButtons.forEach((button, index) => {
            const x = startX + (index * (diameter + gap));
            button.body.setPosition(x, anchorY);
            button.label.setPosition(x, anchorY);
        });
    }

    private showCardPreview (card: Card): void
    {
        this.cardPreviewController.show(card);
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
        const immediateInputEvent = eventType === 'input_result' || eventType === 'input_state_change' || eventType === 'notify';
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

        if (eventType === 'terminal_log' && this.commandExecutionInProgress) {
            if (isAckEvent) {
                console.info('[ACK_TRACE][Game] queue_ack_command_in_progress', {
                    seq: eventSequence,
                    command: responseData.command ?? null,
                    activeAnimations: this.activeSceneAnimationCount,
                    pendingBefore: this.pendingBackendEvents.length
                });
            }
            this.pendingBackendEvents.push({
                eventType,
                responseData,
                context
            });
            return;
        }

        if (!phaseNavigationEvent && !immediateInputEvent && this.isInteractionLockedByAnimation()) {
            if (isAckEvent) {
                console.info('[ACK_TRACE][Game] queue_ack_animation_locked', {
                    seq: eventSequence,
                    command: responseData.command ?? null,
                    activeAnimations: this.activeSceneAnimationCount,
                    pendingBefore: this.pendingBackendEvents.length
                });
            }
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
            return;
        }

        if (eventType === 'notify') {
            const notifyCommand =
                this.pendingNotifyCommand
                ?? (typeof responseData.command === 'string' && responseData.command.trim().length > 0 ? responseData.command : null);

            if (!notifyCommand) {
                return;
            }

            this.setInputAcknowledged(false);
            this.enqueueProtocolPacket('update_frontend', {
                command: notifyCommand,
                notify_response: responseData,
                context,
            });
            this.pendingNotifyCommand = null;
            return;
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
                this.redrawAllCardMarks();
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
        this.layoutEnergyTokensInZone(this.energyZoneIdByOwner.p2);
        this.layoutEnergyTokensInZone('energy-discard');
        this.applyCardVisibilityByView();
    }

    private applyBoardView (viewMode: ViewMode): void
    {
        this.activeViewMode = viewMode;
        this.surrenderController.disarm(false);
        const rotateTopBottom = viewMode === 'p2';

        for (const holder of this.cardHolders) {
            const basePosition = this.baseCardHolderPositionById[holder.id];
            if (!basePosition) {
                continue;
            }

            const { x, y } = this.transformBoardPositionForView(basePosition.x, basePosition.y, rotateTopBottom);
            holder.setPosition(x, y);
        }

        for (const holder of this.energyHolders) {
            const basePosition = this.baseEnergyHolderPositionById[holder.id];
            if (!basePosition) {
                continue;
            }

            const { x, y } = this.transformBoardPositionForView(basePosition.x, basePosition.y, rotateTopBottom);
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

    private transformBoardPositionForView (x: number, y: number, rotate180: boolean): { x: number; y: number }
    {
        if (!rotate180) {
            return { x, y };
        }

        // A 180-degree rotation around board center (not a single-axis reflection).
        return {
            x: ((GAME_CENTER_X * 2) - x),
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

        if (viewMode === 'admin') {
            return true;
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

        if (this.activeViewMode === 'spectator') {
            return false;
        }

        if (this.activeViewMode === 'admin') {
            return true;
        }

        if (card.isTurnedOver()) {
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

        if (this.activeViewMode === 'spectator') {
            return false;
        }

        if (this.activeViewMode === 'admin') {
            return true;
        }

        return token.ownerId === this.activeViewMode;
    }

    public canDragTokenByPhase (token: EnergyToken): boolean
    {
        if (this.gamePhase !== 'phase2') {
            return false;
        }

        return token.ownerId === this.playerTurn;
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
        if (rawMode === 'admin') {
            return 'admin';
        }

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
        ownerId: PlayerId;
        holderId: string;
        radius: number;
        attachedToCardId: string | null;
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

        if (parent && parent.getOwnerId() !== options.ownerId) {
            return { ok: false, error: 'create_energy requires token owner and attached card owner to match.' };
        }

        if (parent && parent.getCardType() !== 'character') {
            return { ok: false, error: `Energy can only attach to character cards: ${parent.id}` };
        }

        if (parent && options.holderId !== this.energyZoneIdByOwner[options.ownerId]) {
            return { ok: false, error: `Attached energy must be created in ${this.energyZoneIdByOwner[options.ownerId]}.` };
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

        this.layoutEnergyTokensInZone(options.holderId);
        return { ok: true, token };
    }

    public createCardFromCommand (options: {
        id: string;
        ownerId: PlayerId;
        cardType: 'character' | 'tool' | 'item' | 'stadium' | 'supporter';
        holderId: string;
        color: number;
        AVGECardType: AVGECardType;
        AVGECardClass: string;
        hasAtk1: boolean;
        hasActive: boolean;
        hasAtk2: boolean;
        hp: number;
        maxHp: number;
        statusEffect: Record<string, number>;
        width: number;
        height: number;
        flipped: boolean;
        attachedToCardId: string | null;
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
            has_atk_2: options.hasAtk2
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

        this.layoutAllHolders();
        this.redrawAllCardMarks();

        return { ok: true, card };
    }

    private getViewModeLabel (viewMode: ViewMode): string
    {
        if (viewMode === 'admin') {
            return 'ADMIN';
        }

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
            if (this.activeViewMode === 'admin') {
                return `${ownerId} ${pileName}`.toUpperCase();
            }

            if (this.activeViewMode === 'spectator') {
                return `${ownerId} ${pileName}`.toUpperCase();
            }

            const perspective = ownerId === this.activeViewMode ? 'your' : 'opponent';
            return `${perspective} ${pileName}`.toUpperCase();
        };

        const setCardHolderLabel = (holder: CardHolder, label: string): void => {
            const preferredSize = Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(ENTITY_VISUALS.cardHolderLabelBaseSize * UI_SCALE));
            const fitted = fitBitmapTextToTwoLines({
                scene: this,
                font: 'minogram',
                text: label,
                preferredSize,
                minSize: Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(preferredSize * 0.72)),
                maxWidth: Math.max(10, Math.round(holder.width * 0.9))
            });
            holder.labelText
                .setCenterAlign()
                .setText(fitted.text)
                .setFontSize(fitted.fontSize);
        };

        const setEnergyHolderLabel = (holder: EnergyHolder, label: string): void => {
            const preferredSize = Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(ENTITY_VISUALS.energyHolderLabelBaseSize * UI_SCALE));
            const fitted = fitBitmapTextToTwoLines({
                scene: this,
                font: 'minogram',
                text: label,
                preferredSize,
                minSize: Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(preferredSize * 0.72)),
                maxWidth: Math.max(10, Math.round(holder.width * 0.9))
            });
            holder.labelText
                .setCenterAlign()
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
        const ownerId = token.ownerId;

        if (token.getZoneId() !== this.energyZoneIdByOwner[ownerId]) {
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
        const ownerZoneId = this.energyZoneIdByOwner[token.ownerId];
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

        const pileCount = Math.max(1, GAME_LAYOUT.energyTokenZonePileCount);

        if (tokens.length === 0) {
            holder.hidePileCountDisplays();
            return;
        }

        const tokenHeight = tokens[0].getDisplayHeight();
        const sidePadding = Math.round(zoneArea.width * GAME_LAYOUT.energyTokenZonePileSidePaddingRatio);
        const minX = zoneArea.left + sidePadding;
        const maxX = zoneArea.right - sidePadding;
        const defaultY = zoneArea.top + Math.round(zoneArea.height * GAME_LAYOUT.energyTokenZonePileYRatio);
        const clampedY = Phaser.Math.Clamp(
            defaultY,
            zoneArea.top + Math.round(tokenHeight / 2),
            zoneArea.bottom - Math.round(tokenHeight / 2)
        );

        const pileCenters: number[] = [];
        if (pileCount === 1 || maxX <= minX) {
            pileCenters.push(zoneArea.centerX);
        }
        else {
            const step = (maxX - minX) / (pileCount - 1);
            for (let pileIndex = 0; pileIndex < pileCount; pileIndex += 1) {
                pileCenters.push(minX + (pileIndex * step));
            }
        }

        const piles: EnergyToken[][] = Array.from({ length: pileCount }, () => []);
        tokens.forEach((token, index) => {
            const pileIndex = index % pileCount;
            piles[pileIndex].push(token);
        });

        const countLabelY = clampedY - Math.round(tokenHeight * GAME_LAYOUT.energyTokenZonePileCountLabelYOffsetRatio);

        let depthCursor = ENERGY_TOKEN_DEPTHS.minZone;
        for (let pileIndex = 0; pileIndex < pileCount; pileIndex += 1) {
            const x = Phaser.Math.Clamp(pileCenters[pileIndex] ?? zoneArea.centerX, zoneArea.left, zoneArea.right);
            const pileTokens = piles[pileIndex];

            holder.setPileCountDisplay(pileIndex, x, countLabelY, pileTokens.length);

            for (const token of pileTokens) {
                token.setPosition(x, clampedY);
                token.setDepth(depthCursor);
                depthCursor += 1;
            }
        }
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
        const ownerZoneId = this.energyZoneIdByOwner[token.ownerId];
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

        const ownerEnergyZoneId = this.energyZoneIdByOwner[token.ownerId];
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
            return 'pixelviolin';
        }

        const key = rawAssetName.toLowerCase();
        const aliases: Record<string, string> = {
            pixelviolin: 'pixelviolin',
            'pixelviolin.jpg': 'pixelviolin',
            background: 'background',
            bg: 'background',
            'bg.png': 'background',
            logo: 'logo',
            'logo.png': 'logo',
            minecraftfont: 'minecraftfont',
            'minecraftfont.png': 'minecraftfont',
            font2bitmap: 'font2bitmap',
            'font2bitmap.png': 'font2bitmap'
        };

        const resolved = aliases[key];
        if (!resolved) {
            return null;
        }

        return this.textures.exists(resolved) ? resolved : null;
    }

    public playPixelViolinExplosion (card: Card, textureKey: string): void
    {
        const durationMs = GAME_EXPLOSION.durationMs;
        const count = GAME_EXPLOSION.count;
        const baseScale = Math.max(GAME_EXPLOSION.minScale, this.objectWidth / GAME_EXPLOSION.scaleDivisor);

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

    public playShuffleAnimationForPile (holder: CardHolder): boolean
    {
        const pileCards = holder.cards.slice();
        if (pileCards.length < GAME_SHUFFLE_ANIMATION.minCardsRequired) {
            return false;
        }

        const scatterX = Math.max(GAME_SHUFFLE_ANIMATION.scatterXMinPx, Math.round(this.objectWidth * GAME_SHUFFLE_ANIMATION.scatterXWidthRatio));
        const scatterY = Math.max(GAME_SHUFFLE_ANIMATION.scatterYMinPx, Math.round(this.objectHeight * GAME_SHUFFLE_ANIMATION.scatterYHeightRatio));
        const spreadDuration = Math.max(GAME_SHUFFLE_ANIMATION.spreadDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.spreadDurationMoveDurationRatio));
        const settleDuration = Math.max(GAME_SHUFFLE_ANIMATION.settleDurationMinMs, Math.round(GAME_LAYOUT.cardMoveDurationMs * GAME_SHUFFLE_ANIMATION.settleDurationMoveDurationRatio));

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
                duration: spreadDuration,
                delay: index * GAME_SHUFFLE_ANIMATION.cardDelayStepMs,
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
