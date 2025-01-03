const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");
const Address = require('../../models/addressModel');
const Order = require('../../models/orderModel');
const { addRefundToWallet } = require('./walletController');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

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
                select: 'productName productImage'
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

        // Calculate totals
        const subtotal = order.orderedItems.reduce((total, item) => {
            return total + (item.finalPrice * item.quantity);
        }, 0);

        res.json({
            success: true,
            order: {
                orderId: order._id,
                createdOn: order.createdOn,
                status: order.status,
                orderedItems: order.orderedItems.map(item => {
                    return {
                        product: {
                            productName: item.product.productName,
                            productImage: item.product.productImage
                        },
                        quantity: item.quantity,
                        regularPrice: item.regularPrice,
                        finalPrice: item.finalPrice,
                        discountPercentage: item.discountPercentage,
                        offerType: item.offerType,
                        totalItemPrice: item.finalPrice * item.quantity
                    };
                }),
                address: addressDetails,
                subtotal: subtotal,
                discount: order.discount || 0,
                finalAmount: order.finalAmount,
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

const downloadInvoice = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const orderId = req.params.orderId;
        
        // Find the order with populated fields
        const order = await Order.findById(orderId)
            .populate('userId')
            .populate('orderedItems.product')
            .lean();

        if (!order) {
            console.error('Order not found:', orderId);
            return res.status(404).send('Order not found');
        }

        // Check if order is cancelled or returned
        if (order.status === 'Cancelled' || order.status === 'Returned') {
            return res.status(403).send('Invoice download not available for cancelled or returned orders');
        }

        // Get address details
        const addressDoc = await Address.findOne({ 
            userId: req.session.user._id,
            'address._id': order.address 
        });

        let shippingAddress = null;
        if (addressDoc && addressDoc.address) {
            shippingAddress = addressDoc.address.find(addr => 
                addr._id.toString() === order.address.toString()
            );
        }

        if (!shippingAddress) {
            console.error('Shipping address not found for order:', orderId);
            return res.status(404).send('Shipping address not found');
        }

        // Create a new PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);

        // Pipe the PDF to the response
        doc.pipe(res);

        // Add colored background for header
        doc.rect(0, 0, doc.page.width, 150)
           .fill('#487379');

        // Add company logo and header with white text
        doc.fillColor('white')
           .fontSize(30)
           .font('Helvetica-Bold')
           .text('Scentify', { align: 'center', y: 50 });
        doc.fontSize(14)
           .font('Helvetica')
           .text('Premium Perfumes & Fragrances', { align: 'center' });

        // Add invoice title with a different color
        doc.fillColor('#487379')
           .fontSize(24)
           .font('Helvetica-Bold')
           .text('INVOICE', { align: 'center', y: 170 });

        // Add order information in a colored box
        doc.rect(50, 220, doc.page.width - 100, 80)
           .fill('#f5f5f5');

        doc.fillColor('#333333')
           .fontSize(10)
           .font('Helvetica')
           .text('Order Information:', 70, 230)
           .font('Helvetica-Bold')
           .text(`Order ID: ${orderId}`, 70, 250)
           .text(`Date: ${new Date(order.createdOn).toLocaleDateString()}`, 70, 270)
           .text(`Payment Method: ${order.paymentMethod || 'N/A'}`, 70, 290);

        // Add customer and shipping info in two columns with colored backgrounds
        doc.rect(50, 320, (doc.page.width - 120) / 2, 120)
           .fill('#eef7f8');
        doc.rect(doc.page.width / 2 + 10, 320, (doc.page.width - 120) / 2, 120)
           .fill('#eef7f8');

        // Customer Details
        doc.fillColor('#487379')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Customer Details:', 70, 335);
        
        doc.fillColor('#333333')
           .fontSize(10)
           .font('Helvetica')
           .text(`Name: ${order.userId?.name || 'N/A'}`, 70, 355)
           .text(`Email: ${order.userId?.email || 'N/A'}`, 70, 375)
           .text(`Phone: ${order.userId?.phone || 'N/A'}`, 70, 395);

        // Shipping Address
        doc.fillColor('#487379')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Shipping Address:', doc.page.width / 2 + 30, 335);

        doc.fillColor('#333333')
           .fontSize(10)
           .font('Helvetica')
           .text(`${shippingAddress.name || 'N/A'}`, doc.page.width / 2 + 30, 355)
           .text(`${shippingAddress.landMark || 'N/A'}`, doc.page.width / 2 + 30, 375)
           .text(`${shippingAddress.city || 'N/A'}, ${shippingAddress.state || 'N/A'} ${shippingAddress.pincode || 'N/A'}`, doc.page.width / 2 + 30, 395)
           .text(`Phone: ${shippingAddress.phone || 'N/A'}`, doc.page.width / 2 + 30, 415);

        // Add table header with background
        const tableTop = 460;
        doc.rect(50, tableTop, doc.page.width - 100, 25)
           .fill('#487379');

        doc.fillColor('white')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('Product', 70, tableTop + 8)
           .text('Quantity', 270, tableTop + 8)
           .text('Price', 370, tableTop + 8)
           .text('Total', 470, tableTop + 8);

        // Add items with alternating background
        let y = tableTop + 25;
        let subtotal = 0;
        
        if (order.orderedItems && order.orderedItems.length > 0) {
            order.orderedItems.forEach((item, index) => {
                if (item.product) {
                    // Add alternating row background
                    if (index % 2 === 0) {
                        doc.rect(50, y, doc.page.width - 100, 20)
                           .fill('#f9f9f9');
                    }

                    const itemTotal = (item.finalPrice || 0) * (item.quantity || 0);
                    subtotal += itemTotal;
                    
                    doc.fillColor('#333333')
                       .font('Helvetica')
                       .text(item.product.productName || 'N/A', 70, y + 5)
                       .text(item.quantity?.toString() || '0', 270, y + 5)
                       .text(`₹${(item.finalPrice || 0).toLocaleString()}`, 370, y + 5)
                       .text(`₹${itemTotal.toLocaleString()}`, 470, y + 5);
                    y += 20;
                }
            });
        }

        // Add totals section with colored background
        y += 20;
        doc.rect(50, y, doc.page.width - 100, 80)
           .fill('#f5f5f5');

        doc.fillColor('#333333')
           .font('Helvetica-Bold')
           .text('Subtotal:', 370, y + 10)
           .text(`₹${subtotal.toLocaleString()}`, 470, y + 10);

        const discount = order.discount || 0;
        if (discount > 0) {
            doc.fillColor('#487379')
               .text('Discount:', 370, y + 30)
               .text(`-₹${discount.toLocaleString()}`, 470, y + 30);
        }

        const finalAmount = subtotal - discount;
        doc.fillColor('#487379')
           .fontSize(12)
           .text('Total Amount:', 370, y + 50)
           .text(`₹${finalAmount.toLocaleString()}`, 470, y + 50);

        // Add footer with full width colored background
        const footerY = y + 120;
        
        // First line background
        doc.rect(0, footerY, doc.page.width, 30)
           .fill('#487379');
        
        // First line text
        doc.fillColor('white')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Thank you for shopping with Scentify!', 0, footerY + 8, {
               align: 'center',
               width: doc.page.width
           });

        // Second line background
        doc.rect(0, footerY + 30, doc.page.width, 25)
           .fill('#eef7f8');
        
        // Second line text
        doc.fillColor('#487379')
           .fontSize(10)
           .font('Helvetica')
           .text('This is a computer-generated invoice and does not require a signature.', 0, footerY + 35, {
               align: 'center',
               width: doc.page.width
           });

        // Finalize the PDF
        doc.end();

    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice');
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
    getOrderDetailsJson,
    downloadInvoice
};