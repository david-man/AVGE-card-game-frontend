export type BackendEventPacket = {
    event_type: string;
    timestamp: string;
    response_data: Record<string, unknown>;
    context?: Record<string, unknown>;
};

const DEFAULT_BACKEND_EVENTS_URL = 'http://127.0.0.1:5500/events';
const DEFAULT_BACKEND_SCANNER_NEXT_URL = 'http://127.0.0.1:5500/scanner/next';
const DEFAULT_BACKEND_SCANNER_WAIT_URL = 'http://127.0.0.1:5500/scanner/wait';

const getBackendEventsUrl = (): string => {
    if (typeof window === 'undefined') {
        return DEFAULT_BACKEND_EVENTS_URL;
    }

    const configuredUrl = (window as Window & { AVGE_BACKEND_EVENTS_URL?: string }).AVGE_BACKEND_EVENTS_URL;
    if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
        return configuredUrl.trim();
    }

    return DEFAULT_BACKEND_EVENTS_URL;
};

const getBackendScannerNextUrl = (): string => {
    if (typeof window === 'undefined') {
        return DEFAULT_BACKEND_SCANNER_NEXT_URL;
    }

    const scannerUrl = (window as Window & { AVGE_BACKEND_SCANNER_NEXT_URL?: string }).AVGE_BACKEND_SCANNER_NEXT_URL;
    if (typeof scannerUrl === 'string' && scannerUrl.trim().length > 0) {
        return scannerUrl.trim();
    }

    const eventsUrl = getBackendEventsUrl();
    if (eventsUrl.endsWith('/events')) {
        return `${eventsUrl.slice(0, -'/events'.length)}/scanner/next`;
    }

    return DEFAULT_BACKEND_SCANNER_NEXT_URL;
};

const getBackendScannerWaitUrl = (): string => {
    if (typeof window === 'undefined') {
        return DEFAULT_BACKEND_SCANNER_WAIT_URL;
    }

    const scannerWaitUrl = (window as Window & { AVGE_BACKEND_SCANNER_WAIT_URL?: string }).AVGE_BACKEND_SCANNER_WAIT_URL;
    if (typeof scannerWaitUrl === 'string' && scannerWaitUrl.trim().length > 0) {
        return scannerWaitUrl.trim();
    }

    const eventsUrl = getBackendEventsUrl();
    if (eventsUrl.endsWith('/events')) {
        return `${eventsUrl.slice(0, -'/events'.length)}/scanner/wait`;
    }

    return DEFAULT_BACKEND_SCANNER_WAIT_URL;
};

export type ScannerCommandMessage = {
    command: string;
    source: string;
    received_at?: string;
};

export const sendBackendEvent = async (
    eventType: string,
    responseData: Record<string, unknown>,
    context?: Record<string, unknown>
): Promise<void> => {
    if (typeof fetch !== 'function') {
        return;
    }

    const packet: BackendEventPacket = {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        response_data: responseData,
        context
    };

    try {
        await fetch(getBackendEventsUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(packet),
            keepalive: true
        });
    }
    catch (error) {
        console.warn('[Network] Failed to send backend event', packet, error);
    }
};

export const pollNextScannerCommand = async (): Promise<ScannerCommandMessage | null> => {
    if (typeof fetch !== 'function') {
        return null;
    }

    try {
        const response = await fetch(getBackendScannerNextUrl(), {
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as {
            command?: unknown;
            source?: unknown;
            received_at?: unknown;
        };

        if (typeof payload.command !== 'string' || payload.command.trim().length === 0) {
            return null;
        }

        return {
            command: payload.command.trim(),
            source: typeof payload.source === 'string' && payload.source.trim().length > 0 ? payload.source.trim() : 'scanner',
            received_at: typeof payload.received_at === 'string' ? payload.received_at : undefined
        };
    }
    catch (error) {
        console.warn('[Network] Failed to poll scanner command', error);
        return null;
    }
};

export const waitForNextScannerCommand = async (timeoutSeconds = 25): Promise<ScannerCommandMessage | null> => {
    if (typeof fetch !== 'function') {
        return null;
    }

    const normalizedTimeout = Math.max(1, Math.min(60, Math.floor(timeoutSeconds)));

    try {
        const response = await fetch(`${getBackendScannerWaitUrl()}?timeout_s=${normalizedTimeout}`, {
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as {
            command?: unknown;
            source?: unknown;
            received_at?: unknown;
        };

        if (typeof payload.command !== 'string' || payload.command.trim().length === 0) {
            return null;
        }

        return {
            command: payload.command.trim(),
            source: typeof payload.source === 'string' && payload.source.trim().length > 0 ? payload.source.trim() : 'scanner',
            received_at: typeof payload.received_at === 'string' ? payload.received_at : undefined
        };
    }
    catch (error) {
        console.warn('[Network] Failed while waiting for scanner command', error);
        return null;
    }
};
