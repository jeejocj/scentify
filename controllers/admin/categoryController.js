const Category = require("../../models/categoryModel");
const Product = require("../../models/productModel");



const categoryInfo = async (req,res)=>{
    try{
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        const searchTerm = req.query.search || '';


        // Create search query
        const searchQuery = searchTerm 
            ? {
                $or: [
                    { name: { $regex: searchTerm, $options: 'i' } },
                    { description: { $regex: searchTerm, $options: 'i' } }
                ]
            } 
            : {};

        const categoryData = await Category.find(searchQuery)
            .sort({createdAt:-1})
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalCategories / limit);
        
        res.render("category", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            searchTerm: searchTerm
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
        await newCategory.save;


        return res.status(200).json({message:"Category added successfully"})
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};



const addCategoryOffer = async (req, res) => {
    try {
        const { percentage, categoryId } = req.body;

        const parsedPercentage = parseInt(percentage);
        if (isNaN(parsedPercentage) || parsedPercentage <= 0 || parsedPercentage > 100) {
            return res.status(400).json({ status: false, message: "Invalid percentage value" });
        }

      
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        const products = await Product.find({ Category: category._id });
        const hasHigherOffer = products.some(product => product.productOffer > parsedPercentage);
        if (hasHigherOffer) {
            return res.status(400).json({ 
                status: false, 
                message: "Some products in this category have higher offers" 
            });
        }

      
        await Category.findByIdAndUpdate(categoryId, { $set: { categoryOffer: parsedPercentage } });

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

       
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

       
        if (!category.categoryOffer || category.categoryOffer === 0) {
            return res.status(400).json({ status: false, message: "No active offer for this category" });
        }

        
        await Category.findByIdAndUpdate(categoryId, { $set: { categoryOffer: 0 } });

        
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
        const id = req.params.id; 
        const { categoryName, description } = req.body;

    
        const existingCategory = await Category.findOne({ name: categoryName });

        
        if (existingCategory && existingCategory._id.toString() !== id) {
            
            return res.render('edit-category',{category:existingCategory,error: "Category exists, please choose another name" })
        }
        const category = await Category.findById(id);
        if(category.name === categoryName && category.description === description){
            return res.render('edit-category',{category:existingCategory,error: "No changes were made. Please update the data before submitting." })
        }
        
        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            {
                name: categoryName,
                description: description,
            },
            { new: true }
        );

        
        if (updatedCategory) {
            return res.redirect("/admin/category");
        } else {
            return res.status(404).json({ error: "Category not found" });
        }
    } catch (error) {
        
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