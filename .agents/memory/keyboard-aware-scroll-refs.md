---
name: Keyboard-aware scroll refs
description: Bridge imperative ScrollView methods through the shared keyboard-aware wrapper.
---

Expose the compatibility wrapper's forwarded ref as a React Native `ScrollView` when callers need standard methods such as `scrollTo`. On native, bridge the `KeyboardAwareScrollView` instance to that ref through a callback rather than directly assigning one library's ref type to the other.

**Why:** The keyboard controller adds methods to its ref type, and this workspace's package/type resolution treated direct ref casts as incompatible despite matching package type names.

**How to apply:** When a keyboard-aware form also needs imperative scrolling, keep the public ref narrow and adapt at the native boundary; preserve the standard `ScrollView` fallback on web.