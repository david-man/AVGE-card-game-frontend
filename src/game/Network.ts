const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:5500';
const DEFAULT_ROUTER_BASE_URL = 'http://127.0.0.1:5600';

export const ROOM_BACKEND_BASE_URL_STORAGE_KEY = 'avge_room_backend_base_url';
export const ROUTER_SESSION_ID_STORAGE_KEY = 'avge_router_session_id';
export const ROUTER_USERNAME_STORAGE_KEY = 'avge_router_username';

export type AuthSessionResult = {
    ok: boolean;
    sessionId?: string;
    username?: string;
    currentRoomId?: string | null;
    error?: string;
};

export type RouterAssignedRoom = {
    roomId: string;
    endpointUrl: string;
    status: string;
};

export type RouterBootstrapSessionResult = {
    ok: boolean;
    sessionId?: string;
    username?: string;
    currentRoomId?: string | null;
    error?: string;
};

export type RouterQueueResult = {
    ok: boolean;
    status?: 'assigned' | 'waiting' | 'idle';
    queued?: boolean;
    queuePosition?: number | null;
    room?: RouterAssignedRoom;
    error?: string;
};

export type UserDeck = {
    deckId: string;
    name: string;
    cards: string[];
    updatedAt: number;
};

export type UserDecksResult = {
    ok: boolean;
    decks?: UserDeck[];
    selectedDeckId?: string | null;
    error?: string;
};

export type DeckMutationResult = {
    ok: boolean;
    deck?: UserDeck;
    selectedDeckId?: string | null;
    error?: string;
};

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/$/, '');

const readRoomBackendBaseUrlFromStorage = (): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const persisted = window.sessionStorage.getItem(ROOM_BACKEND_BASE_URL_STORAGE_KEY);
    if (typeof persisted !== 'string' || persisted.trim().length === 0) {
        return null;
    }

    return normalizeBaseUrl(persisted);
};

export const getRouterBaseUrl = (): string => {
    if (typeof window === 'undefined') {
        return DEFAULT_ROUTER_BASE_URL;
    }

    const configuredBaseUrl = (window as Window & { AVGE_ROUTER_BASE_URL?: string }).AVGE_ROUTER_BASE_URL;
    if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim().length > 0) {
        return normalizeBaseUrl(configuredBaseUrl);
    }

    return DEFAULT_ROUTER_BASE_URL;
};

export const checkServiceHealth = async (baseUrl: string): Promise<boolean> => {
    if (typeof fetch !== 'function') {
        return false;
    }

    const normalized = normalizeBaseUrl(baseUrl);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), 1500)
        : null;

    try {
        const response = await fetch(`${normalized}/health`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller?.signal,
        });
        return response.ok;
    }
    catch {
        return false;
    }
    finally {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
    }
};

export const getBackendBaseUrl = (): string => {
    const persistedRoomBaseUrl = readRoomBackendBaseUrlFromStorage();
    if (persistedRoomBaseUrl !== null) {
        return persistedRoomBaseUrl;
    }

    if (typeof window === 'undefined') {
        return DEFAULT_BACKEND_BASE_URL;
    }

    const configuredBaseUrl = (window as Window & { AVGE_BACKEND_BASE_URL?: string }).AVGE_BACKEND_BASE_URL;
    if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim().length > 0) {
        return normalizeBaseUrl(configuredBaseUrl);
    }

    const configuredUrl = (window as Window & { AVGE_BACKEND_PROTOCOL_URL?: string }).AVGE_BACKEND_PROTOCOL_URL;
    if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
        try {
            const parsed = new URL(configuredUrl.trim());
            return parsed.origin;
        }
        catch {
            return DEFAULT_BACKEND_BASE_URL;
        }
    }

    return DEFAULT_BACKEND_BASE_URL;
};

const getBackendProtocolUrl = (): string => {
    return `${getBackendBaseUrl()}/protocol`;
};

const parseAssignedRoom = (value: unknown): RouterAssignedRoom | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    const room = value as {
        room_id?: unknown;
        endpoint_url?: unknown;
        status?: unknown;
    };

    if (typeof room.room_id !== 'string' || room.room_id.trim().length === 0) {
        return undefined;
    }

    if (typeof room.endpoint_url !== 'string' || room.endpoint_url.trim().length === 0) {
        return undefined;
    }

    return {
        roomId: room.room_id.trim(),
        endpointUrl: normalizeBaseUrl(room.endpoint_url),
        status: typeof room.status === 'string' ? room.status : 'running',
    };
};

export const bootstrapRouterSession = async (username: string): Promise<RouterBootstrapSessionResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const normalized = username.trim();
    if (normalized.length === 0) {
        return { ok: false, error: 'Username is required.' };
    }

    const sessionId =
        typeof window !== 'undefined'
            ? window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY)
            : null;

    try {
        const response = await fetch(`${getRouterBaseUrl()}/session/bootstrap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: normalized,
                session_id: typeof sessionId === 'string' && sessionId.trim().length > 0 ? sessionId : undefined,
            }),
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            session_id?: unknown;
            username?: unknown;
            current_room_id?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Session bootstrap failed.',
            };
        }

        const nextSessionId = typeof payload.session_id === 'string' ? payload.session_id.trim() : '';
        const nextUsername = typeof payload.username === 'string' ? payload.username.trim() : normalized;
        if (!nextSessionId) {
            return {
                ok: false,
                error: 'Session bootstrap response missing session_id.',
            };
        }

        return {
            ok: true,
            sessionId: nextSessionId,
            username: nextUsername,
            currentRoomId: typeof payload.current_room_id === 'string' ? payload.current_room_id : null,
        };
    }
    catch (error) {
        console.warn('[Network] Failed to bootstrap router session', error);
        return {
            ok: false,
            error: 'Unable to reach matchmaking router.',
        };
    }
};

export const loginRouterSession = async (username: string): Promise<AuthSessionResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const normalized = username.trim();
    if (normalized.length === 0) {
        return { ok: false, error: 'Username is required.' };
    }

    const existingSessionId =
        typeof window !== 'undefined'
            ? window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY)
            : null;

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: normalized,
                session_id: typeof existingSessionId === 'string' && existingSessionId.trim().length > 0
                    ? existingSessionId.trim()
                    : undefined,
            }),
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            session_id?: unknown;
            username?: unknown;
            current_room_id?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Login failed.',
            };
        }

        const nextSessionId = typeof payload.session_id === 'string' ? payload.session_id.trim() : '';
        const nextUsername = typeof payload.username === 'string' ? payload.username.trim() : normalized;
        if (!nextSessionId) {
            return {
                ok: false,
                error: 'Login response missing session_id.',
            };
        }

        return {
            ok: true,
            sessionId: nextSessionId,
            username: nextUsername,
            currentRoomId: typeof payload.current_room_id === 'string' ? payload.current_room_id : null,
        };
    }
    catch (error) {
        console.warn('[Network] Failed to login router session', error);
        return {
            ok: false,
            error: 'Unable to reach matchmaking router.',
        };
    }
};

export const fetchRouterSession = async (sessionId?: string): Promise<AuthSessionResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const sessionFromStorage =
        typeof window !== 'undefined'
            ? window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY)
            : null;
    const resolvedSessionId = sessionId ?? (typeof sessionFromStorage === 'string' ? sessionFromStorage.trim() : '');
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const url = new URL(`${getRouterBaseUrl()}/api/v1/auth/session`);
        url.searchParams.set('session_id', resolvedSessionId);

        const response = await fetch(url.toString(), {
            method: 'GET',
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            session_id?: unknown;
            username?: unknown;
            current_room_id?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Session lookup failed.',
            };
        }

        const nextSessionId = typeof payload.session_id === 'string' ? payload.session_id.trim() : '';
        const nextUsername = typeof payload.username === 'string' ? payload.username.trim() : '';

        if (!nextSessionId || !nextUsername) {
            return {
                ok: false,
                error: 'Session response missing required fields.',
            };
        }

        return {
            ok: true,
            sessionId: nextSessionId,
            username: nextUsername,
            currentRoomId: typeof payload.current_room_id === 'string' ? payload.current_room_id : null,
        };
    }
    catch (error) {
        console.warn('[Network] Failed to fetch router session', error);
        return {
            ok: false,
            error: 'Unable to reach matchmaking router.',
        };
    }
};

export const logoutRouterSession = async (sessionId?: string): Promise<{ ok: boolean; error?: string }> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const sessionFromStorage =
        typeof window !== 'undefined'
            ? window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY)
            : null;
    const resolvedSessionId = sessionId ?? (typeof sessionFromStorage === 'string' ? sessionFromStorage.trim() : '');
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ session_id: resolvedSessionId }),
        });

        const payload = await response.json() as { ok?: unknown; error?: unknown };
        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Logout failed.',
            };
        }

        return { ok: true };
    }
    catch (error) {
        console.warn('[Network] Failed to logout router session', error);
        return {
            ok: false,
            error: 'Unable to reach matchmaking router.',
        };
    }
};

const parseDeck = (value: unknown): UserDeck | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    const candidate = value as {
        deck_id?: unknown;
        name?: unknown;
        cards?: unknown;
        updated_at?: unknown;
    };

    if (typeof candidate.deck_id !== 'string' || candidate.deck_id.trim().length === 0) {
        return undefined;
    }
    if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
        return undefined;
    }
    if (!Array.isArray(candidate.cards)) {
        return undefined;
    }

    const cards = candidate.cards.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter((item) => item.length > 0);

    return {
        deckId: candidate.deck_id.trim(),
        name: candidate.name.trim(),
        cards,
        updatedAt: typeof candidate.updated_at === 'number' && Number.isFinite(candidate.updated_at) ? candidate.updated_at : 0,
    };
};

const resolveSessionId = (sessionId?: string): string => {
    if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
        return sessionId.trim();
    }

    if (typeof window === 'undefined') {
        return '';
    }

    const fromStorage = window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
    return typeof fromStorage === 'string' ? fromStorage.trim() : '';
};

export const fetchUserDecks = async (sessionId?: string): Promise<UserDecksResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const resolvedSessionId = resolveSessionId(sessionId);
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const url = new URL(`${getRouterBaseUrl()}/api/v1/decks`);
        url.searchParams.set('session_id', resolvedSessionId);
        const response = await fetch(url.toString(), { method: 'GET' });
        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            decks?: unknown;
            selected_deck_id?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to fetch decks.',
            };
        }

        const decks = Array.isArray(payload.decks)
            ? payload.decks.map((item) => parseDeck(item)).filter((item): item is UserDeck => item !== undefined)
            : [];

        const selectedDeckId = typeof payload.selected_deck_id === 'string' ? payload.selected_deck_id : null;
        return { ok: true, decks, selectedDeckId };
    }
    catch (error) {
        console.warn('[Network] Failed to fetch user decks', error);
        return { ok: false, error: 'Unable to reach matchmaking router.' };
    }
};

export const createUserDeck = async (name: string, cards: string[], sessionId?: string): Promise<DeckMutationResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const resolvedSessionId = resolveSessionId(sessionId);
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/decks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: resolvedSessionId,
                name,
                cards,
            }),
        });

        const payload = await response.json() as { ok?: unknown; error?: unknown; deck?: unknown };
        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to create deck.',
            };
        }

        const deck = parseDeck(payload.deck);
        if (!deck) {
            return { ok: false, error: 'Deck response payload invalid.' };
        }

        return { ok: true, deck };
    }
    catch (error) {
        console.warn('[Network] Failed to create user deck', error);
        return { ok: false, error: 'Unable to reach matchmaking router.' };
    }
};

export const updateUserDeck = async (deckId: string, name: string, cards: string[], sessionId?: string): Promise<DeckMutationResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const resolvedSessionId = resolveSessionId(sessionId);
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/decks/${encodeURIComponent(deckId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: resolvedSessionId,
                name,
                cards,
            }),
        });

        const payload = await response.json() as { ok?: unknown; error?: unknown; deck?: unknown };
        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to update deck.',
            };
        }

        const deck = parseDeck(payload.deck);
        if (!deck) {
            return { ok: false, error: 'Deck response payload invalid.' };
        }

        return { ok: true, deck };
    }
    catch (error) {
        console.warn('[Network] Failed to update user deck', error);
        return { ok: false, error: 'Unable to reach matchmaking router.' };
    }
};

export const selectUserDeck = async (deckId: string, sessionId?: string): Promise<DeckMutationResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const resolvedSessionId = resolveSessionId(sessionId);
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/decks/${encodeURIComponent(deckId)}/select`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: resolvedSessionId }),
        });

        const payload = await response.json() as { ok?: unknown; error?: unknown; selected_deck_id?: unknown };
        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to select deck.',
            };
        }

        return {
            ok: true,
            selectedDeckId: typeof payload.selected_deck_id === 'string' ? payload.selected_deck_id : null,
        };
    }
    catch (error) {
        console.warn('[Network] Failed to select user deck', error);
        return { ok: false, error: 'Unable to reach matchmaking router.' };
    }
};

export const enqueueForMatchmaking = async (sessionId: string): Promise<RouterQueueResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/matchmaking/queue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'join',
                session_id: sessionId,
            }),
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            status?: unknown;
            queued?: unknown;
            queue_position?: unknown;
            room?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to join matchmaking queue.',
            };
        }

        return {
            ok: true,
            status: payload.status === 'assigned' || payload.status === 'waiting' || payload.status === 'idle'
                ? payload.status
                : undefined,
            queued: typeof payload.queued === 'boolean' ? payload.queued : undefined,
            queuePosition: typeof payload.queue_position === 'number' ? Math.max(1, Math.floor(payload.queue_position)) : null,
            room: parseAssignedRoom(payload.room),
        };
    }
    catch (error) {
        console.warn('[Network] Failed to enqueue matchmaking request', error);
        return {
            ok: false,
            error: 'Unable to reach matchmaking router.',
        };
    }
};

export const fetchMatchmakingStatus = async (sessionId: string): Promise<RouterQueueResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    try {
        const url = new URL(`${getRouterBaseUrl()}/matchmaking/status`);
        url.searchParams.set('session_id', sessionId);

        const response = await fetch(url.toString(), {
            method: 'GET',
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            status?: unknown;
            queue_position?: unknown;
            room?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to fetch matchmaking status.',
            };
        }

        return {
            ok: true,
            status: payload.status === 'assigned' || payload.status === 'waiting' || payload.status === 'idle'
                ? payload.status
                : undefined,
            queuePosition: typeof payload.queue_position === 'number' ? Math.max(1, Math.floor(payload.queue_position)) : null,
            room: parseAssignedRoom(payload.room),
        };
    }
    catch (error) {
        console.warn('[Network] Failed to fetch matchmaking status', error);
        return {
            ok: false,
            error: 'Unable to reach matchmaking router.',
        };
    }
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
    playerView?: 'admin' | 'p1' | 'p2' | 'spectator';
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
    requestFailed?: boolean;
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
            return { packets: [], requestFailed: true };
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
            waitingForOpponent,
            requestFailed: false,
        };
    }
    catch (error) {
        console.warn('[Network] Failed to send frontend protocol packet', packet, error);
        return { packets: [], requestFailed: true };
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
        payload.playerView === 'admin' || payload.playerView === 'p1' || payload.playerView === 'p2' || payload.playerView === 'spectator'
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
