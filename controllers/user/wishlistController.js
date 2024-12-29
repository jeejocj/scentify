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
            select: 'productName productImage salePrice regularPrice quantity brand category',
            populate: [{
                path: 'category',
                model: 'Category',
                select: 'name'
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

        console.log('Wishlist products:', JSON.stringify(wishlist.products, null, 2));

        res.render('wishlist', {
            user: req.session.user,
            wishlist: wishlist.products
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