---
name: Expo mobile preview
description: Environment-specific Expo workflow behavior discovered while building Kitchen Compass.
---

The Expo 57 workflow may print an error while installing React Native DevTools because `libglib-2.0.so.0` is unavailable in the container. This does not prevent Metro from starting, bundling the app, or producing an Expo Go QR code.

**Why:** The DevTools binary is optional for the app runtime; treating the message as a Metro failure would cause unnecessary environment changes.

**How to apply:** If the Expo workflow reaches “Starting Metro Bundler,” prints the QR code, bundles the app, and shows no JavaScript errors, continue with app-level verification rather than attempting to install system libraries.