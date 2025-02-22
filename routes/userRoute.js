const express = require("express");
const router = express.Router();
 
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


router.get("/change-password", userAuth, profileController.ChangePassword);
router.post("/change-password", userAuth, profileController.changePasswordValid);
router.post("/verify-changepassword-otp", userAuth, profileController.verifyChangepassOtp);
router.post("/resend-changepassword-otp", userAuth, profileController.resendChangePasswordOtp);

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
router.post("/retry-payment", userAuth, checkoutController.retryPayment);
router.get("/payment-failed", userAuth, checkoutController.paymentFailed);
router.get("/order-confirmation", userAuth, checkoutController.orderConfirm);

// Profile and Order Routes
router.get("/profile", profileController.userProfile);
router.get("/orders/:orderId", profileController.getOrderDetails);
router.post("/orders/cancel", userAuth, orderController.cancelOrder);

// Order Routes
router.get('/orders', userAuth, orderController.getOrderHistory);
router.get('/orders/download-invoice/:orderId', userAuth, orderController.downloadInvoice);
router.get('/orders/get-details/:orderId', userAuth, orderController.getOrderDetailsJson);
router.post('/orders/update-status', userAuth, orderController.updateOrderStatus);


// Wallet Routes
router.get('/wallet/details', userAuth, walletController.getWalletDetails);
router.post('/wallet/recharge', userAuth, walletController.createWalletRechargeOrder);
router.post('/wallet/verify', userAuth, walletController.verifyWalletRecharge);

// Return request route
router.post('/request-return', userAuth, orderController.requestReturn);

module.exports = router