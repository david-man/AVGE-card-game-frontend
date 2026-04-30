import { io } from 'socket.io-client';

import { BackendProtocolPacket } from '../../Network';
import { PlayerId } from '../../entities';

type ProtocolSessionScene = any;

export const initializeProtocolSocket = (
    scene: ProtocolSessionScene,
    socketUrl: string,
    onConnectErrorFallback: () => void
): boolean => {
    if (scene.protocolSocketFallbackToHttp) {
        return false;
    }

    if (scene.protocolSocket !== null) {
        return true;
    }

    const socket = io(socketUrl, {
        // Polling is more stable with the local Flask/Werkzeug room server.
        transports: ['polling'],
        upgrade: false,
        reconnection: false,
    });

    scene.protocolSocket = socket;

    socket.on('connect', () => {
        scene.clientUnloadSignalSent = false;
        scene.enqueueProtocolPacket('register_client', {
            requested_slot: scene.protocolClientSlot,
            reconnect_token: scene.protocolReconnectToken,
            session_id: scene.routerSessionId,
        });
    });

    socket.on('connect_error', (error: unknown) => {
        console.warn('[Protocol] socket connect failed, falling back to HTTP /protocol', error);
        onConnectErrorFallback();
    });

    socket.on('registration_ok', (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null
            ? payload as {
                slot?: unknown;
                reconnect_token?: unknown;
                both_players_connected?: unknown;
                waiting_for_init?: unknown;
            }
            : {};

        if (data.slot === 'p1' || data.slot === 'p2') {
            scene.protocolClientSlot = data.slot;
        }

        if (typeof data.reconnect_token === 'string' && data.reconnect_token.trim().length > 0) {
            scene.protocolReconnectToken = data.reconnect_token.trim();
        }

        scene.waitingForOpponent = data.both_players_connected !== true;
        if (data.waiting_for_init === true) {
            scene.pregameInitStage = 'init';
        }
        if (scene.waitingForOpponent) {
            scene.appendTerminalLine('Waiting for opponent to connect...');
            scene.setOpponentDisconnectedState(true, 'Opponent is connecting...');
        }
        else {
            scene.setOpponentDisconnectedState(false);
        }

        persistProtocolClientSession(scene);

        // Always request a fresh environment snapshot after registration.
        // This prevents reconnect limbo where holder zones render but
        // entities were not replayed for the new socket session.
        scene.enqueueProtocolPacket('request_environment', {});
    });

    socket.on('registration_error', (payload: unknown) => {
        console.warn('[Protocol] registration_error', payload);
        scene.setInputAcknowledged(true);
    });

    socket.on('protocol_packets', (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null
            ? payload as {
                packets?: unknown;
                blocked_pending_peer_ack?: unknown;
            }
            : {};

        const packets = Array.isArray(data.packets)
            ? data.packets as BackendProtocolPacket[]
            : [];

        const blockedPendingPeerAck = data.blocked_pending_peer_ack === true;

        scene.processBackendProtocolPackets(packets);

        if (blockedPendingPeerAck) {
            scene.setInputAcknowledged(false);
        }
        else if (packets.length === 0) {
            scene.setInputAcknowledged(true);
        }
    });

    socket.on('protocol_error', (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null
            ? payload as {
                error?: unknown;
                packet_type?: unknown;
                status?: unknown;
            }
            : {};

        const errorMessage = typeof data.error === 'string' && data.error.trim().length > 0
            ? data.error.trim()
            : 'Protocol request failed.';
        const packetType = typeof data.packet_type === 'string' ? data.packet_type.trim() : '';
        const statusCode = typeof data.status === 'number' && Number.isFinite(data.status)
            ? Math.trunc(data.status)
            : null;

        console.warn('[Protocol] protocol_error', payload);

        const packetLabel = packetType.length > 0 ? packetType : 'request';
        const statusSuffix = statusCode !== null ? ` (${statusCode})` : '';
        scene.appendTerminalLine(`Server rejected ${packetLabel}${statusSuffix}: ${errorMessage}`);

        scene.setInputAcknowledged(true);

        if (packetType === 'init_setup_done') {
            scene.appendTerminalLine('Refreshing init state from server...');
            scene.enqueueProtocolPacket('request_environment', {});
            scene.enqueueProtocolPacket('ready', {});
        }
    });

    socket.on('opponent_disconnected', (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null
            ? payload as { grace_seconds?: unknown }
            : {};
        const graceSeconds = typeof data.grace_seconds === 'number' && Number.isFinite(data.grace_seconds)
            ? Math.max(0, Math.round(data.grace_seconds))
            : 0;
        scene.waitingForOpponent = true;
        scene.setOpponentDisconnectedState(true, 'Other player disconnected. Waiting for reconnection...', graceSeconds);
    });

    socket.on('opponent_reconnected', (_payload: unknown) => {
        scene.waitingForOpponent = false;
        scene.setOpponentDisconnectedState(false);
    });

    socket.on('disconnect', () => {
        if (scene.matchEndedAwaitingExit) {
            scene.appendTerminalLine('Match ended. Waiting for Main Menu confirmation...');
            return;
        }
        scene.redirectToMainMenuAfterServiceFailure('room_disconnected', 'Game server disconnected. Returning to main menu.');
    });

    return true;
};

export const activateHttpProtocolFallback = (scene: ProtocolSessionScene): void => {
    if (scene.matchEndedAwaitingExit) {
        return;
    }

    if (scene.protocolSocketFallbackToHttp) {
        return;
    }

    scene.protocolSocketFallbackToHttp = true;
    if (scene.protocolSocket !== null) {
        scene.protocolSocket.removeAllListeners();
        scene.protocolSocket.disconnect();
        scene.protocolSocket = null;
    }

    scene.enqueueProtocolPacket('register_client', {
        requested_slot: scene.protocolClientSlot,
        reconnect_token: scene.protocolReconnectToken,
        session_id: scene.routerSessionId,
    });
};

export const loadOrCreateProtocolClientId = (): string => {
    const fallback = `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (typeof window === 'undefined') {
        return fallback;
    }

    const key = 'avge_protocol_client_id';
    const existing = window.sessionStorage.getItem(key);
    if (typeof existing === 'string' && existing.trim().length > 0) {
        return existing.trim();
    }

    const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : fallback;
    window.sessionStorage.setItem(key, generated);
    return generated;
};

export const loadProtocolClientSlot = (): PlayerId | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    const raw = window.sessionStorage.getItem('avge_protocol_client_slot');
    return raw === 'p1' || raw === 'p2' ? raw : null;
};

export const loadProtocolReconnectToken = (): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    const raw = window.sessionStorage.getItem('avge_protocol_reconnect_token');
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
};

export const loadRouterSessionId = (storageKey: string): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const raw = window.sessionStorage.getItem(storageKey);
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
};

export const persistProtocolClientSession = (scene: ProtocolSessionScene): void => {
    if (typeof window === 'undefined') {
        return;
    }

    if (scene.protocolClientSlot) {
        window.sessionStorage.setItem('avge_protocol_client_slot', scene.protocolClientSlot);
    }
    else {
        window.sessionStorage.removeItem('avge_protocol_client_slot');
    }

    if (scene.protocolReconnectToken) {
        window.sessionStorage.setItem('avge_protocol_reconnect_token', scene.protocolReconnectToken);
    }
    else {
        window.sessionStorage.removeItem('avge_protocol_reconnect_token');
    }
};
