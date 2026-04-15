const DEFAULT_BACKEND_PROTOCOL_URL = 'http://127.0.0.1:5500/protocol';

const getBackendProtocolUrl = (): string => {
    if (typeof window === 'undefined') {
        return DEFAULT_BACKEND_PROTOCOL_URL;
    }

    const configuredUrl = (window as Window & { AVGE_BACKEND_PROTOCOL_URL?: string }).AVGE_BACKEND_PROTOCOL_URL;
    if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
        return configuredUrl.trim();
    }

    const configuredBaseUrl = (window as Window & { AVGE_BACKEND_BASE_URL?: string }).AVGE_BACKEND_BASE_URL;
    if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim().length > 0) {
        const base = configuredBaseUrl.trim().replace(/\/$/, '');
        return `${base}/protocol`;
    }

    return DEFAULT_BACKEND_PROTOCOL_URL;
};

export type BackendCardSetup = {
    id: string;
    ownerId: 'p1' | 'p2';
    cardType: 'character' | 'tool' | 'item' | 'stadium' | 'supporter';
    holderId: string;
    AVGECardType: 'NONE' | 'WW' | 'PERC' | 'PIANO' | 'STRING' | 'GUITAR' | 'CHOIR' | 'BRASS';
    AVGECardClass: string;
    hasAtk1: boolean;
    hasActive: boolean;
    hasAtk2: boolean;
    hp: number;
    maxHp: number;
    attachedToCardId: string | null;
    statusEffect: Record<string, number>;
};

export type BackendEnergySetup = {
    id: string;
    ownerId: 'p1' | 'p2';
    holderId: string;
    attachedToCardId: string | null;
};

export type BackendPlayerTurnAttributesSetup = Partial<{
    ENERGY_ADD_REMAINING_IN_TURN: number;
    KO_COUNT: number;
    SUPPORTER_USES_REMAINING_IN_TURN: number;
    SWAP_REMAINING_IN_TURN: number;
    ATTACKS_LEFT: number;
}>;

export type BackendPlayerSetup = {
    username?: string;
    attributes?: BackendPlayerTurnAttributesSetup;
};

export type BackendEntitiesSetup = {
    cards: BackendCardSetup[];
    energyTokens: BackendEnergySetup[];
    roundNumber: number;
    gamePhase?: 'no-input' | 'phase2' | 'atk';
    playerTurn?: 'p1' | 'p2';
    playerView?: 'admin' | 'p1' | 'p2';
    players?: Partial<Record<'p1' | 'p2', BackendPlayerSetup>>;
};

const ALLOWED_AVGE_CARD_TYPES = new Set(['NONE', 'WW', 'PERC', 'PIANO', 'STRING', 'GUITAR', 'CHOIR', 'BRASS']);
const ALLOWED_CARD_HOLDER_IDS = new Set([
    'p1-hand',
    'p1-bench',
    'p1-active',
    'p1-discard',
    'p1-deck',
    'p2-hand',
    'p2-bench',
    'p2-active',
    'p2-discard',
    'p2-deck',
    'stadium'
]);

const isBackendCardSetup = (value: unknown): value is BackendCardSetup => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const card = value as Partial<BackendCardSetup>;
    const hasValidStatusEffect = typeof card.statusEffect === 'object' && card.statusEffect !== null &&
        Object.values(card.statusEffect as Record<string, unknown>).every((count) => Number.isInteger(count) && (count as number) >= 0);

    return typeof card.id === 'string' &&
        (card.ownerId === 'p1' || card.ownerId === 'p2') &&
        (card.cardType === 'character' || card.cardType === 'tool' || card.cardType === 'item' || card.cardType === 'stadium' || card.cardType === 'supporter') &&
        typeof card.holderId === 'string' &&
        ALLOWED_CARD_HOLDER_IDS.has(card.holderId) &&
        typeof card.AVGECardType === 'string' &&
        ALLOWED_AVGE_CARD_TYPES.has(card.AVGECardType) &&
        typeof card.AVGECardClass === 'string' &&
        typeof card.hasAtk1 === 'boolean' &&
        typeof card.hasActive === 'boolean' &&
        typeof card.hasAtk2 === 'boolean' &&
        typeof card.hp === 'number' &&
        typeof card.maxHp === 'number' &&
        (typeof card.attachedToCardId === 'string' || card.attachedToCardId === null) &&
        hasValidStatusEffect;
};

const isBackendEnergySetup = (value: unknown): value is BackendEnergySetup => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const token = value as Partial<BackendEnergySetup>;
    return typeof token.id === 'string' &&
        (token.ownerId === 'p1' || token.ownerId === 'p2') &&
        typeof token.holderId === 'string' &&
        (typeof token.attachedToCardId === 'string' || token.attachedToCardId === null);
};

export type FrontendProtocolPacket = {
    ACK: number;
    PacketType: 'ready' | 'register_client' | 'update_frontend' | 'frontend_event';
    Body: Record<string, unknown>;
    client_id?: string;
    client_slot?: 'p1' | 'p2';
    reconnect_token?: string;
};

export type BackendProtocolPacket = {
    SEQ: number;
    IsResponse: boolean;
    PacketType: 'environment' | 'command';
    Body: Record<string, unknown>;
};

export type BackendProtocolResponse = {
    packets: BackendProtocolPacket[];
    clientSlot?: 'p1' | 'p2';
    reconnectToken?: string;
    bothPlayersConnected?: boolean;
    waitingForOpponent?: boolean;
};

const isBackendProtocolPacket = (value: unknown): value is BackendProtocolPacket => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const packet = value as Partial<BackendProtocolPacket>;
    return Number.isInteger(packet.SEQ) &&
        typeof packet.IsResponse === 'boolean' &&
        (packet.PacketType === 'environment' || packet.PacketType === 'command') &&
        typeof packet.Body === 'object' &&
        packet.Body !== null;
};

export const sendFrontendProtocolPacket = async (
    packet: FrontendProtocolPacket
): Promise<BackendProtocolResponse> => {
    if (typeof fetch !== 'function') {
        return { packets: [] };
    }

    try {
        const response = await fetch(getBackendProtocolUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(packet),
            keepalive: true
        });

        if (!response.ok) {
            return { packets: [] };
        }

        const payload = (await response.json()) as {
            packets?: unknown;
            client_slot?: unknown;
            reconnect_token?: unknown;
            both_players_connected?: unknown;
            waiting_for_opponent?: unknown;
        };

        const packets = Array.isArray(payload.packets)
            ? payload.packets.filter((candidate) => isBackendProtocolPacket(candidate))
            : [];

        const clientSlot = payload.client_slot === 'p1' || payload.client_slot === 'p2'
            ? payload.client_slot
            : undefined;

        const reconnectToken = typeof payload.reconnect_token === 'string' && payload.reconnect_token.trim().length > 0
            ? payload.reconnect_token.trim()
            : undefined;

        const bothPlayersConnected = typeof payload.both_players_connected === 'boolean'
            ? payload.both_players_connected
            : undefined;

        const waitingForOpponent = typeof payload.waiting_for_opponent === 'boolean'
            ? payload.waiting_for_opponent
            : undefined;

        return {
            packets,
            clientSlot,
            reconnectToken,
            bothPlayersConnected,
            waitingForOpponent
        };
    }
    catch (error) {
        console.warn('[Network] Failed to send frontend protocol packet', packet, error);
        return { packets: [] };
    }
};

export const parseBackendEntitiesSetup = (value: unknown): BackendEntitiesSetup | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const payload = value as {
        cards?: unknown;
        energyTokens?: unknown;
        roundNumber?: unknown;
        gamePhase?: unknown;
        playerTurn?: unknown;
        playerView?: unknown;
        players?: unknown;
    };

    if (!Array.isArray(payload.cards) || !Array.isArray(payload.energyTokens)) {
        return null;
    }

    if (!payload.cards.every((card) => isBackendCardSetup(card))) {
        console.warn('[Network] environment payload has invalid card entries.');
        return null;
    }

    if (!payload.energyTokens.every((token) => isBackendEnergySetup(token))) {
        console.warn('[Network] environment payload has invalid energy token entries.');
        return null;
    }

    if (!Number.isInteger(payload.roundNumber) || (payload.roundNumber as number) < 0) {
        console.warn('[Network] environment payload is missing a valid integer roundNumber.');
        return null;
    }

    const players = typeof payload.players === 'object' && payload.players !== null
        ? payload.players as Partial<Record<'p1' | 'p2', BackendPlayerSetup>>
        : undefined;

    const gamePhase =
        payload.gamePhase === 'no-input' || payload.gamePhase === 'phase2' || payload.gamePhase === 'atk'
            ? payload.gamePhase
            : undefined;

    const playerTurn = payload.playerTurn === 'p1' || payload.playerTurn === 'p2'
        ? payload.playerTurn
        : undefined;

    const playerView =
        payload.playerView === 'admin' || payload.playerView === 'p1' || payload.playerView === 'p2'
            ? payload.playerView
            : undefined;

    return {
        cards: payload.cards as BackendCardSetup[],
        energyTokens: payload.energyTokens as BackendEnergySetup[],
        roundNumber: payload.roundNumber as number,
        gamePhase,
        playerTurn,
        playerView,
        players
    };
};
