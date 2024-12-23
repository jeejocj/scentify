const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");

// Get Cart
const getCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);

    // Fetch cart with populated product details
    const cartItems = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select: "productName productImage price quantity",
      model: "Product",
    });

    if (!cartItems) {
      return res.render("cart", {
        cart: null,
        products: [],
        totalAmount: 0,
        user: user,
      });
    }

    // Filter valid items
    const validItems = cartItems.items
      .filter((item) => item.productId != null)
      .map((item) => ({
        ...item.toObject(),
        totalPrice: item.price * item.quantity,
      }));

    // Calculate total amount
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

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please login to add to cart",
      });
    }

    // Find product and check stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check stock availability
    if (product.quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Product is out of stock",
      });
    }
    
    // Calculate the current price
    const currentPrice = product.salePrice || product.regularPrice;
    console.log(currentPrice)
    if (!currentPrice) {
      return res.status(400).json({
        success: false,
        message: "Invalid product price",
      });
    }

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

      if (newQuantity > 5) {
        return res.status(400).json({
          success: false,
          message: "Maximum 5 items allowed per product",
        });
      }

      if (newQuantity > product.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.quantity} items available in stock`,
        });
      }

      // Update existing item
      existingItem.quantity = newQuantity;
      existingItem.price = currentPrice;
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

    // Convert quantity to number and validate
    const numQuantity = parseInt(quantity);
    if (isNaN(numQuantity)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity value'
      });
    }

    // Get product to check stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log("hiiii",product)

    // Ensure product price is valid
    const itemPrice = product.salePrice || product.regularPrice;
    console.log(itemPrice)
    if (typeof itemPrice !== 'number' || isNaN(itemPrice)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product price'
      });
    }

    // Validate quantity
    if (numQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity cannot be less than 1'
      });
    }

    if (numQuantity > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum quantity allowed is 5'
      });
    }
    console.log(numQuantity,product.quantity)
    if (numQuantity > product.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`
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

    const cartItem = cart.items.find(item => 
        item.productId && item.productId._id && 
        item.productId._id.toString() === productId
    );
    
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    // Calculate total price (ensure it's a valid number)
    const totalPrice = numQuantity * itemPrice;
    if (isNaN(totalPrice)) {
      console.error('Price calculation error:', {
        quantity: numQuantity,
        itemPrice,
        product: product._id
      });
      return res.status(400).json({
        success: false,
        message: 'Error calculating total price'
      });
    }

    // Update cart item
    cartItem.quantity = numQuantity;
    cartItem.totalPrice = totalPrice;

    // Calculate cart total (with validation)
    let cartTotal = 0;
    for (const item of cart.items) {
      if (!item.productId) {
        console.error('Product reference is null for cart item');
        continue;
      }
      const price = item.productId.salePrice || item.productId.regularPrice;
      if (typeof price !== 'number' || isNaN(price)) {
        console.error('Invalid price for item:', item.productId._id);
        continue;
      }
      cartTotal += item.quantity * price;
    }

    cart.total = cartTotal;

    // Save with validation
    try {
      await cart.save();
    } catch (validationError) {
      console.error('Cart validation error:', validationError);
      return res.status(400).json({
        success: false,
        message: 'Invalid cart data'
      });
    }

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
        message: "Cart not found",
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