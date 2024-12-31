const mongoose = require("mongoose");
const Coupon = require("../../models/couponModel");

const loadcoupon = async (req, res) => {
    try {
        const coupons = await Coupon.find(); 
        res.render('coupon', { coupons }); // Pass coupons to the view
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
};

const createCoupon = async (req, res) => {
    try {
        // 1. Destructure all required fields from req.body
        const {
            couponName,
            startDate,
            endDate,
            offerPrice,
            minimumPrice
        } = req.body;

        // 2. Log the received data
        console.log('Received Coupon Data:', {
            couponName,
            startDate,
            endDate,
            offerPrice,
            minimumPrice
        });

        // 3. Validate all required fields are present
        if (!couponName || !startDate || !endDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                success: false,
                message: "Invalid input: All fields are required."
            });
        }

        // 4. Convert and validate dates
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

        // 5. Validate price fields
        const parsedOfferPrice = parseInt(offerPrice);
        const parsedMinimumPrice = parseInt(minimumPrice);

        if (isNaN(parsedOfferPrice) || isNaN(parsedMinimumPrice)) {
            return res.status(400).json({
                success: false,
                message: "Offer price and minimum price must be valid numbers."
            });
        }

        if (parsedOfferPrice <= 0 || parsedMinimumPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: "Prices must be greater than 0."
            });
        }

        if (parsedOfferPrice >= parsedMinimumPrice) {
            return res.status(400).json({
                success: false,
                message: "Offer price must be less than minimum price."
            });
        }

        // 6. Check for existing coupon with same name
        const existingCoupon = await Coupon.findOne({
            name: { $regex: new RegExp(`^${couponName}$`, 'i') } // Case-insensitive name check
        });

        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: "A coupon with this name already exists."
            });
        }

        // 7. Create and save the new coupon
        const newCoupon = new Coupon({
            name: couponName,
            createdOn: parsedStartDate,
            expireOn: parsedEndDate,
            offerPrice: parsedOfferPrice,
            minimumPrice: parsedMinimumPrice,
        });

        await newCoupon.save();
        console.log('Coupon created successfully:', newCoupon);
        
        res.status(201).json({
            success: true,
            message: "Coupon created successfully",
            coupon: newCoupon
        });
    } catch (error) {
        console.error("Error creating coupon:", error);
        res.status(500).json({
            success: false,
            message: "Error creating coupon. Please try again.",
            error: error.message
        });
    }
};

const editCoupon = async (req, res) => {
    try {
        const id = req.query.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send("Invalid coupon ID.");
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).send("Coupon not found.");
        }

        res.render("edit-coupon", { coupon });
    } catch (error) {
        console.error("Error loading coupon for edit:", error);
        res.status(500).send("Server error.");
    }
};

const updateCoupon = async (req, res) => {
    try {
      const id = req.query.id;
  
      // Validate coupon ID
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).send("Invalid coupon ID.");
      }
  
      // Validate required fields
      const { couponName, startDate, endDate, offerPrice, minimumPrice, type } = req.body;
      if (!couponName || !startDate || !endDate || !offerPrice || !minimumPrice || !type) {
        return res.status(400).send("All fields (couponName, startDate, endDate, offerPrice, minimumPrice, type) are required.");
      }
  
      // Prepare data for update
      const updateData = {
        name: couponName,
        type: type,
        createdOn: new Date(startDate),
        expireOn: new Date(endDate),
        offerPrice: parseInt(offerPrice),
        minimumPrice: parseInt(minimumPrice),
      };
  
      // Perform update
      const updatedCoupon = await Coupon.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true } // Ensure schema validation during update
      );
  
      if (!updatedCoupon) {
        return res.status(404).send("Coupon not found.");
      }
  
      res.status(200).send("Coupon updated successfully.");
    } catch (error) {
      console.error("Error updating coupon:", error);
      res.status(500).send("Internal server error.");
    }
  };
  

// Delete Coupon
const deleteCoupon = async (req, res) => {
  try {
      const id = req.params.id;
      
      console.log("Attempting to delete coupon with ID:", id);
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
          console.log("Invalid coupon ID:", id);
          return res.status(400).json({ success: false, message: "Invalid coupon ID." });
      }

      const deletedCoupon = await Coupon.findByIdAndDelete(id);
      
      if (deletedCoupon) {
          console.log("Coupon deleted successfully:", deletedCoupon);
          res.status(200).json({ success: true, message: "Coupon deleted successfully." });
      } else {
          console.log("Coupon not found with ID:", id);
          res.status(404).json({ success: false, message: "Coupon not found." });
      }
  } catch (error) {
      console.error("Error deleting coupon:", error);
      res.status(500).json({ 
          success: false, 
          message: "Internal server error.",
          error: error.message 
      });
  }
};

module.exports = {
    loadcoupon,
    createCoupon,
    editCoupon,
    updateCoupon,
    deleteCoupon,
};