"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const REQUIRED_METHODS = ["quote", "buyLabel", "getLabel", "track"];
function assertShippingProvider(provider, providerName = "unknown") {
    if (!provider || typeof provider !== "object") {
        throw new Error(`SHIPPING_PROVIDER_INVALID:${providerName}`);
    }
    for (const method of REQUIRED_METHODS) {
        if (typeof provider[method] !== "function") {
            throw new Error(`SHIPPING_PROVIDER_METHOD_MISSING:${providerName}:${method}`);
        }
    }
    return provider;
}
module.exports = {
    REQUIRED_METHODS,
    assertShippingProvider
};
//# sourceMappingURL=provider.interface.js.map