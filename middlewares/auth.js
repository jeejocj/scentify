const User = require("../models/userModel");

// User Authentication Middleware
const userAuth = async (req, res, next) => {
    if (req.session?.user) {
        try {
            const user = await User.findById(req.session.user);
            if (user && !user.isBlocked) {
                next(); // Proceed if the user is not blocked
            } else {
                res.render("login", { message: "User is blocked by admin" });
            }
        } catch (error) {
            console.error("Error in userAuth middleware:", error);
            res.status(500).send("Internal Server Error");
        }
    } else {
        res.redirect("/login");
    }
};



// Admin Authentication Middleware
const adminAuth = (req, res, next) => {
    if (req.session?.admin) {
        next(); // Proceed if the admin session exists
    } else {
        res.redirect("/admin/login");
    }
};


module.exports = {
    userAuth,
    adminAuth, 
};
