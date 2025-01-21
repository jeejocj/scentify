const Wishlist = require('../../models/wishlistModel');
const Product = require('../../models/productModel');
const User = require('../../models/userModel');

// Load Wishlist Page
const loadWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId }).populate({
            path: 'products.productId',
            model: 'Product',
            select: 'productName productImage regularPrice salesPrice quantity brand category productOffer',
            populate: [{
                path: 'category',
                model: 'Category',
                select: 'name categoryOffer'
            }, {
                path: 'brand',
                model: 'Brand',
                select: 'brandName'
            }]
        });

        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
            await wishlist.save();
        }

        // Calculate best offer for each product
        const processedWishlist = wishlist.products.map(item => {
            const product = item.productId;
            
            // Calculate category offer price
            let categoryOfferPrice = product.regularPrice;
            let categoryOffer = 0;
            if (product.category && product.category.categoryOffer > 0) {
                categoryOffer = product.category.categoryOffer;
                categoryOfferPrice = product.regularPrice - (product.regularPrice * (categoryOffer / 100));
            }

            // Calculate product offer price
            let productOfferPrice = product.regularPrice;
            let productOffer = product.productOffer || 0;
            if (productOffer > 0) {
                productOfferPrice = product.regularPrice - (product.regularPrice * (productOffer / 100));
            }

            // Get sale price
            const salePrice = product.salesPrice || product.regularPrice;

            // Find the best offer
            const prices = [
                { type: 'regular', price: product.regularPrice, discount: 0, percentage: 0 },
                { type: 'sale', price: salePrice, discount: product.regularPrice - salePrice, percentage: Math.round(((product.regularPrice - salePrice) / product.regularPrice) * 100) },
                { type: 'category', price: categoryOfferPrice, discount: product.regularPrice - categoryOfferPrice, percentage: categoryOffer },
                { type: 'product', price: productOfferPrice, discount: product.regularPrice - productOfferPrice, percentage: productOffer }
            ];

            // Get the offer with lowest price
            const bestOffer = prices.reduce((best, current) => 
                current.price < best.price ? current : best
            );

            return {
                ...item.toObject(),
                regularPrice: product.regularPrice,
                finalPrice: bestOffer.price,
                discountPercentage: bestOffer.percentage,
                offerType: bestOffer.type,
                savings: bestOffer.discount
            };
        });


        res.render('wishlist', {
            user: req.session.user,
            wishlist: processedWishlist
        });
    } catch (error) {
        console.error('Error loading wishlist:', error);
        res.status(500).render('error', { message: 'Error loading wishlist' });
    }
};

// Add to Wishlist
const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Product ID is required' 
            });
        }

        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }

        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        // Check if product already in wishlist
        const existingProduct = wishlist.products.find(
            item => item.productId.toString() === productId
        );

        if (existingProduct) {
            return res.status(400).json({ 
                success: false, 
                exists: true,
                message: 'Product already in wishlist' 
            });
        }

        // Add product to wishlist
        wishlist.products.push({ productId, addedOn: new Date() });
        await wishlist.save();

        // Update user's wishlist reference
        await User.findByIdAndUpdate(userId, {
            $addToSet: { wishlist: wishlist._id }
        });

        res.status(200).json({ 
            success: true, 
            message: 'Product added to wishlist' 
        });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error adding to wishlist' 
        });
    }
};

// Remove from Wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const productId = req.params.id;

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ 
                success: false, 
                message: 'Wishlist not found' 
            });
        }

        // Remove product from wishlist
        wishlist.products = wishlist.products.filter(
            item => item.productId.toString() !== productId
        );
        await wishlist.save();

        res.status(200).json({ 
            success: true, 
            message: 'Product removed from wishlist' 
        });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error removing from wishlist' 
        });
    }
};

module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist
};