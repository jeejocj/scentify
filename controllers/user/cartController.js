const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");

// Get Cart
const getCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    
    // Fetch cart with populated product details
    const cartItems = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "productName productImage regularPrice salePrice quantity category productOffer",
      populate: {
        path: "category",
        select: "categoryOffer"
      }
    });

    // If the cart is empty or no valid items are found
    if (!cartItems || cartItems.items.length === 0) {
      return res.render("cart", {
        products: [],
        totalAmount: 0,
        user: user,
      });
    }

    // Filter valid items and calculate prices
    const validItems = cartItems.items
      .filter((item) => item.productId != null)
      .map((item) => {
        const product = item.productId;
        
        // Calculate category offer price if category has an offer
        let categoryOfferPrice = product.regularPrice;
        if (product.category && product.category.categoryOffer > 0) {
          categoryOfferPrice = product.regularPrice - (product.regularPrice * (product.category.categoryOffer / 100));
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
        
        // Return the item with all calculated prices and the total price for the item
        return {
          ...item.toObject(),
          regularPrice: product.regularPrice,
          salePrice: product.salePrice,
          finalPrice,
          totalPrice: finalPrice * item.quantity
        };
      });

    // Calculate total amount with offer prices
    const totalAmount = validItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    res.render("cart", {
      products: validItems,
      totalAmount,
      user: user,
    });

  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).render("error", {
      message: "Failed to load cart",
    });
  }
};

// Add to Cart
const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, quantity = 1 } = req.body;

    // Validate product existence and stock
    const product = await Product.findById(productId);
    if (!product || product.quantity < 1) {
      return res.status(400).json({
        success: false,
        message: product ? "Product is out of stock" : "Product not found",
      });
    }

    // Calculate the current price
    const currentPrice = product.salePrice || product.regularPrice;

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check existing item in cart
    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    if (existingItem) {
      // Check quantity limits
      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity > 5 || newQuantity > product.quantity) {
        return res.status(400).json({
          success: false,
          message:
            newQuantity > 5
              ? "Maximum 5 items allowed per product"
              : `Only ${product.quantity} items available in stock`,
        });
      }

    

      // Update existing item
      existingItem.quantity = newQuantity;
      existingItem.totalPrice = newQuantity * currentPrice;
    } else {
      // Add new item
      if (quantity > product.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.quantity} items available in stock`,
        });
      }

      cart.items.push({
        productId,
        quantity,
        price: currentPrice,
        totalPrice: quantity * currentPrice
      });
    }

    await cart.save();
    res.json({
      success: true,
      message: "Product added to cart successfully",
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add product to cart",
    });
  }
};

// Update Cart Quantity
const updateQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session.user._id;

    // Validate quantity input
    const numQuantity = parseInt(quantity, 10);
    if (!numQuantity || numQuantity < 1 || numQuantity > 5) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 5',
      });
    }

    // Find product and validate stock
    const product = await Product.findById(productId);
    if (!product || product.quantity < numQuantity) {
      return res.status(400).json({
        success: false,
        message: product
          ? `Only ${product.quantity} items available in stock`
          : 'Product not found',
      });
    }

    // Find cart and populate product details
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find item in cart
    const cartItem = cart.items.find(item => 
        item.productId &&  
        item.productId._id.toString() === productId
    );
    
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    // Update item quantity and total price
    const itemPrice = product.salePrice || product.regularPrice;
    cartItem.quantity = numQuantity;
    cartItem.totalPrice = numQuantity * itemPrice;

    // Recalculate cart total
    cart.total = cart.items.reduce((sum, item) => {
      const price = item.productId.salePrice || item.productId.regularPrice;
      return sum + item.quantity * price;
    }, 0);

    // Save cart
    await cart.save();

    return res.json({
      success: true,
      message: 'Cart updated successfully',
      data: {
        quantity: cartItem.quantity,
        totalPrice: cartItem.totalPrice,
        cartTotal: cart.total
      }
    });

  } catch (error) {
    console.error('Error updating cart quantity:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Remove from Cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found for this user",
      });
    }

    // Find item index
    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    // Remove item
    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.json({
      success: true,
      message: "Item removed successfully",
    });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove item",
    });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateQuantity,
  removeFromCart,
};