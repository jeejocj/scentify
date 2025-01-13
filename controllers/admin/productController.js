const Product=require("../../models/productModel");
const Category=require("../../models/categoryModel");
const Brand=require("../../models/brandModel");
const fs=require("fs")
const path = require("path")
const sharp=require("sharp");




const getProductAddPage = async(req,res)=>{
    try {
        const category = await Category.find({isListed:true})
        const brand = await Brand.find({isBlocked:false})
        
        res.render("product-add",{
            cat:category,
            brand:brand
        })
    } catch (error) {    
        res.redirect("/pageerror")
    }
};


const addProducts = async (req, res) => {
    try {
   
        const products = req.body;
        
        // Validate required fields
        // if (!products.productName || !products.description || !products.brand || 
        //     !products.category || !products.regularPrice || !products.quantity) {
        //     return res.status(400).json({ 
        //         success: false, 
        //         error: "All fields are required" 
        //     });
        // }

        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if (!productExists) {
            const images = [];
           
            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    try {
                        const file = req.files[i];
                        const originalImagePath = file.path;
                        const filename = file.filename;
                        const resizedImagePath = path.join(
                            "public",
                            "uploads",
                            "product-images",
                             filename
                        );

                        // Ensure directory exists
                        // const dir = path.join("public", "uploads", "product-images");
                        // if (!fs.existsSync(dir)) {
                        //     fs.mkdirSync(dir, { recursive: true });
                        // }

                        // Resize image
                        await sharp(originalImagePath)
                            .resize({ width: 440, height: 440 })
                            .toFile(resizedImagePath);

                        // Add the resized image filename to the array
                        images.push(filename);

                       

                    } catch (err) {
                        console.error('Error processing image:', err);
                    }
                }
            }

            if (images.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: "At least one product image is required" 
                });
            }
            
            const categoryId = await Category.findOne({ name: products.category });
            if (!categoryId) {
                return res.status(400).json({ 
                    success: false, 
                    error: "Invalid category name" 
                });
            }

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: products.brand,
                category: categoryId._id,
                regularPrice: parseFloat(products.regularPrice),
                salePrice: products.salePrice ? parseFloat(products.salePrice) : undefined,
                createdOn: new Date(),
                quantity: parseInt(products.quantity),
                productImage: images,
                status: "Available",
            });

            // console.log("Attempting to save product:", newProduct);
            
            try {
                await newProduct.save();
                // console.log("Product saved successfully");
                return res.status(200).json({ 
                    success: true, 
                    message: "Product added successfully" 
                });
            } catch (saveError) {
                console.error("Error saving product to database:", saveError);
                return res.status(500).json({ 
                    success: false, 
                    error: "Error saving product to database" 
                });
            }
        } else {
            return res.status(400).json({ 
                success: false, 
                error: "Product already exists. Please try with another name." 
            });
        }
    } catch (error) {
        console.error("Error in addProducts:", error);
        return res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};




const getAllProducts = async(req,res)=>{
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    if (page < 1) page = 1;
    const limit = 4;

    // Build search query
    const searchQuery = {
      $or: [
        { productName: { $regex: ".*" + search + ".*", $options: "i" } },
        { "brand.brandName": { $regex: ".*" + search + ".*", $options: "i" } }
      ]
    };

    // If search matches a category name, include products from that category
    const categoryMatch = await Category.findOne({
      name: { $regex: ".*" + search + ".*", $options: "i" }
    });
    
    if (categoryMatch) {
      searchQuery.$or.push({ category: categoryMatch._id });
    }

    // Fetch products with pagination
    const productData = await Product.find(searchQuery)
        .populate('brand')
        .populate('category')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();
    console.log(JSON.stringify(productData));
    // Get total count for pagination
    const count = await Product.countDocuments(searchQuery);

    // Fetch categories and brands
    const [categories, brands] = await Promise.all([
      Category.find({ isListed: true }).lean(),
      Brand.find({ isBlocked: false }).lean()
    ]);

    res.render("products", {
      data: productData,
      totalpages: Math.ceil(count / limit),
      currentPage: page,
      searchTerm: search,
      cat: categories,
      brand: brands
    });

  } catch (error) {
    console.error("Error in getAllProducts:", error);
    res.redirect("/admin/error");
  }
}




const addProductOffer = async (req, res) => {
    try {
        const productId = req.params.id;
        const percentage = req.params.amount;
        
        const findProduct = await Product.findById(productId);
        if (!findProduct) {
            return res.status(400).json({ 
                success: false, 
                error: "Product not found" 
            });
        }

        const findCategory = await Category.findById(findProduct.category);
        if (findCategory && findCategory.categoryOffer > percentage) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid category offer" 
            });
        }

        findProduct.salePrice = findProduct.regularPrice - Math.floor(findProduct.regularPrice * (percentage/100));
        findProduct.productOffer = parseInt(percentage);
        await findProduct.save();

        if (findCategory) {
            findCategory.categoryOffer = 0;
            await findCategory.save();
        }

        return res.status(200).json({ 
            success: true, 
            message: "Product offer added successfully" 
        });
    } catch (error) {
        console.error("Error in addProductOffer:", error);
        return res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const productId = req.params.id;
        const findProduct = await Product.findById(productId);
        
        if (!findProduct) {
            return res.status(400).json({ 
                success: false, 
                error: "Product not found" 
            });
        }

        const percentage = findProduct.productOffer;
        findProduct.salePrice = findProduct.regularPrice;
        findProduct.productOffer = 0;
        await findProduct.save();

        return res.status(200).json({ 
            success: true, 
            message: "Product offer removed successfully" 
        });
    } catch (error) {
        console.error("Error in removeProductOffer:", error);
        return res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

const blockProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        await Product.findByIdAndUpdate(productId, { isBlocked: true });
        return res.status(200).json({ 
            success: true, 
            message: "Product blocked successfully" 
        });
    } catch (error) {
        console.error("Error in blockProduct:", error);
        return res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

const unblockProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        await Product.findByIdAndUpdate(productId, { isBlocked: false });
        return res.status(200).json({ 
            success: true, 
            message: "Product unblocked successfully" 
        });
    } catch (error) {
        console.error("Error in unblockProduct:", error);
        return res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findById(id).populate(['brand', 'category']);
        const brand = await Brand.find({ isBlocked: false });
        const cat = await Category.find({ isListed: true });

        if (!product) {
            return res.redirect("/admin/products");
        }

        console.log('Product:', product);
        console.log('Categories:', cat);

        res.render("edit-product", { product, brand, cat });
    } catch (error) {
        console.error("Error in getEditProduct:", error);
        res.redirect("/admin/products");
    }
};

const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const {
            productName,
            description,
            brand: brandId,
            category: categoryId,
            regularPrice,
            salePrice,
            quantity
        } = req.body;

        // Input validation
        if (!productName || !description || !brandId || !categoryId || !regularPrice || !quantity) {
            return res.status(400).json({
                success: false,
                message: "Please fill all required fields"
            });
        }

        // Validate brand exists
        const brandDoc = await Brand.findById(brandId);
        if (!brandDoc) {
            return res.status(400).json({
                success: false,
                message: "Invalid brand selected"
            });
        }

        // Validate category exists
        const categoryDoc = await Category.findById(categoryId);
        if (!categoryDoc) {
            return res.status(400).json({
                success: false,
                message: "Invalid category selected"
            });
        }

        // Handle image uploads
        const images = [];
        if (req.files && req.files.length > 0) {
            for (let file of req.files) {
                images.push(file.filename);
            }
        }

        // Convert price and quantity to numbers
        const numRegularPrice = Number(regularPrice);
        const numSalePrice = salePrice ? Number(salePrice) : undefined;
        const numQuantity = Number(quantity);

        if (isNaN(numRegularPrice) || isNaN(numQuantity) || (salePrice && isNaN(numSalePrice))) {
            return res.status(400).json({
                success: false,
                message: "Invalid price or quantity values"
            });
        }

        // Prepare update object
        const updateFields = {
            productName,
            description,
            brand: brandId,
            category: categoryId,
            regularPrice: numRegularPrice,
            quantity: numQuantity,
            status: numQuantity > 0 ? "Available" : "out of stock"
        };

        // Only include salePrice if it's provided
        if (numSalePrice !== undefined) {
            updateFields.salePrice = numSalePrice;
        }

        // Add images if any were uploaded
        if (images.length > 0) {
            updateFields.$push = { productImage: { $each: images } };
        }

        // Update the product
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updateFields,
            { new: true, runValidators: true }
        ).populate(['brand', 'category']);

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: updatedProduct
        });

    } catch (error) {
        console.error("Error updating product:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update product"
        });
    }
};

const deleteSingleImage = async(req,res)=>{
    try {
        const { imageName, productId } = req.body;
        
        // Validate input
        if (!imageName || !productId) {
            return res.status(400).json({
                success: false,
                error: "Image name and product ID are required"
            });
        }

        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: "Product not found"
            });
        }

        // Check if image exists in product
        if (!product.productImage.includes(imageName)) {
            return res.status(404).json({
                success: false,
                error: "Image not found in product"
            });
        }

        // Update product
        await Product.findByIdAndUpdate(productId, {
            $pull: { productImage: imageName }
        });

        // Delete file
        const imagePath = path.join("public", "uploads", "product-images", imageName);
        if(fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        
        return res.status(200).json({ 
            success: true, 
            message: "Image deleted successfully" 
        });
    } catch (error) {
        console.error('Error deleting image:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Internal server error" 
        });
    }
}

const addProductImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No image file provided"
            });
        }

        const productId = req.body.productId;
        if (!productId) {
            return res.status(400).json({
                success: false,
                error: "Product ID is required"
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: "Product not found"
            });
        }

        if (product.productImage.length >= 4) {
            return res.status(400).json({
                success: false,
                error: "Maximum 4 images allowed"
            });
        }

        const file = req.file;
        const originalImagePath = file.path;
        const filename =   file.filename;
        const resizedImagePath = path.join(
            "public",
            "uploads",
            "product-images",
             filename
        );

        // Ensure directory exists
        const dir = path.join("public", "uploads", "product-images");
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Resize image
        await sharp(originalImagePath)
            .resize({ width: 800, height: 800 })
            .toFile(resizedImagePath);

        // Update product with new image
        await Product.findByIdAndUpdate(productId, {
            $push: { productImage: filename }
        });

        // Delete original file
        setTimeout(async () => {
            try {
                if (fs.existsSync(originalImagePath)) {
                    await fs.promises.unlink(originalImagePath);
                }
            } catch (err) {
                console.error('Error deleting original file:', err);
                // Continue execution even if deletion fails
            }
        }, 2000);

        return res.status(200).json({
            success: true,
            message: "Image uploaded successfully",
            imageName: filename
        });

    } catch (error) {
        console.error('Error uploading image:', error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to upload image"
        });
    }
};



module.exports={
    getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    updateProduct,
    deleteSingleImage,
    addProductImage
}