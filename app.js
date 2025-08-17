const express = require('express');
const cookieParser = require("cookie-parser");
const session = require("express-session");

// Import routes
const userRoutes = require('./routes/user');
const allApi = require('./routes/api');

const app = express();


// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false
  })
);



// Use routes
app.use('/users', userRoutes);  // now /users/register and /users/login
app.use('/api', allApi);

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
