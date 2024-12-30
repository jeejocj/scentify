const User = require("../../models/userModel");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Product = require("../../models/productModel");
const Order = require("../../models/orderModel");
const Category = require("../../models/categoryModel");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const pageerror = async (req, res) => {
  try {
    res.render("admin-error");
  } catch (error) {
    console.error(error);
  }
};

const loadLogin = (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    const error = req.session.adminError;
    req.session.adminError = null;
    res.render("admin-login", { message: error });
  } catch (error) {
    console.error(error);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });
    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = true;
        return res.redirect("/admin");
      } else {
        req.session.adminError = "Incorrect Password";
        return res.redirect("/admin/login");
      }
    } else {
      req.session.adminError = "Admin not found";
      return res.redirect("/admin/login");
    }
  } catch (error) {
    console.error("login error:", error);
    return res.redirect("/pageerror");
  }
};

const loadDashboard = async (req, res) => {
  try {
    // Get total users (excluding admin)
    const totalUsers = await User.countDocuments({ isAdmin: { $ne: true } });

    // Get total products
    const totalProducts = await Product.countDocuments();

    // Get orders and calculate totals
    const orders = await Order.find();
    const totalOrders = orders.length;

    // Calculate total revenue from delivered orders only
    const totalRevenue = orders
      .filter(order => order.status === 'Delivered')
      .reduce((acc, order) => acc + (order.finalAmount || 0), 0);

    // Get monthly sales data for chart
    const monthlyData = await getMonthlyData();

    // Get top selling products
    const topProducts = await getTopSellingProducts();

    res.render("dashboard", {
      admin: req.session.admin,
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      salesData: monthlyData,
      topProducts
    });

  } catch (error) {
    console.error('Error in loadDashboard:', error);
    res.redirect("/admin/pagerror");
  }
};

// Helper function to get monthly sales data
async function getMonthlyData() {
  try {
    const months = [];
    const values = [];

    // Get last 6 months of data
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      
      // Get start and end of month
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

      // Get orders for this month
      const monthlyOrders = await Order.find({
        createdOn: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'Delivered'
      });

      // Calculate total revenue for the month
      const monthlyRevenue = monthlyOrders.reduce((acc, order) => acc + (order.finalAmount || 0), 0);

      months.push(date.toLocaleString('default', { month: 'short' }));
      values.push(monthlyRevenue);
    }

    return {
      labels: months,
      values: values
    };
  } catch (error) {
    console.error('Error in getMonthlyData:', error);
    return { labels: [], values: [] };
  }
}

// Helper function to get top selling products
async function getTopSellingProducts() {
  try {
    // Aggregate pipeline to get top 5 selling products
    const topProducts = await Order.aggregate([
      // Match only delivered orders
      { $match: { status: 'Delivered' } },
      // Unwind the orderItems array
      { $unwind: '$orderItems' },
      // Group by product and sum quantities
      {
        $group: {
          _id: '$orderItems.product',
          totalQuantity: { $sum: '$orderItems.quantity' }
        }
      },
      // Sort by total quantity sold
      { $sort: { totalQuantity: -1 } },
      // Limit to top 5
      { $limit: 5 },
      // Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      // Project final format
      {
        $project: {
          _id: 1,
          name: { $arrayElemAt: ['$productDetails.name', 0] },
          sales: '$totalQuantity'
        }
      }
    ]);

    return topProducts;
  } catch (error) {
    console.error('Error in getTopSellingProducts:', error);
    return [];
  }
}

const logout = async (req, res) => {
  try {
    req.session.admin = false;
    res.redirect("/admin/login");
  } catch (error) {
    console.error(error);
  }
};

const loadSalesReport = async (req, res) => {
  try {
    const { period = 'daily', startDate: customStartDate, endDate: customEndDate, status = 'all' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    let startDate = new Date();
    
    switch(period) {
      case 'daily':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'yearly':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          startDate = new Date(customStartDate);
          endDate = new Date(customEndDate);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
    }

    // Build query
    let query = {
      createdOn: { 
        $gte: startDate, 
        $lte: endDate 
      }
    };

    if (status !== 'all') {
      query.status = status;
    }

    // Get orders within date range
    const orders = await Order.find(query)
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .populate({
        path: 'orderedItems.product',
        select: 'name price'
      })
      .sort({ createdOn: -1 });

    // Calculate totals
    const totals = {
      count: orders.length,
      finalAmount: orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
      totalPrice: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      discount: orders.reduce((sum, order) => sum + ((order.totalPrice - order.finalAmount) || 0), 0),
      cancelledCount: orders.filter(order => order.status === 'Cancelled').length,
      returnedCount: orders.filter(order => order.status === 'Returned').length,
      deliveredCount: orders.filter(order => order.status === 'Delivered').length,
      processingCount: orders.filter(order => order.status === 'Processing').length,
      shippedCount: orders.filter(order => order.status === 'Shipped').length,
      pendingCount: orders.filter(order => order.status === 'Pending').length,
      returnRequestCount: orders.filter(order => order.status === 'Return Request').length
    };

    // Calculate payment method statistics
    const paymentStats = orders.reduce((acc, order) => {
      acc[order.paymentMethod] = (acc[order.paymentMethod] || 0) + 1;
      return acc;
    }, {});

    // Get unique statuses for filter
    const uniqueStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'];

    res.render('salesReport', {
      orders,
      totals,
      period,
      status,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      paymentStats,
      uniqueStatuses
    });
  } catch (error) {
    console.error('Error loading sales report:', error);
    res.status(500).send('Error loading sales report');
  }
};

const downloadSalesReport = async (req, res) => {
  try {
    const { format, period, startDate, endDate, status = 'all' } = req.query;

    // Build date range query
    let dateQuery = {};
    const endDateTime = endDate ? new Date(endDate) : new Date();
    let startDateTime = new Date();

    switch (period) {
      case 'daily':
        startDateTime.setDate(startDateTime.getDate() - 1);
        break;
      case 'weekly':
        startDateTime.setDate(startDateTime.getDate() - 7);
        break;
      case 'monthly':
        startDateTime.setMonth(startDateTime.getMonth() - 1);
        break;
      case 'yearly':
        startDateTime.setFullYear(startDateTime.getFullYear() - 1);
        break;
      case 'custom':
        if (startDate) {
          startDateTime = new Date(startDate);
          endDateTime.setHours(23, 59, 59, 999);
        }
        break;
    }

    dateQuery = {
      createdOn: {
        $gte: startDateTime,
        $lte: endDateTime
      }
    };

    // Add status filter if specified
    if (status !== 'all') {
      dateQuery.status = status;
    }

    // Get orders
    const orders = await Order.find(dateQuery)
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .populate({
        path: 'orderedItems.product',
        select: 'name price'
      })
      .sort({ createdOn: -1 });

    if (format === 'excel') {
      const Excel = require('exceljs');
      const workbook = new Excel.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      // Add headers
      worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 25 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Original Amount', key: 'totalPrice', width: 15 },
        { header: 'Discount', key: 'discount', width: 15 },
        { header: 'Final Amount', key: 'finalAmount', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 }
      ];

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data
      orders.forEach(order => {
        worksheet.addRow({
          orderId: order.orderId,
          date: new Date(order.createdOn).toLocaleDateString(),
          customer: order.userId?.name || 'N/A',
          totalPrice: order.totalPrice,
          discount: order.totalPrice - order.finalAmount,
          finalAmount: order.finalAmount,
          status: order.status,
          paymentMethod: order.paymentMethod
        });
      });

      // Add totals row
      const totalRow = worksheet.addRow({
        orderId: 'TOTAL',
        totalPrice: orders.reduce((sum, order) => sum + order.totalPrice, 0),
        discount: orders.reduce((sum, order) => sum + (order.totalPrice - order.finalAmount), 0),
        finalAmount: orders.reduce((sum, order) => sum + order.finalAmount, 0)
      });
      totalRow.font = { bold: true };

      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=SalesReport-${period}-${new Date().toISOString().split('T')[0]}.xlsx`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } else if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({
        margins: {
          top: 50,
          bottom: 50,
          left: 40,
          right: 40
        },
        size: 'A4',
        layout: 'portrait'
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=SalesReport-${period}-${new Date().toISOString().split('T')[0]}.pdf`
      );

      // Pipe the PDF to the response
      doc.pipe(res);

      // Helper function to draw a colored rectangle
      function drawColoredRect(x, y, width, height, color) {
        doc.save()
           .fillColor(color)
           .rect(x, y, width, height)
           .fill()
           .restore();
      }

      // Add title with background
      const titleHeight = 40;
      drawColoredRect(0, 0, doc.page.width, titleHeight, '#4A90E2');
      doc.fontSize(24)
         .fillColor('white')
         .text('Sales Report', 0, 10, { align: 'center' });

      doc.moveDown(2);

      // Add period info with styling
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, { align: 'left' })
         .text(`Date Range: ${startDateTime.toLocaleDateString()} to ${endDateTime.toLocaleDateString()}`);

      doc.moveDown();

      // Add summary with colored background
      const totals = {
        count: orders.length,
        totalPrice: orders.reduce((sum, order) => sum + order.totalPrice, 0),
        discount: orders.reduce((sum, order) => sum + (order.totalPrice - order.finalAmount), 0),
        finalAmount: orders.reduce((sum, order) => sum + order.finalAmount, 0)
      };

      // Summary box
      const summaryX = 40;
      const summaryY = doc.y;
      const summaryWidth = doc.page.width - 80;
      const summaryHeight = 120;

      drawColoredRect(summaryX, summaryY, summaryWidth, summaryHeight, '#F5F6FA');
      doc.roundedRect(summaryX, summaryY, summaryWidth, summaryHeight, 5).stroke('#4A90E2');

      doc.fontSize(16)
         .fillColor('#2C3E50')
         .text('Summary', summaryX + 20, summaryY + 15);

      doc.fontSize(12)
         .fillColor('#34495E')
         .text(`Total Orders: ${totals.count}`, summaryX + 20, summaryY + 40)
         .text(`Total Amount: ₹${totals.totalPrice.toFixed(2)}`, summaryX + 20, summaryY + 60)
         .text(`Total Discount: ₹${totals.discount.toFixed(2)}`, summaryX + 20, summaryY + 80)
         .text(`Final Amount: ₹${totals.finalAmount.toFixed(2)}`, summaryX + 20, summaryY + 100);

      doc.moveDown(2);

      // Table settings
      const startX = 40;
      let currentY = doc.y + 20;
      const lineHeight = 25;
      const columnWidths = {
        orderId: 100,
        date: 80,
        customer: 90,
        products: 120,
        amount: 80,
        status: 70,
        payment: 80
      };

      // Draw table header
      drawColoredRect(startX, currentY, doc.page.width - 80, lineHeight, '#4A90E2');
      doc.fillColor('white')
         .fontSize(10);

      // Header texts with proper alignment
      let xOffset = startX + 5;
      doc.text('Order ID', xOffset, currentY + 7, { width: columnWidths.orderId, align: 'left' });
      xOffset += columnWidths.orderId;
      doc.text('Date', xOffset, currentY + 7, { width: columnWidths.date, align: 'left' });
      xOffset += columnWidths.date;
      doc.text('Customer', xOffset, currentY + 7, { width: columnWidths.customer, align: 'left' });
      xOffset += columnWidths.customer;
      doc.text('Products', xOffset, currentY + 7, { width: columnWidths.products, align: 'left' });
      xOffset += columnWidths.products;
      doc.text('Amount', xOffset, currentY + 7, { width: columnWidths.amount, align: 'right' });
      xOffset += columnWidths.amount;
      doc.text('Status', xOffset, currentY + 7, { width: columnWidths.status, align: 'left' });
      xOffset += columnWidths.status;
      doc.text('Payment', xOffset, currentY + 7, { width: columnWidths.payment, align: 'left' });

      currentY += lineHeight;

      // Table rows with alternating colors
      orders.forEach((order, index) => {
        // Add new page if needed
        if (currentY > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          
          // Redraw header on new page
          drawColoredRect(startX, currentY, doc.page.width - 80, lineHeight, '#4A90E2');
          doc.fillColor('white')
             .fontSize(10);
          
          let headerX = startX + 5;
          doc.text('Order ID', headerX, currentY + 7, { width: columnWidths.orderId, align: 'left' });
          headerX += columnWidths.orderId;
          doc.text('Date', headerX, currentY + 7, { width: columnWidths.date, align: 'left' });
          headerX += columnWidths.date;
          doc.text('Customer', headerX, currentY + 7, { width: columnWidths.customer, align: 'left' });
          headerX += columnWidths.customer;
          doc.text('Products', headerX, currentY + 7, { width: columnWidths.products, align: 'left' });
          headerX += columnWidths.products;
          doc.text('Amount', headerX, currentY + 7, { width: columnWidths.amount, align: 'right' });
          headerX += columnWidths.amount;
          doc.text('Status', headerX, currentY + 7, { width: columnWidths.status, align: 'left' });
          headerX += columnWidths.status;
          doc.text('Payment', headerX, currentY + 7, { width: columnWidths.payment, align: 'left' });
          
          currentY += lineHeight;
        }

        // Alternate row colors
        if (index % 2 === 0) {
          drawColoredRect(startX, currentY, doc.page.width - 80, lineHeight, '#F8F9FA');
        }

        doc.fillColor('#2C3E50')
           .fontSize(9);

        let xOffset = startX + 5;
        
        // Order ID
        doc.text(order.orderId.toString(), xOffset, currentY + 7, { 
            width: columnWidths.orderId - 10, 
            align: 'left' 
        });
        xOffset += columnWidths.orderId;
        
        // Date
        doc.text(new Date(order.createdOn).toLocaleDateString(), xOffset, currentY + 7, { 
            width: columnWidths.date - 10, 
            align: 'left' 
        });
        xOffset += columnWidths.date;
        
        // Customer
        doc.text(order.userId?.name || 'Guest User', xOffset, currentY + 7, { 
            width: columnWidths.customer - 10, 
            align: 'left' 
        });
        xOffset += columnWidths.customer;
        
        // Products
        const productsText = order.orderedItems.map(item => {
            const productName = item.product?.name || 'Product Unavailable';
            return `${productName} (${item.quantity})`;
        }).join(', ');
        
        doc.text(productsText || 'No products', xOffset, currentY + 7, {
            width: columnWidths.products - 10,
            align: 'left',
            ellipsis: true
        });
        xOffset += columnWidths.products;
        
        // Amount
        doc.text(`₹${order.finalAmount.toFixed(2)}`, xOffset, currentY + 7, { 
            width: columnWidths.amount - 10, 
            align: 'right' 
        });
        xOffset += columnWidths.amount;
        
        // Status with color coding
        const statusColors = {
            'Pending': '#FFA500',
            'Processing': '#3498DB',
            'Shipped': '#2980B9',
            'Delivered': '#27AE60',
            'Cancelled': '#E74C3C',
            'Return Request': '#F39C12',
            'Returned': '#95A5A6'
        };
        doc.fillColor(statusColors[order.status] || '#2C3E50')
           .text(order.status, xOffset, currentY + 7, { 
               width: columnWidths.status - 10, 
               align: 'left' 
           });
        xOffset += columnWidths.status;
        
        // Payment Method
        doc.fillColor('#2C3E50')
           .text(order.paymentMethod === 'Online Payment' ? 'Online' : order.paymentMethod, xOffset, currentY + 7, { 
               width: columnWidths.payment - 10, 
               align: 'left' 
           });

        currentY += lineHeight;
      });

      // Add footer
      const footerY = doc.page.height - 50;
      drawColoredRect(0, footerY, doc.page.width, 40, '#4A90E2');
      doc.fillColor('white')
         .fontSize(10)
         .text(
             'Generated on ' + new Date().toLocaleString(),
             0,
             footerY + 15,
             { align: 'center' }
         );

      // Finalize PDF
      doc.end();
    } else {
      res.status(400).send('Invalid format specified');
    }
  } catch (error) {
    console.error('Error downloading sales report:', error);
    res.status(500).send('Error downloading sales report');
  }
};

module.exports = {

  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
  loadSalesReport,
  downloadSalesReport
};
