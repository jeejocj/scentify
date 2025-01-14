const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");
const Address = require("../../models/addressModel");
const Order = require('../../models/orderModel');
const Coupon = require("../../models/couponModel");
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay Order
const createRazorpayOrder = async (amount) => {
    try {
        const options = {
            amount: amount * 100,
            currency: "INR",
            receipt: `order_${Date.now()}`
        };
        return await razorpay.orders.create(options);
    } catch (error) {
        throw new Error('Error creating Razorpay order: ' + error.message);
    }
};

// Get Checkout Page
const getcheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressData = await Address.findOne({ userId: userId });
        const cart = await Cart.findOne({ userId: userId }).populate({
            path: "items.productId",
            select: "productName productImage regularPrice salePrice quantity category productOffer",
            populate: {
                path: "category",
                select: "categoryOffer"
            }
        });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        // Calculate total
        let cartTotal = 0;
        const products = cart.items.map(item => {
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

            // Calculate total savings and discount percentage
            const savings = product.regularPrice - finalPrice;
            const discountPercentage = Math.round((savings / product.regularPrice) * 100);

            const totalPrice = finalPrice * item.quantity;
            cartTotal += totalPrice;
            return {
                _id: product._id,
                productName: product.productName,
                productImage: product.productImage?.length > 0 ? product.productImage : ["default-image.jpg"],
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                categoryOfferPrice: categoryOfferPrice,
                productOfferPrice: productOfferPrice,
                finalPrice: finalPrice,
                savings: savings,
                discountPercentage: discountPercentage,
                quantity: item.quantity || 1,
                stock: product.quantity,
                totalPrice: totalPrice
            };
        });

        // Get active coupon from session
        const activeCoupon = req.session.activeCoupon;
        const discountAmount = activeCoupon ? activeCoupon.discount : 0;
        const finalAmount = cartTotal - discountAmount;

        // Get available coupons
        const currentDate = new Date();
        const userDoc = await User.findById(userId);
        const usedCouponNames = userDoc.coupons.map(c => c.couponName);

        const availableCoupons = await Coupon.find({
            expireOn: { $gt: currentDate },
            name: { $nin: usedCouponNames }
        }).select('name type offerPrice minimumPrice expireOn description');

        return res.render("checkout", {
            user: req.session.user,
            products,
            subtotal: cartTotal,
            discountAmount,
            finalAmount,
            addressData,
            activeCoupon,
            availableCoupons,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Error in checkout page:", error);
        return res.redirect("/pageNotFound");
    }
};

// Apply Coupon
const applyCoupon = async (req, res) => {
    try {


        const { couponCode, totalAmount } = req.body;
        if (!couponCode || !totalAmount) {
            return res.status(400).json({ success: false, message: "Invalid request" });
        }


        const coupon = await Coupon.findOne({ name: couponCode });
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid coupon code" });
        }

        // Check if coupon is active
        if (!coupon.isListed) {
            return res.status(400).json({ success: false, message: "This coupon is not active" });
        }

        // Check expiry date
        const now = new Date();
        if (coupon.expireOn && now > new Date(coupon.expireOn)) {
            return res.status(400).json({ success: false, message: "This coupon has expired" });
        }

        // Check minimum purchase amount
        if (totalAmount < coupon.minimumPrice) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase amount for this coupon is ₹${coupon.minimumPrice}`
            });
        }

        // Calculate discount
        let discount = Math.min(coupon.offerPrice, totalAmount);

        // Store coupon in session
        req.session.activeCoupon = {
            code: couponCode,
            name: coupon.name,
            discount: discount
        };


        return res.status(200).json({
            success: true,
            message: "Coupon applied successfully",
            discount: discount,
            total: totalAmount - discount
        });

    } catch (error) {
        console.error("Error applying coupon:", error);
        return res.status(500).json({
            success: false,
            message: "Error applying coupon",
        });
    }
};

// Remove Coupon
const removeCoupon = async (req, res) => {
    try {
      

        const { totalAmount } = req.body;
        if (!totalAmount) {
            return res.status(400).json({ success: false, message: "Invalid request" });
        }

        // Remove coupon from session
        delete req.session.activeCoupon;

        return res.status(200).json({
            success: true,
            message: "Coupon removed successfully",
            total: totalAmount
        });

    } catch (error) {
        console.error("Error removing coupon:", error);
        return res.status(500).json({
            success: false,
            message: "Error removing coupon",
            error: error.message
        });
    }
};

// Post Checkout
const postCheckout = async (req, res) => {
    try {
       

        const { address, products, subtotal, total, paymentMethod } = req.body;

         // Parse and validate products
        const parsedProducts = JSON.parse(products);
        if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
            return res.status(400).json({ success: false, message: "No products provided" });
        }

        // Validate stock
        for (const product of parsedProducts) {
            const dbProduct = await Product.findById(product._id);
            if (!dbProduct || product.quantity > dbProduct.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.productName}`
                });
            }
        }

        // Map payment method to enum value
        const paymentMethodMap = {
            'cashOnDelivery': 'COD',
            'onlinePayment': 'Online Payment',

        };

        const mappedPaymentMethod = paymentMethodMap[paymentMethod];
        if (!mappedPaymentMethod) {
            return res.status(400).json({ success: false, message: "Invalid payment method" });
        }

        // Get active coupon from session and calculate final amount
        const activeCoupon = req.session.activeCoupon;
        const discountAmount = activeCoupon ? activeCoupon.discount : 0;
        const finalAmount = total || (subtotal - discountAmount);

        // Prevent COD for orders above Rs 1000
        if (paymentMethod === 'cashOnDelivery' && finalAmount > 1000) {
            return res.status(400).json({
                success: false,
                message: "Cash on Delivery is not available for orders above Rs 1000. Please choose online payment."
            });
        }

        // For online payment, create Razorpay order first
        if (paymentMethod === 'onlinePayment') {
            const razorpayOrder = await createRazorpayOrder(finalAmount);

            // Create order with pending payment status
            const order = await createOrder(
                req.session.user._id,
                parsedProducts,
                address,
                subtotal,
                finalAmount,
                mappedPaymentMethod,
                activeCoupon
            );

            const user = await User.findById(req.session.user._id);

            // Clear cart for online payment since order is created
            await Cart.findOneAndUpdate(
                { userId: req.session.user._id },
                { $set: { items: [] } }
            );
            delete req.session.activeCoupon;

            return res.status(200).json({
                success: true,
                orderId: order._id.toString(), // Ensure orderId is a string
                order_id: razorpayOrder.id,
                key_id: process.env.RAZORPAY_KEY_ID,
                amount: finalAmount * 100,
                currency: "INR",
                name: "Scentify",
                description: "Fragrance Purchase",
                prefill: {
                    name: user.name,
                    email: user.email,
                    contact: user.phone
                }
            });
        }

        // Create order for COD or wallet payment
     

        const order = await createOrder(
            req.session.user._id,
            parsedProducts,
            address,
            subtotal,
            finalAmount,
            mappedPaymentMethod,
            activeCoupon
        );

        // Clear cart and coupon for COD/wallet payment
        await Cart.findOneAndUpdate(
            { userId: req.session.user._id },
            { $set: { items: [] } }
        );
        delete req.session.activeCoupon;

        // Update product quantities for COD/wallet orders
        for (const product of parsedProducts) {
            await Product.findByIdAndUpdate(
                product._id,
                { $inc: { quantity: -product.quantity } }
            );
        }

        return res.status(200).json({
            success: true,
            message: "Order placed successfully",
            orderId: order._id
        });

    } catch (error) {
        console.error("Error in checkout:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Verify Payment
const verifyPayment = async (req, res) => {
    try {
      

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
            return res.status(400).json({ success: false, message: "Missing payment information" });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.error("Signature verification failed");
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        // Find and update order
        const order = await Order.findById(orderId);
        if (!order) {
            console.error("Order not found:", orderId);
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.userId.toString() !== req.session.user._id.toString()) {
            console.error("Order does not belong to user");
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        // Verify payment status with Razorpay
        try {
            const payment = await razorpay.payments.fetch(razorpay_payment_id);


            if (payment.status !== 'captured') {
                console.error("Payment not captured:", payment.status);
                return res.status(400).json({ success: false, message: "Payment not captured" });
            }
        } catch (error) {
            console.error("Error fetching payment from Razorpay:", error);
            return res.status(500).json({ success: false, message: "Failed to verify payment with Razorpay" });
        }

        // Update order payment details
        order.paymentId = razorpay_payment_id;
        order.paymentStatus = 'Completed';
        await order.save();
      

        // Update product quantities after successful payment
        try {
            const orderProducts = JSON.parse(order.products);
            for (const product of orderProducts) {
                await Product.findByIdAndUpdate(
                    product._id,
                    { $inc: { quantity: -product.quantity } }
                );
            }
           
        } catch (error) {
            console.error("Error updating product quantities:", error);
            
        }

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            orderId: order._id
        });

    } catch (error) {
        console.error("Error in payment verification:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify payment. Please contact support if amount is deducted.",
            error: error.message
        });
    }
};

// Helper function to create order
const createOrder = async (userId, products, address, subtotal, finalAmount, paymentMethod, coupon = null) => {
    try {
        // Update product stock
        for (const product of products) {
            await Product.findByIdAndUpdate(product._id, {
                $inc: { quantity: -product.quantity }
            });
        }

        const orderedItems = products.map(product => ({
            product: product._id,
            quantity: product.quantity,
            regularPrice: product.regularPrice,
            finalPrice: product.finalPrice,
            discountPercentage: product.discountPercentage,
            offerType: product.discountPercentage > 0 ?
                (product.categoryOfferPrice < product.productOfferPrice && product.categoryOfferPrice < (product.salePrice || Infinity) ? 'category' :
                    product.productOfferPrice < (product.salePrice || Infinity) ? 'product' : 'sale') : 'regular'
        }));

        // Calculate coupon discount
        const couponDiscount = coupon ? coupon.discount : 0;

        // Set payment status based on payment method
        const paymentStatus = paymentMethod === 'Online Payment' ? 'Pending' : 'Completed';

        // Create the order
        const order = new Order({
            userId,
            orderedItems,
            address,
            totalPrice: subtotal,
            discount: couponDiscount,
            finalAmount: subtotal - couponDiscount,
            status: "Pending",
            paymentMethod,
            paymentStatus,
            couponApplied: !!coupon,
            couponDetails: coupon ? {
                name: coupon.name,
                discount: coupon.discount
            } : null,
            createdOn: new Date()
        });

        // Save the order
        const savedOrder = await order.save();

        // If there's a coupon, add it to user's used coupons
        if (coupon) {
            await User.findByIdAndUpdate(userId, {
                $push: {
                    coupons: {
                        couponName: coupon.name,
                        usedAt: new Date(),
                        // orderId: savedOrder._id
                    }
                }
            });
        }

        // Add order to user's order history
        await User.findByIdAndUpdate(userId, {
            $push: { orderHistory: savedOrder._id }
        });

        return savedOrder;
    } catch (error) {
        console.error("Error creating order:", error);
        throw new Error("Failed to create order: " + error.message);
    }
};

// Retry Payment
const retryPayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.session.user._id;

        // Find the order
        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Verify order is pending payment
        if (order.paymentStatus !== 'Pending' || order.paymentMethod !== 'Online Payment') {
            return res.status(400).json({ success: false, message: "Invalid order status for payment retry" });
        }

        // Create new Razorpay order
        const razorpayOrder = await createRazorpayOrder(order.finalAmount);

        const user = await User.findById(userId);
        return res.status(200).json({
            success: true,
            order_id: razorpayOrder.id,
            key_id: process.env.RAZORPAY_KEY_ID,
            amount: order.finalAmount * 100,
            currency: "INR",
            name: "Scentify",
            description: "Retry Payment for Order #" + order._id,
            prefill: {
                name: user.name,
                email: user.email,
                contact: user.phone
            },
            orderId: order._id
        });

    } catch (error) {
        console.error("Error in retry payment:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Order Confirmation
const orderConfirm = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const orderId = req.query.orderId;
        if (!orderId) {
            console.error("No orderId provided");
            return res.redirect("/pageNotFound");
        }

        // Find the order and populate necessary fields
        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage'
            })
            .lean();

        if (!order) {
            console.error("Order not found:", orderId);
            return res.redirect("/pageNotFound");
        }

        // Get address details
        const addressDoc = await Address.findOne({
            userId: req.session.user._id,
            'address._id': order.address
        });

        if (addressDoc && addressDoc.address) {
            const selectedAddress = addressDoc.address.find(addr =>
                addr._id.toString() === order.address.toString()
            );
            if (selectedAddress) {
                order.address = selectedAddress;
            }
        }

        // Calculate totals from ordered items
        let subtotal = 0;
        order.orderedItems.forEach(item => {
            subtotal += item.finalPrice * item.quantity;
        });
        order.subtotal = subtotal;
        order.finalAmount = subtotal - (order.discount || 0);

     

        return res.render("orderConfirmation", {
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error("Error in orderConfirm:", error);
        return res.redirect("/error");
    }
};

// Payment Failed Page
const paymentFailed = async (req, res) => {
    try {
        const orderId = req.query.orderId;
        if (!orderId) {
            return res.redirect("/profile");
        }

        const order = await Order.findById(orderId);
        if (!order || order.userId.toString() !== req.session.user._id.toString()) {
            return res.redirect("/profile");
        }

        res.render("payment-failed", {
            orderId: order._id,
            user: req.session.user
        });
    } catch (error) {
        console.error("Error in payment failed page:", error);
        res.redirect("/profile");
    }
};

module.exports = {
    getcheckoutPage,
    postCheckout,
    orderConfirm,
    verifyPayment,
    applyCoupon,
    removeCoupon,
    retryPayment,
    paymentFailed
};