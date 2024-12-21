const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");
const Address = require("../../models/addressModel");
const Order = require('../../models/orderModel');

const getOrderHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ userId }).sort({ createdOn: -1 }).lean();
        
        res.render('profile', {
            orders: orders,
            activeTab: 'orders'
        });
    } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).render('error', { message: 'Internal Server Error' });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user._id;

        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                model: 'Product',
                select: 'productName productImage salesPrice'
            });

        if (!order) {
            return res.status(404).render('error', { 
                message: 'Order not found',
                user: req.session.user
            });
        }

        // Calculate totals
        order.totalPrice = order.orderedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        order.finalAmount = order.totalPrice - (order.discount || 0);
        res.render('orderDetails', { 
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', { 
            message: 'Internal Server Error',
            user: req.session.user
        });
    }
};

// Cancel an Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        // Find the order and update its status
        const order = await Order.findOneAndUpdate(
            { _id: orderId, status: 'Pending' }, // Allow cancellation only for 'Pending' orders
            { status: 'Cancelled' },
            { new: true }
        );

        if (!order) {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
        }

        res.status(200).json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
};

// Fetch Order Status
const getOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, status: order.status });
    } catch (error) {
        console.error('Error fetching order status:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch order status' });
    }
};



const viewOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate('orderItems.product')
      .populate('address');

    if (!order) {
      return res.status(404).send('Order not found');
    }

    res.render('order-details-full', { order });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).send('Server error');
  }
};

const changeOrderStatus = async (req, res) => {
    try {
      const { orderId } = req.params;
      const { newStatus } = req.body;
  
      const order = await Order.findById(orderId);
  
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
  
      // Add any necessary validation for status changes here
      const allowedStatusChanges = {
        'Pending': ['Processing', 'Cancelled'],
        'Processing': ['Shipped', 'Cancelled'],
        'Shipped': ['Delivered', 'Returned'],
        'Delivered': ['Returned'],
      };
  
      if (!allowedStatusChanges[order.status] || !allowedStatusChanges[order.status].includes(newStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid status change' });
      }
  
      order.status = newStatus;
      await order.save();
  
      res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
      console.error('Error changing order status:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const userId = req.session.user._id;

        console.log('Updating order:', { orderId, status, userId });

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Validate status transition
        const validTransitions = {
            'Pending': ['Cancelled'],
            'Delivered': ['Return Requested']
        };

        if (!validTransitions[order.status]?.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot change order status from ${order.status} to ${status}`
            });
        }

        // Update the order status
        order.status = status;
        await order.save();

        return res.status(200).json({
            success: true,
            message: `Order ${status.toLowerCase()} successfully`
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const showReturnReasonPage = async (req, res) => {
    try {
        const orderId = req.query.orderId;
        res.render('return-reason', { 
            orderId,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error showing return reason page:', error);
        res.status(500).render('error', { message: 'Internal Server Error' });
    }
};

const submitReturnReason = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const userId = req.session.user._id;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        order.status = 'Return Requested';
        order.returnReason = reason;
        await order.save();

        return res.status(200).json({
            success: true,
            message: "Return request submitted successfully"
        });

    } catch (error) {
        console.error('Error submitting return reason:', error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const getOrderDetailsJson = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user._id;

        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                model: 'Product',
                select: 'productName productImage salesPrice'
            });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Calculate totals
        const totalPrice = order.orderedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        const finalAmount = totalPrice - (order.discount || 0);

        res.json({
            success: true,
            order: {
                orderId: order._id,
                createdOn: order.createdOn,
                status: order.status,
                orderedItems: order.orderedItems,
                address: order.address,
                totalPrice: totalPrice,
                discount: order.discount || 0,
                finalAmount: finalAmount
            }
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports = {
    getOrderHistory,
    getOrderDetails,
    cancelOrder,
    getOrderStatus,
    viewOrderDetails,
    changeOrderStatus,
    updateOrderStatus,
    showReturnReasonPage,
    submitReturnReason,
    getOrderDetailsJson
};