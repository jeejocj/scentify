const User = require('../../models/userModel');
const Address = require('../../models/addressModel');
const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');

const paymentMethodTransitions = {
    'COD': {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Return Request'],
        'Return Request': ['Returned', 'Cancelled'],
        'Returned': [],
        'Cancelled': []
    },
    'Online Payment': {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Return Request'],
        'Return Request': ['Returned', 'Cancelled'],
        'Returned': [],
        'Cancelled': []
    },
    'Wallet': {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Return Request'],
        'Return Request': ['Returned', 'Cancelled'],
        'Returned': [],
        'Cancelled': []
    }
};

const listOrders = async (req, res) => {
    try {
        // Find all users and populate their order history
        const users = await User.find()
            .populate({
                path: 'orderHistory',
                model: 'Order',
                populate: {
                    path: 'orderedItems.product',
                    model: 'Product',
                    select: 'productName productImage salesPrice'
                }
            });

        // Process orders from all users
        const orders = [];
        users.forEach(user => {
            if (user.orderHistory && user.orderHistory.length > 0) {
                user.orderHistory.forEach(order => {
                    if (order) {
                        const orderData = order.toObject();
                        orders.push({
                            ...orderData,
                            userName: user.name,
                            userEmail: user.email,
                            // Ensure finalAmount is a number
                            finalAmount: orderData.finalAmount ? Number(orderData.finalAmount) : 0
                        });
                    }
                });
            }
        });

        // Sort orders by creation date
        orders.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));


        res.render('orders', {
            orders,
            filterType: null,
            error: null
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.render('orders', { 
            orders: [],
            filterType: null,
            error: 'Error fetching orders'
        });
    }
};

const getCancelledOrders = async (req, res) => {
    try {
        const users = await User.find()
            .populate({
                path: 'orderHistory',
                match: { status: 'Cancelled' }
            });

        const cancelledOrders = users.reduce((allOrders, user) => {
            return allOrders.concat(user.orderHistory.map(order => ({
                ...order.toObject(),
                userName: user.name,
                userEmail: user.email
            })));
        }, []);

        // Sort orders by creation date
        cancelledOrders.sort((a, b) => b.createdOn - a.createdOn);

        res.render('orders', {
            orders: cancelledOrders,
            filterType: 'cancelled',
            error: null
        });
    } catch (error) {
        console.error('Error fetching cancelled orders:', error);
        res.render('orders', { 
            orders: [],
            filterType: 'cancelled',
            error: 'Error fetching cancelled orders'
        });
    }
};

const getAdminOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        const order = await Order.findById(orderId)
            .populate('orderedItems.product', 'productName productImage')
            .populate('userId', 'name email');

        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        const orderObj = order.toObject();
        orderObj.user = orderObj.userId;

        // Get address details
        if (orderObj.address) {
            const addressDoc = await Address.findOne({ userId: orderObj.userId._id });

            if (addressDoc && addressDoc.address) {
                const selectedAddress = addressDoc.address.find(addr => 
                    addr._id.toString() === orderObj.address.toString()
                );
                if (selectedAddress) {
                    orderObj.address = selectedAddress;
                }
            }
        }

        // Calculate totals
        let subtotal = 0;
        orderObj.orderedItems = orderObj.orderedItems.map(item => {
            const itemTotal = item.finalPrice * item.quantity;
            subtotal += itemTotal;

            return {
                ...item,
                totalItemPrice: itemTotal
            };
        });

        orderObj.subtotal = subtotal;
        orderObj.discount = orderObj.discount || 0;
        orderObj.finalAmount = Math.max(subtotal - orderObj.discount, 0);


        res.render('orderDetails', { order: orderObj });
    } catch (error) {
        console.error('Error in getAdminOrderDetails:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!orderId || !status) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID and status are required' 
            });
        }

        // Find the order
        const order = await Order.findById(orderId)
            .populate('orderedItems.product');
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Get allowed transitions based on payment method
        const paymentMethod = order.paymentMethod || 'COD';
        const transitionsForPaymentMethod = paymentMethodTransitions[paymentMethod] || paymentMethodTransitions['COD'];
        const allowedNextStatuses = transitionsForPaymentMethod[order.status] || [];

       

        if (!allowedNextStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot change order status from ${order.status} to ${status}. Allowed next statuses are: ${allowedNextStatuses.join(', ')}` 
            });
        }

        // Handle return process
        if (status === 'Returned') {
            try {
                // Find the user
                const user = await User.findById(order.userId);
                if (!user) {
                    throw new Error('User not found');
                }

                // Calculate refund amount (final amount including any discounts)
                const refundAmount = order.finalAmount || 0;

                // Initialize wallet if undefined
                user.wallet = (user.wallet || 0) + refundAmount;

                // Initialize walletHistory array if undefined
                if (!Array.isArray(user.walletHistory)) {
                    user.walletHistory = [];
                }

                // Add wallet transaction history
                user.walletHistory.push({
                    type: 'credit',
                    amount: refundAmount,
                    description: `Refund for order ${order._id}`,
                    date: new Date()
                });

                // Update product stock
                for (const item of order.orderedItems) {
                    const product = await Product.findById(item.product._id);
                    if (product) {
                        product.quantity += item.quantity;
                        await product.save();
                    }
                }

                // Save user changes
                await user.save();
                
              
            } catch (error) {
                console.error('Error processing return:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error processing return',
                    error: error.message
                });
            }
        }

        // Update the order status
        order.status = status;
        await order.save();

     

        res.json({ 
            success: true, 
            message: 'Order status updated successfully'
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating order status',
            error: error.message 
        });
    }
};

module.exports = {
    listOrders,
    getCancelledOrders,
    getAdminOrderDetails,
    updateOrderStatus
};