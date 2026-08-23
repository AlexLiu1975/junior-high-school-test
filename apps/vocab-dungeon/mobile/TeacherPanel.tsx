import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { C, styles, type TeacherClass, type TeacherStudent, type User } from "./mobile-ui";

type Props = {
  user: User;
  busy: boolean;
  teacherClasses: TeacherClass[];
  selectedStudent: TeacherStudent | null;
  setSelectedStudent: (student: TeacherStudent | null) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
  joinMessage: string;
  join: () => void;
  classNameInput: string;
  setClassNameInput: (value: string) => void;
  createClassroom: () => void;
  rotateJoinCode: (classroomId: number) => void;
  toggleClassroom: (classroomId: number, isActive: boolean) => void;
};

export default function TeacherPanel({ user, busy, teacherClasses, selectedStudent, setSelectedStudent, joinCode, setJoinCode, joinMessage, join, classNameInput, setClassNameInput, createClassroom, rotateJoinCode, toggleClassroom }: Props) {
  if (user.role === "student") {
    return <View style={styles.questCard}>
      <Text style={styles.kicker}>STUDENT GATE</Text>
      <Text style={styles.sectionTitle}>加入老師的班級</Text>
      <Text style={styles.body}>輸入班級加入碼，答題紀錄就會歸入班級統計。</Text>
      <TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase())} placeholder="班級加入碼" placeholderTextColor={C.muted} style={styles.input} autoCapitalize="characters" />
      <Pressable onPress={join} disabled={busy || joinCode.length < 4} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? "加入中…" : "加入班級"}</Text></Pressable>
      {joinMessage ? <Text style={styles.example}>{joinMessage}</Text> : null}
    </View>;
  }

  const isSystemAdmin = user.role === "system_admin";
  return <View>
    <Text style={styles.kicker}>{isSystemAdmin ? "SYSTEM ADMIN COMMAND" : "TEACHER COMMAND CENTER"}</Text>
    <Text style={styles.titleSmall}>{isSystemAdmin ? "全域班級管理" : "班級學習雷達"}</Text>
    <Text style={styles.body}>{isSystemAdmin ? "系統管理員可查看所有班級；老師只能管理自己建立的班級。" : "建立班級並分享加入碼，查看答題次數、正確率與待複習單字。"}</Text>
    {!isSystemAdmin && <View style={styles.createClassBox}><TextInput value={classNameInput} onChangeText={setClassNameInput} placeholder="例如：八年級英文 A 班" placeholderTextColor={C.muted} style={styles.input} /><Pressable onPress={createClassroom} disabled={busy || !classNameInput.trim()} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? "建立中…" : "建立班級"}</Text></Pressable></View>}
    {teacherClasses.length === 0 ? <View style={styles.empty}><Text style={styles.body}>{isSystemAdmin ? "目前尚無班級。" : "尚未建立班級，請先輸入班級名稱。"}</Text></View> : <FlatList data={teacherClasses} keyExtractor={(item) => String(item.classroom.id)} scrollEnabled={false} renderItem={({ item }) => <View style={styles.classCard}>
      <View style={styles.classHeader}><View><Text style={styles.sectionTitle}>{item.classroom.name}</Text><Text style={styles.muted}>加入碼：{item.classroom.joinCode}</Text><Text style={styles.muted}>{item.classroom.isActive === false ? "已停用" : "使用中"}</Text></View><Text style={styles.badge}>{item.students.length} 位學生</Text></View>
      <View style={styles.classActions}><Pressable onPress={() => rotateJoinCode(item.classroom.id)} style={styles.secondaryButton}><Text style={styles.secondaryText}>重設加入碼</Text></Pressable><Pressable onPress={() => toggleClassroom(item.classroom.id, item.classroom.isActive === false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{item.classroom.isActive === false ? "重新啟用" : "停用班級"}</Text></Pressable></View>
      <View style={styles.metrics}><Text style={styles.metric}>{item.totalAttempts} <Text style={styles.metricLabel}>次答題</Text></Text><Text style={styles.metric}>{item.totalAttempts ? Math.round((item.totalCorrect / item.totalAttempts) * 100) : 0}% <Text style={styles.metricLabel}>正確率</Text></Text></View>
      {item.students.map((student) => <Pressable key={student.student.id} onPress={() => setSelectedStudent(student)} style={styles.studentRow}><Text style={styles.studentName}>{student.student.name || student.student.email || `學生 #${student.student.id}`}</Text><Text style={styles.muted}>{student.attempts} 次・{student.accuracy}%・待複習 {student.dueWords}</Text></Pressable>)}
    </View>} />}
    {selectedStudent ? <View style={styles.detail}><Text style={styles.kicker}>STUDENT DOSSIER</Text><Text style={styles.sectionTitle}>{selectedStudent.student.name || selectedStudent.student.email || "個別學生"}</Text><Text style={styles.body}>{selectedStudent.attempts} 次作答・{selectedStudent.accuracy}% 正確率・{selectedStudent.dueWords} 個待複習</Text><FlatList data={selectedStudent.performance} keyExtractor={(item) => String(item.wordId)} scrollEnabled={false} renderItem={({ item }) => <View style={[styles.performance, item.due && styles.performanceDue]}><Text style={styles.studentName}>{item.english || "—"}</Text><Text style={styles.muted}>{item.chinese || "—"}・{item.attempts} 次・{item.accuracy}%・{item.due ? "今日複習" : item.nextReviewAt ? `下次 ${new Date(item.nextReviewAt).toLocaleDateString()}` : "待作答"}</Text></View>} /></View> : null}
  </View>;
}
