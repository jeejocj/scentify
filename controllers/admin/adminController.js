const User = require("../../models/userModel");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Product = require("../../models/productModel");
const Order = require("../../models/orderModel");
const Category = require("../../models/categoryModel");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Handles rendering of the error page for the admin
const pageerror = async (req, res) => {
  try {
    res.render("admin-error");
  } catch (error) {
    console.error(error);
  }
};

// Handles the loading of the admin login page
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

// Handles the admin login process
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
    let endDate = new Date();
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
        select: 'productName price regularPrice salesPrice'
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

    // Calculate daily average
    const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    totals.dailyAverage = {
      orders: totals.count / daysDiff,
      revenue: totals.finalAmount / daysDiff,
      delivered: totals.deliveredCount / daysDiff
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
        select: 'productName price regularPrice salesPrice'
      })
      .sort({ createdOn: -1 });

    if (format === 'excel') {
      const Excel = require('exceljs');
      const workbook = new Excel.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      // Add title and period info
      worksheet.mergeCells('A1:I1');
      worksheet.getCell('A1').value = 'Sales Report';
      worksheet.getCell('A1').font = { bold: true, size: 16 };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A2:I2');
      worksheet.getCell('A2').value = `Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`;
      worksheet.getCell('A2').font = { bold: true };
      worksheet.getCell('A2').alignment = { horizontal: 'center' };

      worksheet.mergeCells('A3:I3');
      worksheet.getCell('A3').value = `Date Range: ${startDateTime.toLocaleDateString()} to ${endDateTime.toLocaleDateString()}`;
      worksheet.getCell('A3').font = { bold: true };
      worksheet.getCell('A3').alignment = { horizontal: 'center' };

      worksheet.addRow([]); // Empty row for spacing

      // Add headers with improved widths
      worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 12 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Products', key: 'products', width: 35 },
        { header: 'Original', key: 'totalPrice', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Final', key: 'finalAmount', width: 12 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Payment', key: 'paymentMethod', width: 18 }
      ];

      // Style the header row (now row 5 due to title and period info)
      worksheet.getRow(5).font = { bold: true };
      worksheet.getRow(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data with product details
      orders.forEach(order => {
        const productsText = order.orderedItems.map(item => 
          `${item.product?.productName || 'N/A'} (${item.quantity})`
        ).join(', ');

        worksheet.addRow({
          orderId: order.orderId,
          date: new Date(order.createdOn).toLocaleDateString(),
          customer: order.userId?.name || 'N/A',
          products: productsText,
          totalPrice: order.totalPrice,
          discount: order.totalPrice - order.finalAmount,
          finalAmount: order.finalAmount,
          status: order.status,
          paymentMethod: order.paymentMethod
        });
      });

      // Style all cells
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          if (cell.column === 5 || cell.column === 6 || cell.column === 7) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            cell.numFmt = '₹#,##0.00';
          }
        });
        row.height = 25;
      });

      // Add totals row with formatting
      const totalRow = worksheet.addRow({
        orderId: 'TOTAL',
        totalPrice: orders.reduce((sum, order) => sum + order.totalPrice, 0),
        discount: orders.reduce((sum, order) => sum + (order.totalPrice - order.finalAmount), 0),
        finalAmount: orders.reduce((sum, order) => sum + order.finalAmount, 0)
      });
      totalRow.font = { bold: true };
      totalRow.height = 25;

      // Set borders for all cells
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

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

      doc.moveDown();

      // Add period and date range info with styling
      const periodInfoY = titleHeight + 20;
      drawColoredRect(40, periodInfoY, doc.page.width - 80, 60, '#F5F6FA');
      
      doc.fontSize(12)
         .fillColor('#2C3E50')
         .text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, 60, periodInfoY + 10, { align: 'left' })
         .text(`Date Range: ${startDateTime.toLocaleDateString()} to ${endDateTime.toLocaleDateString()}`, 60, periodInfoY + 30, { align: 'left' });

      doc.moveDown(2);

      // Table settings
      const startX = 40;
      let currentY = doc.y + 20;
      const lineHeight = 30;  
      const columnWidths = {
        orderId: 70,
        date: 60,
        customer: 70,
        products: 120,  
        amount: 60,
        status: 60,
        payment: 80  // Increased width for payment method
      };

      // Draw table header
      drawColoredRect(startX, currentY, doc.page.width - 80, lineHeight, '#4A90E2');
      doc.fontSize(10)
         .fillColor('white')
         .text('Order ID', startX + 5, currentY + 7, { width: columnWidths.orderId - 10, align: 'left' })
         .text('Date', startX + columnWidths.orderId + 5, currentY + 7, { width: columnWidths.date - 10, align: 'left' })
         .text('Customer', startX + columnWidths.orderId + columnWidths.date + 5, currentY + 7, { width: columnWidths.customer - 10, align: 'left' })
         .text('Products', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + 5, currentY + 7, { width: columnWidths.products - 10, align: 'left' })
         .text('Amount', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + columnWidths.products + 5, currentY + 7, { width: columnWidths.amount - 10, align: 'right' })
         .text('Status', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + columnWidths.products + columnWidths.amount + 5, currentY + 7, { width: columnWidths.status - 10, align: 'left' })
         .text('Payment', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + columnWidths.products + columnWidths.amount + columnWidths.status + 5, currentY + 7, { width: columnWidths.payment - 10, align: 'left' });

      currentY += lineHeight;

      // Table rows with alternating colors
      orders.forEach((order, index) => {
        // Add new page if needed
        if (currentY > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          
          // Redraw header on new page
          drawColoredRect(startX, currentY, doc.page.width - 80, lineHeight, '#4A90E2');
          doc.fontSize(10)
             .fillColor('white')
             .text('Order ID', startX + 5, currentY + 7, { width: columnWidths.orderId - 10, align: 'left' })
             .text('Date', startX + columnWidths.orderId + 5, currentY + 7, { width: columnWidths.date - 10, align: 'left' })
             .text('Customer', startX + columnWidths.orderId + columnWidths.date + 5, currentY + 7, { width: columnWidths.customer - 10, align: 'left' })
             .text('Products', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + 5, currentY + 7, { width: columnWidths.products - 10, align: 'left' })
             .text('Amount', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + columnWidths.products + 5, currentY + 7, { width: columnWidths.amount - 10, align: 'right' })
             .text('Status', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + columnWidths.products + columnWidths.amount + 5, currentY + 7, { width: columnWidths.status - 10, align: 'left' })
             .text('Payment', startX + columnWidths.orderId + columnWidths.date + columnWidths.customer + columnWidths.products + columnWidths.amount + columnWidths.status + 5, currentY + 7, { width: columnWidths.payment - 10, align: 'left' });
          
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
        doc.text(order.userId?.name || 'N/A', xOffset, currentY + 7, { 
            width: columnWidths.customer - 10, 
            align: 'left' 
        });
        xOffset += columnWidths.customer;
        
        // Products with proper wrapping
        const productsText = order.orderedItems.map(item => {
            const productName = item.product?.productName || 'N/A';
            return `${productName} (${item.quantity})`;
        }).join('\n');  
        
        const productLines = doc.heightOfString(productsText, {
            width: columnWidths.products - 10,
            align: 'left'
        });
        
        const rowHeight = Math.max(lineHeight, productLines + 14);
        
        doc.text(productsText, xOffset, currentY + 7, {
            width: columnWidths.products - 10,
            align: 'left'
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

        currentY += rowHeight;
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
  logout,
  pageerror,
  loadSalesReport,
  downloadSalesReport
};
