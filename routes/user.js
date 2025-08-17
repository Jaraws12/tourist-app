const express = require("express");
const router = express.Router();
const userController = require("../controllers/userControllers");

// REGISTER route
router.post("/register", userController.registerUser);

// LOGIN route
router.post("/login", userController.loginUser);

module.exports = router;
