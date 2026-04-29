import { Scene, GameObjects } from 'phaser';
import { GAME_CENTER_X, GAME_HEIGHT, GAME_WIDTH, LOGIN_TEXT_LAYOUT, UI_SCALE } from '../config';
import {
    fetchMatchmakingStatus,
    fetchRouterSession,
    fetchRouterSessionFromCookie,
    loginRouterSession,
    rejoinAssignedRoom,
    ROOM_BACKEND_BASE_URL_STORAGE_KEY,
    ROUTER_SESSION_ID_STORAGE_KEY,
    ROUTER_USERNAME_STORAGE_KEY,
} from '../Network';

export class Login extends Scene
{
    background: GameObjects.Image;
    title: GameObjects.Text;
    subtitle: GameObjects.Text;
    usernameValue: GameObjects.Text;
    continueButton: GameObjects.Rectangle;
    continueLabel: GameObjects.Text;
    changeNameButton: GameObjects.Rectangle;
    changeNameLabel: GameObjects.Text;

    private selectedUsername: string;
    private submitting: boolean;

    constructor ()
    {
        super('Login');
        this.selectedUsername = '';
        this.submitting = false;
    }

    preload (): void
    {
        this.load.setPath('assets');
        this.load.image('background', 'background/background_element.png');
    }

    create (): void
    {
        this.submitting = false;
        this.selectedUsername = this.loadPreferredUsername();

        this.cameras.main.fadeIn(180, 0, 0, 0);

        this.background = this.add.image(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.5), 'background');
        this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
        this.background.setAlpha(0.9);

        this.title = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.24), 'LOGIN').setFontSize(Math.max(LOGIN_TEXT_LAYOUT.titleFontSizeMin, Math.round(LOGIN_TEXT_LAYOUT.titleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.subtitle = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.36), 'Choose your username to continue').setFontSize(Math.max(LOGIN_TEXT_LAYOUT.subtitleFontSizeMin, Math.round(LOGIN_TEXT_LAYOUT.subtitleFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xcbd5e1);

        this.usernameValue = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.46), this.selectedUsername.toUpperCase()).setFontSize(Math.max(LOGIN_TEXT_LAYOUT.usernameFontSizeMin, Math.round(LOGIN_TEXT_LAYOUT.usernameFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        const buttonWidth = Math.round(280 * UI_SCALE);
        const buttonHeight = Math.round(74 * UI_SCALE);

        this.continueButton = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.63),
            buttonWidth,
            buttonHeight,
            0x0f172a,
            0.92
        )
            .setStrokeStyle(3, 0xffffff, 0.85)
            .setInteractive({ useHandCursor: true });

        this.continueLabel = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.63), 'CONTINUE').setFontSize(Math.max(LOGIN_TEXT_LAYOUT.continueFontSizeMin, Math.round(LOGIN_TEXT_LAYOUT.continueFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.changeNameButton = this.add.rectangle(
            GAME_CENTER_X,
            Math.round(GAME_HEIGHT * 0.76),
            buttonWidth,
            buttonHeight,
            0x1e293b,
            0.92
        )
            .setStrokeStyle(2, 0xffffff, 0.7)
            .setInteractive({ useHandCursor: true });

        this.changeNameLabel = this.add.text(GAME_CENTER_X, Math.round(GAME_HEIGHT * 0.76), 'CHANGE NAME').setFontSize(Math.max(LOGIN_TEXT_LAYOUT.changeNameFontSizeMin, Math.round(LOGIN_TEXT_LAYOUT.changeNameFontSizeBase * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff);

        this.continueButton.on('pointerdown', () => {
            void this.submitLogin();
        });

        this.changeNameButton.on('pointerdown', () => {
            this.promptForUsername();
        });

        this.input.keyboard?.on('keydown-ENTER', () => {
            void this.submitLogin();
        });

        void this.tryAutoContinueFromExistingSession();
    }

    private async tryAutoContinueFromExistingSession (): Promise<void>
    {
        if (this.submitting) {
            return;
        }

        this.submitting = true;
        this.setBusyState(true);
        this.subtitle.setText('Checking existing sign-in...');

        let sessionResult = await fetchRouterSessionFromCookie();
        if (!sessionResult.ok) {
            sessionResult = await fetchRouterSession();
        }

        if (sessionResult.ok && sessionResult.sessionId && sessionResult.username) {
            if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, sessionResult.sessionId);
                window.localStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, sessionResult.sessionId);
                window.localStorage.setItem(ROUTER_USERNAME_STORAGE_KEY, sessionResult.username);
            }

            await this.resumeAssignedRoomOrOpenMenu(sessionResult.sessionId, sessionResult.currentRoomId ?? null);
            return;
        }

        this.submitting = false;
        this.setBusyState(false);
        this.subtitle.setText('Choose your username to continue');
    }

    private async submitLogin (): Promise<void>
    {
        if (this.submitting) {
            return;
        }

        this.submitting = true;
        this.setBusyState(true);
        this.subtitle.setText('Signing in...');

        const result = await loginRouterSession(this.selectedUsername);
        if (!result.ok || !result.sessionId || !result.username) {
            this.submitting = false;
            this.setBusyState(false);
            this.subtitle.setText(result.error ?? 'Login failed.');
            return;
        }

        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, result.sessionId);
            window.localStorage.setItem(ROUTER_SESSION_ID_STORAGE_KEY, result.sessionId);
            window.localStorage.setItem(ROUTER_USERNAME_STORAGE_KEY, result.username);
        }

        await this.resumeAssignedRoomOrOpenMenu(result.sessionId, result.currentRoomId ?? null);
    }

    private async resumeAssignedRoomOrOpenMenu (sessionId: string, currentRoomId: string | null): Promise<void>
    {
        const status = await fetchMatchmakingStatus(sessionId);
        if (status.ok && status.status === 'assigned' && status.room) {
            if (typeof window !== 'undefined') {
                window.sessionStorage.setItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY, status.room.endpointUrl);
            }

            this.cameras.main.fadeOut(180, 0, 0, 0);
            this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                this.scene.start('Game');
            });
            return;
        }

        if (typeof currentRoomId === 'string' && currentRoomId.trim().length > 0) {
            const rejoin = await rejoinAssignedRoom(sessionId, currentRoomId);
            if (rejoin.ok && rejoin.room) {
                if (typeof window !== 'undefined') {
                    window.sessionStorage.setItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY, rejoin.room.endpointUrl);
                }

                this.cameras.main.fadeOut(180, 0, 0, 0);
                this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
                    this.scene.start('Game');
                });
                return;
            }
        }

        this.cameras.main.fadeOut(220, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('MainMenu');
        });
    }

    private promptForUsername (): void
    {
        if (typeof window === 'undefined') {
            return;
        }

        const candidate = window.prompt('Enter username', this.selectedUsername);
        if (typeof candidate !== 'string') {
            return;
        }

        const normalized = candidate.trim().slice(0, 32);
        if (!normalized) {
            this.subtitle.setText('Username cannot be empty.');
            return;
        }

        this.selectedUsername = normalized;
        this.usernameValue.setText(normalized.toUpperCase());
        this.subtitle.setText('Choose your username to continue');
        window.localStorage.setItem(ROUTER_USERNAME_STORAGE_KEY, normalized);
    }

    private loadPreferredUsername (): string
    {
        if (typeof window === 'undefined') {
            return `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
        }

        const persisted = window.localStorage.getItem(ROUTER_USERNAME_STORAGE_KEY);
        if (typeof persisted === 'string' && persisted.trim().length > 0) {
            return persisted.trim().slice(0, 32);
        }

        const generated = `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
        window.localStorage.setItem(ROUTER_USERNAME_STORAGE_KEY, generated);
        return generated;
    }

    private setBusyState (busy: boolean): void
    {
        if (busy) {
            this.continueButton.disableInteractive();
            this.changeNameButton.disableInteractive();
            this.continueLabel.setText('SIGNING IN...');
            return;
        }

        this.continueButton.setInteractive({ useHandCursor: true });
        this.changeNameButton.setInteractive({ useHandCursor: true });
        this.continueLabel.setText('CONTINUE');
    }
}
