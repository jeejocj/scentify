const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController")
const categoryController = require("../controllers/admin/categoryController")
const {adminAuth} = require("../middlewares/auth")
const brandController = require("../controllers/admin/brandController")
const productController = require("../controllers/admin/productController")
const orderController = require("../controllers/admin/orderController")
const couponController = require("../controllers/admin/couponController")
const dashboardController = require("../controllers/admin/dashboardController") 

const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({storage:storage});

router.get("/pageerror",adminController.pageerror)
router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/logout",adminController.logout)

router.get("/users",adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked)

router.get("/category",adminAuth,categoryController.categoryInfo)
router.post("/addCategory",adminAuth,categoryController.addCategory)

router.get("/editCategory",adminAuth,categoryController.getEditCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory)

router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer)
router.post("/removeCategoryOffer",adminAuth,categoryController.removeCategoryOffer)
router.get("/listCategory",adminAuth,categoryController.getListCategory)
router.get("/unlistCategory",adminAuth,categoryController.getUnListCategory)

// Brand routes
router.get("/brands",adminAuth,brandController.getBrandPage)
router.post("/addBrand",adminAuth,uploads.single("image"),brandController.addBrand)
router.get("/brands/block/:id",adminAuth,brandController.blockBrand)
router.get("/brands/unblock/:id",adminAuth,brandController.unBlockBrand)
router.get("/brands/edit",adminAuth,brandController.getEditBrand)
router.post("/brands/edit/:id",adminAuth,uploads.single("image"),brandController.editBrand)

router.get("/addProducts",adminAuth,productController.getProductAddPage)
router.post("/addProductImage",adminAuth,uploads.single("images"),productController.addProductImage)
router.post("/addProducts",adminAuth,uploads.array("images",4),productController.addProducts);
router.get("/Products",adminAuth,productController.getAllProducts)
router.put('/blockProduct/:id', adminAuth, productController.blockProduct);
router.put("/unblockProduct/:id", adminAuth, productController.unblockProduct);
router.get("/editProduct/:id", adminAuth, productController.getEditProduct);
router.post('/product/edit/:id', 
    uploads.array('productImage', 4),
    productController.updateProduct
)
router.delete('/deleteImage', adminAuth, productController.deleteSingleImage);
// Order Management Routes
router.get("/orderList", adminAuth, orderController.listOrders);
router.get("/orders/cancelled", adminAuth, orderController.getCancelledOrders);
router.get("/orders/:orderId", adminAuth, orderController.getAdminOrderDetails);
router.post("/orders/update-status", adminAuth, orderController.updateOrderStatus);
router.post('/return-request/:orderId/:action', adminAuth, orderController.handleReturnRequest);

// Coupon Routes
router.get("/coupon", adminAuth, couponController.loadcoupon);
router.post("/createCoupon", adminAuth, couponController.createCoupon);
router.put("/coupon/list/:id", adminAuth, couponController.listCoupon);
router.put("/coupon/unlist/:id", adminAuth, couponController.unlistCoupon);

// Dashboard routes
router.get("/", adminAuth, dashboardController.loadDashboard);
router.get("/dashboard/sales-data", adminAuth, dashboardController.getSalesData);
router.get("/dashboard/top-products", adminAuth, dashboardController.getTopProducts);
router.get("/dashboard/top-categories", adminAuth, dashboardController.getTopCategories);
router.get("/dashboard/top-brands", adminAuth, dashboardController.getTopBrands);

//Admin DashBoard & Sales Report................................
router.get('/sales-report', adminAuth, adminController.loadSalesReport);
router.get('/sales-report/download', adminAuth, adminController.downloadSalesReport);

module.exports = router;