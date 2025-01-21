const User = require('../../models/userModel');
const Address = require('../../models/addressModel');
const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const { addRefundToWallet } = require('../user/walletController');

const paymentMethodTransitions = {
    'COD': {
        'undefined': ['Pending', 'Cancelled'],
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Return Pending'],
        'Return Pending': ['Returned', 'Cancelled'],
        'Returned': [],
        'Cancelled': []
    },
    'Online Payment': {
        'undefined': ['Pending', 'Cancelled'],
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Return Pending'],
        'Return Pending': ['Returned', 'Cancelled'],
        'Returned': [],
        'Cancelled': []
    },
    'Wallet': {
        'undefined': ['Pending', 'Cancelled'],
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Cancelled'],
        'Delivered': ['Return Pending'],
        'Return Pending': ['Returned', 'Cancelled'],
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
        
        // Find the order
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Store previous status for reference
        const previousStatus = order.status;

        // If order is being cancelled and payment is already completed
        if (status === 'Cancelled' && order.paymentStatus === 'Completed') {
            try {
                // Calculate refund amount
                const refundAmount = order.finalAmount;

                // Process refund using wallet controller
                const refundResult = await addRefundToWallet(
                    order.userId,
                    refundAmount,
                    order._id,
                    `Refund for cancelled order #${order._id}`
                );

                // Update product quantities - return items to stock
                for (const item of order.orderedItems) {
                    const product = await Product.findById(item.product);
                    if (product) {
                        product.quantity += item.quantity;
                        await product.save();
                    }
                }

                // Update order status
                order.status = status;
                order.cancellationReason = 'Cancelled by admin';
                order.refundStatus = 'Refunded to wallet';
                await order.save();

                return res.json({
                    success: true,
                    message: `Order cancelled and ₹${refundAmount} refunded to wallet`,
                    newStatus: status,
                    newWalletBalance: refundResult.newBalance
                });

            } catch (error) {
                console.error('Error processing refund:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error processing refund'
                });
            }
        } else {
            // Just update the status for non-cancellation cases
            order.status = status;
            await order.save();

            return res.json({
                success: true,
                message: 'Order status updated successfully',
                newStatus: status
            });
        }

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating order status'
        });
    }
};

const handleReturnRequest = async (req, res) => {
    try {
        const { orderId, action } = req.params;

        if (!orderId || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request parameters'
            });
        }

        const order = await Order.findById(orderId).populate('orderedItems.product');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.returnRequest?.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'No pending return request found for this order'
            });
        }

        if (action === 'approve') {
            try {
                // Calculate refund amount
                const refundAmount = order.finalAmount;

                // Process refund using wallet controller
                const refundResult = await addRefundToWallet(
                    order.userId,
                    refundAmount,
                    order._id,
                    `Refund for approved return #${order._id}`
                );

                // Update product quantities
                for (const item of order.orderedItems) {
                    const product = await Product.findById(item.product._id);
                    if (product) {
                        product.quantity += item.quantity;
                        await product.save();
                    }
                }

                // Update order status and return request
                order.status = 'Returned';
                order.returnRequest.status = 'Approved';
                order.returnRequest.actionDate = new Date();
                order.refundStatus = 'Refunded to wallet';
                await order.save();

                return res.json({
                    success: true,
                    message: `Return request approved and ₹${refundAmount} refunded to wallet`,
                    newStatus: order.status,
                    newWalletBalance: refundResult.newBalance
                });

            } catch (error) {
                console.error('Error processing return refund:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Error processing return refund'
                });
            }
        } else {
            // Reject return request
            order.status = 'Delivered'; // Revert back to delivered status
            order.returnRequest.status = 'Rejected';
            order.returnRequest.actionDate = new Date();
            await order.save();

            return res.json({
                success: true,
                message: 'Return request rejected',
                newStatus: order.status
            });
        }

    } catch (error) {
        console.error('Error handling return request:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing return request'
        });
    }
};

module.exports = {
    listOrders,
    getCancelledOrders,
    getAdminOrderDetails,
    updateOrderStatus,
    handleReturnRequest
};