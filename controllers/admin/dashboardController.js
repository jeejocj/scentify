const Order = require('../../models/orderModel');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const User = require('../../models/userModel');

// Load dashboard with initial data
const loadDashboard = async (req, res) => {
    try {
        // Get total users (excluding admin)
        const totalUsers = await User.countDocuments({ isAdmin: { $ne: true } });

        // Get total products
        const totalProducts = await Product.countDocuments();

        // Get total orders and revenue
        const orders = await Order.find({ paymentStatus: 'Completed' });
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((acc, order) => acc + (order.finalAmount || 0), 0);

        // Get current year for initial chart data
        const currentYear = new Date().getFullYear();

        // Get initial top 10 data
        const [topProducts, topCategories, topBrands] = await Promise.all([
            Order.aggregate([
                { $match: { paymentStatus: 'Completed' } },
                { $unwind: '$orderedItems' },
                {
                    $group: {
                        _id: '$orderedItems.productId',
                        name: { $first: '$orderedItems.name' },
                        count: { $sum: '$orderedItems.quantity' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            Order.aggregate([
                { $match: { paymentStatus: 'Completed' } },
                { $unwind: '$orderedItems' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'orderedItems.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: '$product.category',
                        name: { $first: '$product.category' },
                        count: { $sum: '$orderedItems.quantity' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            Order.aggregate([
                { $match: { paymentStatus: 'Completed' } },
                { $unwind: '$orderedItems' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'orderedItems.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: '$product.brand',
                        name: { $first: '$product.brand' },
                        count: { $sum: '$orderedItems.quantity' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        // Get monthly data for initial chart
        const monthlyData = await Order.aggregate([
            {
                $match: {
                    paymentStatus: 'Completed',
                    createdOn: {
                        $gte: new Date(currentYear, 0, 1),
                        $lt: new Date(currentYear + 1, 0, 1)
                    }
                }
            },
            {
                $group: {
                    _id: { $month: '$createdOn' },
                    total: { $sum: '$finalAmount' }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        // Format monthly data
        const months = Array(12).fill(0);
        monthlyData.forEach(item => {
            months[item._id - 1] = item.total;
        });

        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        res.render('dashboard', {
            admin: req.session.admin,
            totalUsers,
            totalProducts,
            totalOrders,
            totalRevenue,
            topProducts,
            topCategories,
            topBrands,
            initialSalesData: {
                labels,
                data: months
            }
        });

    } catch (error) {
        console.error('Error in loadDashboard:', error);
        res.status(500).render('admin-error');
    }
};

// Get sales data based on filter
const getSalesData = async (req, res) => {
    try {
        const { filter, year } = req.query;
        const startYear = parseInt(year);
        let labels = [];
        let data = [];
        
        switch(filter) {
            case 'yearly':
                // Get last 5 years data
                for (let i = 4; i >= 0; i--) {
                    const yearData = await Order.aggregate([
                        {
                            $match: {
                                createdOn: {
                                    $gte: new Date(startYear - i, 0, 1),
                                    $lt: new Date(startYear - i + 1, 0, 1)
                                },
                                paymentStatus: 'Completed'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$finalAmount' }
                            }
                        }
                    ]);
                    labels.push(startYear - i);
                    data.push(yearData[0]?.total || 0);
                }
                break;

            case 'monthly':
                // Get monthly data for selected year
                for (let month = 0; month < 12; month++) {
                    const monthData = await Order.aggregate([
                        {
                            $match: {
                                createdOn: {
                                    $gte: new Date(startYear, month, 1),
                                    $lt: new Date(startYear, month + 1, 1)
                                },
                                paymentStatus: 'Completed'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$finalAmount' }
                            }
                        }
                    ]);
                    labels.push(new Date(2000, month, 1).toLocaleString('default', { month: 'short' }));
                    data.push(monthData[0]?.total || 0);
                }
                break;

            case 'weekly':
                // Get weekly data for current month
                const currentMonth = new Date().getMonth();
                const weeksInMonth = getWeeksInMonth(startYear, currentMonth);
                
                for (let week = 0; week < weeksInMonth; week++) {
                    const startDate = new Date(startYear, currentMonth, week * 7 + 1);
                    const endDate = new Date(startYear, currentMonth, (week + 1) * 7 + 1);
                    
                    const weekData = await Order.aggregate([
                        {
                            $match: {
                                createdOn: {
                                    $gte: startDate,
                                    $lt: endDate
                                },
                                paymentStatus: 'Completed'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$finalAmount' }
                            }
                        }
                    ]);
                    labels.push(`Week ${week + 1}`);
                    data.push(weekData[0]?.total || 0);
                }
                break;

            case 'daily':
                // Get daily data for current month
                const daysInMonth = new Date(startYear, new Date().getMonth() + 1, 0).getDate();
                for (let day = 1; day <= daysInMonth; day++) {
                    const dayData = await Order.aggregate([
                        {
                            $match: {
                                createdOn: {
                                    $gte: new Date(startYear, new Date().getMonth(), day),
                                    $lt: new Date(startYear, new Date().getMonth(), day + 1)
                                },
                                paymentStatus: 'Completed'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$finalAmount' }
                            }
                        }
                    ]);
                    labels.push(day);
                    data.push(dayData[0]?.total || 0);
                }
                break;
        }

        res.json({ labels, data });
    } catch (error) {
        console.error('Error getting sales data:', error);
        res.status(500).json({ error: 'Error getting sales data' });
    }
};

// Get top 10 selling products
const getTopProducts = async (req, res) => {
    try {
        const topProducts = await Order.aggregate([
            { $match: { paymentStatus: 'Completed' } },
            { $unwind: '$orderedItems' },
            {
                $group: {
                    _id: '$orderedItems.productId',
                    name: { $first: '$orderedItems.name' },
                    count: { $sum: '$orderedItems.quantity' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json(topProducts);
    } catch (error) {
        console.error('Error getting top products:', error);
        res.status(500).json({ error: 'Error getting top products' });
    }
};

// Get top 10 selling categories
const getTopCategories = async (req, res) => {
    try {
        const topCategories = await Order.aggregate([
            { $match: { paymentStatus: 'Completed' } },
            { $unwind: '$orderedItems' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItems.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    name: { $first: '$product.category' },
                    count: { $sum: '$orderedItems.quantity' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json(topCategories);
    } catch (error) {
        console.error('Error getting top categories:', error);
        res.status(500).json({ error: 'Error getting top categories' });
    }
};

// Get top 10 selling brands
const getTopBrands = async (req, res) => {
    try {
        const topBrands = await Order.aggregate([
            { $match: { paymentStatus: 'Completed' } },
            { $unwind: '$orderedItems' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItems.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.brand',
                    name: { $first: '$product.brand' },
                    count: { $sum: '$orderedItems.quantity' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json(topBrands);
    } catch (error) {
        console.error('Error getting top brands:', error);
        res.status(500).json({ error: 'Error getting top brands' });
    }
};

// Helper function to get number of weeks in a month
function getWeeksInMonth(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return Math.ceil((lastDay.getDate() - firstDay.getDate() + 1) / 7);
}

module.exports = {
    loadDashboard,
    getSalesData,
    getTopProducts,
    getTopCategories,
    getTopBrands,
    getWeeksInMonth
};