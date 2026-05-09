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
    // We import the handler directly to keep logic consistent
    try {
      const handler = await import("./api/admin/create-user.ts");
      // @ts-ignore - Vercel handler type
      await handler.default(req, res);
    } catch (e) {
      console.error("Failed to load API handler:", e);
      res.status(500).json({ error: "API Internal Error" });
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
