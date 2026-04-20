import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// pino-pretty runs in a worker_thread. Under memory pressure worker_thread
// creation can fail with EAGAIN, which makes vitest suites crash at module
// load with "Error: EAGAIN" in thread-stream. Only use the pretty transport
// for interactive development — tests and production should use the default
// synchronous stdout writer.
const useWorkerTransport = !isProduction && !isTest;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(useWorkerTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
