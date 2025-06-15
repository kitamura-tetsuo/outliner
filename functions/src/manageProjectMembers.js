const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.manageProjectMembers = functions.https.onRequest(async (req, res) => {
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
    const { idToken, projectId, targetUserId, action, newRole } = req.body;

    if (!idToken || !projectId || !targetUserId || !action) {
      res.status(400).json({ error: 'Missing required fields: idToken, projectId, targetUserId, action.' });
      return;
    }

    if (action === 'updateRole' && !newRole) {
      res.status(400).json({ error: "Missing required field 'newRole' for action 'updateRole'." });
      return;
    }

    if (newRole && !['editor', 'viewer'].includes(newRole)) {
        res.status(400).json({ error: "Invalid newRole. Must be 'editor' or 'viewer'." });
        return;
    }
    if (newRole === 'owner') {
        res.status(400).json({ error: "Cannot assign 'owner' role using this function." });
        return;
    }


    // 1. Authentication & Authorization
    let managerUid;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      managerUid = decodedToken.uid;
    } catch (error) {
      console.error('Error verifying ID token:', error);
      res.status(401).json({ error: 'Unauthorized. Invalid ID token.' });
      return;
    }

    if (managerUid === targetUserId) {
        res.status(400).json({ error: "Cannot manage your own membership using this function. Project owners should manage their roles or project deletion through project settings." });
        return;
    }

    const managerDocRef = db.collection('userContainers').doc(managerUid);
    const managerDoc = await managerDocRef.get();

    if (!managerDoc.exists) {
      console.error(`Manager's userContainer document not found for UID: ${managerUid}`);
      res.status(403).json({ error: 'Permission denied. Manager data not found.' });
      return;
    }

    const managerData = managerDoc.data();
    const managerHasOwnerPermission = managerData.accessibleContainers &&
      managerData.accessibleContainers.some(container => container.id === projectId && container.role === 'owner');

    if (!managerHasOwnerPermission) {
      console.warn(`Manager ${managerUid} does not have owner permission for project ${projectId}.`);
      res.status(403).json({ error: 'Permission denied. You must be an owner of the project to manage its members.' });
      return;
    }

    // 2. Update Target User's Permissions
    const targetUserDocRef = db.collection('userContainers').doc(targetUserId);
    const targetUserDoc = await targetUserDocRef.get();

    if (!targetUserDoc.exists) {
      res.status(404).json({ error: `Target user with ID ${targetUserId} not found.` });
      return;
    }

    const targetUserData = targetUserDoc.data();
    let accessibleContainers = targetUserData.accessibleContainers || [];
    const containerIndex = accessibleContainers.findIndex(c => c.id === projectId);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (action === 'updateRole') {
      if (containerIndex === -1) {
        res.status(404).json({ error: `Project ${projectId} not found in target user's accessible containers. User is not a member.` });
        return;
      }
      if (accessibleContainers[containerIndex].role === 'owner') {
        // This check is an additional safeguard. Owners shouldn't be managed by other owners via this function.
        // Owner management (like transfer or removing last owner) needs a more dedicated process.
        res.status(403).json({ error: "Cannot change the role of an 'owner'. This action requires a different process." });
        return;
      }
      accessibleContainers[containerIndex].role = newRole;
      await targetUserDocRef.update({ accessibleContainers, updatedAt: timestamp });
      console.log(`Role for user ${targetUserId} in project ${projectId} updated to ${newRole} by manager ${managerUid}.`);
      res.status(200).json({ success: true, message: `Role updated successfully to ${newRole}.` });

    } else if (action === 'removeMember') {
      if (containerIndex === -1) {
        // Member not found, arguably this is a success or a no-op.
        console.log(`User ${targetUserId} is already not a member of project ${projectId}. Request by manager ${managerUid}.`);
        res.status(200).json({ success: true, message: 'User is already not a member of this project.' });
        return;
      }

      if (accessibleContainers[containerIndex].role === 'owner') {
        // Similar to update, preventing removal of an owner via this general member management function.
        // Need to check if they are the *sole* owner - this is more complex and might be better handled in a dedicated "delete project" or "transfer ownership" function.
        // For now, prevent removal of any owner.
        const ownersInProject = accessibleContainers.filter(c => c.id === projectId && c.role === 'owner'); // This check is on target user's list, not comprehensive.

        // A more robust check would be to query all userContainers for this projectId and count owners.
        // This is a simplified check for now: if the target is an owner, prevent removal here.
        res.status(403).json({ error: "Cannot remove an 'owner' using this function. Owner removal requires a different process." });
        return;
      }

      accessibleContainers.splice(containerIndex, 1);

      // Check if the removed project was the user's default project.
      // If so, we should clear their defaultContainerId or set it to another available project.
      // For simplicity, just clearing it here. A more sophisticated approach might pick the next available project.
      let defaultContainerIdUpdate = {};
      if (targetUserData.defaultContainerId === projectId) {
        defaultContainerIdUpdate.defaultContainerId = null; // Or pick another, e.g., accessibleContainers[0]?.id || null
         console.log(`User ${targetUserId}'s default project was ${projectId}, which is now removed. Setting default to null.`);
      }

      await targetUserDocRef.update({ accessibleContainers, updatedAt: timestamp, ...defaultContainerIdUpdate });
      console.log(`User ${targetUserId} removed from project ${projectId} by manager ${managerUid}.`);
      res.status(200).json({ success: true, message: 'User removed from project successfully.' });

    } else {
      res.status(400).json({ error: `Invalid action: ${action}. Must be 'updateRole' or 'removeMember'.` });
    }

  } catch (error) {
    console.error('Unexpected error in manageProjectMembers function:', error);
    // Check for specific Firebase error codes if necessary
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});
