const Brand = require('../../models/brandModel')
const sharp = require('sharp')

const getBrandPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const searchTerm = req.query.search || '';
        
        let query = {};
        if (searchTerm) {
            query = {
                brandName: { $regex: new RegExp(searchTerm, 'i') }
            };
        }

        const totalBrands = await Brand.countDocuments(query);
        const totalPages = Math.ceil(totalBrands / limit);
        const skip = (page - 1) * limit;

        const data = await Brand.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('brands', {
            data,
            currentPage: page,
            totalPages,
            totalBrands,
            searchTerm
        });
    } catch (error) {
        console.error('Error in getBrandPage:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const addBrand = async (req, res) => {
    try {
        const { name } = req.body;
        const file = req.file;

        if (!name || !file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Brand name and image are required' 
            });
        }

        const existingBrand = await Brand.findOne({ 
            brandName: { $regex: new RegExp('^' + name + '$', 'i') } 
        });
        
        if (existingBrand) {
            return res.status(409).json({ 
                success: false, 
                message: 'Brand already exists' 
            });
        }

        const brand = new Brand({
            brandName: name,
            brandImage: [file.filename]
        });

        await brand.save();
        return res.status(200).json({ 
            success: true, 
            message: 'Brand added successfully' 
        });
    } catch (error) {
        console.error('Error in addBrand:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error adding brand' 
        });
    }
};

const blockBrand = async (req, res) => {
    try {
        const id = req.params.id;
        const page = req.query.page || 1;
        const searchTerm = req.query.search || '';
        
        await Brand.findByIdAndUpdate(id, { isBlocked: true });
        
        res.redirect(`/admin/brands?page=${page}${searchTerm ? '&search=' + searchTerm : ''}`);
    } catch (error) {
        console.error('Error in blockBrand:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const unBlockBrand = async (req, res) => {
    try {
        const id = req.params.id;
        const page = req.query.page || 1;
        const searchTerm = req.query.search || '';
        
        await Brand.findByIdAndUpdate(id, { isBlocked: false });
        
        res.redirect(`/admin/brands?page=${page}${searchTerm ? '&search=' + searchTerm : ''}`);
    } catch (error) {
        console.error('Error in unBlockBrand:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const deleteBrand = async (req, res) => {
    try {
        const id = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const searchTerm = req.query.search || '';
        const limit = 4; 
        
        
        await Brand.findByIdAndDelete(id);
        
        
        const totalBrands = await Brand.countDocuments({
            ...(searchTerm && {
                name: { $regex: searchTerm, $options: 'i' }
            })
        });
        const totalPages = Math.ceil(totalBrands / limit);
        
        if (page > totalPages && page > 1) {
            res.redirect(`/admin/brands?page=${page - 1}${searchTerm ? '&search=' + searchTerm : ''}`);
        } else {
            res.redirect(`/admin/brands?page=${page}${searchTerm ? '&search=' + searchTerm : ''}`);
        }
    } catch (error) {
        console.error('Error in deleteBrand:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

module.exports = {
    getBrandPage,
    addBrand,
    blockBrand,
    unBlockBrand,
    deleteBrand
};