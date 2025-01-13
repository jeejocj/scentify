const Product = require("../../models/productModel");
const Category = require("../../models/categoryModel");
const Brand = require("../../models/brandModel");
const User = require("../../models/userModel");

const loadShoppingPage = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = await User.findById(user);
    const categories = await Category.find({ isListed: true });
    const brands = await Brand.find({ isBlocked: false });

    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    // Base query
    let query = {
      isBlocked: false,
    };

    // Handle multiple category filters
    if (req.query.categories && req.query.categories.length > 0) {
      const categoryIds = Array.isArray(req.query.categories) 
        ? req.query.categories 
        : [req.query.categories];
      query.category = { $in: categoryIds };
    } else {
      // If no categories selected, show products from all listed categories
      query.category = { $in: categories.map(cat => cat._id) };
    }

    // Handle multiple brand filters
    if (req.query.brands && req.query.brands.length > 0) {
      const brandIds = Array.isArray(req.query.brands) 
        ? req.query.brands 
        : [req.query.brands];
      query.brand = { $in: brandIds };
    }

    // Price range filter
    if (req.query.minPrice || req.query.maxPrice) {
      query.regularPrice = {};
      if (req.query.minPrice) {
        query.regularPrice.$gte = parseFloat(req.query.minPrice);
      }
      if (req.query.maxPrice) {
        query.regularPrice.$lte = parseFloat(req.query.maxPrice);
      }
    }

    // Stock filter
    if (req.query.inStock === 'true') {
      query.quantity = { $gt: 0 };
    }

    // Search functionality
    if (req.query.query) {
      const searchRegex = new RegExp(req.query.query, 'i');
      query.productName = searchRegex;
    }

    // Default sort
    let sort = { createdOn: -1 };

    // Advanced sorting
    const sortOption = req.query.sort;
    if (sortOption) {
      switch (sortOption) {
        case 'popularity':
          sort = { salesCount: -1 };
          break;
        case 'price_asc':
          sort = { regularPrice: 1 };
          break;
        case 'price_desc':
          sort = { regularPrice: -1 };
          break;
        case 'newest':
          sort = { createdOn: -1 };
          break;
        case 'name_asc':
          sort = { productName: 1 };
          break;
        case 'name_desc':
          sort = { productName: -1 };
          break;
      }
    }

    // Fetch products with all filters applied
    const products = await Product.find(query)
      .collation({ locale: "en", strength: 2 })
      .populate('category')
      .populate('brand')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate final prices considering both category and product offers
    const productsWithPrices = products.map(product => {
      // Calculate category offer price
      let categoryOfferPrice = product.regularPrice;
      if (product.category?.categoryOffer > 0) {
        categoryOfferPrice = product.regularPrice - (product.regularPrice * (product.category.categoryOffer / 100));
      }

      // Calculate product offer price
      let productOfferPrice = product.regularPrice;
      if (product.productOffer > 0) {
        productOfferPrice = product.regularPrice - (product.regularPrice * (product.productOffer / 100));
      }

      // Get the best price (lowest among regular, sale, category offer, and product offer)
      const finalPrice = Math.min(
        product.regularPrice,
        product.salePrice || product.regularPrice,
        categoryOfferPrice,
        productOfferPrice
      );

      // Calculate savings and discount percentage
      const totalSavings = product.regularPrice - finalPrice;
      const discountPercentage = Math.round((totalSavings / product.regularPrice) * 100);

      return {
        ...product,
        finalPrice,
        savings: totalSavings,
        discountPercentage
      };
    });

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render("shop", {
      user: userData,
      products: productsWithPrices,
      categories,
      brands,
      totalProducts,
      currentPage: page,
      totalPages,
      query: req.query
    });

  } catch (error) {
    console.error('Error in loadShoppingPage:', error);
    res.status(500).render("error", { message: "Internal server error" });
  }
};

module.exports = {
  loadShoppingPage,
};