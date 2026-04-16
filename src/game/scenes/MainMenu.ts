import { Scene, GameObjects } from 'phaser';
import { GAME_CENTER_X, GAME_CENTER_Y, GAME_HEIGHT, GAME_WIDTH, UI_SCALE } from '../config';
import {
    fetchRouterSession,
    fetchUserDecks,
    enqueueForMatchmaking,
    fetchMatchmakingStatus,
    ROOM_BACKEND_BASE_URL_STORAGE_KEY,
    ROUTER_SESSION_ID_STORAGE_KEY,
    ROUTER_USERNAME_STORAGE_KEY,
    RouterAssignedRoom,
} from '../Network';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    title: GameObjects.BitmapText;
    subtitle: GameObjects.BitmapText;
    startButton: GameObjects.Rectangle;
    startButtonLabel: GameObjects.BitmapText;
    decksButton: GameObjects.Rectangle;
    decksButtonLabel: GameObjects.BitmapText;
    private transitioning: boolean;
    private matchmakingPollTimer: Phaser.Time.TimerEvent | null;
    private matchmakingInProgress: boolean;
    private authReady: boolean;
    private disconnectGateActive: boolean;
    private disconnectGateBackdrop: GameObjects.Rectangle | null;
    private disconnectGateTitle: GameObjects.BitmapText | null;
    private disconnectGateContinueButton: GameObjects.Rectangle | null;
    private disconnectGateContinueLabel: GameObjects.BitmapText | null;
    private selectedDeckId: string | null;

    constructor ()
    {
        super('MainMenu');
        this.transitioning = false;
        this.matchmakingPollTimer = null;
        this.matchmakingInProgress = false;
        this.authReady = false;
        this.disconnectGateActive = false;
        this.disconnectGateBackdrop = null;
        this.disconnectGateTitle = null;
        this.disconnectGateContinueButton = null;
        this.disconnectGateContinueLabel = null;
        this.selectedDeckId = null;
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
        this.load.bitmapFont('minogram', 'minogram_6x10.png', 'minogram_6x10.xml');
    }

    create ()
    {
        this.transitioning = false;
        this.matchmakingInProgress = false;
        this.authReady = false;
        this.stopMatchmakingPolling();
        this.cameras.main.fadeIn(180, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, GAME_CENTER_Y, 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.9);

        this.title = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.34),
            'minogram',
            'AVGE CARD GAME',
            Math.max(32, Math.round(64 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.subtitle = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.47),
            'minogram',
            'Admin Visual Game Environment',
            Math.max(14, Math.round(24 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xcbd5e1);

        const buttonWidth = Math.round(280 * UI_SCALE);
        const buttonHeight = Math.round(84 * UI_SCALE);
        const buttonY = Math.round(GAME_HEIGHT * 0.68);

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

        this.startButtonLabel = this.add.bitmapText(
            GAME_CENTER_X,
            buttonY,
            'minogram',
            'START',
            Math.max(20, Math.round(36 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.decksButton = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(buttonY - (96 * UI_SCALE)),
            buttonWidth,
            buttonHeight,
            0x1e293b,
            0.9
        )
            .setStrokeStyle(3, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.decksButtonLabel = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(buttonY - (96 * UI_SCALE)),
            'minogram',
            'DECK BUILDER',
            Math.max(18, Math.round(30 * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.startButton.on('pointerover', () => {
            this.startButton.setFillStyle(0x1e293b, 0.95);
            this.startButtonLabel.setTint(0xfef08a);
        });

        this.startButton.on('pointerout', () => {
            this.startButton.setFillStyle(0x0f172a, 0.9);
            this.startButtonLabel.setTint(0xffffff);
        });

        const startGame = () => {
            if (this.disconnectGateActive || !this.authReady || this.transitioning || this.matchmakingInProgress) {
                return;
            }

            if (!this.selectedDeckId) {
                this.updateMatchmakingSubtitle('No deck selected. Open Deck Builder.');
                this.scene.start('DeckBuilder');
                return;
            }

            this.matchmakingInProgress = true;
            this.startButton.disableInteractive();
            this.startButton.setFillStyle(0x1e293b, 0.95);
            this.startButtonLabel.setText('MATCHMAKING...');
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

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.stopMatchmakingPolling();
        });

        const initData = this.scene.settings.data as { systemMessage?: unknown } | undefined;
        if (typeof initData?.systemMessage === 'string' && initData.systemMessage.trim().length > 0) {
            this.showDisconnectGate('Game Server Disconnected');
        }

        void this.ensureAuthenticatedSession();
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
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
            }
            this.scene.start('Login');
            return;
        }

        this.persistMatchmakingIdentity(auth.sessionId, auth.username);
        const decksResult = await fetchUserDecks(auth.sessionId);
        this.selectedDeckId = decksResult.ok ? (decksResult.selectedDeckId ?? null) : null;
        this.authReady = true;
        this.startButton.setInteractive({ useHandCursor: true });
        this.decksButton.setInteractive({ useHandCursor: true });
        this.updateMatchmakingSubtitle(this.selectedDeckId ? 'Admin Visual Game Environment' : 'No deck selected. Open Deck Builder.');
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

        this.disconnectGateTitle = this.add.bitmapText(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.45),
            'minogram',
            titleText,
            Math.max(18, Math.round(34 * UI_SCALE))
        )
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

        this.disconnectGateContinueLabel = this.add.bitmapText(
            GAME_CENTER_X,
            buttonY,
            'minogram',
            'CONTINUE',
            Math.max(16, Math.round(26 * UI_SCALE))
        )
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
        this.decksButton.setVisible(true).setInteractive({ useHandCursor: true });
        this.decksButtonLabel.setVisible(true);
        this.updateMatchmakingSubtitle('Admin Visual Game Environment');
    }

    private async beginMatchmakingFlow (): Promise<void>
    {
        const sessionId = this.getStoredSessionId();
        if (!sessionId) {
            this.scene.start('Login');
            return;
        }

        const auth = await fetchRouterSession(sessionId);
        if (!auth.ok || !auth.sessionId || !auth.username) {
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
            }
            this.scene.start('Login');
            return;
        }

        this.persistMatchmakingIdentity(auth.sessionId, auth.username);

        const deckState = await fetchUserDecks(auth.sessionId);
        this.selectedDeckId = deckState.ok ? (deckState.selectedDeckId ?? null) : null;
        if (!this.selectedDeckId) {
            this.matchmakingInProgress = false;
            this.startButton.setInteractive({ useHandCursor: true });
            this.startButtonLabel.setText('START');
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
        this.updateMatchmakingSubtitle('Match found. Validating room...');
        void this.transitionToAssignedRoom(room);
    }

    private async transitionToAssignedRoom (room: RouterAssignedRoom): Promise<void>
    {
        this.updateMatchmakingSubtitle('Match found. Starting room...');
        const roomHealthy = await this.isAssignedRoomReachable(room.endpointUrl);
        if (!roomHealthy) {
            this.matchmakingInProgress = true;
            this.transitioning = false;
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
            window.sessionStorage.removeItem('avge_protocol_client_slot');
            window.sessionStorage.removeItem('avge_protocol_reconnect_token');
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
        if (typeof raw !== 'string' || raw.trim().length === 0) {
            return null;
        }

        return raw.trim();
    }

    private persistMatchmakingIdentity (sessionId: string, username: string): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        window.sessionStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, sessionId);
        window.localStorage.setItem(ROUTER_USERNAME_STORAGE_KEY, username);
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
        this.startButton.setInteractive({ useHandCursor: true });
        this.startButton.setFillStyle(0x0f172a, 0.9);
        this.startButtonLabel.setTint(0xffffff);
        this.startButtonLabel.setText('START');

        const normalized = message.toLowerCase();
        if (normalized.includes('unable to reach matchmaking provider') || normalized.includes('unable to reach matchmaking router')) {
            this.showDisconnectGate('Unable to reach matchmaking provider');
            return;
        }

        this.updateMatchmakingSubtitle(message);
    }
}
