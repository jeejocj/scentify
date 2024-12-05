const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController")
const categoryController = require("../controllers/admin/categoryController")
const {userAuth,adminAuth} = require("../middlewares/auth")
const brandController = require("../controllers/admin/brandController")
const productController = require("../controllers/admin/productController")


const multer = require("multer");
const storage = require("../helpers/multer");
const uploads = multer({storage:storage});


router.get("/pageerror",adminController.pageerror)
router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/",adminAuth,adminController.loadDashboard);
router.get("/logout",adminController.logout)

router.get("/users",adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked)

router.get("/category",adminAuth,categoryController.categoryInfo)
router.post("/addCategory",adminAuth,categoryController.addCategory)

router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer)
router.post("/removeCategoryOffer",adminAuth,categoryController.removeCategoryOffer)
router.get("/listCategory",adminAuth,categoryController.getListCategory)
router.get("/unlistCategory",adminAuth,categoryController.getUnListCategory)
router.get("/editCategory",adminAuth,categoryController.getEditCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory)

router.get("/brands",adminAuth,brandController.getBrandPage)
router.post("/addBrand",adminAuth,uploads.single("image"),brandController.addBrand)
router.get('/blockBrand/:id', brandController.blockBrand);
router.get("/unBlockBrand/:id", adminAuth, brandController.unblockBrand);
router.get("/deleteBrand/:id",adminAuth,brandController.deleteBrand)

router.get("/addProducts",adminAuth,productController.getProductAddPage)
router.post("/addProducts",adminAuth,uploads.array("images",4),productController.addProducts);
router.get("/Products",adminAuth,productController.getAllProducts)
router.post("/addProductOffer",adminAuth,productController.addProductOffer)
router.post("/removeProductoffer",adminAuth,productController.removeProductOffer)
router.get('/blockProduct', productController.blockProduct);
router.get("/unblockProduct", adminAuth, productController.unblockProduct);
router.get("/editProduct", adminAuth, productController.getEditProduct);
router.post("/editProduct/:id", adminAuth,uploads.array("images",4),productController.editProduct);
router.post("/deleteImage", adminAuth, productController.deleteSingleImage);



module.exports = router;