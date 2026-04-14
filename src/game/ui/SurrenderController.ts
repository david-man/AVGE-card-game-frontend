import { Scene } from 'phaser';
import { CardHolder } from '../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    GAME_SURRENDER_BUTTON_LAYOUT,
    GAME_WIDTH,
    UI_SCALE
} from '../config';

type ViewMode = 'p1' | 'p2' | 'admin';

type SurrenderControllerOptions = {
    onArm: (seconds: number) => void;
    onConfirm: () => void;
    onTimeout: () => void;
};

export class SurrenderController
{
    private readonly scene: Scene;
    private readonly options: SurrenderControllerOptions;
    private body: Phaser.GameObjects.Arc | null;
    private label: Phaser.GameObjects.BitmapText | null;
    private confirmArmed: boolean;
    private confirmTimerEvent: Phaser.Time.TimerEvent | null;
    private confirmSecondsRemaining: number;

    constructor (scene: Scene, options: SurrenderControllerOptions)
    {
        this.scene = scene;
        this.options = options;
        this.body = null;
        this.label = null;
        this.confirmArmed = false;
        this.confirmTimerEvent = null;
        this.confirmSecondsRemaining = 0;
    }

    create (): void
    {
        const radius = Math.max(14, Math.round((GAME_SURRENDER_BUTTON_LAYOUT.radiusBase / BASE_WIDTH) * GAME_WIDTH));
        const x = GAME_WIDTH - radius;
        const y = radius;
        const fontSize = Math.max(10, Math.round(GAME_SURRENDER_BUTTON_LAYOUT.fontSize * UI_SCALE));

        this.body = this.scene.add.circle(
            x,
            y,
            radius,
            GAME_SURRENDER_BUTTON_LAYOUT.fillColor,
            GAME_SURRENDER_BUTTON_LAYOUT.fillAlpha
        )
            .setStrokeStyle(
                GAME_SURRENDER_BUTTON_LAYOUT.strokeWidth,
                GAME_SURRENDER_BUTTON_LAYOUT.strokeColor,
                GAME_SURRENDER_BUTTON_LAYOUT.strokeAlpha
            )
            .setDepth(GAME_SURRENDER_BUTTON_LAYOUT.depth)
            .setInteractive({ useHandCursor: true });

        this.label = this.scene.add.bitmapText(x, y, 'minogram', GAME_SURRENDER_BUTTON_LAYOUT.label, fontSize)
            .setOrigin(0.5)
            .setTint(GAME_SURRENDER_BUTTON_LAYOUT.textTint)
            .setDepth(GAME_SURRENDER_BUTTON_LAYOUT.depth + 1);

        this.body.on('pointerdown', () => {
            this.handleClick();
        });
    }

    refresh (activeViewMode: ViewMode, handHolder: CardHolder | undefined): void
    {
        if (!this.body || !this.label) {
            return;
        }

        const visible = activeViewMode !== 'admin';

        if (visible && handHolder) {
            const handOffsetX = Math.round((GAME_SURRENDER_BUTTON_LAYOUT.handOffsetXBase / BASE_WIDTH) * GAME_WIDTH);
            const handOffsetY = Math.round((GAME_SURRENDER_BUTTON_LAYOUT.handOffsetYBase / BASE_HEIGHT) * this.scene.scale.height);
            const radius = this.body.radius;
            const x = Math.round(handHolder.x + (handHolder.width / 2) + handOffsetX + radius);
            const y = Math.round(handHolder.y + handOffsetY);
            this.body.setPosition(x, y);
            this.label.setPosition(x, y);
        }

        this.body.setVisible(visible);
        this.label.setVisible(visible);

        if (!visible) {
            this.disarm(false);
        }
        else {
            this.refreshLabel();
        }
    }

    disarm (timedOut: boolean): void
    {
        this.confirmArmed = false;
        this.confirmSecondsRemaining = 0;

        if (this.confirmTimerEvent) {
            this.confirmTimerEvent.remove(false);
            this.confirmTimerEvent = null;
        }

        this.refreshLabel();

        if (timedOut) {
            this.options.onTimeout();
        }
    }

    private handleClick (): void
    {
        if (this.body?.visible === false) {
            return;
        }

        if (!this.confirmArmed) {
            this.arm();
            this.options.onArm(Math.round(GAME_SURRENDER_BUTTON_LAYOUT.confirmWindowMs / 1000));
            return;
        }

        this.disarm(false);
        this.options.onConfirm();
    }

    private arm (): void
    {
        this.disarm(false);
        this.confirmArmed = true;
        this.confirmSecondsRemaining = Math.max(1, Math.round(GAME_SURRENDER_BUTTON_LAYOUT.confirmWindowMs / 1000));
        this.refreshLabel();

        this.confirmTimerEvent = this.scene.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (!this.confirmArmed) {
                    return;
                }

                this.confirmSecondsRemaining = Math.max(0, this.confirmSecondsRemaining - 1);
                if (this.confirmSecondsRemaining <= 0) {
                    this.disarm(true);
                    return;
                }

                this.refreshLabel();
            }
        });
    }

    private refreshLabel (): void
    {
        if (!this.label) {
            return;
        }

        if (this.confirmArmed) {
            this.label.setText(String(this.confirmSecondsRemaining));
            return;
        }

        this.label.setText(GAME_SURRENDER_BUTTON_LAYOUT.label);
    }
}
