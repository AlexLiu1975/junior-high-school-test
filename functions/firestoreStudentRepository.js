import { requireStudentIdentity } from "./studentIdentity.js";

function identityDb(db, transaction) {
  if (!transaction) return db;
  return {
    collection(collectionName) {
      const collection = db.collection(collectionName);
      return {
        doc(documentId) {
          const document = collection.doc(documentId);
          return {
            collection(childCollectionName) {
              const childCollection = document.collection(childCollectionName);
              return {
                doc(childDocumentId) {
                  const childDocument = childCollection.doc(childDocumentId);
                  return { get: () => transaction.get(childDocument) };
                },
              };
            },
          };
        },
      };
    },
  };
}

function progressRef(db, studentId, quizId) {
  return db.collection("studentProgress").doc(studentId).collection("quizzes").doc(quizId);
}

async function read(ref, transaction) {
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  return snapshot.exists ? snapshot.data() : null;
}

export function createFirestoreStudentRepository(db) {
  return {
    resolveStudent(input, transaction) {
      return requireStudentIdentity(identityDb(db, transaction), input);
    },

    getProgress(studentId, quizId, transaction) {
      return read(progressRef(db, studentId, quizId), transaction);
    },

    setProgress(studentId, quizId, value, transaction) {
      const ref = progressRef(db, studentId, quizId);
      if (transaction) {
        transaction.set(ref, value);
        return Promise.resolve();
      }
      return ref.set(value);
    },

    getAttempt(attemptId, transaction) {
      return read(db.collection("quizAttempts").doc(attemptId), transaction);
    },

    createAttemptRecords(attemptId, publicValue, privateValue, transaction) {
      transaction.create(db.collection("quizAttempts").doc(attemptId), publicValue);
      transaction.create(db.collection("attemptPrivate").doc(attemptId), privateValue);
      return Promise.resolve();
    },

    runTransaction(callback) {
      return db.runTransaction(callback);
    },

    runAdminStudentTransaction(studentId, callback) {
      return db.runTransaction(async (transaction) => {
        const studentRef = db.collection("students").doc(studentId);
        const studentSnapshot = await transaction.get(studentRef);
        const student = studentSnapshot.exists
          ? { id: studentSnapshot.id, ...studentSnapshot.data() }
          : null;
        if (!student) {
          return callback({ getStudent: () => null });
        }

        const attemptQuery = db.collection("quizAttempts").where("studentId", "==", studentId);
        const progressCollection = db.collection("studentProgress").doc(studentId).collection("quizzes");
        const parentAccessQuery = db.collection("viewerAccess").where("studentIds", "array-contains", studentId);
        const [attemptSnapshot, progressSnapshot, parentAccessSnapshot] = await Promise.all([
          transaction.get(attemptQuery),
          transaction.get(progressCollection),
          transaction.get(parentAccessQuery),
        ]);
        const attempts = attemptSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        const progress = progressSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        const entryRef = db.collection("studentEntries").doc(student.code).collection("names").doc(student.name);
        const adminLinkRef = student.ownerUid
          ? db.collection("adminStudentLinks").doc(student.ownerUid).collection("students").doc(studentId)
          : null;

        return callback({
          getStudent: () => student,
          listAttempts: () => attempts,
          listProgress: () => progress,
          deactivate({ progress: nextProgress }) {
            transaction.update(studentRef, { active: false });
            transaction.update(entryRef, { active: false });
            for (const item of nextProgress) {
              const { id, ...value } = item;
              transaction.set(progressCollection.doc(id), value);
            }
          },
          deleteExact() {
            transaction.delete(studentRef);
            transaction.delete(entryRef);
            for (const item of progressSnapshot.docs) transaction.delete(item.ref);
            if (adminLinkRef) transaction.delete(adminLinkRef);
            for (const accessDocument of parentAccessSnapshot.docs) {
              const access = accessDocument.data();
              const remainingStudentIds = (access.studentIds ?? [])
                .filter((linkedStudentId) => linkedStudentId !== studentId);
              if (access.role === "parent" && remainingStudentIds.length === 0) {
                transaction.delete(accessDocument.ref);
              } else {
                transaction.update(accessDocument.ref, { studentIds: remainingStudentIds });
              }
            }
          },
        });
      });
    },
  };
}
