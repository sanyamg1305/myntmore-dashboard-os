import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
// This expects FIREBASE_SERVICE_ACCOUNT to be a JSON string of the service account key
const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;

// Try to load project ID from config as fallback
let projectId: string | undefined;
try {
  const config = JSON.parse(readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));
  projectId = config.projectId;
} catch (e) {
  // Ignore
}

if (serviceAccountVar) {
  try {
    const serviceAccount = JSON.parse(serviceAccountVar);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId
    });
    console.log("Firebase Admin initialized with service account");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
    admin.initializeApp({ projectId });
  }
} else {
  // Fallback to default but explicitly set projectId if found
  admin.initializeApp({ projectId });
  console.log(`Firebase Admin initialized with Project ID: ${projectId || "default"}`);
}

const db = admin.firestore();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Route: Create User (Admin Only)
  app.post("/api/admin/create-user", async (req, res) => {
    console.log("POST /api/admin/create-user - Request received");
    const { email, password, displayName, role, department, clientIds } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("Unauthorized: No Bearer token");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const idToken = authHeader.split("Bearer ")[1];

    try {
      console.log("Verifying ID token...");
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const requesterUid = decodedToken.uid;
      console.log(`Requester UID: ${requesterUid}`);

      // Check if the requester is an admin in Firestore
      const requesterDoc = await db.collection("users").doc(requesterUid).get();
      if (!requesterDoc.exists) {
        console.warn(`Requester document ${requesterUid} not found in users collection`);
        return res.status(403).json({ error: "Forbidden: Admin profile not found" });
      }

      const userDataFromDb = requesterDoc.data();
      if (userDataFromDb?.role !== "admin") {
        console.warn(`Requester ${requesterUid} is not an admin. Role: ${userDataFromDb?.role}`);
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      console.log(`Creating user in Auth: ${email}`);
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });

      console.log(`User created in Auth: ${userRecord.uid}. Saving to Firestore...`);
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

      console.log("User record created in Firestore successfully");
      res.json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      console.error("Error creating user:", error);
      // Return a JSON error instead of letting it fall through
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Internal Server Error" });
      }
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
