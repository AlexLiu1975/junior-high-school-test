import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { evaluateDeviceState } from "../../guardian/domain/policy.js";
import { normalizePolicy } from "../../guardian/domain/schedule.js";
import { firebaseConfig, functionsRegion } from "./config.js";

const STORAGE_KEY = "guardian.device.state.v1";

/**
 * The child's device client.
 *
 * Design rule: the phone must behave correctly with no network. Every sync
 * stores the policy and the last verdict, and `currentState()` re-evaluates
 * that stored policy locally with the same domain code the server uses. Losing
 * connectivity therefore freezes the rules in place — it never unlocks the
 * phone.
 */
export function createGuardianClient() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const functions = getFunctions(app, functionsRegion);
  const call = (name) => httpsCallable(functions, name);

  const callers = {
    enroll: call("guardianEnrollDevice"),
    sync: call("guardianSync"),
    confirm: call("guardianConfirmCommand"),
    requestExtension: call("guardianRequestExtension"),
  };

  let cache = null;

  async function loadCache() {
    if (cache) return cache;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : null;
    return cache;
  }

  async function saveCache(next) {
    cache = next;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return {
    async isEnrolled() {
      return (await loadCache()) !== null;
    },

    /** Redeems the pairing code the parent read off the dashboard. */
    async enroll({ code, platform, deviceName }) {
      const result = await callers.enroll({ code, platform, deviceName });
      await signInWithCustomToken(auth, result.data.token);
      await saveCache({
        familyId: result.data.familyId,
        childId: result.data.childId,
        deviceId: result.data.deviceId,
        policy: null,
        state: null,
        lastSyncMs: null,
        pendingSessions: [],
      });
      return result.data;
    },

    /**
     * Uploads buffered usage and refreshes policy, verdict and commands. Any
     * sessions that fail to upload stay buffered for the next attempt, so a
     * flight-mode afternoon is still counted once the phone reconnects.
     */
    async sync({ sessions = [], platform, appVersion } = {}) {
      const stored = await loadCache();
      if (!stored) throw new Error("device-not-enrolled");
      const pending = [...(stored.pendingSessions ?? []), ...sessions];

      try {
        const result = await callers.sync({ sessions: pending, platform, appVersion });
        const data = result.data;
        for (const command of data.commands ?? []) {
          await callers.confirm({ commandId: command.commandId });
        }
        await saveCache({
          ...stored,
          policy: data.policy,
          state: data.state,
          usage: data.usage,
          override: data.override ?? null,
          requests: data.requests ?? [],
          lastSyncMs: Date.now(),
          pendingSessions: [],
        });
        return data;
      } catch (error) {
        await saveCache({ ...stored, pendingSessions: pending });
        throw error;
      }
    },

    /**
     * The verdict right now, computed locally. Falls back to the last synced
     * verdict only when no policy has ever been received.
     */
    async currentState({ extraUsedMinutes = 0, nowMs = Date.now() } = {}) {
      const stored = await loadCache();
      if (!stored?.policy) return stored?.state ?? null;
      return evaluateDeviceState({
        policy: normalizePolicy(stored.policy),
        usedMinutes: (stored.usage?.totalMinutes ?? 0) + extraUsedMinutes,
        bonusMinutes: stored.state?.bonusMinutes ?? 0,
        override: stored.override ?? null,
        nowMs,
      });
    },

    async requestExtension({ minutes, reason }) {
      const result = await callers.requestExtension({ minutes, reason });
      return result.data;
    },

    async cached() {
      return loadCache();
    },
  };
}
