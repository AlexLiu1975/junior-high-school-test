import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const REASONS = {
  "manual-lock": {
    title: "家長暫時鎖住了手機",
    body: "等家長解除後就可以再使用。",
  },
  "bedtime": {
    title: "現在是睡覺時間",
    body: "明天早上時間到了會自動解鎖。",
  },
  "outside-window": {
    title: "現在不是可以使用的時間",
    body: "下一個可以使用的時間到了會自動解鎖。",
  },
  "quota-exhausted": {
    title: "今天的時間用完了",
    body: "明天會重新計算，也可以向家長申請延長。",
  },
};

function formatClock(instantMs, timeZone) {
  if (typeof instantMs !== "number") return null;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instantMs));
}

/**
 * Shown in-app whenever the verdict is locked. On Android this screen is also
 * what the overlay service presents on top of other apps; on iOS the OS shield
 * covers blocked apps and this screen explains why.
 *
 * It always states the reason and the time the phone comes back — a lock the
 * child cannot understand is one they will try to defeat.
 */
export default function LockScreen({ state, timeZone, onRequestExtension, pendingRequest }) {
  const [sent, setSent] = useState(false);
  const copy = REASONS[state?.reason] ?? {
    title: "手機目前無法使用",
    body: "請向家長確認設定。",
  };
  const unlockAt = formatClock(state?.nextUnlockAtMs, timeZone);
  const canAsk = state?.reason === "quota-exhausted" || state?.reason === "outside-window";

  return (
    <View style={styles.container}>
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>

      {unlockAt ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{unlockAt} 解鎖</Text>
        </View>
      ) : null}

      <Text style={styles.allowlist}>
        緊急電話隨時可以撥打
        {state?.allowlist?.length > 0 ? "，家長允許的 App 也還能使用" : ""}。
      </Text>

      {pendingRequest ? (
        <Text style={styles.pending}>已送出延長申請，等家長回覆中。</Text>
      ) : canAsk ? (
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            await onRequestExtension({ minutes: 30, reason: "" });
            setSent(true);
          }}
          disabled={sent}
        >
          <Text style={styles.buttonText}>{sent ? "已送出申請" : "向家長申請延長 30 分鐘"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  lockIcon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", color: "#ffffff", textAlign: "center" },
  body: { fontSize: 15, color: "#cbd5e1", textAlign: "center", marginTop: 10, lineHeight: 22 },
  pill: {
    marginTop: 24,
    backgroundColor: "#1e293b",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  pillText: { color: "#7dd3fc", fontSize: 16, fontWeight: "700" },
  allowlist: { marginTop: 28, fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 20 },
  pending: { marginTop: 24, fontSize: 14, color: "#fcd34d" },
  button: {
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#38bdf8",
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: { color: "#7dd3fc", fontSize: 15, fontWeight: "700" },
});
