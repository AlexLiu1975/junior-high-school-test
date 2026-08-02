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

    createAttempt(attemptId, value, transaction) {
      transaction.create(db.collection("quizAttempts").doc(attemptId), value);
      return Promise.resolve();
    },

    createPrivateAttempt(attemptId, value, transaction) {
      transaction.create(db.collection("attemptPrivate").doc(attemptId), value);
      return Promise.resolve();
    },

    runTransaction(callback) {
      return db.runTransaction(callback);
    },
  };
}
