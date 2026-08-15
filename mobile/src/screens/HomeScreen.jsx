import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const REASON_LIMIT = 200;
const MINUTE_CHOICES = [10, 15, 30, 60];

function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} 分鐘`;
  if (rest === 0) return `${hours} 小時`;
  return `${hours} 小時 ${rest} 分`;
}

function formatClock(instantMs, timeZone) {
  if (typeof instantMs !== "number") return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instantMs));
}

/**
 * What the child sees when the phone is usable: how long is left, when it will
 * lock, and the one action they have — asking for more time. Showing the same
 * numbers the parent sees is deliberate; a countdown the child can check is
 * what makes the lock feel like a rule rather than an ambush.
 */
export default function HomeScreen({ state, usage, pendingRequest, timeZone, onRequestExtension, onRefresh, syncing }) {
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      await onRequestExtension({ minutes, reason: reason.trim() });
      setSent(true);
      setReason("");
    } catch (requestError) {
      const raw = requestError?.message ?? "";
      setError(raw.includes("too-many")
        ? "已經有太多待處理的申請了，等家長回覆再試。"
        : "送出失敗，請稍後再試。");
    }
  };

  const remaining = state?.remainingMinutes ?? 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>今天還可以用</Text>
      <Text style={styles.remaining}>{formatMinutes(remaining)}</Text>
      {state?.lockAtMs ? (
        <Text style={styles.subtitle}>{formatClock(state.lockAtMs, timeZone)} 會自動鎖定</Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>今天的使用狀況</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>已使用</Text>
          <Text style={styles.rowValue}>{formatMinutes(usage?.totalMinutes ?? 0)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>今日上限</Text>
          <Text style={styles.rowValue}>{formatMinutes(state?.quotaMinutes ?? 0)}</Text>
        </View>
        {state?.bonusMinutes > 0 ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>家長加時</Text>
            <Text style={styles.rowValue}>+{formatMinutes(state.bonusMinutes)}</Text>
          </View>
        ) : null}
      </View>

      {pendingRequest ? (
        <View style={[styles.card, styles.pendingCard]}>
          <Text style={styles.cardTitle}>已送出申請</Text>
          <Text style={styles.body}>
            你申請延長 {formatMinutes(pendingRequest.minutes)}，等家長回覆中。
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>想要多一點時間？</Text>
          <Text style={styles.body}>告訴家長原因，他們可以直接在手機上同意。</Text>

          <View style={styles.chipRow}>
            {MINUTE_CHOICES.map((choice) => (
              <TouchableOpacity
                key={choice}
                style={[styles.chip, minutes === choice && styles.chipActive]}
                onPress={() => setMinutes(choice)}
              >
                <Text style={[styles.chipText, minutes === choice && styles.chipTextActive]}>
                  {choice} 分鐘
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={(value) => setReason(value.slice(0, REASON_LIMIT))}
            placeholder="例如：作業的影片還沒看完"
            multiline
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {sent ? <Text style={styles.sent}>已送出，等家長回覆。</Text> : null}

          <TouchableOpacity style={styles.button} onPress={submit}>
            <Text style={styles.buttonText}>送出申請</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.refresh} onPress={onRefresh} disabled={syncing}>
        <Text style={styles.refreshText}>{syncing ? "更新中…" : "重新整理"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 24 },
  heading: { fontSize: 15, color: "#64748b" },
  remaining: { fontSize: 44, fontWeight: "800", color: "#0f172a", marginTop: 4 },
  subtitle: { fontSize: 15, color: "#0369a1", marginTop: 4 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pendingCard: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 10 },
  body: { fontSize: 14, color: "#475569", lineHeight: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: "#64748b" },
  rowValue: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  chipText: { fontSize: 14, color: "#475569" },
  chipTextActive: { color: "#ffffff", fontWeight: "700" },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    textAlignVertical: "top",
    fontSize: 14,
  },
  error: { color: "#b91c1c", marginTop: 10, fontSize: 13 },
  sent: { color: "#047857", marginTop: 10, fontSize: 13 },
  button: {
    marginTop: 14,
    backgroundColor: "#0369a1",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  refresh: { marginTop: 24, alignItems: "center" },
  refreshText: { color: "#0369a1", fontSize: 14, fontWeight: "600" },
});
