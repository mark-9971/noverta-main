#!/usr/bin/env node
/**
 * Tiny reverse proxy used in CI so that the API server and the Trellis web
 * app appear under a single origin (mirroring the Replit dev proxy on port
 * 80). Routes /api/* to the API server, everything else to the Vite preview
 * server.
 *
 * Env:
 *   PROXY_PORT  (default 8080)  — port this proxy listens on
 *   API_TARGET  (default http://127.0.0.1:8090) — API server origin
 *   WEB_TARGET  (default http://127.0.0.1:5173) — Vite preview origin
 */
import http from "node:http";
import { URL } from "node:url";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080);
const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:8090";
const WEB_TARGET = process.env.WEB_TARGET ?? "http://127.0.0.1:5173";

function pickTarget(url) {
  return url.startsWith("/api") || url.startsWith("/__e2e") ? API_TARGET : WEB_TARGET;
}

function proxyRequest(req, res) {
  const target = new URL(pickTarget(req.url));
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
  };

  const upstream = http.request(options, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers);
    upRes.pipe(res);
  });

  upstream.on("error", (err) => {
    console.error(`[ci-proxy] upstream error for ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end(`Bad gateway: ${err.message}`);
  });

  req.pipe(upstream);
}

const server = http.createServer(proxyRequest);

server.on("upgrade", (req, socket, head) => {
  const target = new URL(pickTarget(req.url));
  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${target.hostname}:${target.port}` },
  });
  upstream.on("upgrade", (upRes, upSocket, upHead) => {
    const headers = Object.entries(upRes.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\r\n");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
    if (upHead && upHead.length) socket.write(upHead);
    upSocket.pipe(socket).pipe(upSocket);
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(
    `[ci-proxy] listening on :${PROXY_PORT} → /api → ${API_TARGET}, * → ${WEB_TARGET}`,
  );
});
