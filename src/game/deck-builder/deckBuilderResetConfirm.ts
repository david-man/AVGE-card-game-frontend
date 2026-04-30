type DeckBuilderResetScene = any;

export const applyConfirmedDeckReset = (scene: DeckBuilderResetScene): void => {
    scene.state.countsByCardId.clear();
    scene.persistCurrentDeckDraft();
    scene.refreshDeckSlotButtons();
    scene.renderRows();
    scene.updateSummaryText();
    scene.hideDeckCardPreview();
    scene.subtitle.setText(`Reset ${scene.state.deckName.toUpperCase()} to 0 cards. Save to persist.`);
};

export const armResetDeckConfirm = (
    scene: DeckBuilderResetScene,
    resetConfirmWindowSeconds: number,
    onExpire: () => void
): Phaser.Time.TimerEvent => {
    scene.resetDeckConfirmSecondsRemaining = resetConfirmWindowSeconds;
    scene.resetHoverLabel.setVisible(false);
    scene.resetIcon.setVisible(false);
    scene.resetIcon.clearTint();
    scene.resetLabel
        .setVisible(true)
        .setText(`${scene.resetDeckConfirmSecondsRemaining}s`);
    scene.subtitle.setText(`Click reset again within ${scene.resetDeckConfirmSecondsRemaining}s to confirm.`);

    return scene.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => {
            scene.resetDeckConfirmSecondsRemaining = Math.max(0, scene.resetDeckConfirmSecondsRemaining - 1);
            if (scene.resetDeckConfirmSecondsRemaining <= 0) {
                onExpire();
                return;
            }

            scene.resetLabel.setText(`${scene.resetDeckConfirmSecondsRemaining}s`);
        }
    });
};

export const disarmResetDeckConfirm = (scene: DeckBuilderResetScene): void => {
    if (scene.resetDeckConfirmTimer) {
        scene.resetDeckConfirmTimer.remove(false);
        scene.resetDeckConfirmTimer = null;
    }

    scene.resetDeckConfirmSecondsRemaining = 0;
    scene.resetHoverLabel.setVisible(false);
    scene.resetLabel.setVisible(false).setText('');
    scene.resetIcon.setVisible(true);
    scene.resetIcon.clearTint();
};

export const shouldDisarmResetConfirmOnGameObjectDown = (
    scene: DeckBuilderResetScene,
    gameObject: Phaser.GameObjects.GameObject
): boolean => {
    if (gameObject === scene.resetButton) {
        return false;
    }

    return true;
};