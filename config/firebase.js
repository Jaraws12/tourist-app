const admin = require("firebase-admin");
const path = require("path");

// Load the service account key from config folder
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: "https://<your-project-id>.firebaseio.com" // (optional if using Firestore only)
});

module.exports = admin;
