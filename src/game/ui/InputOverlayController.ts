import { Scene } from 'phaser';
import { CoinInputOverlay } from './overlays/CoinInputOverlay';
import { DiceInputOverlay } from './overlays/DiceInputOverlay';
import { DisplayInputOverlay, RevealOverlayCard } from './overlays/DisplayInputOverlay';
import { KeiWatanabeDrumkidWorkshopInputOverlay, KeiWatanabeDrumkidWorkshopItem } from './overlays/KeiWatanabeDrumkidWorkshopInputOverlay';
import { NumericalEntryInputOverlay } from './overlays/NumericalEntryInputOverlay';
import { SelectionInputOverlay, SelectionOverlayItem } from './overlays/SelectionInputOverlay';

type DiceRollCompleteCallback = (value: number) => void;
type CoinFlipCompleteCallback = (result: 'heads' | 'tails') => void;
type SelectionSubmitCallback = (orderedSelections: string[]) => void;
type OverlayCloseCallback = () => void;
type OverlayCardClickCallback = (cardId: string) => void;
type KeiSubmitCallback = (result: { cardId: string; attack: 'atk1' | 'atk2' }) => void;
type NumericalSubmitCallback = (value: number) => void;

export type { SelectionOverlayItem };
export type { RevealOverlayCard };
export type { KeiWatanabeDrumkidWorkshopItem };

export class InputOverlayController
{
    static preloadDiceAssets (scene: Scene): void
    {
        DiceInputOverlay.preloadAssets(scene);
        CoinInputOverlay.preloadAssets(scene);
    }

    private diceOverlay: DiceInputOverlay;
    private coinOverlay: CoinInputOverlay;
    private selectionOverlay: SelectionInputOverlay;
    private displayOverlay: DisplayInputOverlay;
    private keiOverlay: KeiWatanabeDrumkidWorkshopInputOverlay;
    private numericalOverlay: NumericalEntryInputOverlay;

    constructor (scene: Scene, inputLockOverlay: Phaser.GameObjects.Rectangle)
    {
        this.diceOverlay = new DiceInputOverlay(scene, inputLockOverlay);
        this.coinOverlay = new CoinInputOverlay(scene, inputLockOverlay);
        this.selectionOverlay = new SelectionInputOverlay(scene, inputLockOverlay);
        this.displayOverlay = new DisplayInputOverlay(scene, inputLockOverlay);
        this.keiOverlay = new KeiWatanabeDrumkidWorkshopInputOverlay(scene, inputLockOverlay);
        this.numericalOverlay = new NumericalEntryInputOverlay(scene, inputLockOverlay);
    }

    hasActiveOverlay (): boolean
    {
        return this.diceOverlay.hasActiveOverlay() || this.coinOverlay.hasActiveOverlay() || this.selectionOverlay.hasActiveOverlay() || this.displayOverlay.hasActiveOverlay() || this.keiOverlay.hasActiveOverlay() || this.numericalOverlay.hasActiveOverlay();
    }

    stopActiveOverlay (): void
    {
        this.diceOverlay.stopActiveOverlay();
        this.coinOverlay.stopActiveOverlay();
        this.selectionOverlay.stopActiveOverlay();
        this.displayOverlay.stopActiveOverlay();
        this.keiOverlay.stopActiveOverlay();
        this.numericalOverlay.stopActiveOverlay();
    }

    startDiceRollOverlay (topMessage: string, onComplete: DiceRollCompleteCallback, forcedValue?: number): void
    {
        this.stopActiveOverlay();
        this.diceOverlay.start(onComplete, topMessage, forcedValue);
    }

    startCoinFlipOverlay (topMessage: string, onComplete: CoinFlipCompleteCallback, forcedResult?: 'heads' | 'tails'): void
    {
        this.stopActiveOverlay();
        this.coinOverlay.start(onComplete, topMessage, forcedResult);
    }

    startSelectionOverlay (
        items: SelectionOverlayItem[],
        numberOfSelections: number,
        allowRepeat: boolean,
        allowNone: boolean,
        topMessage: string,
        onSubmit: SelectionSubmitCallback,
        onCardClick?: OverlayCardClickCallback,
        onBackgroundClick?: OverlayCloseCallback
    ): void
    {
        this.stopActiveOverlay();
        this.selectionOverlay.start(items, numberOfSelections, allowRepeat, allowNone, topMessage, onSubmit, onCardClick, onBackgroundClick);
    }

    startNotifyOverlay (playerLabel: string, message: string, onClose: OverlayCloseCallback): void
    {
        this.stopActiveOverlay();
        this.displayOverlay.startNotifyOverlay(playerLabel, message, onClose);
    }

    startRevealOverlay (
        playerLabel: string,
        cards: RevealOverlayCard[],
        onClose: OverlayCloseCallback,
        onCardClick?: OverlayCardClickCallback,
        onBackgroundClick?: OverlayCloseCallback
    ): void
    {
        this.stopActiveOverlay();
        this.displayOverlay.startRevealOverlay(playerLabel, cards, onClose, onCardClick, onBackgroundClick);
    }

    startWinnerOverlay (winnerLabel: string, panelColor: number, onBackToMenu: OverlayCloseCallback): void
    {
        this.stopActiveOverlay();
        this.displayOverlay.startWinnerOverlay(winnerLabel, panelColor, onBackToMenu);
    }

    startKeiWatanabeDrumkidWorkshopOverlay (
        items: KeiWatanabeDrumkidWorkshopItem[],
        topMessage: string,
        onSubmit: KeiSubmitCallback,
        onCardClick?: OverlayCardClickCallback,
        onBackgroundClick?: OverlayCloseCallback
    ): void
    {
        this.stopActiveOverlay();
        this.keiOverlay.start(items, topMessage, onSubmit, onCardClick, onBackgroundClick);
    }

    startNumericalEntryOverlay (topMessage: string, onSubmit: NumericalSubmitCallback, onBackgroundClick?: OverlayCloseCallback): void
    {
        this.stopActiveOverlay();
        this.numericalOverlay.start(topMessage, onSubmit, onBackgroundClick);
    }
}
