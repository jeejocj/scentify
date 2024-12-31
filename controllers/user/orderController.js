const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");
const Address = require('../../models/addressModel');
const Order = require('../../models/orderModel');
const { addRefundToWallet } = require('./walletController');

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

// const getOrderDetails = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;
//         const userId = req.session.user._id;

//         const order = await Order.findById(orderId)
//             .populate({
//                 path: 'orderedItems.product',
//                 model: 'Product',
//                 select: 'productName productImage salesPrice'
//             });

//         if (!order) {
//             return res.status(404).render('error', { 
//                 message: 'Order not found',
//                 user: req.session.user
//             });
//         }

//         // Calculate totals
//         order.totalPrice = order.orderedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
//         order.finalAmount = order.totalPrice - (order.discount || 0);
//         res.render('orderDetails', { 
//             order,
//             user: req.session.user
//         });
//     } catch (error) {
//         console.error('Error fetching order details:', error);
//         res.status(500).render('error', { 
//             message: 'Internal Server Error',
//             user: req.session.user
//         });
//     }
// };

// Cancel an Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.session.user._id;

        console.log('Cancelling order:', orderId, 'for user:', userId);

        // Find the order and ensure it's still cancellable
        const order = await Order.findOne({ 
            _id: orderId, 
            status: { $in: ['Pending', 'Processing'] } 
        }).populate('orderedItems.product');

        if (!order) {
            console.log('Order not found or not cancellable');
            return res.status(400).json({ 
                success: false, 
                message: 'Order cannot be cancelled' 
            });
        }

        console.log('Found order:', order);

        // Revert product quantities
        for (const item of order.orderedItems) {
            try {
                const product = await Product.findById(item.product._id);
                if (product) {
                    const oldQuantity = product.quantity;
                    product.quantity = oldQuantity + item.quantity;
                    await product.save();
                    console.log(`Product ${product._id}: Quantity updated from ${oldQuantity} to ${product.quantity}`);
                }
            } catch (error) {
                console.error(`Error reverting quantity for product ${item.product._id}:`, error);
            }
        }

        // Handle refund for online payments
        if (order.paymentMethod === 'Online Payment' || order.paymentMethod === 'razorpay') {
            try {
                // Calculate refund amount
                const refundAmount = order.finalAmount;
                console.log('Processing refund of amount:', refundAmount);

                // Add refund to wallet with order reference
                const refundResult = await addRefundToWallet(
                    userId, 
                    refundAmount, 
                    order._id, 
                    `Refund for Order #${order.orderId}`
                );

                console.log('Refund processed:', refundResult);

                // Update order status
                order.status = 'Cancelled';
                order.cancellationReason = 'Cancelled by user';
                order.refundStatus = 'Refunded to wallet';
                await order.save();

                return res.status(200).json({ 
                    success: true, 
                    message: 'Order cancelled and amount refunded to wallet',
                    refundAmount: refundAmount,
                    newWalletBalance: refundResult.newBalance
                });
            } catch (refundError) {
                console.error('Error processing refund:', refundError);
                
                // Revert product quantity changes if refund fails
                for (const item of order.orderedItems) {
                    try {
                        const product = await Product.findById(item.product._id);
                        if (product) {
                            product.quantity -= item.quantity;
                            await product.save();
                        }
                    } catch (error) {
                        console.error(`Error reverting quantity for product ${item.product._id}:`, error);
                    }
                }

                return res.status(500).json({
                    success: false,
                    message: 'Error processing refund'
                });
            }
        }

        // For COD orders, just cancel the order
        order.status = 'Cancelled';
        order.cancellationReason = 'Cancelled by user';
        await order.save();

        res.status(200).json({ 
            success: true, 
            message: 'Order cancelled successfully' 
        });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel order' 
        });
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

// const showReturnReasonPage = async (req, res) => {
//     try {
//         const orderId = req.query.orderId;
//         res.render('return-reason', { 
//             orderId,
//             user: req.session.user
//         });
//     } catch (error) {
//         console.error('Error showing return reason page:', error);
//         res.status(500).render('error', { message: 'Internal Server Error' });
//     }
// };

// const submitReturnReason = async (req, res) => {
//     try {
//         const { orderId, reason } = req.body;
//         const userId = req.session.user._id;

//         const order = await Order.findById(orderId);

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         order.status = 'Return Requested';
//         order.returnReason = reason;
//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "Return request submitted successfully"
//         });

//     } catch (error) {
//         console.error('Error submitting return reason:', error);
//         return res.status(500).json({
//             success: false,
//             message: "Internal server error"
//         });
//     }
// };

const getOrderDetailsJson = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user._id;

        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                model: 'Product',
                select: 'productName productImage salePrice regularPrice'
            });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Get address details
        const address = await Address.findOne({ userId: userId });
        const addressDetails = address?.address.find(addr => addr._id.toString() === order.address.toString()) || {};

        // Calculate totals using product's salePrice
        const totalPrice = order.orderedItems.reduce((total, item) => {
            const itemPrice = item.product.salePrice || item.product.regularPrice || 0;
            return total + (itemPrice * item.quantity);
        }, 0);

        // Ensure discount doesn't exceed total price
        const discount = Math.min(order.discount || 0, totalPrice);
        const finalAmount = Math.max(totalPrice - discount, 0);

        res.json({
            success: true,
            order: {
                orderId: order._id,
                createdOn: order.createdOn,
                status: order.status,
                orderedItems: order.orderedItems.map(item => ({
                    ...item.toObject(),
                    price: item.product.salePrice || item.product.regularPrice || 0
                })),
                address: addressDetails,
                totalPrice: totalPrice,
                discount: discount,
                finalAmount: finalAmount,
                paymentMethod: order.paymentMethod || 'Not specified'
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
    // getOrderDetails,
    cancelOrder,
    getOrderStatus,
    viewOrderDetails,
    changeOrderStatus,
    updateOrderStatus,
    // showReturnReasonPage,
    // submitReturnReason,
    getOrderDetailsJson
};