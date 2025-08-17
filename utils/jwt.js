// utils/jwt.js
const jwt = require("jsonwebtoken");

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const SECRET_KEY = process.env.JWT_SECRET || "password";

// Function to generate token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, phone: user.phone },
    SECRET_KEY,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Function to verify token (can also be used in tests, sockets, etc.)
const verifyToken = (token) => {
  return jwt.verify(token, SECRET_KEY);
};

module.exports = { generateToken, verifyToken };
