import { GAME_SCENE_VISUALS } from '../../config';

type EventPipelineScene = any;

export const setBoardInputEnabled = (
    scene: EventPipelineScene,
    enabled: boolean,
    showLockOverlayWhenDisabled = true
): void => {
    scene.boardInputEnabled = enabled;

    if (!enabled) {
        const overlayAlpha = showLockOverlayWhenDisabled
            ? GAME_SCENE_VISUALS.inputLockAlpha
            : 0;
        const showOverlay = showLockOverlayWhenDisabled && overlayAlpha > 0;
        scene.inputLockOverlay
            .setFillStyle(GAME_SCENE_VISUALS.inputLockColor, overlayAlpha)
            .setVisible(showOverlay);
    }
    else {
        scene.inputLockOverlay
            .setFillStyle(GAME_SCENE_VISUALS.inputLockColor, GAME_SCENE_VISUALS.inputLockAlpha)
            .setVisible(false);
    }

    if (enabled && scene.inputOverlayController?.hasActiveOverlay()) {
        scene.inputOverlayController.stopActiveOverlay();
        scene.overlayPreviewContext = null;
        scene.refreshCardActionButtons();
    }

    if (!enabled) {
        scene.clearCardSelection();
        scene.activelyDraggedCardIds.clear();
        scene.dragOriginZoneByCardId.clear();
        scene.dragStartPositionByCardId.clear();
        scene.dragDistanceByCardId.clear();
        scene.activelyDraggedEnergyTokenIds.clear();
        scene.energyDragStartPositionById.clear();
        scene.energyDragDistanceById.clear();
        return;
    }

    if (!scene.isInteractionLockedByAnimation() && !scene.initStartCountdownAckGateActive) {
        flushPendingBackendEvents(scene);
    }
};

export const beginSceneAnimation = (scene: EventPipelineScene): void => {
    scene.activeSceneAnimationCount += 1;
    console.info('[ACK_TRACE][Game] animation_begin', {
        activeAnimations: scene.activeSceneAnimationCount,
        pendingEvents: scene.pendingBackendEvents.length
    });
};

export const endSceneAnimation = (scene: EventPipelineScene): void => {
    scene.activeSceneAnimationCount = Math.max(0, scene.activeSceneAnimationCount - 1);
    console.info('[ACK_TRACE][Game] animation_end', {
        activeAnimations: scene.activeSceneAnimationCount,
        pendingEvents: scene.pendingBackendEvents.length
    });
    if (scene.activeSceneAnimationCount === 0) {
        flushPendingBackendEvents(scene);
    }
};

export const flushPendingBackendEvents = (scene: EventPipelineScene): void => {
    if (scene.pendingBackendEvents.length === 0) {
        return;
    }

    if (scene.commandExecutionInProgress || scene.isInteractionLockedByAnimation() || scene.initStartCountdownAckGateActive) {
        return;
    }

    const pending = scene.pendingBackendEvents.splice(0, scene.pendingBackendEvents.length);
    console.info('[ACK_TRACE][Game] flush_pending_events', {
        flushedCount: pending.length,
        activeAnimations: scene.activeSceneAnimationCount,
        commandExecutionInProgress: scene.commandExecutionInProgress
    });
    for (const item of pending) {
        const isAck = item.eventType === 'terminal_log' && String(item.responseData.line ?? '').trim().toLowerCase() === 'ack backend_update_processed';
        console.info('[ACK_TRACE][Game] flush_send_event', {
            eventType: item.eventType,
            isAck,
            command: isAck ? item.responseData.command ?? null : null
        });
        dispatchFrontendEvent(scene, item.eventType, item.responseData, item.context);
    }
};

export const setCommandExecutionInProgress = (
    scene: EventPipelineScene,
    inProgress: boolean
): void => {
    scene.commandExecutionInProgress = inProgress;
    if (!inProgress && !scene.isInteractionLockedByAnimation() && !scene.initStartCountdownAckGateActive) {
        flushPendingBackendEvents(scene);
    }
};

export const appendTerminalLine = (scene: EventPipelineScene, line: string): void => {
    console.info(`[Command] ${line}`);

    // While replaying backend scanner commands, avoid echoing every corrected
    // local line back to backend. A single ACK is emitted per processed update.
    if (scene.scannerCommandInProgress) {
        return;
    }

    emitBackendEvent(scene, 'terminal_log', {
        line
    });
};

export const emitBackendEvent = (
    scene: EventPipelineScene,
    eventType: string,
    responseData: Record<string, unknown>
): void => {
    const phaseNavigationEvent = eventType === 'phase2_attack_button_clicked' || eventType === 'atk_skip_button_clicked';
    const immediateInputEvent = eventType === 'input_result' || eventType === 'input_state_change' || eventType === 'notify' || eventType === 'reveal';
    const isAckEvent = eventType === 'terminal_log' && String(responseData.line ?? '').trim().toLowerCase() === 'ack backend_update_processed';
    const eventSequence = scene.backendEventSequence + 1;
    scene.backendEventSequence = eventSequence;

    // Avoid echo loops: when a scanner command from backend mutates frontend state,
    // do not send those resulting events back to backend.
    if (scene.scannerCommandInProgress && eventType !== 'terminal_log') {
        if (isAckEvent) {
            console.info('[ACK_TRACE][Game] scanner_replay_ack_allowed', {
                seq: eventSequence,
                command: responseData.command ?? null
            });
        }
        return;
    }

    const context = {
        scene: 'Game',
        view_mode: scene.activeViewMode,
        game_phase: scene.gamePhase,
        player_turn: scene.playerTurn
    };

    if (isAckEvent) {
        // ACK packets should usually be emitted immediately, but they must
        // wait for in-flight scene animations (for example HP pulse/hurt
        // effects). Otherwise backend can advance to the next command
        // before both clients finish visualizing the current one.
        if (scene.commandExecutionInProgress || scene.isInteractionLockedByAnimation() || scene.initStartCountdownAckGateActive) {
            scene.pendingBackendEvents.push({
                eventType,
                responseData,
                context
            });
            return;
        }

        dispatchFrontendEvent(scene, eventType, responseData, context);
        return;
    }

    if (eventType === 'terminal_log' && scene.commandExecutionInProgress) {
        scene.pendingBackendEvents.push({
            eventType,
            responseData,
            context
        });
        return;
    }

    if (!phaseNavigationEvent && !immediateInputEvent && scene.isInteractionLockedByAnimation()) {
        scene.pendingBackendEvents.push({
            eventType,
            responseData,
            context
        });
        return;
    }

    dispatchFrontendEvent(scene, eventType, responseData, context);
};

export const dispatchFrontendEvent = (
    scene: EventPipelineScene,
    eventType: string,
    responseData: Record<string, unknown>,
    context: Record<string, unknown>
): void => {
    const isAckEvent = eventType === 'terminal_log' && String(responseData.line ?? '').trim().toLowerCase() === 'ack backend_update_processed';
    if (eventType === 'terminal_log' && !isAckEvent) {
        return;
    }

    if (eventType === 'input_result' && scene.pendingInputCommand) {
        scene.setInputAcknowledged(false);
        scene.enqueueProtocolPacket('update_frontend', {
            command: scene.pendingInputCommand,
            input_response: responseData,
            context,
        });
        scene.pendingInputCommand = null;
        scene.drainQueuedNotifyCommands();
        return;
    }

    if (eventType === 'notify') {
        const notifyCommand =
            (typeof responseData.command === 'string' && responseData.command.trim().length > 0 ? responseData.command : null)
            ?? scene.pendingNotifyCommand;

        if (!notifyCommand) {
            return;
        }

        scene.awaitingRemoteNotifyAck = false;
        scene.setInputAcknowledged(false);
        scene.enqueueProtocolPacket('update_frontend', {
            command: notifyCommand,
            notify_response: responseData,
            context,
        });
        scene.pendingNotifyCommand = null;
        scene.drainQueuedNotifyCommands();
        return;
    }

    if (eventType === 'reveal') {
        const revealCommand =
            (typeof responseData.command === 'string' && responseData.command.trim().length > 0 ? responseData.command : null)
            ?? scene.pendingNotifyCommand;

        if (revealCommand) {
            scene.awaitingRemoteNotifyAck = false;
            scene.setInputAcknowledged(false);
            scene.enqueueProtocolPacket('update_frontend', {
                command: revealCommand,
                notify_response: responseData,
                context,
            });
            scene.pendingNotifyCommand = null;
            scene.drainQueuedNotifyCommands();
            return;
        }
    }

    if (isAckEvent) {
        scene.enqueueProtocolPacket('update_frontend', {
            command: responseData.command,
            apply_error: responseData.apply_error ?? null,
            context,
        });
        return;
    }

    if (scene.pendingNotifyCommand) {
        // Hold non-notify frontend events while waiting for notify
        // dismissal ACK to avoid starving notify response delivery.
        return;
    }

    scene.setInputAcknowledged(false);
    scene.enqueueProtocolPacket('frontend_event', {
        event_type: eventType,
        response_data: responseData,
        context,
    });
};