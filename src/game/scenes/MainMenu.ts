import { Scene, GameObjects } from 'phaser';
import {
    GAME_CENTER_X,
    GAME_CENTER_Y,
    GAME_HEIGHT,
    GAME_WIDTH,
    MAIN_MENU_LAYOUT,
    MAIN_MENU_LOGO_ASSET,
    MAIN_MENU_LOGO_LAYOUT,
    MAIN_MENU_LOGO_LINK,
    MAIN_MENU_TITLE_ASSET,
    MAIN_MENU_TITLE_LAYOUT,
    MAIN_MENU_TEXT_LAYOUT,
    UI_RECTANGLE_CORNER_RADIUS,
    UI_RECTANGLE_CORNER_RADIUS_MAX_WIDTH_RATIO,
    UI_SCALE
} from '../config';
import {
    clearClientSessionState,
    fetchRouterSession,
    logoutRouterSession,
    fetchUserDecks,
    enqueueForMatchmaking,
    fetchMatchmakingStatus,
    isSessionSupersededError,
    subscribeToRouterSessionEvents,
    rejoinAssignedRoom,
    leaveMatchmakingQueue,
    ROOM_BACKEND_BASE_URL_STORAGE_KEY,
    ROUTER_SESSION_ID_STORAGE_KEY,
    ROUTER_USERNAME_STORAGE_KEY,
    RouterAssignedRoom,
} from '../Network';
import { registerUiClickSoundForScene } from '../ui/clickSfx';
import { createVolumeControlForScene, preloadVolumeControlAssets } from '../ui/volumeControl';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    title: GameObjects.Image;
    subtitle: GameObjects.Text;
    startButton: GameObjects.Rectangle;
    startButtonLabel: GameObjects.Text;
    decksButton: GameObjects.Rectangle;
    decksButtonLabel: GameObjects.Text;
    private usernameButton: GameObjects.Rectangle | null;
    private usernameIndicator: GameObjects.Text | null;
    private logoutButton: GameObjects.Rectangle | null;
    private logoutButtonLabel: GameObjects.Text | null;
    private logoutHoverHideTimer: Phaser.Time.TimerEvent | null;
    private transitioning: boolean;
    private matchmakingPollTimer: Phaser.Time.TimerEvent | null;
    private authSessionUnsubscribe: (() => void) | null;
    private matchmakingInProgress: boolean;
    private authReady: boolean;
    private disconnectGateActive: boolean;
    private disconnectGateBackdrop: GameObjects.Rectangle | null;
    private disconnectGateTitle: GameObjects.Text | null;
    private disconnectGateContinueButton: GameObjects.Rectangle | null;
    private disconnectGateContinueLabel: GameObjects.Text | null;
    private selectedDeckId: string | null;
    private pageHideHandler: (() => void) | null;
    private beforeUnloadHandler: (() => void) | null;

    constructor ()
    {
        super('MainMenu');
        this.transitioning = false;
        this.matchmakingPollTimer = null;
        this.authSessionUnsubscribe = null;
        this.matchmakingInProgress = false;
        this.authReady = false;
        this.usernameButton = null;
        this.usernameIndicator = null;
        this.logoutButton = null;
        this.logoutButtonLabel = null;
        this.logoutHoverHideTimer = null;
        this.disconnectGateActive = false;
        this.disconnectGateBackdrop = null;
        this.disconnectGateTitle = null;
        this.disconnectGateContinueButton = null;
        this.disconnectGateContinueLabel = null;
        this.selectedDeckId = null;
        this.pageHideHandler = null;
        this.beforeUnloadHandler = null;
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'background/background_element.png');
        this.load.image(MAIN_MENU_LOGO_ASSET.key, MAIN_MENU_LOGO_ASSET.filePath);
        this.load.image(MAIN_MENU_TITLE_ASSET.key, MAIN_MENU_TITLE_ASSET.filePath);
        preloadVolumeControlAssets(this);
    }

    create ()
    {
        registerUiClickSoundForScene(this);
        createVolumeControlForScene(this);

        this.transitioning = false;
        this.matchmakingInProgress = false;
        this.authReady = false;
        this.stopMatchmakingPolling();
        this.cameras.main.fadeIn(180, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.9);

        const logoMargin = Math.max(MAIN_MENU_LOGO_LAYOUT.marginMin, Math.round(MAIN_MENU_LOGO_LAYOUT.marginBase * UI_SCALE));
        const cornerLogo = this.add.image(logoMargin, GAME_HEIGHT - logoMargin, MAIN_MENU_LOGO_ASSET.key)
            .setOrigin(0, 1)
            .setDepth(8)
            .setAlpha(MAIN_MENU_LOGO_LAYOUT.alpha)
            .setInteractive({ useHandCursor: true });
        (cornerLogo as Phaser.GameObjects.Image & { __avgeDisableClickSfx?: boolean }).__avgeDisableClickSfx = true;
        const maxLogoWidth = GAME_WIDTH * MAIN_MENU_LOGO_LAYOUT.maxWidthRatio;
        const maxLogoHeight = GAME_HEIGHT * MAIN_MENU_LOGO_LAYOUT.maxHeightRatio;
        const logoScale = Math.min(
            maxLogoWidth / cornerLogo.width,
            maxLogoHeight / cornerLogo.height,
            1
        );
        cornerLogo.setScale(logoScale);

        cornerLogo.on('pointerover', () => {
            this.tweens.killTweensOf(cornerLogo);
            cornerLogo.setAlpha(MAIN_MENU_LOGO_LAYOUT.hoverAlpha);
            this.tweens.add({
                targets: cornerLogo,
                scaleX: logoScale * MAIN_MENU_LOGO_LAYOUT.hoverScaleMultiplier,
                scaleY: logoScale * MAIN_MENU_LOGO_LAYOUT.hoverScaleMultiplier,
                duration: MAIN_MENU_LOGO_LAYOUT.hoverTweenDurationMs,
                ease: 'Sine.easeOut'
            });
        });

        cornerLogo.on('pointerout', () => {
            this.tweens.killTweensOf(cornerLogo);
            cornerLogo.setAlpha(MAIN_MENU_LOGO_LAYOUT.alpha);
            this.tweens.add({
                targets: cornerLogo,
                scaleX: logoScale,
                scaleY: logoScale,
                duration: MAIN_MENU_LOGO_LAYOUT.hoverTweenDurationMs,
                ease: 'Sine.easeOut'
            });
        });

        cornerLogo.on('pointerdown', () => {
            if (typeof window === 'undefined') {
                return;
            }

            const targetUrl = MAIN_MENU_LOGO_LINK.url.trim();
            if (targetUrl.length === 0) {
                return;
            }

            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        });

        const titleTargetHeight = Math.max(
            MAIN_MENU_TITLE_LAYOUT.targetHeightMin,
            Math.round(MAIN_MENU_TITLE_LAYOUT.targetHeightBase * UI_SCALE)
        );
        this.title = this.add.image(
            Math.round(GAME_WIDTH * MAIN_MENU_TITLE_LAYOUT.xRatio),
            Math.round(GAME_HEIGHT * MAIN_MENU_TITLE_LAYOUT.yRatio),
            MAIN_MENU_TITLE_ASSET.key
        ).setOrigin(0.5);
        if (this.title.height > 0) {
            const titleScale = titleTargetHeight / this.title.height;
            this.title.setScale(titleScale);
        }

        const subtitleRightMargin = Math.round(MAIN_MENU_LAYOUT.subtitleRightMarginBase * UI_SCALE);
        const subtitleBottomMargin = Math.round(MAIN_MENU_LAYOUT.subtitleBottomMarginBase * UI_SCALE);
        this.subtitle = this.add.text(
            GAME_WIDTH - subtitleRightMargin,
            GAME_HEIGHT - subtitleBottomMargin,
            'From: Brown AVGE'
        ).setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.subtitleFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.subtitleFontSizeBase * UI_SCALE)))
            .setOrigin(1, 1)
            .setAlign('right')
            .setTint(0xcbd5e1);

        const accountMargin = Math.round(MAIN_MENU_LAYOUT.accountMarginBase * UI_SCALE);
        const accountTop = Math.round(MAIN_MENU_LAYOUT.accountTopBase * UI_SCALE);
        const logoutWidth = Math.round(MAIN_MENU_LAYOUT.logoutWidthBase * UI_SCALE);
        const logoutHeight = Math.round(MAIN_MENU_LAYOUT.logoutHeightBase * UI_SCALE);
        const accountUiDepth = MAIN_MENU_LAYOUT.accountUiDepth;
        const logoutBottomMargin = Math.round(MAIN_MENU_LAYOUT.logoutBottomMarginBase * UI_SCALE);
        const persistedUsername = typeof window !== 'undefined'
            ? window.localStorage.getItem(ROUTER_USERNAME_STORAGE_KEY)
            : null;

        this.usernameIndicator = this.add.text(0, 0, this.formatUsernameIndicator(persistedUsername)).setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.accountFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.accountFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xe2e8f0)
            .setAlign('center')
            .setDepth(accountUiDepth + 1);

        this.usernameButton = this.add.rectangle(
            GAME_WIDTH - accountMargin,
            accountTop,
            10,
            10,
            0x0f172a,
            0.9
        )
            .setStrokeStyle(2, 0xffffff, 0.8)
            .setDepth(accountUiDepth)
            .setInteractive({ useHandCursor: true });
        this.refreshUsernameButtonLayout();
        this.applyUsernameButtonBaseStyle();

        this.logoutButton = this.add.rectangle(
            GAME_WIDTH - accountMargin - Math.round(logoutWidth / 2),
            GAME_HEIGHT - logoutBottomMargin - Math.round(logoutHeight / 2),
            logoutWidth,
            logoutHeight,
            0x7f1d1d,
            0.95
        )
            .setStrokeStyle(2, 0xffffff, 0.8)
            .setDepth(accountUiDepth)
            .setInteractive({ useHandCursor: true });

        this.logoutButtonLabel = this.add.text(this.logoutButton.x, this.logoutButton.y, 'LOG OUT').setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.accountFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.accountFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(accountUiDepth + 1);

        this.usernameButton.on('pointerover', () => {
            if (this.disconnectGateActive || this.transitioning) {
                return;
            }

            this.applyUsernameButtonHoverStyle();
            this.showLogoutButtonForAccountHover();
        });

        this.usernameButton.on('pointerout', () => {
            this.applyUsernameButtonBaseStyle();
            this.scheduleLogoutButtonHideFromHover();
        });

        this.logoutButton.on('pointerover', () => {
            this.cancelLogoutButtonHideTimer();
            this.applyLogoutButtonHoverStyle();
        });

        this.logoutButton.on('pointerout', () => {
            this.applyLogoutButtonBaseStyle();
            this.scheduleLogoutButtonHideFromHover();
        });

        this.logoutButton.on('pointerdown', () => {
            if (this.disconnectGateActive || this.transitioning) {
                return;
            }
            void this.logoutAndReturnToLogin();
        });
        this.setLogoutButtonVisible(false);

        const buttonWidth = Math.round(MAIN_MENU_LAYOUT.buttonWidthBase * UI_SCALE);
        const buttonHeight = Math.round(MAIN_MENU_LAYOUT.buttonHeightBase * UI_SCALE);
        const buttonY = Math.round(GAME_HEIGHT * MAIN_MENU_LAYOUT.buttonYRatio);

        this.startButton = this.add.rectangle(
            GAME_CENTER_X,
            buttonY,
            buttonWidth,
            buttonHeight,
            0x0f172a,
            0.9
        )
            .setStrokeStyle(3, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.startButtonLabel = this.add.text(GAME_CENTER_X, buttonY, 'START').setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.startFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.startFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.decksButton = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(buttonY - (MAIN_MENU_LAYOUT.decksButtonOffsetYBase * UI_SCALE)),
            buttonWidth,
            buttonHeight,
            0x0f172a,
            0.9
        )
            .setStrokeStyle(3, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.decksButtonLabel = this.add.text(GAME_CENTER_X, Math.round(buttonY - (MAIN_MENU_LAYOUT.decksButtonOffsetYBase * UI_SCALE)), 'DECK BUILDER').setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.deckBuilderFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.deckBuilderFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.startButton.on('pointerover', () => {
            if (this.matchmakingInProgress) {
                this.startButton.setFillStyle(0x991b1b, 0.98);
                this.startButtonLabel.setTint(0xffffff);
                return;
            }

            this.startButton.setFillStyle(0x1e293b, 0.95);
            this.startButtonLabel.setTint(0xfef08a);
        });

        this.startButton.on('pointerout', () => {
            if (this.matchmakingInProgress) {
                this.startButton.setFillStyle(0x7f1d1d, 0.96);
                this.startButtonLabel.setTint(0xffffff);
                return;
            }

            this.startButton.setFillStyle(0x0f172a, 0.9);
            this.startButtonLabel.setTint(0xffffff);
        });

        this.decksButton.on('pointerover', () => {
            if (this.matchmakingInProgress) {
                return;
            }

            this.decksButton.setFillStyle(0x1e293b, 0.95);
            this.decksButtonLabel.setTint(0xfef08a);
        });

        this.decksButton.on('pointerout', () => {
            if (this.matchmakingInProgress) {
                return;
            }

            this.decksButton.setFillStyle(0x0f172a, 0.9);
            this.decksButtonLabel.setTint(0xffffff);
        });

        const startGame = () => {
            if (this.disconnectGateActive || !this.authReady || this.transitioning) {
                return;
            }

            if (this.matchmakingInProgress) {
                void this.cancelMatchmakingFlow();
                return;
            }

            if (!this.selectedDeckId) {
                this.updateMatchmakingSubtitle('No deck selected. Open Deck Builder.');
                this.scene.start('DeckBuilder');
                return;
            }

            this.matchmakingInProgress = true;
            this.applyQueueUiState(true);
            this.updateMatchmakingSubtitle('Connecting to matchmaking...');
            void this.beginMatchmakingFlow();
        };

        this.startButton.on('pointerdown', startGame);
        this.decksButton.on('pointerdown', () => {
            if (this.disconnectGateActive || this.transitioning || this.matchmakingInProgress) {
                return;
            }
            this.scene.start('DeckBuilder');
        });
        this.input.keyboard?.once('keydown-ENTER', startGame);

        if (typeof window !== 'undefined') {
            this.pageHideHandler = () => {
                this.leaveQueueOnDisconnect();
            };
            this.beforeUnloadHandler = () => {
                this.leaveQueueOnDisconnect();
            };
            window.addEventListener('pagehide', this.pageHideHandler);
            window.addEventListener('beforeunload', this.beforeUnloadHandler);
        }

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.stopMatchmakingPolling();
            this.stopAuthSessionPush();
            this.leaveQueueOnDisconnect();
            this.cancelLogoutButtonHideTimer();

            if (typeof window !== 'undefined') {
                if (this.pageHideHandler) {
                    window.removeEventListener('pagehide', this.pageHideHandler);
                    this.pageHideHandler = null;
                }
                if (this.beforeUnloadHandler) {
                    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
                    this.beforeUnloadHandler = null;
                }
            }
        });

        const initData = this.scene.settings.data as { systemMessage?: unknown } | undefined;
        if (typeof initData?.systemMessage === 'string' && initData.systemMessage.trim().length > 0) {
            this.showDisconnectGate('Game Server Disconnected');
        }

        void this.ensureAuthenticatedSession();
    }

    private startAuthSessionPush (sessionId: string): void
    {
        this.stopAuthSessionPush();
        this.authSessionUnsubscribe = subscribeToRouterSessionEvents(sessionId, ({ reason, message }) => {
            if (reason !== 'session_superseded') {
                return;
            }
            this.forceSessionSupersededLogout(message);
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

    private forceSessionSupersededLogout (message?: string): void
    {
        if (this.transitioning) {
            return;
        }

        this.transitioning = true;
        this.stopMatchmakingPolling();
        this.stopAuthSessionPush();
        this.matchmakingInProgress = false;
        this.authReady = false;

        clearClientSessionState();
        this.scene.start('Login', {
            systemMessage: typeof message === 'string' && message.trim().length > 0
                ? message
                : 'Signed out: account opened on another client.'
        });
    }

    private async ensureAuthenticatedSession (): Promise<void>
    {
        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.scene.start('Login');
            return;
        }

        this.startButton.disableInteractive();
        this.updateMatchmakingSubtitle('Checking session...');

        const auth = await fetchRouterSession(sessionId);
        if (!auth.ok || !auth.sessionId || !auth.username) {
            if (isSessionSupersededError(auth)) {
                this.forceSessionSupersededLogout();
                return;
            }
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
                window.localStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
            }
            this.scene.start('Login');
            return;
        }

        this.persistMatchmakingIdentity(auth.sessionId, auth.username);
        this.startAuthSessionPush(auth.sessionId);
        this.usernameIndicator?.setText(this.formatUsernameIndicator(auth.username));
        this.refreshUsernameButtonLayout();

        const resumed = await this.resumeAssignedRoomIfPresent(auth.sessionId, auth.currentRoomId ?? null);
        if (resumed) {
            return;
        }

        const decksResult = await fetchUserDecks(auth.sessionId);
        this.selectedDeckId = decksResult.ok ? (decksResult.selectedDeckId ?? null) : null;
        this.authReady = true;
        this.applyQueueUiState(false);
        this.updateMatchmakingSubtitle(this.selectedDeckId ? 'From: Brown AVGE' : 'No deck selected. Open Deck Builder.');
    }

    private async resumeAssignedRoomIfPresent (sessionId: string, currentRoomId: string | null): Promise<boolean>
    {
        const status = await fetchMatchmakingStatus(sessionId);
        if (status.ok && status.status === 'assigned' && status.room) {
            const roomHealthy = await this.isAssignedRoomReachable(status.room.endpointUrl);
            if (!roomHealthy) {
                this.updateMatchmakingSubtitle('Saved room is unavailable. Returning to menu.');
                return false;
            }

            this.launchAssignedRoom(status.room);
            return true;
        }

        if (typeof currentRoomId === 'string' && currentRoomId.trim().length > 0) {
            const rejoin = await rejoinAssignedRoom(sessionId, currentRoomId);
            if (!rejoin.ok || !rejoin.room) {
                return false;
            }

            const roomHealthy = await this.isAssignedRoomReachable(rejoin.room.endpointUrl);
            if (!roomHealthy) {
                this.updateMatchmakingSubtitle('Saved room is unavailable. Returning to menu.');
                return false;
            }

            this.launchAssignedRoom(rejoin.room);
            return true;
        }

        return false;
    }

    private showDisconnectGate (titleText: string): void
    {
        this.disconnectGateActive = true;

        this.title.setVisible(false);
        this.subtitle.setVisible(false);
        this.startButton.setVisible(false).disableInteractive();
        this.startButtonLabel.setVisible(false);
        this.decksButton.setVisible(false).disableInteractive();
        this.decksButtonLabel.setVisible(false);
        this.cancelLogoutButtonHideTimer();
        this.usernameButton?.setVisible(false).disableInteractive();
        this.usernameIndicator?.setVisible(false);
        this.logoutButton?.setVisible(false).disableInteractive();
        this.logoutButtonLabel?.setVisible(false);

        const depthBase = 900;
        const buttonWidth = Math.round(220 * UI_SCALE);
        const buttonHeight = Math.round(70 * UI_SCALE);
        const buttonY = Math.round(GAME_HEIGHT * 0.62);

        this.disconnectGateBackdrop = this.add.rectangle(
            GAME_CENTER_X,
            GAME_CENTER_Y,
            GAME_WIDTH,
            GAME_HEIGHT,
            0x020617,
            0.92
        ).setDepth(depthBase);

        this.disconnectGateTitle = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.45), titleText).setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.disconnectTitleFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.disconnectTitleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(depthBase + 1);

        this.disconnectGateContinueButton = this.add.rectangle(
            GAME_CENTER_X,
            buttonY,
            buttonWidth,
            buttonHeight,
            0x0f172a,
            0.95
        )
            .setStrokeStyle(3, 0xffffff, 0.9)
            .setDepth(depthBase + 1)
            .setInteractive({ useHandCursor: true });

        this.disconnectGateContinueLabel = this.add.text(GAME_CENTER_X, buttonY, 'CONTINUE').setFontSize(Math.max(MAIN_MENU_TEXT_LAYOUT.disconnectContinueFontSizeMin, Math.round(MAIN_MENU_TEXT_LAYOUT.disconnectContinueFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(depthBase + 2);

        this.disconnectGateContinueButton.on('pointerover', () => {
            this.disconnectGateContinueButton?.setFillStyle(0x1e293b, 0.98);
            this.disconnectGateContinueLabel?.setTint(0xfef08a);
        });

        this.disconnectGateContinueButton.on('pointerout', () => {
            this.disconnectGateContinueButton?.setFillStyle(0x0f172a, 0.95);
            this.disconnectGateContinueLabel?.setTint(0xffffff);
        });

        this.disconnectGateContinueButton.on('pointerdown', () => {
            this.hideDisconnectGate();
        });
    }

    private hideDisconnectGate (): void
    {
        this.disconnectGateActive = false;

        this.disconnectGateBackdrop?.destroy();
        this.disconnectGateTitle?.destroy();
        this.disconnectGateContinueButton?.destroy();
        this.disconnectGateContinueLabel?.destroy();

        this.disconnectGateBackdrop = null;
        this.disconnectGateTitle = null;
        this.disconnectGateContinueButton = null;
        this.disconnectGateContinueLabel = null;

        this.title.setVisible(true);
        this.subtitle.setVisible(true);
        this.startButton.setVisible(true).setInteractive({ useHandCursor: true });
        this.startButtonLabel.setVisible(true).setText('START').setTint(0xffffff);
        this.startButton.setFillStyle(0x0f172a, 0.9);
        this.decksButton.setVisible(true).setInteractive({ useHandCursor: true }).setFillStyle(0x0f172a, 0.9);
        this.decksButtonLabel.setVisible(true).setTint(0xffffff);
        this.usernameButton?.setVisible(true).setInteractive({ useHandCursor: true });
        this.usernameIndicator?.setVisible(true);
        this.applyUsernameButtonBaseStyle();
        this.setLogoutButtonVisible(false);
        this.applyLogoutButtonBaseStyle();
        this.updateMatchmakingSubtitle('From: Brown AVGE');
    }

    private async logoutAndReturnToLogin (): Promise<void>
    {
        if (this.transitioning) {
            return;
        }

        this.stopMatchmakingPolling();
        this.matchmakingInProgress = false;
        this.transitioning = false;
        this.authReady = false;

        this.startButton.disableInteractive();
        this.decksButton.disableInteractive();
        this.logoutButton?.disableInteractive();
        this.updateMatchmakingSubtitle('Logging out...');

        const sessionId = this.getStoredSessionId();
        if (sessionId) {
            await logoutRouterSession(sessionId);
        }

        if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
            window.localStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
            window.sessionStorage.removeItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY);
            window.sessionStorage.removeItem('avge_protocol_client_slot');
            window.sessionStorage.removeItem('avge_protocol_reconnect_token');
            window.localStorage.removeItem(ROUTER_USERNAME_STORAGE_KEY);
        }

        this.scene.start('Login');
    }

    private async beginMatchmakingFlow (): Promise<void>
    {
        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.applyQueueUiState(false);
            this.scene.start('Login');
            return;
        }

        const auth = await fetchRouterSession(sessionId);
        if (!auth.ok || !auth.sessionId || !auth.username) {
            if (isSessionSupersededError(auth)) {
                this.forceSessionSupersededLogout();
                return;
            }
            this.applyQueueUiState(false);
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
                window.localStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
            }
            this.scene.start('Login');
            return;
        }

        this.persistMatchmakingIdentity(auth.sessionId, auth.username);
        this.startAuthSessionPush(auth.sessionId);

        const deckState = await fetchUserDecks(auth.sessionId);
        this.selectedDeckId = deckState.ok ? (deckState.selectedDeckId ?? null) : null;
        if (!this.selectedDeckId) {
            this.matchmakingInProgress = false;
            this.applyQueueUiState(false);
            this.updateMatchmakingSubtitle('No deck selected. Open Deck Builder.');
            this.scene.start('DeckBuilder');
            return;
        }

        const enqueueResult = await enqueueForMatchmaking(auth.sessionId);
        if (!enqueueResult.ok) {
            this.handleMatchmakingFailure(enqueueResult.error ?? 'Failed to enter matchmaking queue.');
            return;
        }

        if (enqueueResult.status === 'assigned' && enqueueResult.room) {
            this.launchAssignedRoom(enqueueResult.room);
            return;
        }

        this.updateQueueStatusLabel(enqueueResult.queuePosition ?? null);
        this.startMatchmakingPolling(auth.sessionId);
    }

    private startMatchmakingPolling (sessionId: string): void
    {
        this.stopMatchmakingPolling();

        this.matchmakingPollTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                void this.pollMatchmakingStatus(sessionId);
            },
        });
    }

    private stopMatchmakingPolling (): void
    {
        if (this.matchmakingPollTimer !== null) {
            this.matchmakingPollTimer.remove(false);
            this.matchmakingPollTimer = null;
        }
    }

    private async pollMatchmakingStatus (sessionId: string): Promise<void>
    {
        if (!this.matchmakingInProgress || this.transitioning) {
            return;
        }

        const statusResult = await fetchMatchmakingStatus(sessionId);
        if (!statusResult.ok) {
            this.handleMatchmakingFailure(statusResult.error ?? 'Failed to get matchmaking status.');
            return;
        }

        if (statusResult.status === 'assigned' && statusResult.room) {
            this.launchAssignedRoom(statusResult.room);
            return;
        }

        if (statusResult.status === 'idle') {
            // Recover from transient room startup failures by rejoining queue.
            const enqueueResult = await enqueueForMatchmaking(sessionId);
            if (!enqueueResult.ok) {
                this.handleMatchmakingFailure(enqueueResult.error ?? 'Failed to recover matchmaking queue.');
                return;
            }
            if (enqueueResult.status === 'assigned' && enqueueResult.room) {
                this.launchAssignedRoom(enqueueResult.room);
                return;
            }
            this.updateQueueStatusLabel(enqueueResult.queuePosition ?? null);
            return;
        }

        this.updateQueueStatusLabel(statusResult.queuePosition ?? null);
    }

    private launchAssignedRoom (room: RouterAssignedRoom): void
    {
        if (this.transitioning) {
            return;
        }

        this.stopMatchmakingPolling();
        this.matchmakingInProgress = false;
        this.applyQueueUiState(false);
        this.updateMatchmakingSubtitle('Match found. Validating room...');
        void this.transitionToAssignedRoom(room);
    }

    private async cancelMatchmakingFlow (): Promise<void>
    {
        if (!this.matchmakingInProgress || this.transitioning) {
            return;
        }

        this.stopMatchmakingPolling();
        this.matchmakingInProgress = false;
        this.applyQueueUiState(false);

        const sessionId = this.getStoredSessionId();
        if (sessionId) {
            await leaveMatchmakingQueue(sessionId);
        }

        this.updateMatchmakingSubtitle(this.selectedDeckId ? 'Matchmaking canceled.' : 'No deck selected. Open Deck Builder.');
    }

    private leaveQueueOnDisconnect (): void
    {
        if (!this.matchmakingInProgress || this.transitioning) {
            return;
        }

        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            return;
        }

        this.matchmakingInProgress = false;
        this.applyQueueUiState(false);
        void leaveMatchmakingQueue(sessionId, true);
    }

    private async transitionToAssignedRoom (room: RouterAssignedRoom): Promise<void>
    {
        this.updateMatchmakingSubtitle('Match found. Starting room...');
        const roomHealthy = await this.isAssignedRoomReachable(room.endpointUrl);
        if (!roomHealthy) {
            this.matchmakingInProgress = true;
            this.transitioning = false;
            this.applyQueueUiState(true);
            this.updateMatchmakingSubtitle('Room startup failed. Re-queueing...');
            const sessionId = typeof window !== 'undefined'
                ? window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY)
                : null;
            if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
                this.startMatchmakingPolling(sessionId.trim());
            }
            return;
        }

        this.transitioning = true;
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY, room.endpointUrl);
            // New room assignment should not reuse slot/reconnect identity from an old room.
            window.sessionStorage.removeItem('avge_protocol_reconnect_token');

            const activeSessionId = this.getStoredSessionId();
            const playerSessionIds = Array.isArray(room.playerSessionIds) ? room.playerSessionIds : undefined;
            if (
                activeSessionId
                && playerSessionIds
                && playerSessionIds.length >= 2
                && typeof playerSessionIds[0] === 'string'
                && typeof playerSessionIds[1] === 'string'
            ) {
                const normalized = activeSessionId.trim();
                if (normalized === playerSessionIds[0].trim()) {
                    window.sessionStorage.setItem('avge_protocol_client_slot', 'p1');
                }
                else if (normalized === playerSessionIds[1].trim()) {
                    window.sessionStorage.setItem('avge_protocol_client_slot', 'p2');
                }
                else {
                    window.sessionStorage.removeItem('avge_protocol_client_slot');
                }
            }
            else {
                window.sessionStorage.removeItem('avge_protocol_client_slot');
            }
        }

        this.updateMatchmakingSubtitle('Match found. Launching room...');
        this.cameras.main.fadeOut(280, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('Game');
        });
    }

    private async isAssignedRoomReachable (endpointUrl: string): Promise<boolean>
    {
        if (typeof fetch !== 'function') {
            return true;
        }

        const maxAttempts = 12;
        const delayMs = 250;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetch(`${endpointUrl}/health`, {
                    method: 'GET',
                });
                if (response.ok) {
                    return true;
                }
            }
            catch {
                // Room process may still be booting; retry shortly.
            }

            if (attempt < maxAttempts) {
                await new Promise<void>((resolve) => {
                    this.time.delayedCall(delayMs, () => resolve());
                });
            }
        }

        return false;
    }

    private getStoredSessionId (): string | null
    {
        if (typeof window === 'undefined') {
            return null;
        }

        const raw = window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
        if (typeof raw === 'string' && raw.trim().length > 0) {
            return raw.trim();
        }

        const persisted = window.localStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
        if (typeof persisted !== 'string' || persisted.trim().length === 0) {
            return null;
        }

        return persisted.trim();
    }

    private persistMatchmakingIdentity (sessionId: string, username: string): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        window.sessionStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, sessionId);
        window.localStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, sessionId);
        window.localStorage.setItem(ROUTER_USERNAME_STORAGE_KEY, username);
    }

    private formatUsernameIndicator (username: string | null | undefined): string
    {
        const normalized = typeof username === 'string' ? username.trim().toUpperCase() : '';
        if (normalized.length === 0) {
            return 'USER: ...';
        }

        const maxUsernameChars = 18;
        const clipped = normalized.length > maxUsernameChars
            ? `${normalized.slice(0, maxUsernameChars - 3)}...`
            : normalized;
        return `USER: ${clipped}`;
    }

    private refreshUsernameButtonLayout (): void
    {
        if (!this.usernameButton || !this.usernameIndicator) {
            return;
        }

        const accountMargin = Math.round(MAIN_MENU_LAYOUT.accountMarginBase * UI_SCALE);
        const accountTop = Math.round(MAIN_MENU_LAYOUT.accountTopBase * UI_SCALE);
        const paddingX = Math.round(MAIN_MENU_LAYOUT.usernameButtonPaddingXBase * UI_SCALE);
        const paddingY = Math.round(MAIN_MENU_LAYOUT.usernameButtonPaddingYBase * UI_SCALE);
        const minWidth = Math.round(MAIN_MENU_LAYOUT.usernameButtonMinWidthBase * UI_SCALE);
        const minHeight = Math.round(MAIN_MENU_LAYOUT.usernameButtonMinHeightBase * UI_SCALE);

        const buttonWidth = Math.max(minWidth, Math.round(this.usernameIndicator.width + (paddingX * 2)));
        const buttonHeight = Math.max(minHeight, Math.round(this.usernameIndicator.height + (paddingY * 2)));
        const rightX = GAME_WIDTH - accountMargin;
        const topY = accountTop;

        this.usernameButton
            .setSize(buttonWidth, buttonHeight)
            .setPosition(
                rightX - Math.round(buttonWidth / 2),
                topY + Math.round(buttonHeight / 2)
            );

        if (UI_RECTANGLE_CORNER_RADIUS > 0) {
            const widthCapRatio = Math.max(0, UI_RECTANGLE_CORNER_RADIUS_MAX_WIDTH_RATIO);
            const widthCap = widthCapRatio > 0
                ? buttonWidth * widthCapRatio
                : UI_RECTANGLE_CORNER_RADIUS;
            const roundedRadius = Math.min(UI_RECTANGLE_CORNER_RADIUS, widthCap);
            if (roundedRadius > 0) {
                this.usernameButton.setRounded(roundedRadius);
            }
        }

        this.usernameIndicator.setPosition(
            this.usernameButton.x,
            this.usernameButton.y
        );
    }

    private applyUsernameButtonBaseStyle (): void
    {
        this.usernameButton?.setFillStyle(0x0f172a, 0.9);
        this.usernameIndicator?.setTint(0xe2e8f0);
    }

    private applyUsernameButtonHoverStyle (): void
    {
        this.usernameButton?.setFillStyle(0x1e293b, 0.95);
        this.usernameIndicator?.setTint(0xfef08a);
    }

    private applyLogoutButtonBaseStyle (): void
    {
        if (this.matchmakingInProgress) {
            this.logoutButton?.setFillStyle(0x334155, 0.5);
            this.logoutButtonLabel?.setTint(0x94a3b8);
            return;
        }

        this.logoutButton?.setFillStyle(0x7f1d1d, 0.95);
        this.logoutButtonLabel?.setTint(0xffffff);
    }

    private applyLogoutButtonHoverStyle (): void
    {
        if (this.matchmakingInProgress) {
            return;
        }

        this.logoutButton?.setFillStyle(0x991b1b, 0.98);
        this.logoutButtonLabel?.setTint(0xfef08a);
    }

    private setLogoutButtonVisible (visible: boolean): void
    {
        this.logoutButton?.setVisible(visible);
        this.logoutButtonLabel?.setVisible(visible);

        if (!visible) {
            this.logoutButton?.disableInteractive();
            return;
        }

        if (this.matchmakingInProgress || this.transitioning || this.disconnectGateActive) {
            this.logoutButton?.disableInteractive();
            return;
        }

        this.logoutButton?.setInteractive({ useHandCursor: true });
    }

    private cancelLogoutButtonHideTimer (): void
    {
        if (this.logoutHoverHideTimer) {
            this.logoutHoverHideTimer.remove(false);
            this.logoutHoverHideTimer = null;
        }
    }

    private scheduleLogoutButtonHideFromHover (): void
    {
        if (this.disconnectGateActive || this.transitioning) {
            this.setLogoutButtonVisible(false);
            return;
        }

        this.cancelLogoutButtonHideTimer();
        const hideDelayMs = Math.max(0, Math.round(MAIN_MENU_LAYOUT.logoutRevealHideDelayMs));
        this.logoutHoverHideTimer = this.time.delayedCall(hideDelayMs, () => {
            this.logoutHoverHideTimer = null;
            this.setLogoutButtonVisible(false);
            this.applyLogoutButtonBaseStyle();
            this.applyUsernameButtonBaseStyle();
        });
    }

    private showLogoutButtonForAccountHover (): void
    {
        this.cancelLogoutButtonHideTimer();
        this.setLogoutButtonVisible(true);
        this.applyLogoutButtonBaseStyle();
    }

    private updateQueueStatusLabel (queuePosition: number | null): void
    {
        if (queuePosition === null) {
            this.updateMatchmakingSubtitle('Searching for opponent...');
            return;
        }

        this.updateMatchmakingSubtitle(`In queue: position ${queuePosition}`);
    }

    private updateMatchmakingSubtitle (message: string): void
    {
        this.subtitle.setText(message);
    }

    private handleMatchmakingFailure (message: string): void
    {
        this.stopMatchmakingPolling();
        this.matchmakingInProgress = false;
        this.transitioning = false;
        this.applyQueueUiState(false);

        if (isSessionSupersededError({ error: message })) {
            this.forceSessionSupersededLogout();
            return;
        }

        const normalized = message.toLowerCase();
        if (normalized.includes('unable to reach matchmaking provider') || normalized.includes('Failed to connect to server')) {
            this.showDisconnectGate('Unable to reach matchmaking provider');
            return;
        }

        this.updateMatchmakingSubtitle(message);
    }

    private applyQueueUiState (inQueue: boolean): void
    {
        if (inQueue) {
            this.startButton
                .setInteractive({ useHandCursor: true })
                .setFillStyle(0x7f1d1d, 0.96);
            this.startButtonLabel
                .setText('CANCEL')
                .setTint(0xffffff);

            this.decksButton
                .disableInteractive()
                .setFillStyle(0x334155, 0.5);
            this.decksButtonLabel.setTint(0x94a3b8);

            this.logoutButton
                ?.disableInteractive()
                .setFillStyle(0x334155, 0.5);
            this.logoutButtonLabel?.setTint(0x94a3b8);
            return;
        }

        this.startButton
            .setInteractive({ useHandCursor: true })
            .setFillStyle(0x0f172a, 0.9);
        this.startButtonLabel
            .setText('PLAY')
            .setTint(0xffffff);

        this.decksButton
            .setInteractive({ useHandCursor: true })
            .setFillStyle(0x0f172a, 0.9);
        this.decksButtonLabel.setTint(0xffffff);

        this.applyLogoutButtonBaseStyle();
        if (this.logoutButton?.visible) {
            this.logoutButton.setInteractive({ useHandCursor: true });
        }
    }
}
