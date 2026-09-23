---
name: Expo mobile preview
description: Environment-specific Expo workflow behavior discovered while building Kitchen Compass.
---

The Expo 57 workflow may print an error while installing React Native DevTools because `libglib-2.0.so.0` is unavailable in the container. This does not prevent Metro from starting, bundling the app, or producing an Expo Go QR code.

**Why:** The DevTools binary is optional for the app runtime; treating the message as a Metro failure would cause unnecessary environment changes.

**How to apply:** If the Expo workflow reaches “Starting Metro Bundler,” prints the QR code, bundles the app, and shows no JavaScript errors, continue with app-level verification rather than attempting to install system libraries.

Web preview can remain blank when the root layout blocks on the native font-loading promise. Allow the browser fallback font to render while keeping the native font gate.

**Why:** The browser can mount the Expo app successfully even when the native font promise never resolves in the preview environment.

**How to apply:** Keep web rendering independent of a pending native font load, then verify the visible route with a screenshot after Metro restarts.

The Expo web bundle can fail even when a native package is declared in the app manifest if the workspace install has not hydrated its symlink. Reinstall at the package workspace level before changing application code.

**Why:** Metro reports the missing module as an app import failure, but the source and lockfile can already contain the dependency.

**How to apply:** Check the package's workspace node_modules link and restart Expo after a targeted workspace install; rebuild stale workspace declaration output if typechecking then reports missing exports.

Expo SDK 57 rejects the old top-level splash configuration, even when Metro still starts. Keep the splash background in the splash-screen plugin configuration and use Expo Doctor to validate the app config.

**Why:** Native launch troubleshooting revealed that web and native bundles could succeed while the config schema still failed validation.

**How to apply:** For phone-loading issues, distinguish stale Metro errors from current bundle failures, request the manifest's actual native launch asset, and run Expo Doctor before changing app logic.