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
        const user = req.session.user;
        const productId = req.query.id || null;
        const quantity = parseInt(req.query.quantity) || 1;

        if (!user) {
            return res.redirect("/login");
        }

        const address = await Address.findOne({ userId: user._id });
        const addressData = address || { address: [] };

        // Get active coupon from session
        const activeCoupon = req.session.activeCoupon;

        if (!productId) {
            // Cart checkout
            const cart = await Cart.findOne({ userId: user._id }).populate({
                path: "items.productId",
                select: "productName productImage salesPrice quantity"
            });

            if (!cart || !cart.items || cart.items.length === 0) {
                return res.redirect("/cart");
            }

            const products = cart.items.map(item => ({
                _id: item.productId._id,
                productName: item.productId.productName,
                productImage: item.productId.productImage?.length > 0 ? item.productId.productImage : ["default-image.jpg"],
                salesPrice: item.productId.salesPrice || 0,
                price: item.price || item.productId.salesPrice || 0,
                quantity: item.quantity || 1,
                stock: item.productId.quantity,
                totalPrice: item.totalPrice || (item.price * item.quantity) || (item.productId.salesPrice * item.quantity)
            }));

            const subtotal = products.reduce((sum, item) => sum + item.totalPrice, 0);
            let finalAmount = subtotal;
            let discountAmount = 0;

            if (activeCoupon) {
                discountAmount = Math.floor((activeCoupon.offerPrice / 100) * subtotal);
                finalAmount = subtotal - discountAmount;
            }

            return res.render("checkout", { 
                user,
                products,
                subtotal,
                discountAmount,
                finalAmount,
                quantity: null,
                addressData,
                activeCoupon,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID
            });
        }

        // Single product checkout
        const product = await Product.findById(productId);
        if (!product) {
            return res.redirect("/pageNotFound");
        }

        const products = [{
            _id: product._id,
            productName: product.productName,
            productImage: product.productImage?.length > 0 ? product.productImage : ["default-image.jpg"],
            salesPrice: product.salesPrice || 0,
            quantity: quantity,
            stock: product.quantity
        }];

        const subtotal = products[0].salesPrice * quantity;
        let finalAmount = subtotal;
        let discountAmount = 0;

        if (activeCoupon) {
            discountAmount = Math.floor((activeCoupon.offerPrice / 100) * subtotal);
            finalAmount = subtotal - discountAmount;
        }

        return res.render("checkout", { 
            user,
            products,
            subtotal,
            discountAmount,
            finalAmount,
            quantity,
            addressData,
            activeCoupon,
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
        const userId = req.session?.user?._id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to apply coupon" });
        }

        if (!couponCode || !totalAmount) {
            return res.status(400).json({ success: false, message: "Missing coupon code or amount" });
        }

        const coupon = await Coupon.findOne({ name: couponCode });
        if (!coupon) {
            return res.status(400).json({ success: false, message: "Invalid coupon code" });
        }

        if (coupon.expireOn < new Date()) {
            return res.status(400).json({ success: false, message: "Coupon has expired" });
        }

        const user = await User.findById(userId);
        const isCouponUsed = user.coupons?.some(c => c.couponName === couponCode);
        if (isCouponUsed) {
            return res.status(400).json({ success: false, message: "Coupon already used" });
        }

        // Store coupon in session
        req.session.activeCoupon = coupon;

        const discountAmount = Math.floor((coupon.offerPrice / 100) * parseFloat(totalAmount));
        const finalAmount = parseFloat(totalAmount) - discountAmount;

        return res.status(200).json({
            success: true,
            message: "Coupon applied successfully",
            discountAmount: discountAmount.toFixed(2),
            finalAmount: finalAmount.toFixed(2)
        });
    } catch (error) {
        console.error("Error applying coupon:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Remove Coupon
const removeCoupon = async (req, res) => {
    try {
        delete req.session.activeCoupon;
        const { totalAmount } = req.body;

        return res.status(200).json({
            success: true,
            message: "Coupon removed successfully",
            finalAmount: parseFloat(totalAmount).toFixed(2)
        });
    } catch (error) {
        console.error("Error removing coupon:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Post Checkout
const postCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to continue" });
        }

        const { address, products, subtotal, total, paymentMethod } = req.body;
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
            'wallet': 'Wallet'
        };

        const mappedPaymentMethod = paymentMethodMap[paymentMethod];
        if (!mappedPaymentMethod) {
            return res.status(400).json({ success: false, message: "Invalid payment method" });
        }

        // Handle online payment
        if (paymentMethod === 'onlinePayment') {
            const order = await createRazorpayOrder(total);
            const user = await User.findById(userId);
            return res.status(200).json({
                success: true,
                order_id: order.id,
                key_id: process.env.RAZORPAY_KEY_ID,
                amount: total * 100,
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

        // Create order for COD
        const activeCoupon = req.session.activeCoupon;
        const order = await createOrder(userId, parsedProducts, address, subtotal, total, mappedPaymentMethod, activeCoupon);

        // Clear cart and coupon
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });
        delete req.session.activeCoupon;

        return res.status(200).json({
            success: true,
            message: "Order placed successfully",
            orderId: order._id
        });

    } catch (error) {
        console.error("Error in checkout:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};

// Helper function to create order
const createOrder = async (userId, products, address, subtotal, total, paymentMethod, coupon = null) => {
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
            price: product.salesPrice
        }));

        const order = new Order({
            userId,
            orderedItems,
            address,
            totalPrice: subtotal,
            discount: coupon ? Math.floor((coupon.offerPrice / 100) * subtotal) : 0,
            finalAmount: total,
            status: "Pending",
            paymentMethod,
            couponApplied: !!coupon,
            createdOn: new Date()
        });

        if (coupon) {
            await User.findByIdAndUpdate(userId, {
                $push: { coupons: { couponName: coupon.name } }
            });
        }

        return await order.save();
    } catch (error) {
        console.error("Error creating order:", error);
        throw new Error("Failed to create order: " + error.message);
    }
};

// Verify Payment
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDetails } = req.body;

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Please login to continue" });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        // Verify payment status
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        if (payment.status !== 'captured') {
            return res.status(400).json({ success: false, message: "Payment not captured" });
        }

        // Create order
        const { address, products, subtotal, total } = orderDetails;
        const parsedProducts = JSON.parse(products);
        const activeCoupon = req.session.activeCoupon;

        const order = await createOrder(
            req.session.user,
            parsedProducts,
            address,
            subtotal,
            total,
            'online',
            activeCoupon
        );

        // Update order with payment details
        order.paymentId = razorpay_payment_id;
        order.paymentStatus = 'Completed';
        await order.save();

        // Clear cart and coupon
        await Cart.findOneAndUpdate(
            { userId: req.session.user._id },
            { $set: { items: [] } }
        );
        delete req.session.activeCoupon;

        return res.status(200).json({
            success: true,
            message: "Payment verified and order placed successfully",
            orderId: order._id
        });

    } catch (error) {
        console.error("Error in payment verification:", error);
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

        const order = await Order.findById(orderId)
            .populate('orderedItems.product')
            .populate('address');

        if (!order) {
            console.error("Order not found:", orderId);
            return res.redirect("/pageNotFound");
        }

        return res.render("orderConfirmation", {
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error("Error in order confirmation:", error);
        return res.redirect("/pageNotFound");
    }
};

module.exports = {
    getcheckoutPage,
    postCheckout,
    orderConfirm,
    verifyPayment,
    applyCoupon,
    removeCoupon
};