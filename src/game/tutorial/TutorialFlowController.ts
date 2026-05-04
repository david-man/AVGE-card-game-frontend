import {
    GAME_CARD_TYPE_FILL_COLORS,
    GAME_WIDTH,
    UI_SCALE,
} from '../config';
import { Card, EnergyToken } from '../entities';
import { RevealOverlayCard, SelectionOverlayItem } from '../ui/InputOverlayController';

type TutorialScene = any;
type CardActionKey = 'atk1' | 'atk2' | 'active';
type PhaseStateAction = 'phase2-attack' | 'atk-skip' | 'init-done';
type StageMode = 'init' | 'phase2' | 'atk';

const TOTAL_STAGES = 25;
const TUTORIAL_STAGE_HEADER_FONT_SIZE_BASE = 34;
const TUTORIAL_STAGE_HEADER_FONT_SIZE_MIN = 20;
const TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_X_BASE = 24;
const TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_X_MIN = 18;
const TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_Y_BASE = 14;
const TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_Y_MIN = 10;
const TUTORIAL_STAGE_HEADER_WRAP_WIDTH_RATIO = 0.76;
const TUTORIAL_STAGE_TRANSITION_DELAY_MS = 500;

const STAGE8_CHAR_A_ID = 'TUT-CHAR-A';
const STAGE8_CHAR_B_ID = 'TUT-CHAR-B';

const STAGE12_ACTIVE_ID = 'TUT-S12-ACTIVE';
const STAGE12_ENERGY_ID = 'TUT-S12-ENERGY';

const STAGE13_ITEM_ID = 'TUT-S13-ITEM';

const STAGE14_TOOL_ID = 'TUT-S14-TOOL';
const STAGE14_ACTIVE_ID = 'TUT-S14-ACTIVE';

const STAGE15_STADIUM_ID = 'TUT-S15-STADIUM';

const STAGE16_ACTIVE_ID = 'TUT-S16-ACTIVE';
const STAGE16_BENCH_ID = 'TUT-S16-BENCH';

const STAGE17_HAND_ID = 'TUT-S17-HAND';

const STAGE20_ACTIVE_ID = 'TUT-S20-ACTIVE';

const STAGE22_ABILITY_ID = 'TUT-S22-ACTIVE';

const STAGE23_SELECTABLE_IDS = new Set(['sel-card-a', 'sel-card-b', 'sel-card-c']);

const DEFAULT_STATUS_EFFECT: Record<string, number> = {
    Arranger: 0,
    Goon: 0,
    Maid: 0,
};

export class TutorialFlowController
{
    private readonly scene: TutorialScene;
    private stageIndex: number;
    private stageText: Phaser.GameObjects.Text | null;
    private stageTextBackdrop: Phaser.GameObjects.Rectangle | null;
    private skipButtonBody: Phaser.GameObjects.Rectangle | null;
    private skipButtonLabel: Phaser.GameObjects.Text | null;
    private pendingStageAdvanceTimer: Phaser.Time.TimerEvent | null;
    private readonly clickedRevealCardIds: Set<string>;
    private active: boolean;

    constructor (scene: TutorialScene)
    {
        this.scene = scene;
        this.stageIndex = 0;
        this.stageText = null;
        this.stageTextBackdrop = null;
        this.skipButtonBody = null;
        this.skipButtonLabel = null;
        this.pendingStageAdvanceTimer = null;
        this.clickedRevealCardIds = new Set();
        this.active = false;
    }

    public start (): void
    {
        this.active = true;
        this.scene.setBoardInputEnabled(false, false);
        this.createChrome();
        this.runCurrentStage();
    }

    public destroy (): void
    {
        this.active = false;
        this.scene.inputOverlayController.stopActiveOverlay();
        this.scene.setBoardInputEnabled(true);

        this.stageText?.destroy();
        this.stageText = null;

        this.stageTextBackdrop?.destroy();
        this.stageTextBackdrop = null;

        this.skipButtonBody?.destroy();
        this.skipButtonBody = null;

        this.skipButtonLabel?.destroy();
        this.skipButtonLabel = null;

        if (this.pendingStageAdvanceTimer) {
            this.pendingStageAdvanceTimer.remove(false);
            this.pendingStageAdvanceTimer = null;
        }
    }

    public onFrontendEvent (eventType: string, responseData: Record<string, unknown>): void
    {
        if (!this.active) {
            return;
        }

        if (this.stageIndex === 24 && eventType === 'surrender_result') {
            this.scene.scene.start('MainMenu');
            return;
        }

        if (this.stageIndex === 11 && eventType === 'energy_moved') {
            const energyId = this.readLowerString(responseData, 'energy_id');
            const attachedToCardId = this.readLowerString(responseData, 'to_attached_to_card_id');
            if (energyId === STAGE12_ENERGY_ID.toLowerCase() && attachedToCardId === STAGE12_ACTIVE_ID.toLowerCase()) {
                this.advanceStageWithDelay();
            }
            return;
        }

        if (this.stageIndex === 12 && eventType === 'item_supporter_use') {
            const cardId = this.readLowerString(responseData, 'card_id');
            if (cardId === STAGE13_ITEM_ID.toLowerCase()) {
                this.advanceStage();
            }
            return;
        }

        if (this.stageIndex === 13 && eventType === 'tool_attached') {
            const toolId = this.readLowerString(responseData, 'tool_card_id');
            if (toolId === STAGE14_TOOL_ID.toLowerCase()) {
                this.advanceStageWithDelay();
            }
            return;
        }

        if (this.stageIndex === 14 && eventType === 'card_moved') {
            const cardId = this.readLowerString(responseData, 'card_id');
            const toZone = this.readLowerString(responseData, 'to_zone_id');
            if (cardId === STAGE15_STADIUM_ID.toLowerCase() && toZone === 'stadium') {
                this.advanceStageWithDelay();
            }
            return;
        }

        if (this.stageIndex === 15 && eventType === 'card_moved') {
            const cardId = this.readLowerString(responseData, 'card_id');
            const fromZone = this.readLowerString(responseData, 'from_zone_id');
            const toZone = this.readLowerString(responseData, 'to_zone_id');
            if (cardId === STAGE16_BENCH_ID.toLowerCase() && fromZone === 'p1-bench' && toZone === 'p1-active') {
                this.ensureStage16SwapResolved();
                if (!this.hasStage16SwapResolved()) {
                    return;
                }
                this.advanceStageWithDelay();
            }
            return;
        }

        if (this.stageIndex === 16 && eventType === 'card_moved') {
            const cardId = this.readLowerString(responseData, 'card_id');
            const fromZone = this.readLowerString(responseData, 'from_zone_id');
            const toZone = this.readLowerString(responseData, 'to_zone_id');
            if (cardId === STAGE17_HAND_ID.toLowerCase() && fromZone === 'p1-hand' && toZone === 'p1-bench') {
                this.advanceStageWithDelay();
            }
            return;
        }

        if (this.stageIndex === 17 && eventType === 'phase2_attack_button_clicked') {
            this.scene.setGamePhase('atk');
            this.advanceStage();
            return;
        }

        if (this.stageIndex === 19 && eventType === 'card_action') {
            const action = this.readLowerString(responseData, 'action');
            const cardId = this.readLowerString(responseData, 'card_id');
            if ((action === 'atk1' || action === 'atk2') && cardId === STAGE20_ACTIVE_ID.toLowerCase()) {
                this.advanceStage();
            }
            return;
        }

        if (this.stageIndex === 20 && eventType === 'atk_skip_button_clicked') {
            this.advanceStage();
            return;
        }

        if (this.stageIndex === 21 && eventType === 'card_action') {
            const action = this.readLowerString(responseData, 'action');
            const cardId = this.readLowerString(responseData, 'card_id');
            if (action === 'activate_ability' && cardId === STAGE22_ABILITY_ID.toLowerCase()) {
                this.advanceStage();
            }
        }
    }

    public onPregameInitLocalMove (): void
    {
        if (!this.active) {
            return;
        }

        if (this.stageIndex !== 7) {
            return;
        }

        if (this.hasStage8SolvedBoard()) {
            this.advanceStage();
        }
    }

    public handleInitSetupDone (): boolean
    {
        if (!this.active || this.stageIndex !== 9) {
            return false;
        }

        if (!this.hasStage8SolvedBoard()) {
            this.scene.appendTerminalLine('Set Character A as active and Character B in hand first.');
            return true;
        }

        if (!this.hasValidInitSetupForP1()) {
            this.scene.appendTerminalLine('Init setup is invalid. Ensure exactly 1 active character.');
            return true;
        }

        this.scene.initSetupConfirmed = true;
        this.scene.refreshPhaseStateActionButton();
        this.advanceStage();
        return true;
    }

    public canActOnCard (card: Card): boolean
    {
        if (!this.active) {
            return false;
        }

        if (this.stageIndex === 7 || this.stageIndex === 9) {
            return this.isP1SetupCharacter(card);
        }

        if (this.stageIndex === 12) {
            return card.id === STAGE13_ITEM_ID && card.getZoneId() === 'p1-hand';
        }

        if (this.stageIndex === 13) {
            return card.id === STAGE14_TOOL_ID && card.getZoneId() === 'p1-hand';
        }

        if (this.stageIndex === 14) {
            return card.id === STAGE15_STADIUM_ID && card.getZoneId() === 'p1-hand';
        }

        if (this.stageIndex === 15) {
            return card.id === STAGE16_BENCH_ID && card.getZoneId() === 'p1-bench';
        }

        if (this.stageIndex === 16) {
            return card.id === STAGE17_HAND_ID && card.getZoneId() === 'p1-hand';
        }

        return false;
    }

    public canDragCardByPhase (card: Card): boolean
    {
        if (!this.canActOnCard(card)) {
            return false;
        }

        if (this.stageIndex === 15) {
            return this.hasEnoughRetreatEnergy(STAGE16_ACTIVE_ID);
        }

        return true;
    }

    public canActOnToken (token: EnergyToken): boolean
    {
        if (!this.active) {
            return false;
        }

        if (this.stageIndex === 11) {
            return token.id === STAGE12_ENERGY_ID;
        }

        return false;
    }

    public canDragTokenByPhase (token: EnergyToken): boolean
    {
        return this.canActOnToken(token);
    }

    public canUsePhaseStateAction (action: PhaseStateAction): boolean
    {
        if (!this.active) {
            return false;
        }

        if (this.stageIndex === 9) {
            return action === 'init-done';
        }

        if (this.stageIndex === 17) {
            return action === 'phase2-attack';
        }

        if (this.stageIndex === 20) {
            return action === 'atk-skip';
        }

        return false;
    }

    public canUseCardAction (actionKey: CardActionKey, card: Card | null): boolean
    {
        if (!this.active || card === null) {
            return false;
        }

        if (this.stageIndex === 19) {
            return card.id === STAGE20_ACTIVE_ID && (actionKey === 'atk1' || actionKey === 'atk2');
        }

        if (this.stageIndex === 21) {
            return card.id === STAGE22_ABILITY_ID && actionKey === 'active';
        }

        return false;
    }

    public shouldHidePhaseStateActionButton (): boolean
    {
        return this.active && this.stageIndex === 7;
    }

    public canUseSurrender (): boolean
    {
        return this.active && this.stageIndex === 24;
    }

    private createChrome (): void
    {
        const stageFont = Math.max(TUTORIAL_STAGE_HEADER_FONT_SIZE_MIN, Math.round(TUTORIAL_STAGE_HEADER_FONT_SIZE_BASE * UI_SCALE));
        this.stageText = this.scene.add.text(
            Math.round(GAME_WIDTH / 2),
            Math.round(12 * UI_SCALE),
            'Tutorial',
            {
                align: 'center',
                wordWrap: {
                    width: Math.round(GAME_WIDTH * TUTORIAL_STAGE_HEADER_WRAP_WIDTH_RATIO),
                    useAdvancedWrap: true,
                }
            }
        )
            .setFontSize(stageFont)
            .setOrigin(0.5, 0)
            .setTint(0xf8fafc)
            .setDepth(900);

        this.stageTextBackdrop = this.scene.add.rectangle(
            Math.round(GAME_WIDTH / 2),
            Math.round(12 * UI_SCALE),
            10,
            10,
            0x0f172a,
            0.88
        )
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setDepth(899);
        this.refreshStageHeaderBackdrop();

        const skipWidth = Math.max(120, Math.round(150 * UI_SCALE));
        const skipHeight = Math.max(38, Math.round(44 * UI_SCALE));
        const x = GAME_WIDTH - Math.round(16 * UI_SCALE) - Math.round(skipWidth / 2);
        const y = this.scene.scale.height - Math.round(16 * UI_SCALE) - Math.round(skipHeight / 2);

        this.skipButtonBody = this.scene.add.rectangle(x, y, skipWidth, skipHeight, 0x7f1d1d, 0.94)
            .setStrokeStyle(2, 0xffffff, 0.9)
            .setDepth(900)
            .setInteractive({ useHandCursor: true });

        this.skipButtonLabel = this.scene.add.text(x, y, 'SKIP TUTORIAL')
            .setFontSize(Math.max(10, Math.round(15 * UI_SCALE)))
            .setOrigin(0.5)
            .setTint(0xffffff)
            .setDepth(901);

        const skipButtonBody = this.skipButtonBody;
        if (!skipButtonBody) {
            return;
        }

        skipButtonBody.on('pointerover', () => {
            this.skipButtonBody?.setFillStyle(0x991b1b, 0.98);
            this.skipButtonLabel?.setTint(0xfef08a);
        });

        skipButtonBody.on('pointerout', () => {
            this.skipButtonBody?.setFillStyle(0x7f1d1d, 0.94);
            this.skipButtonLabel?.setTint(0xffffff);
        });

        skipButtonBody.on('pointerdown', () => {
            this.scene.scene.start('MainMenu');
        });
    }

    private refreshStageHeaderBackdrop (): void
    {
        if (!this.stageText || !this.stageTextBackdrop) {
            return;
        }

        const paddingX = Math.max(
            TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_X_MIN,
            Math.round(TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_X_BASE * UI_SCALE)
        );
        const paddingY = Math.max(
            TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_Y_MIN,
            Math.round(TUTORIAL_STAGE_HEADER_BACKDROP_PADDING_Y_BASE * UI_SCALE)
        );

        const width = Math.min(
            Math.round(GAME_WIDTH * 0.94),
            Math.round(this.stageText.width + (paddingX * 2))
        );
        const height = Math.round(this.stageText.height + (paddingY * 2));
        const centerY = this.stageText.y + Math.round(this.stageText.height / 2);

        this.stageTextBackdrop.setSize(width, height);
        this.stageTextBackdrop.setPosition(Math.round(this.stageText.x), centerY);
    }

    private runCurrentStage (): void
    {
        if (!this.active) {
            return;
        }

        if (this.stageIndex >= TOTAL_STAGES) {
            this.scene.scene.start('MainMenu');
            return;
        }

        if (this.stageIndex === 0) {
            this.setStageHeader('Welcome');
            this.runNotifyStage('Welcome to the AVGE TCG tutorial!', () => {
                this.advanceStage();
            }, 5);
            return;
        }

        if (this.stageIndex === 1) {
            this.setStageHeader('Notifications');
            this.runNotifyStage('From here on, I\'ll be communicating via these notifications. You can move through them by clicking the X in the top right corner.', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 2) {
            this.setStageHeader('Card Reveal');
            this.runRevealStage([
                this.createFakeRevealCard('TUT-ITEM-01', 'Demo Item', 'ITEM')
            ], 'This is a card. Any time a card is flipped over like this, you can click on it to get more information about it.', true, () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 3) {
            this.setStageHeader('Deck Composition');
            this.runRevealStage([
                this.createFakeRevealCard('TUT-ITEM-A', 'Tempo Vial', 'ITEM'),
                this.createFakeRevealCard('TUT-CHAR-A', 'Pulse Conductor', 'CHARACTER'),
                this.createFakeRevealCard('TUT-STADIUM-A', 'Grand Hall', 'STADIUM'),
                this.createFakeRevealCard('TUT-SUPPORTER-A', 'Stage Manager', 'SUPPORTER'),
                this.createFakeRevealCard('TUT-TOOL-A', 'Precision Baton', 'TOOL')
            ], 'To play TCG, you need to form a deck of 20 cards, which consist of character, item, stadium, supporter, and tool cards. At least one of these cards must be a character card. You set your deck through the Deck Builder on the home screen, through which you can browse through all the cards in the game and either create your own deck with them or import someone else\'s.', false, () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 4) {
            this.setStageHeader('Queueing');
            this.runNotifyStage('Once you create a deck and queue into a game, you will be randomly matched with another player.', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 5) {
            this.setStageHeader('Preparation Phase');
            this.runNotifyStage('At the beginning of a game, during the \"preparation phase\" 4 cards will be randomly put into your hand, and 1 character card in your deck will immediately be set as the active character.', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 6) {
            this.setStageHeader('Setup Movement Rules');
            this.runNotifyStage('Through dragging and dropping, you can move character cards from your hand to your deck, from your deck to your hand, and from your deck to replace your active slot.', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 7) {
            this.setupStage8Board();
            return;
        }

        if (this.stageIndex === 8) {
            this.setStageHeader('Setup Complete');
            this.runNotifyStage('Nice work! Once you\'re ready to start the game, you can find the \"->Done\" button in the corner. After both players hit this button, the game will start.', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 9) {
            this.setupStage10Board();
            return;
        }

        if (this.stageIndex === 10) {
            this.setStageHeader('Phase Overview');
            this.runNotifyStage('Each player\'s turn consists of Phase 2 and the Attack Phase. During Phase 2, you can do things like...', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 11) {
            this.setupStage12Board();
            return;
        }

        if (this.stageIndex === 12) {
            this.setupStage13Board();
            return;
        }

        if (this.stageIndex === 13) {
            this.setupStage14Board();
            return;
        }

        if (this.stageIndex === 14) {
            this.setupStage15Board();
            return;
        }

        if (this.stageIndex === 15) {
            this.setupStage16Board();
            return;
        }

        if (this.stageIndex === 16) {
            this.setupStage17Board();
            return;
        }

        if (this.stageIndex === 17) {
            this.setupStage18Board();
            return;
        }

        if (this.stageIndex === 18) {
            this.setStageHeader('Attack Phase Basics');
            this.runNotifyStage('Nice! Once you\'re in the attack phase, you can only do an attack with your character or skip the phase.', () => {
                this.advanceStage();
            });
            return;
        }

        if (this.stageIndex === 19) {
            this.setupStage20Board();
            return;
        }

        if (this.stageIndex === 20) {
            this.setupStage21Board();
            return;
        }

        if (this.stageIndex === 21) {
            this.setupStage22Board();
            return;
        }

        if (this.stageIndex === 22) {
            this.startStage23Selection();
            return;
        }

        if (this.stageIndex === 23) {
            this.startStage24Selection();
            return;
        }

        this.setupStage25Board();
    }

    private setupStage8Board (): void
    {
        this.resetBoardForStage('init', 'Try setting up such that Character A is your active character and Character B is in your hand.');

        this.spawnCharacter({ id: STAGE8_CHAR_A_ID, holderId: 'p1-hand', cardClass: 'Character A', hasAtk1: true, atk1Name: 'Pulse Hit', atk1Cost: 1, retreatCost: 1 });
        this.spawnCharacter({ id: STAGE8_CHAR_B_ID, holderId: 'p1-active', cardClass: 'Character B', hasAtk1: true, atk1Name: 'Counter Beat', atk1Cost: 1, retreatCost: 1 });

        this.spawnItem({ id: 'TUT-S8-ITEM-1', cardClass: 'Echo Capsule' });
        this.spawnItem({ id: 'TUT-S8-ITEM-2', cardClass: 'Rhythm Charm' });
        this.spawnItem({ id: 'TUT-S8-ITEM-3', cardClass: 'Tempo Lens' });

        this.finishBoardSetup(true);
    }

    private setupStage10Board (): void
    {
        this.resetBoardForStage('init', 'Same setup as before. Click ->Done when you are ready.');

        this.spawnCharacter({ id: STAGE8_CHAR_A_ID, holderId: 'p1-active', cardClass: 'Character A', hasAtk1: true, atk1Name: 'Pulse Hit', atk1Cost: 1, retreatCost: 1 });
        this.spawnCharacter({ id: STAGE8_CHAR_B_ID, holderId: 'p1-hand', cardClass: 'Character B', hasAtk1: true, atk1Name: 'Counter Beat', atk1Cost: 1, retreatCost: 1 });

        this.spawnItem({ id: 'TUT-S10-ITEM-1', cardClass: 'Echo Capsule' });
        this.spawnItem({ id: 'TUT-S10-ITEM-2', cardClass: 'Rhythm Charm' });
        this.spawnItem({ id: 'TUT-S10-ITEM-3', cardClass: 'Tempo Lens' });

        this.finishBoardSetup(true);
    }

    private setupStage12Board (): void
    {
        this.resetBoardForStage('phase2', 'Drag and drop energy to one of your character cards in play.');

        this.spawnCharacter({ id: STAGE12_ACTIVE_ID, holderId: 'p1-active', cardClass: 'Pulse Conductor', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });
        this.spawnEnergy({ id: STAGE12_ENERGY_ID });

        this.finishBoardSetup(true);
    }

    private setupStage13Board (): void
    {
        this.resetBoardForStage('phase2', 'Use an item/supporter card by dragging it and dropping it outside your hand.');

        this.spawnCharacter({ id: 'TUT-S13-ACTIVE', holderId: 'p1-active', cardClass: 'Studio Guard', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });
        this.spawnCard({ id: STAGE13_ITEM_ID, cardType: 'item', holderId: 'p1-hand', cardClass: 'Demo Item' });

        this.finishBoardSetup(true);
    }

    private setupStage14Board (): void
    {
        this.resetBoardForStage('phase2', 'Attach a tool by dragging it and dropping it onto a character card in play.');

        this.spawnCharacter({ id: STAGE14_ACTIVE_ID, holderId: 'p1-active', cardClass: 'Lead Performer', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });
        this.spawnCard({ id: STAGE14_TOOL_ID, cardType: 'tool', holderId: 'p1-hand', cardClass: 'Precision Baton' });

        this.finishBoardSetup(true);
    }

    private setupStage15Board (): void
    {
        this.resetBoardForStage('phase2', 'Set the game stadium by dragging and dropping a card into the stadium cardholder.');

        this.spawnCharacter({ id: 'TUT-S15-ACTIVE', holderId: 'p1-active', cardClass: 'Field Artist', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });
        this.spawnCard({ id: STAGE15_STADIUM_ID, cardType: 'stadium', holderId: 'p1-hand', cardClass: 'Grand Hall' });

        this.finishBoardSetup(true);
    }

    private setupStage16Board (): void
    {
        this.resetBoardForStage('phase2', 'Retreat your active character by dragging and dropping a card in your bench into the active slot. This will only work if you have enough energy attached to the active card (retreat cost found in card descriptions).');

        this.spawnCharacter({ id: STAGE16_ACTIVE_ID, holderId: 'p1-active', cardClass: 'Frontline Idol', hasAtk1: true, atk1Cost: 1, retreatCost: 2 });
        this.spawnCharacter({ id: STAGE16_BENCH_ID, holderId: 'p1-bench', cardClass: 'Backup Vocal', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });
        this.spawnEnergy({ id: 'TUT-S16-E1', attachedToCardId: STAGE16_ACTIVE_ID });
        this.spawnEnergy({ id: 'TUT-S16-E2', attachedToCardId: STAGE16_ACTIVE_ID });

        this.finishBoardSetup(true);
    }

    private setupStage17Board (): void
    {
        this.resetBoardForStage('phase2', 'Move a character card to your bench by dragging and dropping it from your hand.');

        this.spawnCharacter({ id: 'TUT-S17-ACTIVE', holderId: 'p1-active', cardClass: 'Anchor Lead', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });
        this.spawnCharacter({ id: STAGE17_HAND_ID, holderId: 'p1-hand', cardClass: 'Bench Candidate', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });

        this.finishBoardSetup(true);
    }

    private setupStage18Board (): void
    {
        this.resetBoardForStage('phase2', 'Move onto the attack phase, where players can only attack using their active character.');

        this.spawnCharacter({ id: 'TUT-S18-ACTIVE', holderId: 'p1-active', cardClass: 'Attack Lead', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });

        this.finishBoardSetup(true);
    }

    private setupStage20Board (): void
    {
        this.resetBoardForStage('atk', 'To use an attack, click on the character card and click on one of the attacks located next to it. If you have enough energy tokens attached to the character (attack cost found in card descriptions), it will attack.');

        this.spawnCharacter({
            id: STAGE20_ACTIVE_ID,
            holderId: 'p1-active',
            cardClass: 'Strike Soloist',
            hasAtk1: true,
            hasAtk2: true,
            atk1Name: 'Quarter Note Jab',
            atk2Name: 'Finale Burst',
            atk1Cost: 1,
            atk2Cost: 2,
            retreatCost: 1
        });
        this.spawnEnergy({ id: 'TUT-S20-E1', attachedToCardId: STAGE20_ACTIVE_ID });
        this.spawnEnergy({ id: 'TUT-S20-E2', attachedToCardId: STAGE20_ACTIVE_ID });

        this.finishBoardSetup(true);
    }

    private setupStage21Board (): void
    {
        this.resetBoardForStage('atk', 'If you just want to skip, you should click on the skip button in the top right corner.');

        this.spawnCharacter({ id: 'TUT-S21-ACTIVE', holderId: 'p1-active', cardClass: 'Measured Tempo', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });

        this.finishBoardSetup(true);
    }

    private setupStage22Board (): void
    {
        this.resetBoardForStage('phase2', 'Some cards have abilities that can be activated throughout their turn. To activate these abilities, click the card and find their ability near the red surrender button.');

        const abilityCard = this.spawnCharacter({
            id: STAGE22_ABILITY_ID,
            holderId: 'p1-active',
            cardClass: 'Ability Maestro',
            hasActive: true,
            activeName: 'Encore Engine',
            retreatCost: 1
        });

        this.finishBoardSetup(false);
        this.selectCard(abilityCard);
        this.scene.setBoardInputEnabled(true);
        this.scene.refreshCardActionButtons();
    }

    private setupStage25Board (): void
    {
        this.resetBoardForStage('phase2', 'This game is hard, with all sorts of decks being viable! If you ever have trouble and do not want to play anymore, you can simply hit the surrender button twice within 5 seconds to give up the game.');

        this.spawnCharacter({ id: 'TUT-S25-ACTIVE', holderId: 'p1-active', cardClass: 'Last Encore', hasAtk1: true, atk1Cost: 1, retreatCost: 1 });

        this.finishBoardSetup(true);
    }

    private startStage23Selection (): void
    {
        this.resetBoardForStage('phase2', 'Card selection query.');

        const message = 'Sometimes, you will be asked to make a selection between a few cards. To select cards, click on them, and they will be assigned a selection number (these numbers correspond to the order of submission, which matters sometimes). To deselect them, click the selection number to remove the selection. Try submitting a choice of 2 cards here.';
        const items: SelectionOverlayItem[] = [
            { id: 'sel-card-a', isCard: true, selectable: true, cardColor: GAME_CARD_TYPE_FILL_COLORS.character, cardClassLabel: 'Choice A', cardTypeLabel: 'CHARACTER' },
            { id: 'sel-card-b', isCard: true, selectable: true, cardColor: GAME_CARD_TYPE_FILL_COLORS.item, cardClassLabel: 'Choice B', cardTypeLabel: 'ITEM' },
            { id: 'sel-card-c', isCard: true, selectable: true, cardColor: GAME_CARD_TYPE_FILL_COLORS.tool, cardClassLabel: 'Choice C', cardTypeLabel: 'TOOL' },
            { id: 'sel-card-d', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.supporter, cardClassLabel: 'Display D', cardTypeLabel: 'SUPPORTER' },
            { id: 'sel-card-e', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.stadium, cardClassLabel: 'Display E', cardTypeLabel: 'STADIUM' },
        ];

        this.scene.setBoardInputEnabled(false, false);
        this.scene.overlayPreviewContext = 'input';
        this.scene.refreshCardActionButtons();

        this.scene.inputOverlayController.startSelectionOverlay(
            items,
            2,
            false,
            false,
            message,
            (orderedSelections: string[]) => {
                const normalized = orderedSelections.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0 && entry !== 'none');
                const unique = new Set(normalized);
                const validChoices = normalized.length === 2
                    && unique.size === 2
                    && normalized.every((id) => STAGE23_SELECTABLE_IDS.has(id));

                this.scene.overlayPreviewContext = null;
                this.scene.hideCardPreview();

                if (validChoices) {
                    this.advanceStage();
                    return;
                }

                this.runNotifyStage('Select exactly 2 cards from the 3 selectable options.', () => {
                    this.startStage23Selection();
                });
            }
        );
    }

    private startStage24Selection (): void
    {
        this.resetBoardForStage('phase2', 'Optional selection query.');

        const message = 'Some types of queries will allow you to leave some options blank. In these cases, you can simply select some or none of the cards and hit submit. For example, you cannot select any cards here, but that is okay!';
        const items: SelectionOverlayItem[] = [
            { id: 'display-a', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.character, cardClassLabel: 'Display A', cardTypeLabel: 'CHARACTER' },
            { id: 'display-b', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.item, cardClassLabel: 'Display B', cardTypeLabel: 'ITEM' },
            { id: 'display-c', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.tool, cardClassLabel: 'Display C', cardTypeLabel: 'TOOL' },
            { id: 'display-d', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.supporter, cardClassLabel: 'Display D', cardTypeLabel: 'SUPPORTER' },
            { id: 'display-e', isCard: true, selectable: false, cardColor: GAME_CARD_TYPE_FILL_COLORS.stadium, cardClassLabel: 'Display E', cardTypeLabel: 'STADIUM' },
        ];

        this.scene.setBoardInputEnabled(false, false);
        this.scene.overlayPreviewContext = 'input';
        this.scene.refreshCardActionButtons();

        this.scene.inputOverlayController.startSelectionOverlay(
            items,
            2,
            false,
            true,
            message,
            (orderedSelections: string[]) => {
                const hasAnyChosenCard = orderedSelections.some((entry) => entry.trim().toLowerCase() !== 'none');

                this.scene.overlayPreviewContext = null;
                this.scene.hideCardPreview();

                if (!hasAnyChosenCard) {
                    this.advanceStage();
                    return;
                }

                this.runNotifyStage('This query expects selecting none. Submit with no chosen cards.', () => {
                    this.startStage24Selection();
                });
            }
        );
    }

    private runNotifyStage (message: string, onDone: () => void, timeoutSeconds: number | null = null): void
    {
        this.scene.inputOverlayController.stopActiveOverlay();
        this.scene.setBoardInputEnabled(false, false);
        this.scene.inputOverlayController.startNotifyOverlay('TUTORIAL', message, () => {
            this.scene.setBoardInputEnabled(false, false);
            onDone();
        }, timeoutSeconds);
    }

    private runRevealStage (
        cards: RevealOverlayCard[],
        message: string,
        requireAllCardsClicked: boolean,
        onDone: () => void
    ): void
    {
        this.scene.inputOverlayController.stopActiveOverlay();
        this.scene.setBoardInputEnabled(false, false);
        this.clickedRevealCardIds.clear();

        const requiredIds = new Set(cards.map((card) => card.id.toLowerCase()));

        this.scene.inputOverlayController.startRevealOverlay(
            cards,
            message,
            null,
            () => {
                this.scene.hideTutorialRevealCardPreview?.();
                this.scene.setBoardInputEnabled(false, false);
                const clickedAll = !requireAllCardsClicked || Array.from(requiredIds).every((id) => this.clickedRevealCardIds.has(id));
                if (clickedAll) {
                    onDone();
                    return;
                }

                this.runNotifyStage('Please click every revealed card before closing.', () => {
                    this.runRevealStage(cards, message, requireAllCardsClicked, onDone);
                });
            },
            (cardId: string) => {
                this.clickedRevealCardIds.add(cardId.toLowerCase());
                const clickedCard = cards.find((card) => card.id.toLowerCase() === cardId.toLowerCase()) ?? null;
                if (clickedCard) {
                    this.scene.showTutorialRevealCardPreview?.(clickedCard);
                }
            },
            () => {
                this.scene.hideTutorialRevealCardPreview?.();
            }
        );
    }

    private createFakeRevealCard (id: string, label: string, typeLabel: string): RevealOverlayCard
    {
        const normalizedType = typeLabel.trim().toLowerCase();
        let color = GAME_CARD_TYPE_FILL_COLORS.item;
        if (normalizedType === 'character') {
            color = GAME_CARD_TYPE_FILL_COLORS.character;
        }
        else if (normalizedType === 'tool') {
            color = GAME_CARD_TYPE_FILL_COLORS.tool;
        }
        else if (normalizedType === 'stadium') {
            color = GAME_CARD_TYPE_FILL_COLORS.stadium;
        }
        else if (normalizedType === 'supporter') {
            color = GAME_CARD_TYPE_FILL_COLORS.supporter;
        }

        return {
            id,
            cardClassLabel: label,
            cardColor: color,
            cardTypeLabel: typeLabel,
            isKnownCard: true,
        };
    }

    private resetBoardForStage (mode: StageMode, headerText: string): void
    {
        this.scene.inputOverlayController.stopActiveOverlay();
        this.scene.overlayPreviewContext = null;
        this.scene.clearCardSelection();
        this.scene.resetBoardEntitiesForAuthoritativeEnvironment();
        this.scene.surrenderController.disarm(false);

        this.scene.waitingForOpponent = false;
        this.scene.remoteInputLockActive = false;
        this.scene.awaitingRemoteNotifyAck = false;
        this.scene.pendingNotifyCommand = null;
        this.scene.pendingNotifyCommandQueue = [];
        this.scene.pendingInputCommand = null;
        this.scene.pregameInitStage = mode === 'init' ? 'init' : 'live';
        this.scene.initSetupConfirmed = false;
        this.scene.opponentInitSetupConfirmed = mode !== 'init';

        this.scene.setPlayerTurn('p1');
        this.scene.roundNumber = mode === 'init' ? 0 : 1;
        this.scene.setGamePhase(mode === 'atk' ? 'atk' : 'phase2');
        this.scene.applyBoardView('p1');

        this.setStageHeader(headerText);
        this.scene.setBoardInputEnabled(false, false);
    }

    private finishBoardSetup (enableInput: boolean): void
    {
        this.scene.layoutAllHolders();
        this.scene.redrawAllCardMarks();
        this.scene.refreshPhaseHud();
        this.scene.refreshPhaseStateActionButton();
        this.scene.refreshCardActionButtons();

        if (enableInput) {
            this.scene.setBoardInputEnabled(true);
        }
    }

    private spawnCharacter (options: {
        id: string;
        holderId: string;
        cardClass: string;
        hasAtk1?: boolean;
        hasAtk2?: boolean;
        hasActive?: boolean;
        atk1Name?: string;
        atk2Name?: string;
        activeName?: string;
        atk1Cost?: number;
        atk2Cost?: number;
        retreatCost?: number;
        hp?: number;
        maxHp?: number;
    }): Card
    {
        return this.spawnCard({
            id: options.id,
            cardType: 'character',
            holderId: options.holderId,
            cardClass: options.cardClass,
            hasAtk1: options.hasAtk1,
            hasAtk2: options.hasAtk2,
            hasActive: options.hasActive,
            atk1Name: options.atk1Name,
            atk2Name: options.atk2Name,
            activeName: options.activeName,
            atk1Cost: options.atk1Cost,
            atk2Cost: options.atk2Cost,
            retreatCost: options.retreatCost,
            hp: options.hp,
            maxHp: options.maxHp,
        });
    }

    private spawnItem (options: { id: string; cardClass: string }): Card
    {
        return this.spawnCard({
            id: options.id,
            cardType: 'item',
            holderId: 'p1-hand',
            cardClass: options.cardClass,
        });
    }

    private spawnCard (options: {
        id: string;
        cardType: 'character' | 'tool' | 'item' | 'stadium' | 'supporter';
        holderId: string;
        cardClass: string;
        hasAtk1?: boolean;
        hasAtk2?: boolean;
        hasActive?: boolean;
        atk1Name?: string;
        atk2Name?: string;
        activeName?: string;
        atk1Cost?: number;
        atk2Cost?: number;
        retreatCost?: number;
        hp?: number;
        maxHp?: number;
    }): Card
    {
        const result = this.scene.createCardFromCommand({
            id: options.id,
            ownerId: 'p1',
            cardType: options.cardType,
            holderId: options.holderId,
            color: this.getCardColor(options.cardType),
            AVGECardType: 'NONE',
            AVGECardClass: options.cardClass,
            hasAtk1: options.hasAtk1 === true,
            hasActive: options.hasActive === true,
            hasAtk2: options.hasAtk2 === true,
            atk1Name: options.atk1Name ?? null,
            activeName: options.activeName ?? null,
            atk2Name: options.atk2Name ?? null,
            atk1Cost: options.atk1Cost,
            atk2Cost: options.atk2Cost,
            retreatCost: options.retreatCost,
            hp: options.hp ?? 120,
            maxHp: options.maxHp ?? 120,
            statusEffect: { ...DEFAULT_STATUS_EFFECT },
            width: this.scene.objectWidth,
            height: this.scene.objectHeight,
            flipped: false,
            attachedToCardId: null,
            deferLayoutAndRedraw: true,
        });

        if (!result.ok || !result.card) {
            throw new Error(result.error ?? `Failed to create tutorial card: ${options.id}`);
        }

        return result.card;
    }

    private spawnEnergy (options: { id: string; attachedToCardId?: string }): EnergyToken
    {
        const result = this.scene.createEnergyTokenFromCommand({
            id: options.id,
            ownerId: 'p1',
            holderId: 'shared-energy',
            radius: this.scene.getDefaultEnergyTokenRadius(),
            attachedToCardId: options.attachedToCardId ?? null,
            deferLayout: true,
        });

        if (!result.ok || !result.token) {
            throw new Error(result.error ?? `Failed to create tutorial energy token: ${options.id}`);
        }

        return result.token;
    }

    private selectCard (card: Card): void
    {
        const selectCardFn = this.scene.selectCard;
        if (typeof selectCardFn === 'function') {
            selectCardFn.call(this.scene, card);
            return;
        }

        this.scene.selectedCard = card;
        this.scene.refreshCardActionButtons();
    }

    private isP1SetupCharacter (card: Card): boolean
    {
        if (card.getOwnerId() !== 'p1' || card.getCardType() !== 'character') {
            return false;
        }

        const zoneId = card.getZoneId();
        return zoneId === 'p1-hand' || zoneId === 'p1-bench' || zoneId === 'p1-active';
    }

    private hasStage8SolvedBoard (): boolean
    {
        const activeHolder = this.scene.cardHolderById['p1-active'];
        const handHolder = this.scene.cardHolderById['p1-hand'];
        if (!activeHolder || !handHolder) {
            return false;
        }

        const activeIds = activeHolder.cards.map((card: Card) => card.id);
        const handIds = handHolder.cards.map((card: Card) => card.id);

        return activeIds.includes(STAGE8_CHAR_A_ID) && handIds.includes(STAGE8_CHAR_B_ID);
    }

    private hasValidInitSetupForP1 (): boolean
    {
        const activeHolder = this.scene.cardHolderById['p1-active'];
        const benchHolder = this.scene.cardHolderById['p1-bench'];
        if (!activeHolder || !benchHolder) {
            return false;
        }

        const activeCharacterCount = activeHolder.cards.filter((card: Card) => card.getCardType() === 'character').length;
        const benchCharacterCount = benchHolder.cards.filter((card: Card) => card.getCardType() === 'character').length;
        return activeCharacterCount === 1 && benchCharacterCount <= 5;
    }

    private hasEnoughRetreatEnergy (activeCardId: string): boolean
    {
        const activeCard = this.scene.cardById[activeCardId];
        if (!activeCard) {
            return false;
        }

        const retreatCost = activeCard.getRetreatCost();
        if (retreatCost <= 0) {
            return true;
        }

        const attachedTokens = this.scene.getAttachedEnergyTokens(activeCardId);
        return attachedTokens.length >= retreatCost;
    }

    private hasStage16SwapResolved (): boolean
    {
        const activeCard = this.scene.cardById[STAGE16_ACTIVE_ID];
        const benchCard = this.scene.cardById[STAGE16_BENCH_ID];
        if (!activeCard || !benchCard) {
            return false;
        }

        return activeCard.getZoneId() === 'p1-bench' && benchCard.getZoneId() === 'p1-active';
    }

    private ensureStage16SwapResolved (): void
    {
        if (this.hasStage16SwapResolved()) {
            return;
        }

        const activeCard = this.scene.cardById[STAGE16_ACTIVE_ID];
        const benchCard = this.scene.cardById[STAGE16_BENCH_ID];
        if (!activeCard || !benchCard) {
            return;
        }

        if (benchCard.getZoneId() !== 'p1-active') {
            return;
        }

        if (activeCard.getZoneId() !== 'p1-active') {
            return;
        }

        this.scene.moveCardToZone(activeCard, 'p1-bench');
        this.scene.layoutAllHolders();
        this.scene.redrawAllCardMarks();
    }

    private getCardColor (cardType: 'character' | 'tool' | 'item' | 'stadium' | 'supporter'): number
    {
        if (cardType === 'character') {
            return GAME_CARD_TYPE_FILL_COLORS.character;
        }

        if (cardType === 'tool') {
            return GAME_CARD_TYPE_FILL_COLORS.tool;
        }

        if (cardType === 'stadium') {
            return GAME_CARD_TYPE_FILL_COLORS.stadium;
        }

        if (cardType === 'supporter') {
            return GAME_CARD_TYPE_FILL_COLORS.supporter;
        }

        return GAME_CARD_TYPE_FILL_COLORS.item;
    }

    private readLowerString (payload: Record<string, unknown>, key: string): string
    {
        const value = payload[key];
        return typeof value === 'string' ? value.trim().toLowerCase() : '';
    }

    private setStageHeader (header: string): void
    {
        if (!this.stageText) {
            return;
        }

        this.stageText.setText(`Tutorial Stage ${this.stageIndex + 1}/${TOTAL_STAGES}\n${header}`);
        this.refreshStageHeaderBackdrop();
    }

    private advanceStage (): void
    {
        this.stageIndex += 1;
        this.runCurrentStage();
    }

    private advanceStageWithDelay (delayMs: number = TUTORIAL_STAGE_TRANSITION_DELAY_MS): void
    {
        if (!this.active) {
            return;
        }

        if (this.pendingStageAdvanceTimer) {
            return;
        }

        this.scene.setBoardInputEnabled(false, false);
        this.pendingStageAdvanceTimer = this.scene.time.delayedCall(delayMs, () => {
            this.pendingStageAdvanceTimer = null;
            if (!this.active) {
                return;
            }

            this.advanceStage();
        });
    }
}