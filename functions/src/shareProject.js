const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.shareProject = functions.https.onRequest(async (req, res) => {
  // CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { idToken, projectIdToShare, targetUserEmail, roleToAssign } = req.body;

    if (!idToken || !projectIdToShare || !targetUserEmail || !roleToAssign) {
      res.status(400).json({ error: 'Missing required fields.' });
      return;
    }

    if (!['editor', 'viewer'].includes(roleToAssign)) {
        res.status(400).json({ error: "Invalid role. Must be 'editor' or 'viewer'." });
        return;
    }

    // 1. Authentication & Authorization
    let sharerUid;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      sharerUid = decodedToken.uid;
    } catch (error) {
      console.error('Error verifying ID token:', error);
      res.status(401).json({ error: 'Unauthorized. Invalid ID token.' });
      return;
    }

    const sharerDocRef = db.collection('userContainers').doc(sharerUid);
    const sharerDoc = await sharerDocRef.get();

    if (!sharerDoc.exists) {
      console.error(`Sharer's userContainer document not found for UID: ${sharerUid}`);
      res.status(403).json({ error: 'Permission denied. Sharer data not found.' });
      return;
    }

    const sharerData = sharerDoc.data();
    const sharerHasOwnerPermission = sharerData.accessibleContainers &&
      sharerData.accessibleContainers.some(container => container.id === projectIdToShare && container.role === 'owner');

    if (!sharerHasOwnerPermission) {
      console.warn(`Sharer ${sharerUid} does not have owner permission for project ${projectIdToShare}.`);
      res.status(403).json({ error: 'Permission denied. You must be an owner to share this project.' });
      return;
    }

    // 2. Target User Lookup
    let targetUser;
    try {
      targetUser = await admin.auth().getUserByEmail(targetUserEmail);
    } catch (error) {
      console.error(`Error fetching user by email ${targetUserEmail}:`, error);
      if (error.code === 'auth/user-not-found') {
        res.status(404).json({ error: `User with email ${targetUserEmail} not found.` });
      } else {
        res.status(500).json({ error: 'Could not retrieve target user.' });
      }
      return;
    }
    const targetUserId = targetUser.uid;

    if (targetUserId === sharerUid) {
        res.status(400).json({ error: 'Cannot share a project with yourself.' });
        return;
    }

    // 3. Update Target User's Permissions
    const targetUserDocRef = db.collection('userContainers').doc(targetUserId);
    const targetUserDoc = await targetUserDocRef.get();

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (targetUserDoc.exists) {
      const targetUserData = targetUserDoc.data();
      let accessibleContainers = targetUserData.accessibleContainers || [];
      const existingContainerIndex = accessibleContainers.findIndex(c => c.id === projectIdToShare);

      if (existingContainerIndex !== -1) {
        // Project already shared, update role if different
        if (accessibleContainers[existingContainerIndex].role !== roleToAssign) {
            accessibleContainers[existingContainerIndex].role = roleToAssign;
        } else {
            // Role is the same, no update needed, but still a success.
            res.status(200).json({ success: true, message: `Project already shared with ${targetUserEmail} with the role '${roleToAssign}'.` });
            return;
        }
      } else {
        // Add new project to accessibleContainers
        accessibleContainers.push({ id: projectIdToShare, role: roleToAssign });
      }
      await targetUserDocRef.update({ accessibleContainers, updatedAt: timestamp });
      console.log(`Project ${projectIdToShare} shared with ${targetUserEmail} (${targetUserId}) as ${roleToAssign}. Permissions updated.`);
    } else {
      // Target user document does not exist, create it
      await targetUserDocRef.set({
        userId: targetUserId,
        accessibleContainers: [{ id: projectIdToShare, role: roleToAssign }],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      console.log(`Project ${projectIdToShare} shared with new user ${targetUserEmail} (${targetUserId}) as ${roleToAssign}. New userContainer created.`);
    }

    res.status(200).json({ success: true, message: `Project shared successfully with ${targetUserEmail} as ${roleToAssign}.` });

  } catch (error) {
    console.error('Unexpected error in shareProject function:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});
