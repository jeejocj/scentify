const Order = require('../../models/orderModel');
const User = require('../../models/userModel');
const Address = require('../../models/addressModel'); // Import the Address model

const listOrders = async (req, res) => {
    try {
        const users = await User.find()
            .populate('orderHistory')
            .sort({ 'orderHistory.createdOn': -1 });

        const orders = users.reduce((allOrders, user) => {
            return allOrders.concat(user.orderHistory.map(order => ({
                ...order.toObject(),
                userName: user.name,
                userEmail: user.email
            })));
        }, []);

        // Sort orders by creation date
        orders.sort((a, b) => b.createdOn - a.createdOn);

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
                        select: 'productName productImage salesPrice'
                    }
                ]
            });

        const user = users.find(u => u.orderHistory.some(o => o._id.toString() === orderId));
        if (!user) {
            return res.status(404).render('error', { message: 'Order not found' });
        }

        const order = user.orderHistory.find(o => o._id.toString() === orderId);
        const orderObj = order.toObject();

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

        const users = await User.find()
            .populate({
                path: 'orderHistory',
                match: { _id: orderId }
            });

        const order = users.reduce((foundOrder, user) => {
            return foundOrder || user.orderHistory.find(order => order._id.toString() === orderId);
        }, null);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Validate status transition
        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        order.status = status;
        await order.save();

        res.json({ success: true, message: 'Order status updated successfully', error: null });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Error updating order status', error: 'Error updating order status' });
    }
};

module.exports = {
    listOrders,
    getCancelledOrders,
    getAdminOrderDetails,
    updateOrderStatus
};