const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const productController = require("../controllers/user/productController");
const passport = require("passport");
const { userAuth } = require("../middlewares/auth");




router.get("/",userController.loadHomepage);
router.get("/pageNotFound",userController.pageNotFound);
router.get("/signup",userController.loadSignup);
router.post("/signup",userController.Signup);
router.post("/verify-otp",userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);
router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}));
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/signup"}),(req,res)=>{
    console.log("redirecting home")
    res.redirect("/")
})
router.get("/login",userController.loadLogin);
router.post("/login",userController.login);


router.get("/logout",userController.logout);
router.get("/productDetails",userAuth,productController.productDetails);



module.exports = router