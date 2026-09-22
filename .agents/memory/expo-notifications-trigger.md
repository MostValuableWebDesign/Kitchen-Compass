---
name: Expo notification trigger compatibility
description: Expo SDK 57 notification scheduling uses the daily trigger enum at the native adapter boundary.
---

The notification abstraction can use a small test-friendly daily trigger shape, but the Expo SDK 57 adapter must translate it to `SchedulableTriggerInputTypes.DAILY`; the native daily trigger does not accept a `repeats` property.

**Why:** Expo SDK 57 tightened notification trigger types, so passing the older shorthand shape causes type errors and can conceal device-specific scheduling differences.

**How to apply:** Keep permission and scheduling logic injectable for tests, and convert the abstraction's trigger to the Expo-native shape only in the adapter.