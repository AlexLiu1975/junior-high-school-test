import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { createGuardianClient } from "./src/guardianClient.js";
import { createEnforcement } from "./src/enforcement/index.js";
import HomeScreen from "./src/screens/HomeScreen.jsx";
import LockScreen from "./src/screens/LockScreen.jsx";
import PairingScreen from "./src/screens/PairingScreen.jsx";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const TICK_INTERVAL_MS = 15 * 1000;

/**
 * Child app shell.
 *
 * Two loops run side by side:
 *   - a slow sync (every 5 minutes, and whenever the app comes to the
 *     foreground) that uploads usage and picks up parent commands;
 *   - a fast local tick (every 15 seconds) that re-evaluates the cached policy
 *     so the countdown is honest and the lock lands on time even with no
 *     network.
 */
export default function App() {
  const client = useMemo(() => createGuardianClient(), []);
  const enforcement = useMemo(() => createEnforcement(), []);
  const [ready, setReady] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [state, setState] = useState(null);
  const [usage, setUsage] = useState(null);
  const [requests, setRequests] = useState([]);
  const [timeZone, setTimeZone] = useState("Asia/Taipei");
  const [syncing, setSyncing] = useState(false);
  const [offlineSince, setOfflineSince] = useState(null);
  const lastCollectedMs = useRef(Date.now());
  const appliedLock = useRef(null);

  const evaluate = useCallback(async () => {
    const next = await client.currentState();
    setState(next);
    return next;
  }, [client]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const sessions = enforcement.available
        ? await enforcement.collectUsage(lastCollectedMs.current)
        : [];
      lastCollectedMs.current = Date.now();
      const result = await client.sync({
        sessions,
        platform: Platform.OS,
        appVersion: "1.0.0",
      });
      setState(result.state);
      setUsage(result.usage);
      setRequests(result.requests ?? []);
      setTimeZone(result.policy?.timeZone ?? "Asia/Taipei");
      setOfflineSince(null);
    } catch {
      // Offline is expected and safe: the cached policy still governs.
      setOfflineSince((current) => current ?? Date.now());
      await evaluate();
    } finally {
      setSyncing(false);
    }
  }, [client, enforcement, evaluate]);

  useEffect(() => {
    (async () => {
      const isEnrolled = await client.isEnrolled();
      setEnrolled(isEnrolled);
      if (isEnrolled) {
        const cached = await client.cached();
        setUsage(cached?.usage ?? null);
        setRequests(cached?.requests ?? []);
        setTimeZone(cached?.policy?.timeZone ?? "Asia/Taipei");
        await sync();
      }
      setReady(true);
    })();
  }, [client, sync]);

  // Fast tick: keep the verdict current between syncs.
  useEffect(() => {
    if (!enrolled) return undefined;
    const timer = setInterval(evaluate, TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enrolled, evaluate]);

  // Slow sync, plus an immediate one on foreground.
  useEffect(() => {
    if (!enrolled) return undefined;
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") sync();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [enrolled, sync]);

  // Push the verdict into the OS only when it actually changes.
  useEffect(() => {
    if (!state || !enforcement.available) return;
    const signature = `${state.locked}:${state.reason}`;
    if (appliedLock.current === signature) return;
    appliedLock.current = signature;
    if (state.locked) {
      enforcement.applyLock({
        reason: state.reason,
        allowlist: state.allowlist ?? [],
        nextUnlockAtMs: state.nextUnlockAtMs,
      });
    } else {
      enforcement.releaseLock();
    }
  }, [state, enforcement]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.muted}>載入中…</Text>
      </SafeAreaView>
    );
  }

  if (!enrolled) {
    return (
      <SafeAreaView style={styles.flex}>
        <PairingScreen
          client={client}
          enforcement={enforcement}
          onPaired={async () => { setEnrolled(true); await sync(); }}
        />
      </SafeAreaView>
    );
  }

  const pendingRequest = requests.find((request) => request.status === "pending") ?? null;
  const requestExtension = ({ minutes, reason }) =>
    client.requestExtension({ minutes, reason }).then(async (result) => {
      setRequests((current) => [...current, result.request]);
      return result;
    });

  return (
    <SafeAreaView style={styles.flex}>
      {!enforcement.available ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            尚未完成手機權限設定，時間到時無法真正鎖定。請家長協助完成設定。
          </Text>
        </View>
      ) : null}
      {offlineSince ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>目前離線，仍會依照已同步的規則管制。</Text>
        </View>
      ) : null}

      {state?.locked ? (
        <LockScreen
          state={state}
          timeZone={timeZone}
          pendingRequest={pendingRequest}
          onRequestExtension={requestExtension}
        />
      ) : (
        <HomeScreen
          state={state}
          usage={usage}
          timeZone={timeZone}
          syncing={syncing}
          pendingRequest={pendingRequest}
          onRefresh={sync}
          onRequestExtension={requestExtension}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f8fafc" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  muted: { color: "#64748b", fontSize: 15 },
  banner: { backgroundColor: "#fef3c7", padding: 12 },
  bannerText: { color: "#92400e", fontSize: 13, lineHeight: 19 },
  offlineBanner: { backgroundColor: "#e2e8f0", padding: 8 },
  offlineText: { color: "#475569", fontSize: 12, textAlign: "center" },
});
