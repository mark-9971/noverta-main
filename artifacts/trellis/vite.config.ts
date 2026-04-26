import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

// Build-time refusal: a production-mode bundle MUST NOT ship with the dev
// auth bypass enabled. The runtime guard in App.tsx already strips the
// bypass branch when `import.meta.env.MODE === "production"`, but this
// belt-and-braces check fails the build outright if the two are ever set
// inconsistently (e.g. `VITE_DEV_AUTH_BYPASS=1 vite build`). Without this,
// an operator who flips a Railway env var while shipping a production build
// could publish a bundle with x-test-* identity-spoofing headers wired in.
if (
  process.env.NODE_ENV === "production" &&
  process.env.VITE_DEV_AUTH_BYPASS === "1"
) {
  throw new Error(
    "VITE_DEV_AUTH_BYPASS=1 is set while building in production mode. " +
      "This combination would ship hard-coded x-test-* admin headers in the " +
      "web bundle. Unset VITE_DEV_AUTH_BYPASS in the build environment, or " +
      "build with NODE_ENV=development.",
  );
}

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryRelease =
  process.env.SENTRY_RELEASE ||
  process.env.VITE_APP_VERSION ||
  process.env.REPLIT_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT;

// Mirror the same fallback chain on the runtime side: ensure the bundled
// `import.meta.env.VITE_APP_VERSION` (read by sentry.ts at runtime) matches
// the release name we tag the uploaded artifacts with. Without this, prod
// events can come in with no release while artifacts are uploaded under a
// git-SHA release, and the two never link up in the Sentry UI.
if (!process.env.VITE_APP_VERSION && sentryRelease) {
  process.env.VITE_APP_VERSION = sentryRelease;
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    // Upload source maps + tag the release in production builds. Skip
    // gracefully when SENTRY_AUTH_TOKEN isn't set so dev builds, CI smoke
    // builds, and contributor builds without Sentry creds still work.
    ...(process.env.NODE_ENV === "production" && sentryAuthToken && sentryOrg && sentryProject
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            release: sentryRelease ? { name: sentryRelease } : undefined,
            sourcemaps: {
              filesToDeleteAfterUpload: ["**/*.map"],
            },
            telemetry: false,
          }),
        ]
      : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-clerk": ["@clerk/react"],
          "vendor-charts": ["recharts"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
