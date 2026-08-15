import { splitByLocalDay } from "../domain/usage.js";

/**
 * Firestore layout (all family data lives under one document so security rules
 * and offline-safe reads stay simple):
 *
 *   guardianFamilies/{familyId}
 *     children/{childId}
 *     policies/{childId}
 *     devices/{deviceId}
 *     usage/{childId}_{dateKey}      -> { childId, dateKey, sessions: [...] }
 *     requests/{requestId}
 *     commands/{commandId}
 *     audit/{autoId}
 *     outbox/{autoId}                -> parent push notifications
 */
export function createFirestoreRepository(db) {
  const familyRef = (familyId) => db.collection("guardianFamilies").doc(familyId);
  const usageId = (childId, dateKey) => `${childId}_${dateKey}`;

  async function documentData(reference) {
    const snapshot = await reference.get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async function collectionData(query) {
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  return {
    async loadFamily(familyId) {
      return documentData(familyRef(familyId));
    },
    async saveFamily(familyId, family) {
      await familyRef(familyId).set(family, { merge: true });
    },
    async loadChildren(familyId) {
      return collectionData(familyRef(familyId).collection("children").orderBy("childId"));
    },
    async saveChild(familyId, child) {
      await familyRef(familyId).collection("children").doc(child.childId).set(child, { merge: true });
    },
    async loadPolicy(familyId, childId) {
      return documentData(familyRef(familyId).collection("policies").doc(childId));
    },
    async savePolicy(familyId, childId, policy) {
      await familyRef(familyId).collection("policies").doc(childId).set(policy);
    },
    async loadDevice(familyId, deviceId) {
      return documentData(familyRef(familyId).collection("devices").doc(deviceId));
    },
    async saveDevice(familyId, deviceId, device) {
      await familyRef(familyId).collection("devices").doc(deviceId).set(
        { ...device, deviceId, familyId },
        { merge: true },
      );
    },
    async loadDevicesForChild(familyId, childId) {
      return collectionData(
        familyRef(familyId).collection("devices").where("childId", "==", childId),
      );
    },

    /**
     * Usage is stored one document per child-day. Appending is a transaction so
     * two devices (or a retrying device) cannot clobber each other's segments;
     * duplicates are harmless because screen time is computed as a union.
     */
    async appendSessions(familyId, childId, normalizedSessions, timeZone) {
      const slices = splitByLocalDay(normalizedSessions, timeZone);
      const byDate = new Map();
      for (const slice of slices) {
        const bucket = byDate.get(slice.dateKey) ?? [];
        bucket.push({
          appId: slice.appId,
          appName: slice.appName,
          category: slice.category,
          startMs: slice.startMs,
          endMs: slice.endMs,
        });
        byDate.set(slice.dateKey, bucket);
      }
      for (const [dateKey, additions] of byDate) {
        const reference = familyRef(familyId).collection("usage").doc(usageId(childId, dateKey));
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(reference);
          const existing = snapshot.exists ? (snapshot.data().sessions ?? []) : [];
          const merged = [...existing, ...additions]
            .sort((left, right) => left.startMs - right.startMs);
          transaction.set(reference, { childId, dateKey, sessions: merged }, { merge: true });
        });
      }
    },
    async loadSessions(familyId, childId, dateKeys) {
      const documents = await Promise.all(dateKeys.map((dateKey) =>
        documentData(familyRef(familyId).collection("usage").doc(usageId(childId, dateKey)))));
      return documents.flatMap((document) => document?.sessions ?? []);
    },

    async loadCommand(familyId, commandId) {
      return documentData(familyRef(familyId).collection("commands").doc(commandId));
    },
    async saveCommand(familyId, command) {
      await familyRef(familyId).collection("commands").doc(command.commandId).set(command);
    },
    async loadPendingCommands(familyId, deviceId) {
      return collectionData(
        familyRef(familyId).collection("commands")
          .where("deviceId", "==", deviceId)
          .where("status", "==", "pending"),
      );
    },
    async loadRecentCommands(familyId, limit) {
      return collectionData(
        familyRef(familyId).collection("commands").orderBy("issuedAtMs", "desc").limit(limit),
      );
    },

    async loadRequest(familyId, requestId) {
      return documentData(familyRef(familyId).collection("requests").doc(requestId));
    },
    async saveRequest(familyId, request) {
      await familyRef(familyId).collection("requests").doc(request.requestId).set(request);
    },
    async loadRequests(familyId, childId, dateKeys) {
      if (dateKeys.length === 0) return [];
      // Firestore caps `in` filters at 30 values; MAX_HISTORY_DAYS stays under it.
      return collectionData(
        familyRef(familyId).collection("requests")
          .where("childId", "==", childId)
          .where("dateKey", "in", dateKeys.slice(0, 30)),
      );
    },

    /**
     * Pairing codes live in a top-level collection because the child's device
     * redeems one before it knows which family it belongs to.
     */
    async loadPairing(code) {
      return documentData(db.collection("guardianPairings").doc(code));
    },
    async savePairing(pairing) {
      await db.collection("guardianPairings").doc(pairing.code).set(pairing);
    },

    async appendAudit(familyId, entry) {
      await familyRef(familyId).collection("audit").add(entry);
    },
    async notifyParents(familyId, notification) {
      // A Firestore trigger fans this out to the parents' push tokens.
      await familyRef(familyId).collection("outbox").add(notification);
    },
  };
}
