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

        console.log('Processed Orders:', orders); // Debug log

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
        console.log('Finding order with ID:', orderId);

        const users = await User.find()
            .populate({
                path: 'orderHistory',
                match: { _id: orderId },
                populate: [
                    {
                        path: 'orderedItems.product',
                        select: 'productName productImage salePrice regularPrice'
                    }
                ]
            });

        const user = users.find(u => u.orderHistory.some(o => o._id.toString() === orderId));
        if (!user) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        const order = user.orderHistory.find(o => o._id.toString() === orderId);
        const orderObj = order.toObject();

        // Calculate totals and add prices to ordered items
        let totalAmount = 0;
        orderObj.orderedItems = orderObj.orderedItems.map(item => {
            const price = item.product.salePrice || item.product.regularPrice || 0;
            const itemTotal = price * item.quantity;
            totalAmount += itemTotal;
            return {
                ...item,
                price: price,
                total: itemTotal
            };
        });

        orderObj.totalAmount = totalAmount;
        orderObj.finalAmount = totalAmount - (orderObj.discount || 0);

        console.log('Order found:', orderObj);
        console.log('Address ID in order:', orderObj.address);

        // Find the address document and the specific address from the array
        if (orderObj.address) {
            console.log('Looking for address with ID:', orderObj.address);
            
            const addressDoc = await Address.findOne({ userId: user._id });
            console.log('Found address document:', addressDoc);

            if (addressDoc && addressDoc.address) {
                // Find the specific address from the array
                const selectedAddress = addressDoc.address.find(addr => 
                    addr._id.toString() === orderObj.address.toString()
                );
                console.log('Selected address:', selectedAddress);
                
                if (selectedAddress) {
                    orderObj.address = selectedAddress;
                } else {
                    console.log('Address not found in array');
                }
            } else {
                console.log('No address document found or no addresses in array');
            }
        } else {
            console.log('No address ID in order');
        }

        // Add user information to the order object
        const orderWithUser = {
            ...orderObj,
            user: {
                name: user.name,
                email: user.email
            }
        };

        console.log('Final order with address:', orderWithUser);

        res.render('orderDetails', {
            order: orderWithUser,
            error: null
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', { 
            message: 'Error fetching order details',
            error: error.message 
        });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        console.log('Received update request:', { orderId, status });

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
            console.log('Order not found:', orderId);
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Get allowed transitions based on payment method
        const paymentMethod = order.paymentMethod || 'COD';
        const transitionsForPaymentMethod = paymentMethodTransitions[paymentMethod] || paymentMethodTransitions['COD'];
        const allowedNextStatuses = transitionsForPaymentMethod[order.status] || [];

        console.log('Status transition check:', {
            currentStatus: order.status,
            requestedStatus: status,
            paymentMethod: paymentMethod,
            allowedStatuses: allowedNextStatuses
        });

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
                
                console.log('Return processed successfully:', {
                    orderId,
                    refundAmount,
                    userId: user._id,
                    newWalletBalance: user.wallet
                });
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

        console.log('Order status updated successfully:', { 
            orderId, 
            oldStatus: order.status,
            newStatus: status,
            paymentMethod: order.paymentMethod
        });

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