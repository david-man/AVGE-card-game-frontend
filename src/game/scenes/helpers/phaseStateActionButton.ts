import {
    GAME_STATUS_TEXT_LAYOUT,
    UI_SCALE,
} from '../../config';
import { fitTextToSingleLine } from '../../ui/overlays/textFit';

type PhaseStateActionScene = any;
type PhaseStateAction = 'phase2-attack' | 'atk-skip' | 'init-done' | null;

const hidePhaseStateActionButton = (scene: PhaseStateActionScene): void => {
    const button = scene.phaseStateActionButton;
    if (!button) {
        return;
    }

    button.body.setVisible(false);
    button.label.setVisible(false);
    button.action = null;
};

const renderPhaseStateActionButton = (
    scene: PhaseStateActionScene,
    buttonText: string,
    nextAction: PhaseStateAction
): void => {
    const button = scene.phaseStateActionButton;
    if (!button) {
        return;
    }

    const panelBounds = scene.phaseHudController.getPanelBounds();
    if (!panelBounds || !buttonText) {
        hidePhaseStateActionButton(scene);
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
        scene,
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
};

export const handlePhaseStateActionButtonClick = (scene: PhaseStateActionScene): void => {
    if (!scene.boardInputEnabled) {
        return;
    }

    if (!scene.phaseStateActionButton || !scene.phaseStateActionButton.action) {
        return;
    }

    const action = scene.phaseStateActionButton.action;
    if (typeof scene.canUsePhaseStateAction === 'function' && !scene.canUsePhaseStateAction(action)) {
        return;
    }

    scene.appendTerminalLine(`Phase action clicked: ${action}`);

    if (action === 'phase2-attack') {
        scene.emitBackendEvent('phase2_attack_button_clicked', {
            view_mode: scene.getViewModeLabel(scene.activeViewMode),
            player_turn: scene.getPlayerTurnLabel(scene.playerTurn),
            game_phase: scene.gamePhase
        });
        return;
    }

    if (action === 'atk-skip') {
        scene.emitBackendEvent('atk_skip_button_clicked', {
            view_mode: scene.getViewModeLabel(scene.activeViewMode),
            player_turn: scene.getPlayerTurnLabel(scene.playerTurn),
            game_phase: scene.gamePhase
        });
        return;
    }

    if (action === 'init-done') {
        scene.submitInitSetupDone();
    }
};

export const refreshPhaseStateActionButton = (scene: PhaseStateActionScene): void => {
    const button = scene.phaseStateActionButton;
    if (!button) {
        return;
    }

    const panelBounds = scene.phaseHudController.getPanelBounds();
    if (!panelBounds) {
        hidePhaseStateActionButton(scene);
        return;
    }

    if (typeof scene.shouldHidePhaseStateActionButton === 'function' && scene.shouldHidePhaseStateActionButton()) {
        hidePhaseStateActionButton(scene);
        return;
    }

    const isCurrentTurnView = scene.activeViewMode === scene.playerTurn;
    const isPlayerView = scene.activeViewMode === 'p1' || scene.activeViewMode === 'p2';
    if (scene.isPregameInitActive()) {
        if (!isPlayerView) {
            hidePhaseStateActionButton(scene);
            return;
        }

        const buttonText = scene.initSetupConfirmed ? 'Waiting...' : 'Done';
        const nextAction = scene.initSetupConfirmed ? null : 'init-done';
        if (nextAction && typeof scene.canUsePhaseStateAction === 'function' && !scene.canUsePhaseStateAction(nextAction)) {
            hidePhaseStateActionButton(scene);
            return;
        }

        renderPhaseStateActionButton(scene, buttonText, nextAction);
        return;
    }

    if (!isCurrentTurnView) {
        hidePhaseStateActionButton(scene);
        return;
    }

    let buttonText = '';
    let nextAction: 'phase2-attack' | 'atk-skip' | null = null;
    if (scene.gamePhase === 'phase2') {
        if (scene.roundNumber === 0) {
            buttonText = '-> end turn';
            nextAction = 'phase2-attack';
        }
        else {
            buttonText = '-> attack';
            nextAction = 'phase2-attack';
        }
    }
    else if (scene.gamePhase === 'atk') {
        buttonText = '->skip';
        nextAction = 'atk-skip';
    }

    if (nextAction && typeof scene.canUsePhaseStateAction === 'function' && !scene.canUsePhaseStateAction(nextAction)) {
        hidePhaseStateActionButton(scene);
        return;
    }

    renderPhaseStateActionButton(scene, buttonText, nextAction);
};