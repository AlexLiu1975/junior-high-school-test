import { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

/**
 * First run on the child's phone. The code is read aloud from the parent's
 * dashboard, so enrollment always involves both people — there is no way to
 * attach this phone to a family without the parent acting.
 */
export default function PairingScreen({ client, enforcement, onPaired }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await client.enroll({
        code: code.trim(),
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceName: Platform.OS === "ios" ? "iPhone" : "Android 手機",
      });
      if (enforcement.available) await enforcement.requestPermissions();
      await client.sync({ platform: Platform.OS });
      onPaired();
    } catch (enrollError) {
      const raw = enrollError?.message ?? "";
      if (raw.includes("expired")) setError("配對碼已過期，請家長重新產生。");
      else if (raw.includes("used")) setError("這個配對碼已經被使用過了。");
      else setError("配對碼不正確，請再確認一次。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>連結家長的帳號</Text>
      <Text style={styles.body}>
        請家長在「守護時間」家長後台按下「產生配對碼」，然後把 6 位數字告訴你。
      </Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        placeholder="000000"
        maxLength={6}
        accessibilityLabel="配對碼"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, (busy || code.length !== 6) && styles.buttonDisabled]}
        disabled={busy || code.length !== 6}
        onPress={submit}
      >
        <Text style={styles.buttonText}>{busy ? "連結中…" : "完成連結"}</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        連結後，這支手機的使用時間會依家長設定的時段自動鎖定，使用時間統計也會顯示在家長後台。
        緊急電話和家長允許的 App 不會被鎖住。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#f8fafc" },
  title: { fontSize: 24, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  body: { fontSize: 15, color: "#475569", lineHeight: 22, marginBottom: 24 },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    fontSize: 32,
    letterSpacing: 12,
    textAlign: "center",
    paddingVertical: 14,
  },
  error: { color: "#b91c1c", marginTop: 12, fontSize: 14 },
  button: {
    marginTop: 20,
    backgroundColor: "#0369a1",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  note: { marginTop: 24, fontSize: 13, color: "#64748b", lineHeight: 20 },
});
