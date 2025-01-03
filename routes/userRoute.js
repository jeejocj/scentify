const express = require("express");
const router = express.Router();
const User = require("../models/userModel");
const Product = require("../models/productModel"); 
const userController = require("../controllers/user/userController");
const productController = require("../controllers/user/productController");
const profileController = require("../controllers/user/profileController");
const shopController = require("../controllers/user/shopController");
const cartController = require("../controllers/user/cartController");
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController");
const wishlistController = require("../controllers/user/wishlistController");
const walletController = require("../controllers/user/walletController");

const passport = require("passport");
const { userAuth } = require("../middlewares/auth");

router.get("/",userController.loadHomepage);
router.get("/pageNotFound",userController.pageNotFound);
router.get("/signup",userController.loadSignup);
router.post("/signup",userController.Signup);
router.post("/verify-otp",userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);
router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}));
router.get("/auth/google/callback", 
    passport.authenticate("google", {
        failureRedirect: "/login",
        failureMessage: true,
        session: true
    }),
    async (req, res) => {
        try {
            req.session.user = req.session.passport.user
            res.redirect('/')
        } catch (error) {
            console.error("Google callback error:", error);
            req.session.error_message = "Something went wrong";
            res.redirect("/login");
        }
    }
);
router.get("/login",userController.loadLogin);
router.post("/login",userController.login);
router.get("/logout",userController.logout);
router.get("/productDetails", productController.productDetails);
router.get("/shop", shopController.loadShoppingPage);

router.get("/forgot-password",profileController.getForgotPassPage);
router.post("/forgot-email-valid",profileController.forgotEmailValid);
router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp)
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/reset-password",profileController.postNewPassword);

router.get("/userProfile",userAuth,profileController.userProfile);
router.get("/change-email",userAuth,profileController.changeEmail);
router.post("/change-email",userAuth,profileController.changeEmailValid);
router.post("/verify-email-otp",userAuth,profileController.verifyEmailOtp);
router.post("/update-email",userAuth,profileController.updateEmail)

router.get("/change-password", userAuth, profileController.ChangePassword);
router.post("/change-password", userAuth, profileController.changePasswordValid);
router.post("/verify-changepassword-otp", userAuth, profileController.verifyChangepassOtp);

router.get("/addAddress",userAuth,profileController.addAddress);
router.post("/addAddress",userAuth,profileController.postAddAddress);
router.get("/editAddress",userAuth,profileController.editAddress);
router.post("/editAddress",userAuth,profileController.postEditAddress);
router.get("/deleteAddress",userAuth,profileController.deleteAddress);


router.get("/shop",shopController.loadShoppingPage);

router.post('/addToCart',userAuth,cartController.addToCart);
router.get('/cart', cartController.getCart);
router.post('/cart/update-quantity', userAuth, cartController.updateQuantity);
router.post('/cart/remove', userAuth, cartController.removeFromCart);

 //wishlist Management............................

 router.get("/wishlist",userAuth,wishlistController.loadWishlist);
 router.post("/addToWishlist",userAuth,wishlistController.addToWishlist)
 router.delete('/wishlist/remove/:id', wishlistController.removeFromWishlist);

// Checkout Routes
router.get("/checkout", userAuth, checkoutController.getcheckoutPage);
router.post("/checkout/apply-coupon", userAuth, checkoutController.applyCoupon);
router.post("/checkout/remove-coupon", userAuth, checkoutController.removeCoupon);
router.post("/checkout/place-order", userAuth, checkoutController.postCheckout);
router.post("/checkout/verify-payment", userAuth, checkoutController.verifyPayment);
router.get("/checkout/confirmation", userAuth, checkoutController.orderConfirm);

// Profile and Order Routes
router.get("/profile", profileController.userProfile);
router.get("/orders/:orderId", profileController.getOrderDetails);
router.post("/orders/cancel", userAuth, orderController.cancelOrder);

// Order Routes
router.get('/orders', userAuth, orderController.getOrderHistory);
router.get('/orders/download-invoice/:orderId', userAuth, orderController.downloadInvoice);
router.get('/orders/get-details/:orderId', userAuth, orderController.getOrderDetailsJson);
router.post('/orders/update-status', userAuth, orderController.updateOrderStatus);
// router.get('/return-reason', userAuth, orderController.showReturnReasonPage);
// router.post('/submit-return-reason', userAuth, orderController.submitReturnReason);

// Wallet Routes
router.get('/wallet/details', userAuth, walletController.getWalletDetails);
router.post('/wallet/recharge', userAuth, walletController.createWalletRechargeOrder);
router.post('/wallet/verify', userAuth, walletController.verifyWalletRecharge);

// Return request route
router.post('/submit-return-request', userAuth, userController.submitReturnRequest);

module.exports = router