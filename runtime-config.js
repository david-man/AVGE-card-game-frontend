(function configureAvgeRuntime(windowObj) {
    // Localhost defaults for development.
    // Override these at deploy time for remote services.
    // Example override:
    // windowObj.AVGE_ROUTER_BASE_URL = 'https://router.example.com';

    if (typeof windowObj.AVGE_ROUTER_BASE_URL !== 'string') {
        windowObj.AVGE_ROUTER_BASE_URL = 'http://localhost:5600';
    }

    if (typeof windowObj.AVGE_BACKEND_BASE_URL !== 'string') {
        windowObj.AVGE_BACKEND_BASE_URL = 'http://localhost:5500';
    }

    if (typeof windowObj.AVGE_BACKEND_PROTOCOL_URL !== 'string') {
        windowObj.AVGE_BACKEND_PROTOCOL_URL = 'http://localhost:5500/protocol';
    }
})(window);
