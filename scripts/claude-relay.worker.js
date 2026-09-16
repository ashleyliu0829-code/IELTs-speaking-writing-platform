// Cloudflare Worker that forwards requests to the Claude API unchanged.
//
// Anthropic refuses calls from Hong Kong (403 "Request not allowed"), and the
// production box is in Hong Kong. This worker runs on Cloudflare's network,
// which Anthropic accepts, and passes every request through as-is — the API
// key travels in the request headers, so nothing secret lives here.
//
// Set up once: Cloudflare dashboard → Workers & Pages → Create → paste this
// file → Deploy. Then on the server add to ~/app-new/.env.local:
//   ANTHROPIC_BASE_URL=https://<worker-name>.<account>.workers.dev
// The SDK reads that variable by itself; nothing in the app changes.

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "api.anthropic.com";
    url.protocol = "https:";
    url.port = "";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("cf-connecting-ip");
    forwarded.headers.delete("x-forwarded-for");
    return fetch(forwarded);
  }
};
