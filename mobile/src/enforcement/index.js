import { NativeModules, Platform } from "react-native";

/**
 * Bridge to the platform code that actually blocks the phone.
 *
 * The JavaScript layer decides *whether* the device should be locked (using the
 * same `evaluateDeviceState` the server runs, so the answer is identical online
 * and offline). This module is the thin seam where that decision becomes a
 * platform action — and the two platforms differ a great deal:
 *
 * Android (`GuardianEnforcement` native module, see android/README.md):
 *   - usage detail  : UsageStatsManager, per-app foreground time. Requires the
 *                     PACKAGE_USAGE_STATS special access the parent grants once.
 *   - blocking      : a Device Owner / Device Admin app can call
 *                     DevicePolicyManager.lockNow() and setPackagesSuspended();
 *                     without Device Owner we fall back to a foreground
 *                     accessibility service plus a full-screen overlay.
 *   - allowlist     : suspension skips the dialer and the parent's allowlist.
 *
 * iOS (`GuardianScreenTime` native module, see ios/README.md):
 *   - usage detail  : the Screen Time API deliberately does NOT expose per-app
 *                     names to third parties. Categories and opaque application
 *                     tokens are available inside a DeviceActivityReport
 *                     extension only. The dashboard therefore shows category
 *                     totals on iOS and per-app detail on Android.
 *   - blocking      : ManagedSettingsStore().shield.applications hides apps
 *                     behind a shield screen; this is the supported mechanism.
 *                     It requires the com.apple.developer.family-controls
 *                     entitlement, which Apple grants on request, and the
 *                     child's device must be signed in to a Family Sharing
 *                     child account (or be supervised).
 *   - allowlist     : emergency calling is never blockable, by design.
 *
 * On a simulator, in Expo Go, or before the native module is installed, the
 * fallback below keeps the whole app runnable: the UI, the countdown and the
 * lock screen all work, only the OS-level enforcement is inert. It reports
 * `enforcementAvailable: false` so the app can tell the parent that setup is
 * incomplete rather than silently pretending to protect the phone.
 */
const NOOP_ENFORCEMENT = {
  available: false,
  async requestPermissions() {
    return { granted: false, reason: "native-module-missing" };
  },
  async applyLock() {},
  async releaseLock() {},
  async collectUsage() {
    return [];
  },
};

function nativeEnforcement() {
  if (Platform.OS === "android" && NativeModules.GuardianEnforcement) {
    return NativeModules.GuardianEnforcement;
  }
  if (Platform.OS === "ios" && NativeModules.GuardianScreenTime) {
    return NativeModules.GuardianScreenTime;
  }
  return null;
}

export function createEnforcement() {
  const native = nativeEnforcement();
  if (!native) return NOOP_ENFORCEMENT;

  return {
    available: true,

    /**
     * Android asks for usage-access and (optionally) device-admin; iOS asks for
     * Family Controls authorization. Both are explicit, user-visible grants —
     * there is no silent path, and this app does not want one.
     */
    requestPermissions: () => native.requestPermissions(),

    /**
     * Shows the block. `allowlist` always stays reachable so the child can call
     * home; emergency calling is never blocked on either platform.
     */
    applyLock: ({ reason, allowlist, nextUnlockAtMs }) =>
      native.applyLock({ reason, allowlist, nextUnlockAtMs: nextUnlockAtMs ?? 0 }),

    releaseLock: () => native.releaseLock(),

    /**
     * Foreground segments since `sinceMs`, already shaped like the domain's
     * session record. iOS returns category-level rows with `appId` set to the
     * category token; Android returns real package names.
     */
    collectUsage: (sinceMs) => native.collectUsage(sinceMs),
  };
}
