const Product = require("../../models/productModel");
const Category=require("../../models/categoryModel");
const User=require("../../models/userModel")


const productDetails = async(req,res)=>{
    try {
        const userId=req.session.user;
        const userData= await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findCategory = product.category;
        const CategoryOffer=findCategory?.categoryOffer || 0;
        const ProductOffer=product.productOffer ||0;
        const totalOffer=CategoryOffer + ProductOffer;

        // Fetch related products from the same category
        const relatedProducts = await Product.find({
            category: findCategory._id,
            _id: { $ne: productId }, // Exclude current product
            isListed: true
        }).limit(3);

        res.render("product-details",{
            user:userData,
            product:product,
            quantity:product.quantity,
            totalOffer:totalOffer,
            CategoryOffer:CategoryOffer,
            ProductOffer:ProductOffer,
            category:findCategory,
            relatedProducts:relatedProducts
        });
    } catch (error) {
        console.error("Error for fetching product details",error);
        res.redirect("/pageNotFound")
    }
}

module.exports={
    productDetails,
}