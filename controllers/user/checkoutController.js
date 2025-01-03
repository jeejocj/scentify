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
        const discountAmount = activeCoupon ? activeCoupon.calculatedDiscount : 0;
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
            quantity: null,
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
        const userId = req.session.user._id;

        console.log('Applying coupon:', { couponCode, totalAmount, userId });

        // Basic validation
        if (!couponCode || !totalAmount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon code and total amount are required' 
            });
        }

        // Validate coupon code
        const coupon = await Coupon.findOne({ name: couponCode });
        console.log('Found coupon:', coupon);

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Invalid coupon code' });
        }

        // Check if coupon is active
        if (!coupon.isList) {
            return res.status(400).json({ success: false, message: 'This coupon is not active' });
        }

        // Check expiry date
        if (coupon.expireOn && new Date() > new Date(coupon.expireOn)) {
            return res.status(400).json({ success: false, message: 'This coupon has expired' });
        }

        // Check if user has already used this coupon
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        const hasUsedCoupon = user.coupons.some(c => c.couponName === couponCode);
        if (hasUsedCoupon) {
            return res.status(400).json({ success: false, message: 'You have already used this coupon' });
        }

        // Check minimum purchase requirement
        const cartTotal = parseFloat(totalAmount);
        if (cartTotal < coupon.minimumPrice) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minimumPrice} required for this coupon`
            });
        }

        // Calculate discount based on offer price
        const calculatedDiscount = Math.min(coupon.offerPrice, cartTotal);

        // Store coupon in session
        req.session.activeCoupon = {
            code: couponCode,
            name: coupon.name,
            calculatedDiscount,
            offerPrice: coupon.offerPrice
        };

        console.log('Applied coupon successfully:', {
            discount: calculatedDiscount,
            total: cartTotal - calculatedDiscount
        });

        return res.json({
            success: true,
            message: 'Coupon applied successfully',
            discount: calculatedDiscount,
            total: cartTotal - calculatedDiscount
        });

    } catch (error) {
        console.error('Error applying coupon:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            session: req.session
        });
        return res.status(500).json({ success: false, message: 'Error applying coupon' });
    }
};

// Remove Coupon
const removeCoupon = async (req, res) => {
    try {
        const { totalAmount } = req.body;
        
        // Clear coupon from session
        delete req.session.activeCoupon;
        
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
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Please login to continue" });
        }

        const { address, products, subtotal } = req.body;
        console.log('Checkout request:', { address, subtotal });
        
        const parsedProducts = JSON.parse(products);
        console.log('Parsed products:', parsedProducts);

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

        const mappedPaymentMethod = paymentMethodMap[req.body.paymentMethod];
        if (!mappedPaymentMethod) {
            return res.status(400).json({ success: false, message: "Invalid payment method" });
        }

        // Get active coupon from session and calculate final amount
        const activeCoupon = req.session.activeCoupon;
        const discountAmount = activeCoupon ? activeCoupon.calculatedDiscount : 0;
        const finalAmount = subtotal - discountAmount;

        // Handle online payment
        if (req.body.paymentMethod === 'onlinePayment') {
            console.log('Creating Razorpay order for amount:', finalAmount);
            const order = await createRazorpayOrder(finalAmount);
            console.log('Razorpay order created:', order);
            
            const user = await User.findById(req.session.user._id);
            return res.status(200).json({
                success: true,
                order_id: order.id,
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

        // Create order for COD or wallet
        console.log('Creating order with:', {
            userId: req.session.user._id,
            products: parsedProducts,
            address,
            subtotal,
            finalAmount,
            paymentMethod: mappedPaymentMethod,
            coupon: activeCoupon
        });
        
        const order = await createOrder(
            req.session.user._id,
            parsedProducts,
            address,
            subtotal,
            finalAmount,
            mappedPaymentMethod,
            activeCoupon
        );

        // Clear cart and coupon
        await Cart.findOneAndUpdate({ userId: req.session.user._id }, { $set: { items: [] } });
        delete req.session.activeCoupon;

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
        const couponDiscount = coupon ? coupon.calculatedDiscount : 0;

        // Create the order
        const order = new Order({
            userId,
            orderedItems,
            address,
            totalPrice: subtotal,
            discount: couponDiscount,
            finalAmount: subtotal - couponDiscount, // Using the passed finalAmount which is already subtotal - discount
            status: "Pending",
            paymentMethod,
            couponApplied: !!coupon,
            couponDetails: coupon ? {
                name: coupon.name,
                discount: coupon.calculatedDiscount
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
                        orderId: savedOrder._id
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

// Verify Payment
const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderDetails } = req.body;
        console.log('Payment verification request:', {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        });

        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Please login to continue" });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generated_signature = hmac.digest('hex');
        console.log('Signature verification:', {
            generated: generated_signature,
            received: razorpay_signature
        });

        if (generated_signature !== razorpay_signature) {
            console.error("Signature verification failed");
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        // Verify payment status
        console.log('Fetching payment details from Razorpay');
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        console.log('Payment details:', payment);

        if (payment.status !== 'captured') {
            console.error("Payment not captured:", payment.status);
            return res.status(400).json({ success: false, message: "Payment not captured" });
        }

        // Parse order details
        console.log('Parsing order details:', orderDetails);
        const orderData = JSON.parse(orderDetails);
        const { address, products, subtotal, total } = orderData;
        const parsedProducts = JSON.parse(products);
        const activeCoupon = req.session.activeCoupon;
        console.log("active coupon", activeCoupon);
        // Create order
        console.log('Creating order with payment');
        const order = await createOrder(
            req.session.user._id,
            parsedProducts,
            address,
            subtotal,
            total,
            'Online Payment',
            activeCoupon
        );
        console.log('Order created:', order);

        // Update order with payment details
        order.paymentId = razorpay_payment_id;
        order.paymentStatus = 'Completed';
        await order.save();
        console.log('Order updated with payment details');

        // Clear cart and coupon
        await Cart.findOneAndUpdate(
            { userId: req.session.user._id },
            { $set: { items: [] } }
        );
        delete req.session.activeCoupon;
        console.log('Cart cleared and coupon removed');

        return res.status(200).json({
            success: true,
            message: "Payment verified and order placed successfully",
            orderId: order._id
        });

    } catch (error) {
        console.error("Error in payment verification:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: error.message 
        });
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

        console.log('Order details:', {
            orderId: order._id,
            subtotal: order.subtotal,
            discount: order.discount,
            finalAmount: order.finalAmount,
            items: order.orderedItems
        });

        return res.render("orderConfirmation", {
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error("Error in orderConfirm:", error);
        return res.redirect("/error");
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