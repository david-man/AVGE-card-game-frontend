import type { BackendProtocolPacket } from '../Network';

type BackendCommandPacketBody = {
    command: string;
    command_id: number;
    target_slots?: string[];
    response_category: string;
    response_payload?: Record<string, unknown>;
};

export type BackendCommandResponseCategory =
    | 'replay_command'
    | 'query_input'
    | 'query_notify'
    | 'winner'
    | 'lock_state'
    | 'phase_update'
    | 'other';

export type ParsedBackendProtocolPacket =
    | {
        kind: 'environment';
        packet: BackendProtocolPacket;
        body: Record<string, unknown>;
    }
    | {
        kind: 'init_state';
        packet: BackendProtocolPacket;
        body: Record<string, unknown>;
    }
    | {
        kind: 'command';
        packet: BackendProtocolPacket;
        command: string;
        commandId: number;
        targetSlots: string[];
        category: BackendCommandResponseCategory;
        payload: Record<string, unknown> | null;
    };

const isBackendCommandPacketBody = (value: unknown): value is BackendCommandPacketBody => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const body = value as {
        command?: unknown;
        command_id?: unknown;
        target_slots?: unknown;
        response_category?: unknown;
        response_payload?: unknown;
    };

    if (typeof body.command !== 'string' || body.command.trim().length === 0) {
        return false;
    }

    const hasValidCommandId = Number.isInteger(body.command_id);
    const hasValidTargetSlots = body.target_slots === undefined
        || (Array.isArray(body.target_slots) && body.target_slots.every((slot) => typeof slot === 'string'));
    const hasValidCategory = typeof body.response_category === 'string' && body.response_category.trim().length > 0;
    const hasValidPayload = body.response_payload === undefined
        || (typeof body.response_payload === 'object' && body.response_payload !== null);

    return hasValidCommandId && hasValidTargetSlots && hasValidCategory && hasValidPayload;
};

export const isBackendProtocolPacket = (value: unknown): value is BackendProtocolPacket => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const packet = value as Partial<BackendProtocolPacket>;
    const hasPacketEnvelope = Number.isInteger(packet.SEQ)
        && typeof packet.IsResponse === 'boolean'
        && (packet.PacketType === 'environment' || packet.PacketType === 'command' || packet.PacketType === 'init_state')
        && typeof packet.Body === 'object'
        && packet.Body !== null;

    if (!hasPacketEnvelope) {
        return false;
    }

    if (packet.PacketType === 'command') {
        return isBackendCommandPacketBody(packet.Body);
    }

    return true;
};

export const parseBackendProtocolPackets = (value: unknown): BackendProtocolPacket[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((candidate): candidate is BackendProtocolPacket => isBackendProtocolPacket(candidate));
};

const normalizeCommandCategory = (rawCategory: string): BackendCommandResponseCategory => {
    const normalized = rawCategory.trim().toLowerCase();
    if (normalized === 'replay_command') {
        return 'replay_command';
    }
    if (normalized === 'query_input') {
        return 'query_input';
    }
    if (normalized === 'query_notify') {
        return 'query_notify';
    }
    if (normalized === 'winner') {
        return 'winner';
    }
    if (normalized === 'lock_state') {
        return 'lock_state';
    }
    if (normalized === 'phase_update') {
        return 'phase_update';
    }

    return 'other';
};

const parseCommandPacket = (packet: BackendProtocolPacket): ParsedBackendProtocolPacket | null => {
    const body = packet.Body;
    const rawCommand = body.command;
    if (typeof rawCommand !== 'string' || rawCommand.trim().length === 0) {
        return null;
    }

    const rawCategory = body.response_category;
    if (typeof rawCategory !== 'string' || rawCategory.trim().length === 0) {
        return null;
    }

    if (!Number.isInteger(body.command_id)) {
        return null;
    }

    const command = rawCommand.trim();
    const commandId = body.command_id as number;

    const targetSlots = Array.isArray(body.target_slots)
        ? body.target_slots.filter((value): value is string => typeof value === 'string')
        : [];

    const payload = typeof body.response_payload === 'object' && body.response_payload !== null
        ? body.response_payload as Record<string, unknown>
        : null;

    return {
        kind: 'command',
        packet,
        command,
        commandId,
        targetSlots,
        category: normalizeCommandCategory(rawCategory),
        payload,
    };
};

export const parseBackendProtocolPacket = (packet: BackendProtocolPacket): ParsedBackendProtocolPacket | null => {
    if (packet.PacketType === 'environment') {
        return {
            kind: 'environment',
            packet,
            body: packet.Body,
        };
    }

    if (packet.PacketType === 'init_state') {
        return {
            kind: 'init_state',
            packet,
            body: packet.Body,
        };
    }

    return parseCommandPacket(packet);
};

// Representative packet fixtures captured from the locked backend contract.
export const BACKEND_PROTOCOL_PACKET_FIXTURES: ReadonlyArray<BackendProtocolPacket> = [
    {
        SEQ: 10,
        IsResponse: true,
        PacketType: 'environment',
        Body: {
            roundNumber: 0,
            gamePhase: 'phase2',
            playerTurn: 'p1',
            playerView: 'p1',
            players: {
                p1: { username: 'PLAYER 1', attributes: {} },
                p2: { username: 'PLAYER 2', attributes: {} },
            },
            cards: [],
            energyTokens: [
                {
                    id: 'energy_1',
                    ownerId: 'shared',
                    holderId: 'shared-energy',
                    attachedToCardId: null,
                },
            ],
        },
    },
    {
        SEQ: 11,
        IsResponse: true,
        PacketType: 'init_state',
        Body: {
            stage: 'init',
            both_players_connected: true,
            self_ready: false,
            opponent_ready: false,
            ready_slots: [],
        },
    },
    {
        SEQ: 12,
        IsResponse: true,
        PacketType: 'command',
        Body: {
            response_category: 'replay_command',
            command: 'mv C123 p1-bench',
            command_id: 101,
            target_slots: ['p1', 'p2'],
        },
    },
    {
        SEQ: 13,
        IsResponse: true,
        PacketType: 'command',
        Body: {
            response_category: 'query_input',
            command: 'input selection player-1 Pick_a_card [C1,C2], [C1,C2], 1 false false',
            command_id: 102,
            target_slots: ['p1'],
        },
    },
    {
        SEQ: 14,
        IsResponse: true,
        PacketType: 'command',
        Body: {
            response_category: 'query_notify',
            command: 'notify both Phase2_attack_request_received. -1',
            command_id: 103,
            target_slots: ['p1', 'p2'],
        },
    },
];