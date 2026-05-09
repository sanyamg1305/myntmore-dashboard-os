import { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

// Initialize Firebase Admin (Singleton pattern)
if (!admin.apps.length) {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error('Failed to parse service account:', e);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  console.log('POST /api/admin/create-user - Request received');
  const { email, password, displayName, role, department, clientIds } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // Verify requester
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const requesterDoc = await db.collection('users').doc(requesterUid).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // Create user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });

    // Save to Firestore
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role: role || 'member',
      department: department || 'content',
      assignedClients: clientIds || [],
      inviteStatus: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    console.error('Error in create-user API:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
