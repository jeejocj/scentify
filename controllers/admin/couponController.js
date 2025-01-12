const mongoose = require("mongoose");
const Coupon = require("../../models/couponModel");

const loadcoupon = async (req, res) => {
    try {
        const coupons = await Coupon.find();
        res.render('coupon', { coupons });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
};

const createCoupon = async (req, res) => {
    try {
        const {
            couponName,
            startDate,
            endDate,
            offerPrice,
            minimumPrice
        } = req.body;

        if (!couponName || !startDate || !endDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        const parsedStartDate = new Date(startDate + "T00:00:00");
        const parsedEndDate = new Date(endDate + "T00:00:00");

        if (isNaN(parsedStartDate) || isNaN(parsedEndDate)) {
            return res.status(400).json({
                success: false,
                message: "Invalid dates provided."
            });
        }

        if (parsedStartDate >= parsedEndDate) {
            return res.status(400).json({
                success: false,
                message: "End date must be after start date."
            });
        }

        const parsedOfferPrice = parseInt(offerPrice);
        const parsedMinimumPrice = parseInt(minimumPrice);

        if (isNaN(parsedOfferPrice) || isNaN(parsedMinimumPrice)) {
            return res.status(400).json({
                success: false,
                message: "Invalid price values."
            });
        }

        const existingCoupon = await Coupon.findOne({
            name: { $regex: new RegExp(`^${couponName}$`, 'i') }
        });

        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: "Coupon already exists."
            });
        }

        const newCoupon = new Coupon({
            name: couponName,
            createdOn: parsedStartDate,
            expireOn: parsedEndDate,
            offerPrice: parsedOfferPrice,
            minimumPrice: parsedMinimumPrice,
            isListed: true
        });

        await newCoupon.save();

        res.status(201).json({
            success: true,
            message: "Coupon created successfully"
        });

    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

const listCoupon = async (req, res) => {
    try {
        const id = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid coupon ID." 
            });
        }

        const coupon = await Coupon.findById(id);
        
        if (!coupon) {
            return res.status(404).json({ 
                success: false, 
                message: "Coupon not found." 
            });
        }

        coupon.isListed = true;
        await coupon.save();

        res.status(200).json({ 
            success: true, 
            message: "Coupon listed successfully." 
        });
    } catch (error) {
        console.error("Error listing coupon:", error);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error." 
        });
    }
};

const unlistCoupon = async (req, res) => {
    try {
        const id = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid coupon ID." 
            });
        }

        const coupon = await Coupon.findById(id);
        
        if (!coupon) {
            return res.status(404).json({ 
                success: false, 
                message: "Coupon not found." 
            });
        }

        coupon.isListed = false;
        await coupon.save();

        res.status(200).json({ 
            success: true, 
            message: "Coupon unlisted successfully." 
        });
    } catch (error) {
        console.error("Error unlisting coupon:", error);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error." 
        });
    }
};

module.exports = {
    loadcoupon,
    createCoupon,
    listCoupon,
    unlistCoupon
};