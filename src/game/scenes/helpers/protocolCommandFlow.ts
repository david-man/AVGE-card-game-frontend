import {
    BackendProtocolPacket,
    FrontendProtocolPacket,
    parseBackendEntitiesSetup,
    sendFrontendProtocolPacket,
} from '../../Network';
import { ParsedBackendProtocolPacket, parseBackendProtocolPacket } from '../../protocol/backendResponseAdapter';
import {
    applyBackendEntitySetup,
    applyInitStatePacket,
} from './protocolEnvironmentState';

type ProtocolFlowScene = any;

export const setInputAcknowledged = (scene: ProtocolFlowScene, acknowledged: boolean): void => {
    const allowInitInteractionWhileDisconnected = scene.canInteractDuringInitOpponentDisconnect();
    if (acknowledged && (
        scene.awaitingRemoteNotifyAck
        || scene.pendingNotifyCommand !== null
        || scene.pendingNotifyCommandQueue.length > 0
        || scene.remoteInputLockActive
        || (scene.opponentDisconnected && !allowInitInteractionWhileDisconnected)
    )) {
        acknowledged = false;
    }

    scene.inputAcknowledged = acknowledged;
    if (!acknowledged) {
        const shouldShowLockOverlay =
            scene.awaitingRemoteNotifyAck
            || scene.pendingNotifyCommand !== null
            || scene.inputOverlayController?.hasActiveOverlay() === true;
        scene.setBoardInputEnabled(false, shouldShowLockOverlay);
        return;
    }

    if (!scene.inputOverlayController.hasActiveOverlay()) {
        scene.setBoardInputEnabled(true);
    }
};

export const enqueueProtocolPacket = (
    scene: ProtocolFlowScene,
    packetType: FrontendProtocolPacket['PacketType'],
    body: Record<string, unknown>
): void => {
    if (scene.protocolSocket !== null && scene.protocolSocket.connected) {
        if (packetType === 'register_client') {
            scene.protocolSocket.emit('register_client_or_play', {
                slot: scene.protocolClientSlot,
                reconnect_token: scene.protocolReconnectToken,
                session_id: scene.routerSessionId,
            });
            return;
        }

        const payload = {
            ACK: scene.protocolAck,
            Body: body,
        };

        scene.protocolSocket.emit(packetType, payload);
        return;
    }

    scene.protocolSendChain = scene.protocolSendChain
        .then(async () => {
            const response = await sendFrontendProtocolPacket({
                ACK: scene.protocolAck,
                PacketType: packetType,
                Body: body,
                client_id: scene.protocolClientId,
                client_slot: scene.protocolClientSlot ?? undefined,
                reconnect_token: scene.protocolReconnectToken ?? undefined,
            });

            if (response.requestFailed) {
                scene.redirectToMainMenuAfterServiceFailure('room_unreachable', 'Game server unavailable. Returning to main menu.');
                return;
            }

            if (response.clientSlot) {
                scene.protocolClientSlot = response.clientSlot;
            }
            if (response.reconnectToken) {
                scene.protocolReconnectToken = response.reconnectToken;
            }
            scene.persistProtocolClientSession();

            if (packetType === 'register_client') {
                const wasWaiting = scene.waitingForOpponent;
                scene.waitingForOpponent = Boolean(response.waitingForOpponent);
                if (response.waitingForInit === true) {
                    scene.pregameInitStage = 'init';
                }
                if (scene.waitingForOpponent && !wasWaiting) {
                    scene.appendTerminalLine('Waiting for opponent to connect...');
                }
            }

            processBackendProtocolPackets(scene, response.packets);

            if (response.blockedPendingPeerAck) {
                setInputAcknowledged(scene, false);
            }
            else if (response.packets.length === 0) {
                setInputAcknowledged(scene, true);
            }
        })
        .catch((error: unknown) => {
            console.warn('[Protocol] Failed to send packet', { packetType, body, error });
        });
};

export const processBackendProtocolPackets = (scene: ProtocolFlowScene, packets: BackendProtocolPacket[]): void => {
    for (const packet of packets) {
        if (packet.PacketType !== 'environment' && packet.SEQ !== scene.protocolAck) {
            handleProtocolMismatch(scene, packet);
            return;
        }

        scene.protocolAck = packet.SEQ + 1;

        const parsedPacket = parseBackendProtocolPacket(packet);
        if (!parsedPacket) {
            handleProtocolMismatch(scene, packet);
            return;
        }

        if (parsedPacket.kind === 'environment') {
            scene.waitingForOpponent = false;
            scene.setOpponentDisconnectedState(false);
            const setup = parseBackendEntitiesSetup(parsedPacket.body);
            if (!setup) {
                handleProtocolMismatch(scene, packet);
                return;
            }

            if (scene.cards.length > 0 || scene.energyTokens.length > 0) {
                resetBoardEntitiesForAuthoritativeEnvironment(scene);
            }
            scene.playRevealSound(320);
            applyBackendEntitySetup(scene, setup);
            if (scene.pendingNotifyCommand || scene.pendingInputCommand || scene.pendingNotifyCommandQueue.length > 0) {
                setInputAcknowledged(scene, false);
            }
            else {
                setInputAcknowledged(scene, true);
            }
            enqueueProtocolPacket(scene, 'ready', {});
            continue;
        }

        if (parsedPacket.kind === 'init_state') {
            applyInitStatePacket(scene, parsedPacket.body);
            continue;
        }

        applyBackendCommandPacket(scene, parsedPacket);
    }
};

export const executeBackendReplayCommand = (scene: ProtocolFlowScene, command: string): string | null => {
    let replayError: string | null = null;
    scene.scannerCommandInProgress = true;
    setInputAcknowledged(scene, false);
    try {
        scene.commandProcessor.execute(command);
    }
    catch (error) {
        replayError = error instanceof Error ? (error.stack ?? error.message) : String(error);
        console.error('[Protocol] command execution failed', {
            command,
            error: replayError,
        });
    }
    finally {
        scene.scannerCommandInProgress = false;
    }

    return replayError;
};

export const drainQueuedNotifyCommands = (scene: ProtocolFlowScene): void => {
    while (
        scene.pendingNotifyCommandQueue.length > 0
        && scene.pendingNotifyCommand === null
        && !scene.awaitingRemoteNotifyAck
        && !scene.inputOverlayController.hasActiveOverlay()
    ) {
        const nextEntry = scene.pendingNotifyCommandQueue.shift();
        if (!nextEntry) {
            continue;
        }

        const nextCommand = nextEntry.command;

        const replayError = executeBackendReplayCommand(scene, nextCommand);
        scene.executeBackendAnimationPayload(nextCommand, nextEntry.payload);
        scene.awaitingRemoteNotifyAck = true;

        if (scene.inputOverlayController.hasActiveOverlay()) {
            scene.pendingNotifyCommand = nextCommand;
            setInputAcknowledged(scene, false);
            return;
        }

        scene.awaitingRemoteNotifyAck = false;
        setInputAcknowledged(scene, false);
        scene.emitBackendEvent('terminal_log', {
            line: 'ACK backend_update_processed',
            command: nextCommand,
            apply_error: replayError,
        });
    }
};

export const applyBackendCommandPacket = (
    scene: ProtocolFlowScene,
    packet: Extract<ParsedBackendProtocolPacket, { kind: 'command' }>
): void => {
    const command = packet.command;
    if (packet.category === 'query_notify') {
        scene.pendingNotifyCommandQueue.push({ command, payload: packet.payload });
        setInputAcknowledged(scene, false);
        drainQueuedNotifyCommands(scene);
        return;
    }

    const replayError = executeBackendReplayCommand(scene, command);
    scene.executeBackendAnimationPayload(command, packet.payload);

    if (packet.category === 'query_input') {
        scene.pendingInputCommand = command;
        setInputAcknowledged(scene, true);
        return;
    }

    const action = command.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
    const isUnlockInput = action === 'unlock-input' || action === 'unlock_input';
    if (packet.category === 'lock_state' && isUnlockInput) {
        scene.awaitingRemoteNotifyAck = false;
        setInputAcknowledged(scene, true);
        scene.emitBackendEvent('terminal_log', {
            line: 'ACK backend_update_processed',
            command,
            apply_error: replayError,
        });
        return;
    }

    if (packet.category === 'other') {
        console.warn('[Protocol] Unknown backend command response category.', {
            category: packet.category,
            command,
            commandId: packet.commandId,
        });
    }

    scene.emitBackendEvent('terminal_log', {
        line: 'ACK backend_update_processed',
        command,
        apply_error: replayError,
    });
};

export const handleProtocolMismatch = (scene: ProtocolFlowScene, packet: BackendProtocolPacket): void => {
    if (scene.protocolRecoveryInProgress) {
        return;
    }

    scene.protocolRecoveryInProgress = true;
    setInputAcknowledged(scene, false);
    console.warn('[Protocol] mismatch detected, restarting scene for resync', {
        expectedAck: scene.protocolAck,
        packetSeq: packet.SEQ,
        packetType: packet.PacketType,
    });
    scene.scene.restart();
};

export const resetBoardEntitiesForAuthoritativeEnvironment = (scene: ProtocolFlowScene): void => {
    scene.clearCardSelection();
    scene.clearAllCardHpPulseAnimations();
    if (scene.pendingNotifyCommand === null && scene.inputOverlayController.hasActiveOverlay()) {
        scene.inputOverlayController.stopActiveOverlay();
    }

    for (const card of scene.cards) {
        card.destroy();
    }
    for (const token of scene.energyTokens) {
        token.destroy();
    }

    scene.cards = [];
    scene.cardById = {};
    scene.cardByBody = new Map();
    scene.energyTokens = [];
    scene.energyTokenById = {};
    scene.energyTokenByBody = new Map();

    for (const holder of scene.cardHolders) {
        holder.cards.length = 0;
    }

    for (const holder of scene.energyHolders) {
        holder.tokens.length = 0;
        holder.hidePileCountDisplays();
    }

    scene.activelyDraggedCardIds.clear();
    scene.dragOriginZoneByCardId.clear();
    scene.dragStartPositionByCardId.clear();
    scene.dragDistanceByCardId.clear();
    scene.activelyDraggedEnergyTokenIds.clear();
    scene.energyDragStartPositionById.clear();
    scene.energyDragDistanceById.clear();
    scene.pendingInputCommand = null;
    scene.protocolRecoveryInProgress = false;
};
