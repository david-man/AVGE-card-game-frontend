type OpponentDisconnectScene = any;

export const canInteractDuringInitOpponentDisconnect = (scene: OpponentDisconnectScene): boolean => {
    return scene.opponentDisconnected
        && scene.isPregameInitActive()
        && !scene.initSetupConfirmed;
};

export const setOpponentDisconnectedState = (
    scene: OpponentDisconnectScene,
    disconnected: boolean,
    message?: string,
    graceSeconds = 0
): void => {
    scene.opponentDisconnected = disconnected;
    stopOpponentDisconnectCountdown(scene);

    if (disconnected) {
        const label = typeof message === 'string' && message.trim().length > 0
            ? message.trim()
            : 'Other player disconnected. Waiting for reconnection...';
        safeSetOpponentDisconnectText(scene, label);
        if (canRenderOpponentDisconnectUi(scene)) {
            scene.opponentDisconnectBackdrop.setVisible(true);
            scene.opponentDisconnectText.setVisible(true);
        }
        else {
            console.warn('[Protocol] disconnect UI unavailable, using terminal fallback only.');
            scene.appendTerminalLine(label);
        }

        if (graceSeconds > 0) {
            startOpponentDisconnectCountdown(scene, label, graceSeconds);
        }
        scene.setInputAcknowledged(canInteractDuringInitOpponentDisconnect(scene));
        return;
    }

    if (canRenderOpponentDisconnectUi(scene)) {
        scene.opponentDisconnectBackdrop.setVisible(false);
        scene.opponentDisconnectText.setVisible(false);
    }
    scene.setInputAcknowledged(true);
};

export const stopOpponentDisconnectCountdown = (scene: OpponentDisconnectScene): void => {
    if (scene.opponentDisconnectCountdownTimer) {
        scene.opponentDisconnectCountdownTimer.remove(false);
        scene.opponentDisconnectCountdownTimer = null;
    }
    scene.opponentDisconnectCountdownSeconds = 0;
};

export const startOpponentDisconnectCountdown = (
    scene: OpponentDisconnectScene,
    baseMessage: string,
    graceSeconds: number
): void => {
    scene.opponentDisconnectCountdownSeconds = graceSeconds;
    safeSetOpponentDisconnectText(scene, `${baseMessage}\nAuto-win in ${scene.opponentDisconnectCountdownSeconds}s`);
    scene.appendTerminalLine(`Opponent disconnected. Auto-win in ${scene.opponentDisconnectCountdownSeconds}s if they do not reconnect.`);

    scene.opponentDisconnectCountdownTimer = scene.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => {
            if (!scene.opponentDisconnected) {
                stopOpponentDisconnectCountdown(scene);
                return;
            }

            scene.opponentDisconnectCountdownSeconds = Math.max(0, scene.opponentDisconnectCountdownSeconds - 1);
            safeSetOpponentDisconnectText(scene, `${baseMessage}\nAuto-win in ${scene.opponentDisconnectCountdownSeconds}s`);
            scene.appendTerminalLine(`Opponent reconnect timer: ${scene.opponentDisconnectCountdownSeconds}s remaining.`);

            if (scene.opponentDisconnectCountdownSeconds <= 0) {
                scene.appendTerminalLine('Reconnect grace period expired. Awaiting backend winner resolution...');
                stopOpponentDisconnectCountdown(scene);
            }
        }
    });
};

export const canRenderOpponentDisconnectUi = (scene: OpponentDisconnectScene): boolean => {
    return Boolean(
        scene.opponentDisconnectBackdrop
        && scene.opponentDisconnectBackdrop.active
        && scene.opponentDisconnectBackdrop.scene
        && scene.opponentDisconnectText
        && scene.opponentDisconnectText.active
        && scene.opponentDisconnectText.scene
    );
};

export const safeSetOpponentDisconnectText = (scene: OpponentDisconnectScene, text: string): void => {
    if (!canRenderOpponentDisconnectUi(scene)) {
        return;
    }

    try {
        scene.opponentDisconnectText.setText(text);
    }
    catch (error) {
        console.warn('[Protocol] Failed to update disconnect overlay text.', error);
    }
};
