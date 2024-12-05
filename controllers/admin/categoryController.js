const Category = require("../../models/categoryModel");
const Product = require("../../models/productModel");



const categoryInfo = async (req,res)=>{
    try{
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({})
            .sort({createdAt:-1})
            .skip(skip)
            .limit(limit);

        // console.log(categoryData)
            const totalCategories = await Category.countDocuments();
            const totalPages = Math.ceil(totalCategories / limit);
            res.render("category",{
                cat:categoryData,
                currentPage:page,
                totalPages:totalPages,
                totalCategories:totalCategories
            });
        
    }catch (error){
        console.error(error);
        res.redirect("/pageerror")
    }
}



const addCategory = async (req, res) => {
    const { name, description } = req.body;
    try {
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {

             return res.status(400).json({error:"Category alresdy exists"})
        }

        const newCategory = new Category({
            name,
            description
        });
        await newCategory.save();


        return res.status(200).json({message:"Category added successfully"})
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};



const addCategoryOffer = async (req, res) => {
    try {
        const { percentage, categoryId } = req.body;
        console.log(percentage, categoryId)

        // Validate percentage
        const parsedPercentage = parseInt(percentage);
        if (isNaN(parsedPercentage) || parsedPercentage <= 0 || parsedPercentage > 100) {
            return res.status(400).json({ status: false, message: "Invalid percentage value" });
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        // Check if any product in the category has a higher offer
        const products = await Product.find({ Category: category._id });
        const hasHigherOffer = products.some(product => product.productOffer > parsedPercentage);
        if (hasHigherOffer) {
            return res.status(400).json({ 
                status: false, 
                message: "Some products in this category have higher offers" 
            });
        }

        // Update category offer
        await Category.findByIdAndUpdate(categoryId, { $set: { categoryOffer: parsedPercentage } });

        // Adjust product prices and reset product offers
        await Product.updateMany(
            { Category: category._id },
            [
                {
                    $set: {
                        productOffer: 0,
                        salePrice: { $multiply: ["$regularPrice", (1 - parsedPercentage / 100)] }
                    }
                }
            ]
        );

        return res.json({ status: true, message: "Category offer added successfully" });
    } catch (error) {
        console.error("Error adding category offer:", error);
        return res.status(500).json({ 
            status: false, 
            message: "Internal Server Error", 
            error: error.message 
        });
    }
};

const removeCategoryOffer = async (req, res) => {
    try {
        const { categoryId } = req.body;

        // Validate category existence
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        // Check if category offer exists
        if (!category.categoryOffer || category.categoryOffer === 0) {
            return res.status(400).json({ status: false, message: "No active offer for this category" });
        }

        // Remove category offer
        await Category.findByIdAndUpdate(categoryId, { $set: { categoryOffer: 0 } });

        // Reset product prices (optional)
        await Product.updateMany(
            { Category: category._id },
            [
                {
                    $set: {
                        salePrice: "$regularPrice",
                        productOffer: 0
                    }
                }
            ]
        );

        return res.json({ status: true, message: "Category offer removed successfully" });
    } catch (error) {
        console.error("Error removing category offer:", error);
        return res.status(500).json({ 
            status: false, 
            message: "Internal Server Error", 
            error: error.message 
        });
    }
};

const getListCategory = async (req,res)=>{
    try{
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect("/admin/category");
    }catch (error){
        res.redirect("/pageerror");
    }
}

const getUnListCategory = async (req,res)=>{
    try{
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect("/admin/category");
    }catch (error){
        res.redirect("/pageerror");
    }
}

const getEditCategory = async(req,res)=>{
    try{
        const id = req.query.id;
        const category = await Category.findOne({_id:id});
        res.render("edit-category",{category:category});
    }catch{
        res.redirect("/pageerror")
    }
};



const editCategory = async (req, res) => {
    try {
        const id = req.params.id; // Corrected 'req.param.id' to 'req.params.id'
        const { categoryName, description } = req.body;

        // Check if a category with the same name already exists
        const existingCategory = await Category.findOne({ name: categoryName });

        // Ensure the name isn't being updated to an existing category's name
        if (existingCategory && existingCategory._id.toString() !== id) {
            return res.status(400).json({ error: "Category exists, please choose another name" });
        }

        // Update the category by its ID
        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            {
                name: categoryName,
                description: description,
            },
            { new: true } // Return the updated document
        );

        // Handle the response based on whether the update was successful
        if (updatedCategory) {
            return res.redirect("/admin/category");
        } else {
            return res.status(404).json({ error: "Category not found" });
        }
    } catch (error) {
        // Handle unexpected errors
        console.error("Error updating category:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};


module.exports = {
    categoryInfo,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnListCategory,
    getEditCategory,
    editCategory
}