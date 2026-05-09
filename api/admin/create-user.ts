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
    console.log('Verifying token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;
    console.log('Requester UID:', requesterUid);

    const requesterDoc = await db.collection('users').doc(requesterUid).get();
    if (!requesterDoc.exists) {
      console.warn('Requester profile not found in Firestore:', requesterUid);
      return res.status(403).json({ error: 'Forbidden: Admin profile not found' });
    }

    const requesterData = requesterDoc.data();
    if (requesterData?.role !== 'admin') {
      console.warn('Requester is not an admin. Role:', requesterData?.role);
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // Create user
    console.log('Creating user in Auth:', email);
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });

    console.log('User created in Auth:', userRecord.uid);

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

    console.log('Firestore document created for:', userRecord.uid);
    return res.status(200).json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    console.error('CRITICAL Error in create-user API:', error);
    // If it's a firebase-admin error, it might have a code
    const message = error.message || 'Internal Server Error';
    const code = error.code || 'unknown-error';
    return res.status(500).json({ error: message, code });
  }
}
