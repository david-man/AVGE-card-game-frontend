(function configureAvgeRuntime(windowObj) {
    const normalizeBaseUrl = (value) => String(value).trim().replace(/\/$/, '');
    
    
    
    // Change this one constant for deployment.
    const ROUTER_BASE_URL = 'http://localhost:5600';

    const routerBaseUrl = normalizeBaseUrl(ROUTER_BASE_URL);

    windowObj.AVGE_ROUTER_BASE_URL = routerBaseUrl;
    windowObj.AVGE_BACKEND_BASE_URL = routerBaseUrl;
    windowObj.AVGE_BACKEND_PROTOCOL_URL = `${routerBaseUrl}/protocol`;

    // Optional runtime font overrides.
    // AVGE_FONT_TTF: local assets filename, e.g. "MyFont.ttf"
    // AVGE_FONT_STYLESHEET: URL or full <link ... href="..."> snippet
    if (typeof windowObj.AVGE_FONT_TTF !== 'string') {
        windowObj.AVGE_FONT_TTF = '';
    }

    if (typeof windowObj.AVGE_FONT_STYLESHEET !== 'string') {
        windowObj.AVGE_FONT_STYLESHEET = '';
    }
})(window);
