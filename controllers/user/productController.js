const Product = require("../../models/productModel");
const Category=require("../../models/categoryModel");
const User=require("../../models/userModel")
const mongoose = require("mongoose");

const productDetails = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category').populate('brand');
        const findCategory = product.category;

        // Calculate category offer price if category has an offer
        let categoryOfferPrice = product.regularPrice;
        if (findCategory.categoryOffer && findCategory.categoryOffer > 0) {
            categoryOfferPrice = product.regularPrice - (product.regularPrice * (findCategory.categoryOffer / 100));
        }

        // Calculate product offer price if product has an offer
        let productOfferPrice = product.regularPrice;
        if (product.productOffer && product.productOffer > 0) {
            productOfferPrice = product.regularPrice - (product.regularPrice * (product.productOffer / 100));
        }

        // Compare with product's sale price and get the best offer
        const finalPrice = Math.min(
            product.regularPrice,
            product.salePrice || product.regularPrice,
            categoryOfferPrice,
            productOfferPrice
        );
        
        // Calculate total savings and discount percentage
        const totalSavings = product.regularPrice - finalPrice;
        const discountPercentage = Math.round((totalSavings / product.regularPrice) * 100);

        // Fetch related products from the same category
        const relatedProducts = await Product.find({
            category: new mongoose.Types.ObjectId(findCategory._id),
            _id: { $ne: productId }, // Exclude current product
            isBlocked: false
        }).limit(3);

        // Calculate prices for related products
        const relatedProductsWithPrices = relatedProducts.map(relProduct => {
            let relCategoryOfferPrice = relProduct.regularPrice;
            if (findCategory.categoryOffer && findCategory.categoryOffer > 0) {
                relCategoryOfferPrice = relProduct.regularPrice - (relProduct.regularPrice * (findCategory.categoryOffer / 100));
            }

            let relProductOfferPrice = relProduct.regularPrice;
            if (relProduct.productOffer && relProduct.productOffer > 0) {
                relProductOfferPrice = relProduct.regularPrice - (relProduct.regularPrice * (relProduct.productOffer / 100));
            }

            const relFinalPrice = Math.min(
                relProduct.regularPrice,
                relProduct.salePrice || relProduct.regularPrice,
                relCategoryOfferPrice,
                relProductOfferPrice
            );
            
            return {
                ...relProduct.toObject(),
                finalPrice: relFinalPrice,
                savings: relProduct.regularPrice - relFinalPrice,
                discountPercentage: Math.round(((relProduct.regularPrice - relFinalPrice) / relProduct.regularPrice) * 100)
            };
        });

        // Prepare the product data
        const productData = {
            ...product.toObject(),
            finalPrice,
            categoryOfferPrice,
            productOfferPrice,
            savings: totalSavings,
            discountPercentage
        };

        // Log the data being sent to view
        console.log('Product Details Data:', {
            productBasic: {
                id: product._id,
                name: product.productName,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice
            },
            category: {
                id: findCategory._id,
                name: findCategory.name,
                categoryOffer: findCategory.categoryOffer
            },
            calculatedPrices: {
                categoryOfferPrice,
                productOfferPrice,
                finalPrice,
                totalSavings,
                discountPercentage
            },
            relatedProducts: relatedProductsWithPrices.map(rp => ({
                id: rp._id,
                name: rp.productName,
                regularPrice: rp.regularPrice,
                finalPrice: rp.finalPrice,
                savings: rp.savings,
                discountPercentage: rp.discountPercentage
            }))
        });

        res.render("product-details", {
            user: userData,
            product: productData,
            quantity: product.quantity,
            category: findCategory,
            relatedProducts: relatedProductsWithPrices
        });
    } catch (error) {
        console.error("Error for fetching product details", error);
        res.redirect("/pageNotFound")
    }
}

module.exports = {
    productDetails,
}