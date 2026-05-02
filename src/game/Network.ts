import { io, Socket } from 'socket.io-client';
import cardPreviewDescriptionsJson from './data/cardPreviewDescriptions.json';

const DEFAULT_ROUTER_BASE_URL = 'http://127.0.0.1:5600';

export const ROUTER_SESSION_ID_STORAGE_KEY = 'avge_router_session_id';
export const ROUTER_USERNAME_STORAGE_KEY = 'avge_router_username';

export type NetworkErrorCode = 'session_superseded' | 'unknown_session' | 'session_id_required' | string;

export type AuthSessionResult = {
    ok: boolean;
    sessionId?: string;
    username?: string;
    currentRoomId?: string | null;
    error?: string;
    errorCode?: NetworkErrorCode;
};

export type RouterAssignedRoom = {
    roomId: string;
    status: string;
    playerSessionIds?: [string, string];
};

export type RouterBootstrapSessionResult = {
    ok: boolean;
    sessionId?: string;
    username?: string;
    currentRoomId?: string | null;
    error?: string;
    errorCode?: NetworkErrorCode;
};

const normalizeErrorCode = (value: unknown): NetworkErrorCode | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

export const isSessionSupersededError = (result: { errorCode?: string; error?: string } | null | undefined): boolean => {
    if (!result) {
        return false;
    }

    if (result.errorCode === 'session_superseded') {
        return true;
    }

    const message = typeof result.error === 'string' ? result.error.toLowerCase() : '';
    return message.includes('superseded');
};

export const clearClientSessionState = (): void => {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
    window.localStorage.removeItem(ROUTER_SESSION_ID_STORAGE_KEY);
    window.localStorage.removeItem(ROUTER_USERNAME_STORAGE_KEY);
    window.sessionStorage.removeItem('avge_protocol_client_slot');
    window.sessionStorage.removeItem('avge_protocol_reconnect_token');
};

export type RouterQueueResult = {
    ok: boolean;
    status?: 'assigned' | 'waiting' | 'idle';
    queued?: boolean;
    queuePosition?: number | null;
    room?: RouterAssignedRoom;
    error?: string;
    errorCode?: NetworkErrorCode;
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
    errorCode?: NetworkErrorCode;
};

export type DeckMutationResult = {
    ok: boolean;
    deck?: UserDeck;
    selectedDeckId?: string | null;
    error?: string;
    errorCode?: NetworkErrorCode;
};

export type RouterForceLogoutPayload = {
    reason: string;
    message?: string;
    sessionId?: string;
};

export const subscribeToRouterSessionEvents = (
    sessionId: string,
    onForceLogout: (payload: RouterForceLogoutPayload) => void
): (() => void) => {
    const normalizedSessionId = sessionId.trim();
    if (normalizedSessionId.length === 0) {
        return () => {
            // no-op
        };
    }

    const socket: Socket = io(getRouterBaseUrl(), {
        transports: ['polling'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
    });

    const register = (): void => {
        socket.emit('auth_register_session', {
            session_id: normalizedSessionId,
        });
    };

    socket.on('connect', register);

    socket.on('auth_registration_error', (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null
            ? payload as { error_code?: unknown; error?: unknown }
            : {};

        if (typeof data.error_code === 'string' && data.error_code === 'session_superseded') {
            onForceLogout({
                reason: 'session_superseded',
                message: typeof data.error === 'string' ? data.error : 'Signed out: account opened on another client.',
            });
        }
    });

    socket.on('force_logout', (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null
            ? payload as { reason?: unknown; message?: unknown; session_id?: unknown }
            : {};

        const reason = typeof data.reason === 'string' && data.reason.trim().length > 0
            ? data.reason.trim()
            : 'session_superseded';
        const message = typeof data.message === 'string' && data.message.trim().length > 0
            ? data.message.trim()
            : 'Signed out: account opened on another client.';
        const sessionIdFromPayload = typeof data.session_id === 'string' ? data.session_id.trim() : undefined;

        onForceLogout({
            reason,
            message,
            sessionId: sessionIdFromPayload,
        });
    });

    register();

    return () => {
        socket.removeAllListeners();
        socket.disconnect();
    };
};

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/$/, '');

const readRouterSessionIdFromStorage = (): string => {
    if (typeof window === 'undefined') {
        return '';
    }

    const fromSession = window.sessionStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
    if (typeof fromSession === 'string' && fromSession.trim().length > 0) {
        return fromSession.trim();
    }

    const fromLocal = window.localStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
    return typeof fromLocal === 'string' ? fromLocal.trim() : '';
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
    return getRouterBaseUrl();
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
        status?: unknown;
        player_session_ids?: unknown;
    };

    if (typeof room.room_id !== 'string' || room.room_id.trim().length === 0) {
        return undefined;
    }

    let playerSessionIds: [string, string] | undefined;
    if (Array.isArray(room.player_session_ids) && room.player_session_ids.length >= 2) {
        const first = room.player_session_ids[0];
        const second = room.player_session_ids[1];
        if (typeof first === 'string' && first.trim().length > 0 && typeof second === 'string' && second.trim().length > 0) {
            playerSessionIds = [first.trim(), second.trim()];
        }
    }

    return {
        roomId: room.room_id.trim(),
        status: typeof room.status === 'string' ? room.status : 'running',
        playerSessionIds,
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
            ? readRouterSessionIdFromStorage()
            : null;

    try {
        const response = await fetch(`${getRouterBaseUrl()}/session/bootstrap`, {
            method: 'POST',
            credentials: 'include',
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
            error_code?: unknown;
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
            error: 'Failed to connect to server.',
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
            ? readRouterSessionIdFromStorage()
            : null;

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/auth/login`, {
            method: 'POST',
            credentials: 'include',
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
            error_code?: unknown;
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
            error: 'Failed to connect to server.',
        };
    }
};

export const fetchRouterSession = async (sessionId?: string): Promise<AuthSessionResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const sessionFromStorage =
        typeof window !== 'undefined'
            ? readRouterSessionIdFromStorage()
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
            credentials: 'include',
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            error_code?: unknown;
            session_id?: unknown;
            username?: unknown;
            current_room_id?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Session lookup failed.',
                errorCode: normalizeErrorCode(payload.error_code),
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
            error: 'Failed to connect to server.',
        };
    }
};

export const fetchRouterSessionFromCookie = async (): Promise<AuthSessionResult> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/auth/session`, {
            method: 'GET',
            credentials: 'include',
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            error_code?: unknown;
            session_id?: unknown;
            username?: unknown;
            current_room_id?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Session lookup failed.',
                errorCode: normalizeErrorCode(payload.error_code),
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
        console.warn('[Network] Failed to fetch router session from cookie', error);
        return {
            ok: false,
            error: 'Failed to connect to server.',
        };
    }
};

export const logoutRouterSession = async (sessionId?: string): Promise<{ ok: boolean; error?: string }> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const sessionFromStorage =
        typeof window !== 'undefined'
            ? readRouterSessionIdFromStorage()
            : null;
    const resolvedSessionId = sessionId ?? (typeof sessionFromStorage === 'string' ? sessionFromStorage.trim() : '');
    if (!resolvedSessionId) {
        return { ok: false, error: 'session_id is required.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/api/v1/auth/logout`, {
            method: 'POST',
            credentials: 'include',
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
            error: 'Failed to connect to server.',
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
    if (typeof fromStorage === 'string' && fromStorage.trim().length > 0) {
        return fromStorage.trim();
    }

    const fromLocalStorage = window.localStorage.getItem(ROUTER_SESSION_ID_STORAGE_KEY);
    return typeof fromLocalStorage === 'string' ? fromLocalStorage.trim() : '';
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
        return { ok: false, error: 'Failed to connect to server.' };
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
        return { ok: false, error: 'Failed to connect to server.' };
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
        return { ok: false, error: 'Failed to connect to server.' };
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
        return { ok: false, error: 'Failed to connect to server.' };
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
            error: 'Failed to connect to server.',
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
            error: 'Failed to connect to server.',
        };
    }
};

export const rejoinAssignedRoom = async (
    sessionId: string,
    roomId?: string | null,
): Promise<{ ok: boolean; room?: RouterAssignedRoom; error?: string }> => {
    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    const normalizedSessionId = sessionId.trim();
    if (normalizedSessionId.length === 0) {
        return { ok: false, error: 'session_id is required.' };
    }

    const normalizedRoomId = typeof roomId === 'string' && roomId.trim().length > 0
        ? roomId.trim()
        : undefined;

    try {
        const response = await fetch(`${getRouterBaseUrl()}/rooms/rejoin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: normalizedSessionId,
                room_id: normalizedRoomId,
            }),
        });

        const payload = await response.json() as {
            ok?: unknown;
            error?: unknown;
            room?: unknown;
        };

        if (!response.ok || payload.ok !== true) {
            return {
                ok: false,
                error: typeof payload.error === 'string' ? payload.error : 'Failed to rejoin room.',
            };
        }

        const room = parseAssignedRoom(payload.room);
        if (!room) {
            return {
                ok: false,
                error: 'Room data missing from rejoin response.',
            };
        }

        return {
            ok: true,
            room,
        };
    }
    catch (error) {
        console.warn('[Network] Failed to rejoin assigned room', error);
        return {
            ok: false,
            error: 'Failed to connect to server.',
        };
    }
};

export const leaveMatchmakingQueue = async (
    sessionId: string,
    bestEffort: boolean = false
): Promise<{ ok: boolean; error?: string }> => {
    if (!sessionId || sessionId.trim().length === 0) {
        return { ok: false, error: 'session_id is required.' };
    }

    const payload = JSON.stringify({
        action: 'leave',
        session_id: sessionId.trim(),
    });

    if (bestEffort && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
            const beaconBody = new Blob([payload], { type: 'application/json' });
            if (navigator.sendBeacon(`${getRouterBaseUrl()}/matchmaking/queue`, beaconBody)) {
                return { ok: true };
            }
        }
        catch {
            // Fallback to keepalive fetch below.
        }
    }

    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Fetch API is unavailable.' };
    }

    try {
        const response = await fetch(`${getRouterBaseUrl()}/matchmaking/queue`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: payload,
            keepalive: bestEffort,
        });

        const body = await response.json() as { ok?: unknown; error?: unknown };
        if (!response.ok || body.ok !== true) {
            return {
                ok: false,
                error: typeof body.error === 'string' ? body.error : 'Failed to leave matchmaking queue.',
            };
        }

        return { ok: true };
    }
    catch (error) {
        console.warn('[Network] Failed to leave matchmaking queue', error);
        return {
            ok: false,
            error: 'Failed to connect to server.',
        };
    }
};

export type BackendCardSetup = {
    id: string;
    ownerId: 'p1' | 'p2';
    cardType: 'character' | 'tool' | 'item' | 'stadium' | 'supporter';
    holderId: string;
    AVGECardType: string;
    AVGECardClass: string;
    hasAtk1?: boolean;
    hasActive?: boolean;
    hasPassive?: boolean;
    hasAtk2?: boolean;
    atk1Name?: string | null;
    activeName?: string | null;
    atk2Name?: string | null;
    atk1Cost?: number;
    atk2Cost?: number;
    retreatCost?: number;
    hp: number;
    maxHp: number;
    attachedToCardId: string | null;
    statusEffect: Record<string, number>;
};

export type BackendEnergySetup = {
    id: string;
    ownerId: string;
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
    playerView?: 'p1' | 'p2' | 'spectator';
    players?: Partial<Record<'p1' | 'p2', BackendPlayerSetup>>;
};

const ALLOWED_CARD_HOLDER_IDS = new Set([
    'p1-hand',
    'p1-bench',
    'p1-active',
    'p1-discard',
    'p1-deck',
    'p1-tool',
    'p2-hand',
    'p2-bench',
    'p2-active',
    'p2-discard',
    'p2-deck',
    'p2-tool',
    'stadium'
]);
const ALLOWED_ENERGY_HOLDER_IDS = new Set([
    'shared-energy',
    'energy-discard'
]);

type CardPreviewCatalogEntry = {
    atk1Name?: unknown;
    abilityName?: unknown;
    atk2Name?: unknown;
    atk1Cost?: unknown;
    atk2Cost?: unknown;
    retreatCost?: unknown;
};

type CardPreviewCatalog = {
    cards?: Record<string, CardPreviewCatalogEntry>;
};

const normalizeCardPreviewKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const readCatalogNullableString = (entry: CardPreviewCatalogEntry | undefined, key: keyof CardPreviewCatalogEntry): string | null | undefined => {
    if (!entry) {
        return undefined;
    }

    const value = entry[key];
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const readCatalogNumber = (entry: CardPreviewCatalogEntry | undefined, key: keyof CardPreviewCatalogEntry): number | undefined => {
    if (!entry) {
        return undefined;
    }

    const value = entry[key];
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return undefined;
    }

    return value;
};

const cardPreviewCatalog = cardPreviewDescriptionsJson as CardPreviewCatalog;
const cardPreviewByKey = new Map<string, CardPreviewCatalogEntry>();
for (const [rawKey, entry] of Object.entries(cardPreviewCatalog.cards ?? {})) {
    if (typeof entry !== 'object' || entry === null) {
        continue;
    }
    cardPreviewByKey.set(normalizeCardPreviewKey(rawKey), entry as CardPreviewCatalogEntry);
}

const resolveCardPreviewEntry = (cardClass: string): CardPreviewCatalogEntry | undefined => {
    return cardPreviewByKey.get(normalizeCardPreviewKey(cardClass));
};

const readObjectValue = (record: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
            return record[key];
        }
    }

    return undefined;
};

const readObjectString = (record: Record<string, unknown>, keys: string[]): string | undefined => {
    const value = readObjectValue(record, keys);
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const readObjectNullableString = (record: Record<string, unknown>, keys: string[]): string | null | undefined => {
    const value = readObjectValue(record, keys);
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const readObjectBoolean = (record: Record<string, unknown>, keys: string[]): boolean | undefined => {
    const value = readObjectValue(record, keys);
    return typeof value === 'boolean' ? value : undefined;
};

const readObjectNumber = (record: Record<string, unknown>, keys: string[]): number | undefined => {
    const value = readObjectValue(record, keys);
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return undefined;
    }

    return value;
};

const normalizeOwnerId = (raw: string | undefined): 'p1' | 'p2' | null => {
    if (!raw) {
        return null;
    }

    const normalized = raw.toLowerCase();
    if (normalized === 'p1' || normalized === 'player-1' || normalized === 'player1') {
        return 'p1';
    }
    if (normalized === 'p2' || normalized === 'player-2' || normalized === 'player2') {
        return 'p2';
    }

    return null;
};

const normalizeCardType = (raw: string | undefined): BackendCardSetup['cardType'] | null => {
    if (!raw) {
        return null;
    }

    const normalized = raw.toLowerCase();
    if (normalized === 'character' || normalized === 'tool' || normalized === 'item' || normalized === 'stadium' || normalized === 'supporter') {
        return normalized;
    }

    return null;
};

const normalizeCardHolderId = (raw: string | undefined): string | null => {
    if (!raw) {
        return null;
    }

    const normalized = raw
        .trim()
        .toLowerCase()
        .replace(/^player-1/, 'p1')
        .replace(/^player-2/, 'p2')
        .replace(/^player1/, 'p1')
        .replace(/^player2/, 'p2');

    if (!ALLOWED_CARD_HOLDER_IDS.has(normalized)) {
        return null;
    }

    return normalized;
};

const normalizeEnergyHolderId = (raw: string | undefined): string | null => {
    if (!raw) {
        return null;
    }

    const normalized = raw.trim().toLowerCase();
    if (!ALLOWED_ENERGY_HOLDER_IDS.has(normalized)) {
        return null;
    }

    return normalized;
};

const normalizeStatusEffectPayload = (value: unknown): Record<string, number> | null => {
    if (value === undefined) {
        return {};
    }

    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const result: Record<string, number> = {};
    for (const [key, rawCount] of Object.entries(value as Record<string, unknown>)) {
        if (!Number.isInteger(rawCount) || (rawCount as number) < 0) {
            return null;
        }
        result[key] = rawCount as number;
    }

    return result;
};

const normalizeBackendCardSetup = (value: unknown): BackendCardSetup | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const card = value as Record<string, unknown>;

    const id = readObjectString(card, ['id', 'cardId', 'card_id']);
    const ownerId = normalizeOwnerId(readObjectString(card, ['ownerId', 'owner_id', 'owner']));
    const cardType = normalizeCardType(readObjectString(card, ['cardType', 'card_type']));
    const holderId = normalizeCardHolderId(readObjectString(card, ['holderId', 'holder_id', 'zoneId', 'zone_id']));
    const AVGECardType = readObjectString(card, ['AVGECardType', 'avgeCardType', 'avge_card_type']);
    const AVGECardClass = readObjectString(card, ['AVGECardClass', 'avgeCardClass', 'avge_card_class']);
    const hp = readObjectNumber(card, ['hp']);
    const maxHp = readObjectNumber(card, ['maxHp', 'max_hp']);
    const attachedToCardId = readObjectNullableString(card, ['attachedToCardId', 'attached_to_card_id']);
    const statusEffect = normalizeStatusEffectPayload(readObjectValue(card, ['statusEffect', 'status_effect']));

    if (!id || !ownerId || !cardType || !holderId || !AVGECardType || !AVGECardClass || hp === undefined || maxHp === undefined || statusEffect === null) {
        return null;
    }

    const previewEntry = resolveCardPreviewEntry(AVGECardClass);
    const atk1Name = cardType === 'character'
        ? (readCatalogNullableString(previewEntry, 'atk1Name') ?? null)
        : null;
    const activeName = cardType === 'character'
        ? (readCatalogNullableString(previewEntry, 'abilityName') ?? null)
        : null;
    const atk2Name = cardType === 'character'
        ? (readCatalogNullableString(previewEntry, 'atk2Name') ?? null)
        : null;

    const atk1Cost = cardType === 'character'
        ? (readCatalogNumber(previewEntry, 'atk1Cost') ?? 0)
        : 0;
    const atk2Cost = cardType === 'character'
        ? (readCatalogNumber(previewEntry, 'atk2Cost') ?? 0)
        : 0;
    const retreatCost = cardType === 'character'
        ? (readCatalogNumber(previewEntry, 'retreatCost') ?? 0)
        : 0;

    const hasPassiveRaw = readObjectBoolean(card, ['hasPassive', 'has_passive', 'haspassive']);

    return {
        id,
        ownerId,
        cardType,
        holderId,
        AVGECardType,
        AVGECardClass,
        hasAtk1: cardType === 'character' ? Boolean(atk1Name) : false,
        hasActive: cardType === 'character' ? Boolean(activeName) : false,
        hasPassive: hasPassiveRaw ?? false,
        hasAtk2: cardType === 'character' ? Boolean(atk2Name) : false,
        atk1Name,
        activeName,
        atk2Name,
        atk1Cost,
        atk2Cost,
        retreatCost,
        hp,
        maxHp,
        attachedToCardId: attachedToCardId ?? null,
        statusEffect,
    };
};

const normalizeBackendEnergySetup = (value: unknown): BackendEnergySetup | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const token = value as Record<string, unknown>;
    const id = readObjectString(token, ['id']);
    const ownerId = readObjectString(token, ['ownerId', 'owner_id', 'owner']);
    const holderId = normalizeEnergyHolderId(readObjectString(token, ['holderId', 'holder_id']));
    const attachedToCardId = readObjectNullableString(token, ['attachedToCardId', 'attached_to_card_id']);

    if (!id || !ownerId || !holderId) {
        return null;
    }

    return {
        id,
        ownerId,
        holderId,
        attachedToCardId: attachedToCardId ?? null,
    };
};

export type FrontendProtocolPacket = {
    ACK: number;
    PacketType: 'ready' | 'register_client' | 'init_setup_done' | 'request_environment' | 'update_frontend' | 'frontend_event';
    Body: Record<string, unknown>;
    client_id?: string;
    client_slot?: 'p1' | 'p2';
    reconnect_token?: string;
};

export type BackendProtocolPacket = {
    SEQ: number;
    IsResponse: boolean;
    PacketType: 'environment' | 'command' | 'init_state';
    Body: Record<string, unknown>;
};

export type BackendProtocolResponse = {
    packets: BackendProtocolPacket[];
    clientSlot?: 'p1' | 'p2';
    reconnectToken?: string;
    bothPlayersConnected?: boolean;
    waitingForOpponent?: boolean;
    waitingForInit?: boolean;
    blockedPendingPeerAck?: boolean;
    blockedCommand?: string;
    requestFailed?: boolean;
};

const isBackendCommandPacketBody = (value: unknown): value is {
    command: string;
    command_id?: number;
    target_slots?: string[];
    response_category: string;
    response_payload?: Record<string, unknown>;
} => {
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

    const hasValidCommandId = body.command_id === undefined || Number.isInteger(body.command_id);
    const hasValidTargetSlots = body.target_slots === undefined || (Array.isArray(body.target_slots) && body.target_slots.every((slot) => typeof slot === 'string'));
    const hasValidCategory = typeof body.response_category === 'string' && body.response_category.trim().length > 0;
    const hasValidPayload = body.response_payload === undefined || (typeof body.response_payload === 'object' && body.response_payload !== null);

    return hasValidCommandId && hasValidTargetSlots && hasValidCategory && hasValidPayload;
};

const isBackendProtocolPacket = (value: unknown): value is BackendProtocolPacket => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const packet = value as Partial<BackendProtocolPacket>;
    const hasPacketEnvelope = Number.isInteger(packet.SEQ) &&
        typeof packet.IsResponse === 'boolean' &&
        (packet.PacketType === 'environment' || packet.PacketType === 'command' || packet.PacketType === 'init_state') &&
        typeof packet.Body === 'object' &&
        packet.Body !== null;

    if (!hasPacketEnvelope) {
        return false;
    }

    if (packet.PacketType === 'command') {
        return isBackendCommandPacketBody(packet.Body);
    }

    return true;
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
            waiting_for_init?: unknown;
            blocked_pending_peer_ack?: unknown;
            blocked_command?: unknown;
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

        const waitingForInit = typeof payload.waiting_for_init === 'boolean'
            ? payload.waiting_for_init
            : undefined;

        const blockedPendingPeerAck = typeof payload.blocked_pending_peer_ack === 'boolean'
            ? payload.blocked_pending_peer_ack
            : undefined;

        const blockedCommand = typeof payload.blocked_command === 'string' && payload.blocked_command.trim().length > 0
            ? payload.blocked_command.trim()
            : undefined;

        return {
            packets,
            clientSlot,
            reconnectToken,
            bothPlayersConnected,
            waitingForOpponent,
            waitingForInit,
            blockedPendingPeerAck,
            blockedCommand,
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
        round_number?: unknown;
        gamePhase?: unknown;
        game_phase?: unknown;
        playerTurn?: unknown;
        player_turn?: unknown;
        playerView?: unknown;
        player_view?: unknown;
        players?: unknown;
    };

    if (!Array.isArray(payload.cards) || !Array.isArray(payload.energyTokens)) {
        return null;
    }

    const normalizedCards = payload.cards.map((card) => normalizeBackendCardSetup(card));
    if (normalizedCards.some((card) => card === null)) {
        console.warn('[Network] environment payload has invalid card entries.');
        return null;
    }

    const normalizedEnergyTokens = payload.energyTokens.map((token) => normalizeBackendEnergySetup(token));
    if (normalizedEnergyTokens.some((token) => token === null)) {
        console.warn('[Network] environment payload has invalid energy token entries.');
        return null;
    }

    const roundNumberRaw = payload.roundNumber ?? payload.round_number;
    if (!Number.isInteger(roundNumberRaw) || (roundNumberRaw as number) < 0) {
        console.warn('[Network] environment payload is missing a valid integer roundNumber.');
        return null;
    }

    const players = typeof payload.players === 'object' && payload.players !== null
        ? payload.players as Partial<Record<'p1' | 'p2', BackendPlayerSetup>>
        : undefined;

    const gamePhase =
        payload.gamePhase === 'no-input' || payload.gamePhase === 'phase2' || payload.gamePhase === 'atk'
            ? payload.gamePhase
            : payload.game_phase === 'no-input' || payload.game_phase === 'phase2' || payload.game_phase === 'atk'
                ? payload.game_phase
            : undefined;

    const playerTurnRaw = payload.playerTurn ?? payload.player_turn;
    const playerTurn = playerTurnRaw === 'p1' || playerTurnRaw === 'p2'
        ? playerTurnRaw
        : undefined;

    const playerView =
        payload.playerView === 'p1' || payload.playerView === 'p2' || payload.playerView === 'spectator'
            ? payload.playerView
            : payload.player_view === 'p1' || payload.player_view === 'p2' || payload.player_view === 'spectator'
                ? payload.player_view
            : undefined;

    return {
        cards: normalizedCards as BackendCardSetup[],
        energyTokens: normalizedEnergyTokens as BackendEnergySetup[],
        roundNumber: roundNumberRaw as number,
        gamePhase,
        playerTurn,
        playerView,
        players
    };
};
