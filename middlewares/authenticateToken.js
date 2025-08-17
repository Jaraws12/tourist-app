

// middlewares/authenticateToken.js
const { verifyToken } = require("../utils/jwt");

function authenticateToken(req, res, next) {
  let token1 = req.cookies.token || req.headers["authorization"];

  if (!token1) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = token1.startsWith("Bearer ") ? token1.split(" ")[1] : token1;
  console.log("Token:", token);

  try {
    const user = verifyToken(token); // use utils
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}

module.exports = {authenticateToken};

