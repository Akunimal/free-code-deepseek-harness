// Current direct-first regression: local direct and Cloudflare backend mocks.
// Covers headers without useful content, quota failover, strict payload/model,
// independent circuits and absence of retired SOCKS/rotator dependencies.
require('./test-cloudflare-route');
