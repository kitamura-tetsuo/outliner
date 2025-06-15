const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.getProjectMembers = functions.https.onRequest(async (req, res) => {
  // CORS handling - Adjust origin list as needed for your environments
  const allowedOrigins = [
    "http://localhost:7090", // Example: local SvelteKit dev
    "http://localhost:5173", // Example: local Vite dev
    "https://outliner-d57b0.web.app" // Your deployed app
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
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
    const { idToken, projectId } = req.body;

    if (!idToken || !projectId) {
      return res.status(400).json({ error: 'Missing required fields: idToken and projectId.' });
    }

    // 1. Authentication
    let requesterUid;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      requesterUid = decodedToken.uid;
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return res.status(401).json({ error: 'Unauthorized. Invalid ID token.' });
    }

    // 2. Authorization (Requester must be a member of the project)
    const requesterDocRef = db.collection('userContainers').doc(requesterUid);
    const requesterDoc = await requesterDocRef.get();

    if (!requesterDoc.exists) {
      console.warn(`Requester's userContainer document not found for UID: ${requesterUid}`);
      return res.status(403).json({ error: 'Forbidden. Requester data not found.' });
    }

    const requesterData = requesterDoc.data();
    const isRequesterMember = requesterData.accessibleContainers &&
      requesterData.accessibleContainers.some(container => container.id === projectId);

    if (!isRequesterMember) {
      console.warn(`Requester ${requesterUid} is not a member of project ${projectId}.`);
      return res.status(403).json({ error: 'Forbidden. You are not a member of this project.' });
    }

    // 3. Fetch Project Members by querying for each role
    const rolesToQuery = ['owner', 'editor', 'viewer'];
    const memberQueries = rolesToQuery.map(role =>
      db.collection('userContainers').where('accessibleContainers', 'array-contains', { id: projectId, role }).get()
    );

    const snapshotResults = await Promise.all(memberQueries);

    const membersMap = new Map(); // To store unique members with their highest privilege if multiple roles found (should not happen with current design)

    snapshotResults.forEach((snapshot, index) => {
      const role = rolesToQuery[index];
      snapshot.forEach(doc => {
        const userData = doc.data();
        if (userData && doc.id) { // doc.id is the userId
          // If user already added, ensure we don't overwrite with a lesser role (though ideally one user has one entry per project)
          if (!membersMap.has(doc.id) || (membersMap.has(doc.id) && rolesToQuery.indexOf(membersMap.get(doc.id).role) > rolesToQuery.indexOf(role))) {
             membersMap.set(doc.id, { id: doc.id, role });
          }
        }
      });
    });

    if (membersMap.size === 0) {
      return res.status(200).json({ members: [] }); // No members found for this project
    }

    // 4. Retrieve User Details (email)
    const memberListPromises = Array.from(membersMap.values()).map(async (member) => {
      try {
        const userRecord = await admin.auth().getUser(member.id);
        return {
          id: member.id,
          email: userRecord.email || 'No email provided',
          role: member.role,
          displayName: userRecord.displayName || null, // Optional: include displayName
        };
      } catch (error) {
        console.error(`Error fetching user details for UID ${member.id}:`, error);
        // Return member with ID and role even if Auth details fail, or filter them out
        return {
          id: member.id,
          email: 'Error fetching email',
          role: member.role,
          displayName: null,
        };
      }
    });

    const membersWithDetails = await Promise.all(memberListPromises);

    return res.status(200).json({ members: membersWithDetails });

  } catch (error) {
    console.error('Unexpected error in getProjectMembers function:', error);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
});
