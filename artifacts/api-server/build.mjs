import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { rm, mkdir, cp } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  // Resolve the release identifier once so the source-map upload tag and the
  // runtime Sentry.init() release tag stay in lock-step. Without baking it
  // into the bundle, prod events come in with an empty release while the
  // uploaded artifacts live under a git-SHA release, and the two never link
  // up in the Sentry UI (so stack traces stay minified).
  const resolvedRelease =
    process.env.SENTRY_RELEASE ||
    process.env.APP_VERSION ||
    process.env.REPLIT_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    "";

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    ...(resolvedRelease
      ? {
          define: {
            "process.env.APP_VERSION": JSON.stringify(resolvedRelease),
          },
        }
      : {}),
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/core",
      "@swc/wasm",
      "@aws-sdk/*",
      "@azure/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "pdfkit",
      "fontkit",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] }),
      // Upload source maps + tag the release in production builds. Skip
      // gracefully when SENTRY_AUTH_TOKEN isn't set so dev builds and
      // contributor builds without Sentry creds still work. The release
      // identifier is shared with the frontend (vite.config.ts) so issues
      // across the stack collapse onto the same release.
      ...(process.env.NODE_ENV === "production" &&
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT
        ? (() => {
            const releaseName =
              process.env.SENTRY_RELEASE ||
              process.env.APP_VERSION ||
              process.env.REPLIT_GIT_COMMIT_SHA ||
              process.env.GIT_COMMIT ||
              "";
            return [
              sentryEsbuildPlugin({
                authToken: process.env.SENTRY_AUTH_TOKEN,
                org: process.env.SENTRY_ORG,
                project: process.env.SENTRY_PROJECT,
                ...(releaseName ? { release: { name: releaseName } } : {}),
                sourcemaps: {
                  filesToDeleteAfterUpload: ["dist/**/*.map"],
                },
                telemetry: false,
              }),
            ];
          })()
        : []),
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // Copy SQL migrations next to dist/index.mjs so the bundled server can
  // apply them at startup (esbuild does not bundle filesystem reads).
  const migrationsSrc = path.resolve(artifactDir, "../../lib/db/src/migrations");
  const migrationsDest = path.join(distDir, "migrations");
  await mkdir(migrationsDest, { recursive: true });
  await cp(migrationsSrc, migrationsDest, { recursive: true });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
