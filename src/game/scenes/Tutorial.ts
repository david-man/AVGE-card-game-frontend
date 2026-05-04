import { Scene } from 'phaser';

import { GameCommandProcessor } from '../commands/GameCommandProcessor';
import { Card, CardHolder, CardType, EnergyHolder, EnergyToken, PlayerId } from '../entities';
import { BoardInteractionController } from '../ui/BoardInteractionController';
import { CardPreviewController } from '../ui/CardPreviewController';
import { InputOverlayController, RevealOverlayCard } from '../ui/InputOverlayController';
import { PhaseHudController } from '../ui/PhaseHudController';
import { PlayerStatsHudController } from '../ui/PlayerStatsHudController';
import { SurrenderController } from '../ui/SurrenderController';
import { setImageToSceneCover } from '../ui/backgroundCover';
import { createCardPreviewPanel as createSharedCardPreviewPanel } from '../ui/cardPreviewPanelFactory';
import { registerUiClickSoundForScene } from '../ui/clickSfx';
import { createVolumeControlForScene, preloadVolumeControlAssets } from '../ui/volumeControl';
import {
    BASE_WIDTH,
    CARD_VISUALS,
    GAME_DEPTHS,
    GAME_WINNER_OVERLAY_AUDIO,
    GAME_LAYOUT,
    GAME_OVERLAY_DEPTHS,
    GAME_SCENE_VISUALS,
    GAME_SURRENDER_BUTTON_LAYOUT,
    GAME_STATUS_TEXT_LAYOUT,
    GAME_WIDTH,
    PLAYER_TURN_ATTRIBUTE_DEFAULTS,
    UI_SCALE
} from '../config';
import {
    executeBackendAnimationPayload as sceneExecuteBackendAnimationPayload,
} from './helpers/backendAnimation';
import {
    initializeBoardStateForScene,
} from './helpers/boardSetup';
import {
    resetBoardEntitiesForAuthoritativeEnvironment as sceneResetBoardEntitiesForAuthoritativeEnvironment,
} from './helpers/protocolCommandFlow';
import {
    canInteractDuringInitOpponentDisconnect as sceneCanInteractDuringInitOpponentDisconnect,
    canRenderOpponentDisconnectUi as sceneCanRenderOpponentDisconnectUi,
    safeSetOpponentDisconnectText as sceneSafeSetOpponentDisconnectText,
    setOpponentDisconnectedState as sceneSetOpponentDisconnectedState,
    startOpponentDisconnectCountdown as sceneStartOpponentDisconnectCountdown,
    stopOpponentDisconnectCountdown as sceneStopOpponentDisconnectCountdown,
} from './helpers/opponentDisconnect';
import {
    createCardActionButtons as sceneCreateCardActionButtons,
    handleCardActionButtonClick as sceneHandleCardActionButtonClick,
    refreshCardActionButtons as sceneRefreshCardActionButtons,
} from './helpers/cardActionButtons';
import {
    animateAttachEnergyTokenToCard as sceneAnimateAttachEnergyTokenToCard,
    animateCardBetweenPoints as sceneAnimateCardBetweenPoints,
    animateCardHpChange as sceneAnimateCardHpChange,
    animateCardToZone as sceneAnimateCardToZone,
    animateEnergyTokenToZone as sceneAnimateEnergyTokenToZone,
    animateToolAttachToCard as sceneAnimateToolAttachToCard,
    clearAllCardHpPulseAnimations as sceneClearAllCardHpPulseAnimations,
    playBoomExplosion as scenePlayBoomExplosion,
    resolveBoomTextureKey as sceneResolveBoomTextureKey,
} from './helpers/sceneAnimations';
import {
    playCommandSound as scenePlayCommandSound,
    playCommandSoundAsSceneAnimation as scenePlayCommandSoundAsSceneAnimation,
    playRevealSound as scenePlayRevealSound,
    playShuffleAnimationForPile as scenePlayShuffleAnimationForPile,
    playShuffleDeckSoundAndGetDurationMs as scenePlayShuffleDeckSoundAndGetDurationMs,
    playSingleCardShuffleAnimationForPile as scenePlaySingleCardShuffleAnimationForPile,
} from './helpers/sceneAudioAnimations';
import {
    appendTerminalLine as sceneAppendTerminalLine,
    beginSceneAnimation as sceneBeginSceneAnimation,
    endSceneAnimation as sceneEndSceneAnimation,
    flushPendingBackendEvents as sceneFlushPendingBackendEvents,
    setBoardInputEnabled as sceneSetBoardInputEnabled,
    setCommandExecutionInProgress as sceneSetCommandExecutionInProgress,
} from './helpers/sceneEventPipeline';
import {
    applyBoardView as sceneApplyBoardView,
    applyCardVisibilityByView as sceneApplyCardVisibilityByView,
    getViewModeLabel as sceneGetViewModeLabel,
    isZoneVisibleInSpectator as sceneIsZoneVisibleInSpectator,
} from './helpers/boardProjection';
import {
    canActOnCard as sceneCanActOnCard,
    canActOnToken as sceneCanActOnToken,
    canDragCardByPhase as sceneCanDragCardByPhase,
    canDragTokenByPhase as sceneCanDragTokenByPhase,
    canPreviewCard as sceneCanPreviewCard,
    parseCardTypeArg as sceneParseCardTypeArg,
    parseGamePhaseArg as sceneParseGamePhaseArg,
    parsePlayerTurnArg as sceneParsePlayerTurnArg,
    parseViewModeArg as sceneParseViewModeArg,
} from './helpers/interactionRules';
import {
    attachCardToCard as sceneAttachCardToCard,
    attachEnergyTokenToCard as sceneAttachEnergyTokenToCard,
    compareEnergyTokenIds as sceneCompareEnergyTokenIds,
    detachCard as sceneDetachCard,
    getAttachedChildren as sceneGetAttachedChildren,
    getAttachedEnergyTokens as sceneGetAttachedEnergyTokens,
    getTopAttachmentTarget as sceneGetTopAttachmentTarget,
    layoutEnergyTokensInZone as sceneLayoutEnergyTokensInZone,
    moveCardToZone as sceneMoveCardToZone,
    moveEnergyTokenToDiscard as sceneMoveEnergyTokenToDiscard,
    moveEnergyTokenToOwnerEnergy as sceneMoveEnergyTokenToOwnerEnergy,
    removeCardFromAllHolders as sceneRemoveCardFromAllHolders,
    sendCardToOwnerDiscard as sceneSendCardToOwnerDiscard,
    setEnergyTokenZone as sceneSetEnergyTokenZone,
    updateAttachedCardPosition as sceneUpdateAttachedCardPosition,
    updateAttachedChildrenPositions as sceneUpdateAttachedChildrenPositions,
    updateAttachedEnergyTokenPositions as sceneUpdateAttachedEnergyTokenPositions,
} from './helpers/entityGraphMutations';
import {
    createInitStartCountdownOverlay as sceneCreateInitStartCountdownOverlay,
    isInitWaitingForOpponent as sceneIsInitWaitingForOpponent,
    isPregameInitActive as sceneIsPregameInitActive,
    onPregameInitLocalMove as sceneOnPregameInitLocalMove,
    playInitStartCountdownAnimation as scenePlayInitStartCountdownAnimation,
    stopInitStartCountdownAnimation as sceneStopInitStartCountdownAnimation,
    submitInitSetupDone as sceneSubmitInitSetupDone,
} from './helpers/pregameInitFlow';
import {
    handlePhaseStateActionButtonClick as sceneHandlePhaseStateActionButtonClick,
    refreshPhaseStateActionButton as sceneRefreshPhaseStateActionButton,
} from './helpers/phaseStateActionButton';
import {
    refreshPhaseHud as sceneRefreshPhaseHud,
    refreshPlayerStatsHud as sceneRefreshPlayerStatsHud,
} from './helpers/phaseHudState';
import { TutorialFlowController } from '../tutorial/TutorialFlowController';

type ViewMode = PlayerId | 'spectator';
type GamePhase = 'no-input' | 'phase2' | 'atk';
type CardActionKey = 'atk1' | 'atk2' | 'active';
type OverlayPreviewContext = 'input' | 'reveal' | null;
type PlayerTurnAttributeKey = keyof typeof PLAYER_TURN_ATTRIBUTE_DEFAULTS;
type PlayerTurnAttributes = Record<PlayerTurnAttributeKey, number>;
type InitStage = 'init' | 'live';
const SHUFFLE_DECK_SOUND_KEY = 'shuffle-deck';
const SHUFFLE_DECK_SOUND_PATH = 'sfx/shuffle_deck.wav';
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
const TUTORIAL_OPPONENT_DISCONNECT_FONT_SIZE_MIN = GAME_STATUS_TEXT_LAYOUT.opponentDisconnectFontSizeMin;
const TUTORIAL_OPPONENT_DISCONNECT_FONT_SIZE_BASE = GAME_STATUS_TEXT_LAYOUT.opponentDisconnectFontSizeBase;
const TUTORIAL_PHASE_STATE_ACTION_FONT_SIZE_MIN = GAME_STATUS_TEXT_LAYOUT.phaseStateActionFontSizeMin;
const TUTORIAL_PHASE_STATE_ACTION_FONT_SIZE_BASE = GAME_STATUS_TEXT_LAYOUT.phaseStateActionFontSizeBase;
type PlayerSetupProfile = {
    username: string;
    attributes: Partial<PlayerTurnAttributes>;
};
type QueuedNotifyReplayCommand = {
    command: string;
    commandId: number | null;
    payload: Record<string, unknown> | null;
};
type CardHpPulseAnimationState = {
    baseScaleX: number;
    baseScaleY: number;
    overlay: Phaser.GameObjects.Rectangle;
    pulseTween: Phaser.Tweens.Tween;
    overlayTween: Phaser.Tweens.Tween;
};

export class Tutorial extends Scene
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
    waitingForOpponent: boolean;
    pregameInitStage: InitStage;
    initSetupConfirmed: boolean;
    opponentInitSetupConfirmed: boolean;
    inputAcknowledged: boolean;
    pendingInputCommand: string | null;
    pendingInputCommandId: number | null;
    pendingNotifyCommand: string | null;
    pendingNotifyCommandId: number | null;
    pendingNotifyCommandQueue: QueuedNotifyReplayCommand[];
    awaitingRemoteNotifyAck: boolean;
    remoteInputLockActive: boolean;
    opponentDisconnected: boolean;
    opponentDisconnectCountdownSeconds: number;
    opponentDisconnectCountdownTimer: Phaser.Time.TimerEvent | null;
    matchEndedAwaitingExit: boolean;
    lastRevealSoundPlayedAtMs: number;
    tutorialFlowController: TutorialFlowController | null;

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
        super('Tutorial');
        this.tutorialFlowController = null;
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('board-background', 'background/base_board.png');
        this.load.image(CARD_VISUALS.faceDownTextureKey, CARD_VISUALS.faceDownTexturePath);
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
        this.tutorialFlowController = null;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(GAME_SCENE_VISUALS.backgroundColor);
        this.camera.roundPixels = false;
        this.camera.fadeIn(220, 0, 0, 0);

        this.background = this.add.image(0, 0, 'board-background');
        setImageToSceneCover(this, this.background);
        this.background.setAlpha(GAME_SCENE_VISUALS.backgroundAlpha);

        const viewportWidth = Math.max(1, this.scale.gameSize.width);
        const viewportHeight = Math.max(1, this.scale.gameSize.height);
        const viewportCenterX = viewportWidth * 0.5;
        const viewportCenterY = viewportHeight * 0.5;

        this.boardInputEnabled = true;
        const inputLockDepth = GAME_OVERLAY_DEPTHS.inputLock;
        this.inputLockOverlay = this.add.rectangle(
            viewportCenterX,
            viewportCenterY,
            viewportWidth,
            viewportHeight,
            GAME_SCENE_VISUALS.inputLockColor,
            GAME_SCENE_VISUALS.inputLockAlpha
        )
            .setScrollFactor(0)
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
            viewportCenterX,
            viewportCenterY,
            Math.round(viewportWidth * 0.72),
            Math.round(viewportHeight * 0.24),
            0x0f172a,
            0.92
        )
            .setScrollFactor(0)
            .setStrokeStyle(2, 0xffffff, 0.85)
            .setDepth(GAME_OVERLAY_DEPTHS.opponentDisconnectBackdrop)
            .setVisible(false);
        this.opponentDisconnectText = this.add.text(viewportCenterX, viewportCenterY, 'Other player disconnected. Waiting for reconnection...')
            .setScrollFactor(0)
            .setFontSize(Math.max(
            TUTORIAL_OPPONENT_DISCONNECT_FONT_SIZE_MIN,
            Math.round(TUTORIAL_OPPONENT_DISCONNECT_FONT_SIZE_BASE * UI_SCALE)
            ))
            .setOrigin(0.5)
            .setAlign('center')
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
            canInteract: () => this.boardInputEnabled && this.canUseSurrender(),
        });
        this.playerStatsHudController = new PlayerStatsHudController(this);
        this.phaseHudController = new PhaseHudController(this);
        this.commandProcessor = new GameCommandProcessor(this);
        this.scannerCommandInProgress = false;
        this.commandExecutionInProgress = false;
        this.pendingBackendEvents = [];
        this.backendEventSequence = 0;
        this.waitingForOpponent = false;
        this.pregameInitStage = 'init';
        this.initSetupConfirmed = false;
        this.opponentInitSetupConfirmed = false;
        this.inputAcknowledged = false;
        this.pendingInputCommand = null;
        this.pendingInputCommandId = null;
        this.pendingNotifyCommand = null;
        this.pendingNotifyCommandId = null;
        this.pendingNotifyCommandQueue = [];
        this.awaitingRemoteNotifyAck = false;
        this.remoteInputLockActive = false;
        this.opponentDisconnected = false;
        this.opponentDisconnectCountdownSeconds = 0;
        this.opponentDisconnectCountdownTimer = null;
        this.matchEndedAwaitingExit = false;
        this.lastRevealSoundPlayedAtMs = Number.NEGATIVE_INFINITY;

        initializeBoardStateForScene(this, () => this.createDefaultPlayerTurnAttributes());

        this.createCardPreviewPanel();
        this.createCardActionButtons();
        this.cardActionSourceByKey = { atk1: null, atk2: null, active: null };
        this.phaseStateActionButton = null;
        this.createSurrenderButton();
        this.createPlayerStatsHud();
        this.createPhaseHud();

        this.events.once('shutdown', () => {
            this.scale.off('resize', onScaleResize);
            this.stopInitStartCountdownAnimation();
            this.clearAllCardHpPulseAnimations();
            this.tutorialFlowController?.destroy();
            this.tutorialFlowController = null;
        });

        const onScaleResize = (): void => {
            this.syncViewportOverlayLayout();
        };
        this.scale.on('resize', onScaleResize);
        this.syncViewportOverlayLayout();

        this.applyBoardView(this.activeViewMode);
        this.boardInteractionController.register();

        this.tutorialFlowController = new TutorialFlowController(this);
        this.tutorialFlowController.start();
        this.syncViewportOverlayLayout();
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

    private syncViewportOverlayLayout (): void
    {
        const viewportWidth = Math.max(1, this.scale.gameSize.width);
        const viewportHeight = Math.max(1, this.scale.gameSize.height);
        const viewportCenterX = viewportWidth * 0.5;
        const viewportCenterY = viewportHeight * 0.5;

        this.inputLockOverlay
            .setPosition(viewportCenterX, viewportCenterY)
            .setSize(viewportWidth, viewportHeight);

        this.initStartCountdownOverlay
            .setPosition(viewportCenterX, viewportCenterY)
            .setSize(viewportWidth, viewportHeight);
        this.initStartCountdownText.setPosition(viewportCenterX, viewportCenterY);

        this.opponentDisconnectBackdrop
            .setPosition(viewportCenterX, viewportCenterY)
            .setSize(
                Math.round(viewportWidth * 0.72),
                Math.round(viewportHeight * 0.24)
            );
        this.opponentDisconnectText.setPosition(viewportCenterX, viewportCenterY);
        this.tutorialFlowController?.syncViewportLayout();
    }

    public markMatchEndedAwaitingExit (): void
    {
        this.matchEndedAwaitingExit = true;
    }

    public returnToMainMenuAfterMatchEnd (): void
    {
        this.scene.start('MainMenu');
    }

    public setBoardInputEnabled (enabled: boolean, showLockOverlayWhenDisabled = true): void
    {
        sceneSetBoardInputEnabled(this, enabled, showLockOverlayWhenDisabled);
    }

    public beginSceneAnimation (): void
    {
        sceneBeginSceneAnimation(this);
    }

    public endSceneAnimation (): void
    {
        sceneEndSceneAnimation(this);
    }

    public flushPendingBackendEvents (): void
    {
        sceneFlushPendingBackendEvents(this);
    }

    public setCommandExecutionInProgress (inProgress: boolean): void
    {
        sceneSetCommandExecutionInProgress(this, inProgress);
    }

    public setInputAcknowledged (acknowledged: boolean): void
    {
        this.inputAcknowledged = acknowledged;
    }

    public enqueueProtocolPacket (
        packetType: string,
        body: Record<string, unknown>
    ): void
    {
        void packetType;
        void body;
    }

    public executeBackendReplayCommand (command: string): string | null
    {
        void command;
        return null;
    }

    public drainQueuedNotifyCommands (): void
    {
        // Tutorial is frontend-only; no backend notify queue draining is needed.
    }

    public executeBackendAnimationPayload (command: string, payload: Record<string, unknown> | null): void
    {
        sceneExecuteBackendAnimationPayload(this, command, payload);
    }

    public resetBoardEntitiesForAuthoritativeEnvironment (): void
    {
        sceneResetBoardEntitiesForAuthoritativeEnvironment(this);
    }

    public canInteractDuringInitOpponentDisconnect (): boolean
    {
        return sceneCanInteractDuringInitOpponentDisconnect(this);
    }

    public setOpponentDisconnectedState (disconnected: boolean, message?: string, graceSeconds = 0): void
    {
        sceneSetOpponentDisconnectedState(this, disconnected, message, graceSeconds);
    }

    public stopOpponentDisconnectCountdown (): void
    {
        sceneStopOpponentDisconnectCountdown(this);
    }

    public startOpponentDisconnectCountdown (baseMessage: string, graceSeconds: number): void
    {
        sceneStartOpponentDisconnectCountdown(this, baseMessage, graceSeconds);
    }

    public canRenderOpponentDisconnectUi (): boolean
    {
        return sceneCanRenderOpponentDisconnectUi(this);
    }

    public safeSetOpponentDisconnectText (text: string): void
    {
        sceneSafeSetOpponentDisconnectText(this, text);
    }

    public getDefaultEnergyTokenRadius (): number
    {
        return Math.max(GAME_LAYOUT.energyTokenRadiusMin, Math.round(this.objectWidth * GAME_LAYOUT.energyTokenRadiusWidthRatio));
    }

    private createCardPreviewPanel (): void
    {
        const { previewController } = createSharedCardPreviewPanel(this, {
            variant: 'standard',
            previewController: this.cardPreviewController,
            previewObjectWidth: this.objectWidth,
            previewObjectHeight: this.objectHeight,
        });

        this.cardPreviewController = previewController;
    }

    private createInitStartCountdownOverlay (): void
    {
        sceneCreateInitStartCountdownOverlay(this);
    }

    public stopInitStartCountdownAnimation (): void
    {
        sceneStopInitStartCountdownAnimation(this);
    }

    public playInitStartCountdownAnimation (): void
    {
        scenePlayInitStartCountdownAnimation(this);
    }

    private createCardActionButtons (): void
    {
        sceneCreateCardActionButtons(this);
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
            TUTORIAL_PHASE_STATE_ACTION_FONT_SIZE_MIN,
            Math.round(TUTORIAL_PHASE_STATE_ACTION_FONT_SIZE_BASE * UI_SCALE)
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
        sceneHandlePhaseStateActionButtonClick(this);
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
        sceneRefreshPlayerStatsHud(this);
    }

    private refreshPhaseHud (): void
    {
        sceneRefreshPhaseHud(this);
    }

    public refreshPhaseStateActionButton (): void
    {
        sceneRefreshPhaseStateActionButton(this);
    }

    public submitInitSetupDone (): void
    {
        if (this.tutorialFlowController?.handleInitSetupDone() === true) {
            return;
        }

        sceneSubmitInitSetupDone(this);
    }

    public isPregameInitActive (): boolean
    {
        return sceneIsPregameInitActive(this);
    }

    public isInitWaitingForOpponent (): boolean
    {
        return sceneIsInitWaitingForOpponent(this);
    }

    public onPregameInitLocalMove (): void
    {
        sceneOnPregameInitLocalMove(this);
        this.tutorialFlowController?.onPregameInitLocalMove();
    }

    private getPlayerUsername (playerId: PlayerId): string
    {
        return this.playerSetupProfileById[playerId]?.username ?? this.getPlayerTurnLabel(playerId);
    }

    public handleCardActionButtonClick (actionKey: CardActionKey): void
    {
        sceneHandleCardActionButtonClick(this, actionKey);
    }

    private refreshCardActionButtons (): void
    {
        sceneRefreshCardActionButtons(this);
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
        sceneAppendTerminalLine(this, line);
    }

    public scrollTerminalToLatest (): void
    {
        // Frontend terminal was removed; keep method for command processor compatibility.
    }

    private emitBackendEvent (eventType: string, responseData: Record<string, unknown>): void
    {
        this.tutorialFlowController?.onFrontendEvent(eventType, responseData);
    }

    public dispatchFrontendEvent (
        eventType: string,
        responseData: Record<string, unknown>,
        _context: Record<string, unknown>
    ): void
    {
        this.tutorialFlowController?.onFrontendEvent(eventType, responseData);
    }

    public canUsePhaseStateAction (action: 'phase2-attack' | 'atk-skip' | 'init-done'): boolean
    {
        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canUsePhaseStateAction(action);
    }

    public canUseCardAction (actionKey: CardActionKey, card: Card | null): boolean
    {
        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canUseCardAction(actionKey, card);
    }

    public shouldHidePhaseStateActionButton (): boolean
    {
        return this.tutorialFlowController?.shouldHidePhaseStateActionButton() === true;
    }

    public canUseSurrender (): boolean
    {
        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canUseSurrender();
    }

    public showTutorialRevealCardPreview (card: RevealOverlayCard): void
    {
        const toCardType = (rawTypeLabel: string): CardType => {
            const normalized = rawTypeLabel.trim().toLowerCase();
            if (normalized === 'character') {
                return 'character';
            }

            if (normalized === 'tool') {
                return 'tool';
            }

            if (normalized === 'stadium') {
                return 'stadium';
            }

            if (normalized === 'supporter') {
                return 'supporter';
            }

            return 'item';
        };

        const cardType = toCardType(card.cardTypeLabel);
        const isCharacter = cardType === 'character';

        const previewModel = {
            baseColor: card.cardColor,
            isTurnedOver: () => false,
            getBorderColor: () => 0xffffff,
            getCardClass: () => card.cardClassLabel,
            getCardType: () => cardType,
            getAVGECardType: () => 'NONE',
            getHp: () => 120,
            getMaxHp: () => 120,
            hasAttackOne: () => isCharacter,
            getAttackOneName: () => (isCharacter ? 'Demo Attack' : null),
            getAttackOneCost: () => (isCharacter ? 1 : null),
            hasAttackTwo: () => false,
            getAttackTwoName: () => null,
            getAttackTwoCost: () => null,
            hasActiveAbility: () => isCharacter,
            hasPassiveAbility: () => false,
            getActiveAbilityName: () => (isCharacter ? 'Demo Ability' : null),
            getStatusEffects: () => ({ Arranger: 0, Goon: 0, Maid: 0 }),
            getRetreatCost: () => 1,
            getOwnerId: () => 'p1' as PlayerId,
        } as unknown as Card;

        this.overlayPreviewContext = 'reveal';
        this.cardPreviewController.show(previewModel, {
            ownerUsername: 'TUTORIAL',
            forceFaceUp: true,
            hideOwnerLine: true,
        });
        this.refreshCardActionButtons();
    }

    public hideTutorialRevealCardPreview (): void
    {
        this.hideCardPreview();
        this.overlayPreviewContext = null;
        this.refreshCardActionButtons();
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

    public clearCardSelection (): void
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
        sceneApplyBoardView(this, viewMode);
    }

    public isZoneVisibleToView (zoneId: string, ownerId: PlayerId, viewMode: ViewMode = this.activeViewMode): boolean
    {
        if (viewMode === 'spectator') {
            return sceneIsZoneVisibleInSpectator(zoneId);
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
        sceneApplyCardVisibilityByView(this);
    }

    public canActOnCard (card: Card): boolean
    {
        if (!sceneCanActOnCard(this, card)) {
            return false;
        }

        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canActOnCard(card);
    }

    private canPreviewCard (card: Card): boolean
    {
        return sceneCanPreviewCard(card);
    }

    public canDragCardByPhase (card: Card): boolean
    {
        if (!sceneCanDragCardByPhase(this, card)) {
            return false;
        }

        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canDragCardByPhase(card);
    }

    public canActOnToken (token: EnergyToken): boolean
    {
        if (!sceneCanActOnToken(this, token)) {
            return false;
        }

        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canActOnToken(token);
    }

    public canDragTokenByPhase (token: EnergyToken): boolean
    {
        if (!sceneCanDragTokenByPhase(this, token)) {
            return false;
        }

        if (!this.tutorialFlowController) {
            return true;
        }

        return this.tutorialFlowController.canDragTokenByPhase(token);
    }

    public parseGamePhaseArg (rawPhase: string): GamePhase | null
    {
        return sceneParseGamePhaseArg(rawPhase);
    }

    public parsePlayerTurnArg (rawTurn: string): PlayerId | null
    {
        return sceneParsePlayerTurnArg(rawTurn);
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
        return sceneParseViewModeArg(rawMode);
    }

    public parseCardTypeArg (rawType: string): 'character' | 'tool' | 'item' | 'stadium' | 'supporter' | null
    {
        return sceneParseCardTypeArg(rawType);
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
        return sceneGetViewModeLabel(this, viewMode);
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
        sceneAnimateCardToZone(this, card, zoneId, onComplete);
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
        sceneAnimateCardBetweenPoints(this, card, fromX, fromY, toX, toY, onComplete);
    }

    public animateCardHpChange (
        card: Card,
        nextHp: number,
        nextMaxHp: number
    ): void
    {
        sceneAnimateCardHpChange(this, card, nextHp, nextMaxHp);
    }

    public attachCardToCard (child: Card, parent: Card): void
    {
        sceneAttachCardToCard(this, child, parent);
    }

    public animateToolAttachToCard (child: Card, parent: Card, onComplete?: () => void): void
    {
        sceneAnimateToolAttachToCard(this, child, parent, onComplete);
    }

    public getTopAttachmentTarget (baseCard: Card): Card
    {
        return sceneGetTopAttachmentTarget(this, baseCard);
    }

    public detachCard (card: Card): void
    {
        sceneDetachCard(this, card);
    }

    public getAttachedChildren (parentCardId: string): Card[]
    {
        return sceneGetAttachedChildren(this, parentCardId);
    }

    private clearAllCardHpPulseAnimations (): void
    {
        sceneClearAllCardHpPulseAnimations(this);
    }

    public updateAttachedChildrenPositions (parent: Card): void
    {
        sceneUpdateAttachedChildrenPositions(this, parent);
    }

    public getAttachedEnergyTokens (parentCardId: string): EnergyToken[]
    {
        return sceneGetAttachedEnergyTokens(this, parentCardId);
    }

    public compareEnergyTokenIds (a: string, b: string): number
    {
        return sceneCompareEnergyTokenIds(this, a, b);
    }

    public updateAttachedEnergyTokenPositions (parent: Card): void
    {
        sceneUpdateAttachedEnergyTokenPositions(this, parent);
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
        sceneAttachEnergyTokenToCard(this, token, parent);
    }

    public layoutEnergyTokensInZone (zoneId: string): void
    {
        sceneLayoutEnergyTokensInZone(this, zoneId);
    }

    public moveEnergyTokenToDiscard (token: EnergyToken): void
    {
        sceneMoveEnergyTokenToDiscard(this, token);
    }

    public animateEnergyTokenToZone (token: EnergyToken, zoneId: string, onComplete?: () => void): void
    {
        sceneAnimateEnergyTokenToZone(this, token, zoneId, onComplete);
    }

    public animateAttachEnergyTokenToCard (token: EnergyToken, parent: Card, onComplete?: () => void): void
    {
        sceneAnimateAttachEnergyTokenToCard(this, token, parent, onComplete);
    }

    public moveEnergyTokenToOwnerEnergy (token: EnergyToken): void
    {
        sceneMoveEnergyTokenToOwnerEnergy(this, token);
    }

    public setEnergyTokenZone (token: EnergyToken, zoneId: string): void
    {
        sceneSetEnergyTokenZone(this, token, zoneId);
    }

    public resolveBoomTextureKey (rawAssetName?: string): string | null
    {
        return sceneResolveBoomTextureKey(this, rawAssetName);
    }

    public playBoomExplosion (card: Card, textureKey: string): void
    {
        scenePlayBoomExplosion(this, card, textureKey);
    }

    public updateAttachedCardPosition (child: Card, parent: Card): void
    {
        sceneUpdateAttachedCardPosition(this, child, parent);
    }

    public isDeckOrDiscardHolderId (holderId: string): boolean
    {
        const normalizedHolderId = holderId.trim().toLowerCase();
        return normalizedHolderId.endsWith('-deck') || normalizedHolderId.endsWith('-discard');
    }

    public playShuffleDeckSoundAndGetDurationMs (): number
    {
        return scenePlayShuffleDeckSoundAndGetDurationMs(this);
    }


    public playRevealSound (minIntervalMs: number = 0): void
    {
        scenePlayRevealSound(this, minIntervalMs);
    }

    public playCommandSound (rawSoundKey: string): boolean
    {
        return scenePlayCommandSound(this, rawSoundKey);
    }

    public playCommandSoundAsSceneAnimation (rawSoundKey: string): boolean
    {
        return scenePlayCommandSoundAsSceneAnimation(this, rawSoundKey);
    }

    public playShuffleAnimationForPile (holder: CardHolder, totalDurationMs?: number): boolean
    {
        return scenePlayShuffleAnimationForPile(this, holder, totalDurationMs);
    }

    public playSingleCardShuffleAnimationForPile (card: Card, holder: CardHolder): boolean
    {
        return scenePlaySingleCardShuffleAnimationForPile(this, card, holder);
    }

    public removeCardFromAllHolders (card: Card): void
    {
        sceneRemoveCardFromAllHolders(this, card);
    }

    public moveCardToZone (card: Card, zoneId: string, onComplete?: () => void, insertIndex?: number): void
    {
        sceneMoveCardToZone(this, card, zoneId, onComplete, insertIndex);
    }

    public sendCardToOwnerDiscard (card: Card, onComplete?: () => void): void
    {
        sceneSendCardToOwnerDiscard(this, card, onComplete);
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
