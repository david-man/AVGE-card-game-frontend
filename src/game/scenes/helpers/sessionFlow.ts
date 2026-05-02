import {
    clearClientSessionState,
    subscribeToRouterSessionEvents,
    getRouterBaseUrl,
    checkServiceHealth,
} from '../../Network';

type SessionFlowScene = any;

const clearProtocolSessionStorage = (): void => {
    if (typeof window === 'undefined') {
        return;
    }

    window.sessionStorage.removeItem('avge_protocol_client_slot');
    window.sessionStorage.removeItem('avge_protocol_reconnect_token');
};

const disconnectProtocolSocket = (scene: SessionFlowScene): void => {
    if (!scene.protocolSocket) {
        return;
    }

    scene.protocolSocket.removeAllListeners();
    scene.protocolSocket.disconnect();
    scene.protocolSocket = null;
};

export const startServiceHealthMonitor = (scene: SessionFlowScene, checkHealth: () => void): void => {
    if (scene.serviceHealthTimer) {
        return;
    }

    scene.serviceHealthTimer = scene.time.addEvent({
        delay: 5000,
        loop: true,
        callback: () => {
            checkHealth();
        }
    });
};

export const stopServiceHealthMonitor = (scene: SessionFlowScene): void => {
    if (!scene.serviceHealthTimer) {
        return;
    }

    scene.serviceHealthTimer.remove(false);
    scene.serviceHealthTimer = null;
};

export const checkCoreServiceHealth = async (scene: SessionFlowScene): Promise<void> => {
    if (scene.hasRedirectedToMainMenu || scene.serviceHealthCheckInFlight || scene.matchEndedAwaitingExit) {
        return;
    }

    scene.serviceHealthCheckInFlight = true;
    try {
        const routerBaseUrl = getRouterBaseUrl();
        const routerHealthy = await checkServiceHealth(routerBaseUrl);
        if (!routerHealthy) {
            redirectToMainMenuAfterServiceFailure(scene, 'router_unreachable', 'Router unavailable. Returning to main menu.');
            return;
        }
    }
    finally {
        scene.serviceHealthCheckInFlight = false;
    }
};

export const redirectToMainMenuAfterServiceFailure = (scene: SessionFlowScene, reason: string, message: string): void => {
    if (scene.hasRedirectedToMainMenu) {
        return;
    }

    scene.hasRedirectedToMainMenu = true;
    console.warn('[Protocol] redirecting to MainMenu after service failure', { reason });
    stopServiceHealthMonitor(scene);
    stopAuthSessionPush(scene);

    if (reason === 'session_superseded') {
        clearClientSessionState();
    }
    else {
        clearProtocolSessionStorage();
    }

    disconnectProtocolSocket(scene);

    scene.scene.start('MainMenu', {
        systemMessage: message,
        failureReason: reason,
    });
};

export const startAuthSessionPush = (
    scene: SessionFlowScene,
    sessionId: string,
    onSessionSuperseded: (message?: string) => void
): void => {
    stopAuthSessionPush(scene);
    scene.authSessionUnsubscribe = subscribeToRouterSessionEvents(sessionId, ({ reason, message }) => {
        if (reason !== 'session_superseded') {
            return;
        }

        onSessionSuperseded(message);
    });
};

export const stopAuthSessionPush = (scene: SessionFlowScene): void => {
    if (!scene.authSessionUnsubscribe) {
        return;
    }

    scene.authSessionUnsubscribe();
    scene.authSessionUnsubscribe = null;
};

export const handleSessionSupersededLogout = (scene: SessionFlowScene, message?: string): void => {
    if (scene.hasRedirectedToMainMenu) {
        return;
    }

    scene.hasRedirectedToMainMenu = true;
    stopServiceHealthMonitor(scene);
    stopAuthSessionPush(scene);
    clearClientSessionState();
    disconnectProtocolSocket(scene);

    scene.scene.start('Login', {
        systemMessage: typeof message === 'string' && message.trim().length > 0
            ? message
            : 'Signed out: account opened on another client.'
    });
};

export const markMatchEndedAwaitingExit = (scene: SessionFlowScene): void => {
    if (scene.matchEndedAwaitingExit) {
        return;
    }

    scene.matchEndedAwaitingExit = true;
    stopServiceHealthMonitor(scene);
    scene.setInputAcknowledged(false);
};

export const returnToMainMenuAfterMatchEnd = (scene: SessionFlowScene): void => {
    scene.matchEndedAwaitingExit = false;
    scene.hasRedirectedToMainMenu = true;
    stopServiceHealthMonitor(scene);
    stopAuthSessionPush(scene);
    clearProtocolSessionStorage();
    disconnectProtocolSocket(scene);
    scene.scene.start('MainMenu');
};
