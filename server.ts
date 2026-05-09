import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
// This expects FIREBASE_SERVICE_ACCOUNT to be a JSON string of the service account key
const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
if (serviceAccountVar) {
  try {
    const serviceAccount = JSON.parse(serviceAccountVar);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin initialized with service account");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
    admin.initializeApp();
  }
} else {
  // Fallback to default if available or just empty init (might fail if not in GCP)
  admin.initializeApp();
  console.log("Firebase Admin initialized with default credentials");
}

const db = admin.firestore();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Route: Create User (Admin Only)
  app.post("/api/admin/create-user", async (req, res) => {
    const { email, password, displayName, role, department, clientIds } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const idToken = authHeader.split("Bearer ")[1];

    try {
      // Verify the requester's token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const requesterUid = decodedToken.uid;

      // Check if the requester is an admin in Firestore
      const requesterDoc = await db.collection("users").doc(requesterUid).get();
      if (!requesterDoc.exists || requesterDoc.data()?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      // Create the user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });

      // Create the user document in Firestore
      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email,
        displayName,
        role: role || "member",
        department: department || "content",
        assignedClients: clientIds || [],
        inviteStatus: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
