const bcrypt = require("bcrypt");
const { generateToken } = require("../utils/jwt");
const admin = require("../config/firebase");

const db = admin.firestore();

// REGISTER
exports.registerUser = async (req, res) => {
  const { username, password, phone } = req.body;
  try {
    const usersRef = db.collection("users");
    const existing = await usersRef.where("username", "==", username).get();

    if (!existing.empty) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUserRef = await usersRef.add({
      username,
      password: hashedPassword,
      phone,
      trackingEnabled: false,
      lastLocation: null,
      groups: [],
      Issolo: false,
    });

    const token = generateToken({ id: newUserRef.id, username, phone });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1 * 60 * 60 * 1000,
    });

    res.json({ message: "Registration successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
};

// LOGIN
exports.loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("username", "==", username).get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "User not found" });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    const match = await bcrypt.compare(password, userData.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken({ id: userDoc.id, username, phone: userData.phone });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1 * 60 * 60 * 1000,
    });

    res.json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
};
