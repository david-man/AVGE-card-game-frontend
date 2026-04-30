import { Card } from '../../entities';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    GAME_CARD_ACTION_BUTTON_LAYOUT,
    GAME_DEPTHS,
    GAME_HEIGHT,
    GAME_WIDTH,
    UI_SCALE,
} from '../../config';
import { fitTextToTwoLines } from '../../ui/overlays/textFit';

type CardActionKey = 'atk1' | 'atk2' | 'active';
type CardActionButtonScene = any;

type CardActionButton = {
    key: CardActionKey;
    body: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
};

const hideAllCardActionButtons = (scene: CardActionButtonScene): void => {
    for (const button of scene.cardActionButtons) {
        button.body.setVisible(false);
        button.label.setVisible(false);
        button.body.setScale(1);
        button.label.setScale(1);
    }
};

const normalizeCardActionLabel = (rawName: string | null, fallback: string): string => {
    if (typeof rawName !== 'string') {
        return fallback;
    }

    const normalized = rawName
        .trim()
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ');

    return normalized.length > 0 ? normalized : fallback;
};

const getCardActionButtonLabel = (card: Card, actionKey: CardActionKey): string => {
    if (actionKey === 'atk1') {
        return normalizeCardActionLabel(card.getAttackOneName(), 'ATK1');
    }

    if (actionKey === 'atk2') {
        return normalizeCardActionLabel(card.getAttackTwoName(), 'ATK2');
    }

    return normalizeCardActionLabel(card.getActiveAbilityName(), 'ACTIVE');
};

const getCurrentTurnActiveCharacterCard = (scene: CardActionButtonScene): Card | null => {
    const activeHolder = scene.cardHolderById[`${scene.playerTurn}-active`];
    if (!activeHolder) {
        return null;
    }

    for (const holderCard of activeHolder.cards) {
        if (holderCard.getCardType() === 'character') {
            return holderCard;
        }
    }

    return null;
};

export const createCardActionButtons = (scene: CardActionButtonScene): void => {
    const radius = Math.max(12, Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.buttonRadiusBase / BASE_WIDTH) * GAME_WIDTH));
    const leftMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.leftMarginBase / BASE_WIDTH) * GAME_WIDTH);
    const bottomMargin = Math.round((GAME_CARD_ACTION_BUTTON_LAYOUT.bottomMarginBase / BASE_HEIGHT) * GAME_HEIGHT);
    const fontSize = Math.max(10, Math.round(GAME_CARD_ACTION_BUTTON_LAYOUT.fontSize * UI_SCALE));

    const defs: Array<{ key: CardActionKey; text: string }> = [
        { key: 'atk1', text: 'ATK1' },
        { key: 'atk2', text: 'ATK2' },
        { key: 'active', text: 'ACTIVE' }
    ];

    scene.cardActionButtons = defs.map((def) => {
        const x = leftMargin + radius;
        const y = GAME_HEIGHT - bottomMargin - radius;

        const body = scene.add.circle(
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

        const label = scene.add.text(x, y, def.text).setFontSize(fontSize)
            .setOrigin(0.5)
            .setAlign('center')
            .setTint(GAME_CARD_ACTION_BUTTON_LAYOUT.textTint)
            .setDepth(GAME_DEPTHS.terminalInputText + 1)
            .setVisible(false);

        body.on('pointerdown', () => {
            handleCardActionButtonClick(scene, def.key);
        });

        body.on('pointerover', () => {
            scene.tweens.killTweensOf([body, label]);
            body.setFillStyle(0x1e293b, 0.98);
            label.setTint(0xfef08a);
            scene.tweens.add({
                targets: [body, label],
                scaleX: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverScale,
                scaleY: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverScale,
                duration: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverDurationMs,
                ease: 'Sine.easeOut'
            });
        });

        body.on('pointerout', () => {
            scene.tweens.killTweensOf([body, label]);
            body.setFillStyle(GAME_CARD_ACTION_BUTTON_LAYOUT.fillColor, GAME_CARD_ACTION_BUTTON_LAYOUT.fillAlpha);
            label.setTint(GAME_CARD_ACTION_BUTTON_LAYOUT.textTint);
            scene.tweens.add({
                targets: [body, label],
                scaleX: 1,
                scaleY: 1,
                duration: GAME_CARD_ACTION_BUTTON_LAYOUT.hoverDurationMs,
                ease: 'Sine.easeOut'
            });
        });

        return { key: def.key, body, label };
    });
};

export const handleCardActionButtonClick = (scene: CardActionButtonScene, actionKey: CardActionKey): void => {
    if (!scene.boardInputEnabled) {
        return;
    }

    if (scene.isInitWaitingForOpponent()) {
        return;
    }

    const card = scene.cardActionSourceByKey[actionKey] ?? scene.selectedCard;
    if (!card) {
        return;
    }

    const actionName = actionKey === 'active' ? 'activate_ability' : actionKey;
    const message = `${card.id} ${actionName}`;

    scene.appendTerminalLine(message);
    scene.emitBackendEvent('card_action', {
        action: actionName,
        card_id: card.id,
        card_type: card.getCardType(),
        owner_id: card.getOwnerId(),
        zone_id: card.getZoneId(),
        message
    });
};

export const refreshCardActionButtons = (scene: CardActionButtonScene): void => {
    if (!scene.cardActionButtons || scene.cardActionButtons.length === 0) {
        return;
    }

    scene.cardActionSourceByKey = { atk1: null, atk2: null, active: null };

    if (!scene.boardInputEnabled || scene.isInitWaitingForOpponent() || scene.activeViewMode === 'spectator' || scene.overlayPreviewContext) {
        hideAllCardActionButtons(scene);
        return;
    }

    const selectedCard = scene.selectedCard;
    const selectedIsActiveSlot = Boolean(selectedCard && selectedCard.getZoneId() === `${selectedCard.getOwnerId()}-active`);
    const currentTurnActiveCard = getCurrentTurnActiveCharacterCard(scene);
    const attackCard = selectedCard && selectedIsActiveSlot
        ? selectedCard
        : (scene.gamePhase === 'atk' ? currentTurnActiveCard : null);
    const canControlTurnActions = scene.activeViewMode === scene.playerTurn;

    const abilityCard = selectedCard;
    const abilityIsEligibleZone = abilityCard
        ? (abilityCard.getZoneId() === `${scene.activeViewMode}-deck` || abilityCard.getZoneId() === `${scene.activeViewMode}-active`)
        : false;
    const canUseAbilityCardActions = Boolean(abilityCard && abilityCard.getOwnerId() === scene.activeViewMode);
    const showAtk1 = Boolean(attackCard && scene.gamePhase === 'atk' && canControlTurnActions && attackCard.getCardType() === 'character' && attackCard.getOwnerId() === scene.playerTurn && attackCard.hasAttackOne());
    const showAtk2 = Boolean(attackCard && scene.gamePhase === 'atk' && canControlTurnActions && attackCard.getCardType() === 'character' && attackCard.getOwnerId() === scene.playerTurn && attackCard.hasAttackTwo());
    const showActive = Boolean(!scene.isPregameInitActive() && abilityCard && canUseAbilityCardActions && abilityCard.getCardType() === 'character' && abilityIsEligibleZone && abilityCard.hasActiveAbility());

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

    const buttonByKey = new Map<CardActionKey, CardActionButton>();

    for (const button of scene.cardActionButtons) {
        const visible =
            (button.key === 'atk1' && showAtk1) ||
            (button.key === 'atk2' && showAtk2) ||
            (button.key === 'active' && showActive);

        const labelSourceCard = button.key === 'active' ? abilityCard : attackCard;
        if (visible && labelSourceCard) {
            const fittedLabel = fitTextToTwoLines({
                scene,
                text: getCardActionButtonLabel(labelSourceCard, button.key),
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
                scene.cardActionSourceByKey.active = abilityCard;
            }
            else {
                scene.cardActionSourceByKey[button.key] = attackCard;
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
        const surrenderMetrics = scene.surrenderController.getButtonMetrics();
        if (surrenderMetrics && surrenderMetrics.visible) {
            setButtonPosition('active', surrenderMetrics.x, surrenderMetrics.y - (diameter + gap));
        }
        else {
            setButtonPosition('active', defaultAnchorX, defaultAnchorY);
        }
    }
};
