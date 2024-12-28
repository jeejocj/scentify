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
        if (!req.body.couponName || !req.body.startDate || !req.body.endDate || 
            !req.body.offerPrice || !req.body.minimumPrice) {
            return res.status(400).send("Invalid input: All fields are required.");
        }

        if (isNaN(new Date(req.body.startDate)) || isNaN(new Date(req.body.endDate))) {
            return res.status(400).send("Invalid dates provided.");
        }

        if (isNaN(req.body.offerPrice) || isNaN(req.body.minimumPrice)) {
            return res.status(400).send("Offer price and minimum price must be valid numbers.");
        }

        const data = {
            couponName: req.body.couponName,
            startDate: new Date(req.body.startDate + "T00:00:00"),
            endDate: new Date(req.body.endDate + "T00:00:00"),
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice)
        };

        const existingCoupon = await Coupon.findOne({
            createdOn: { $lte: data.endDate },
            expireOn: { $gte: data.startDate }
        });

        if (existingCoupon) {
            return res.status(400).send("A coupon with overlapping dates already exists.");
        }

        const newCoupon = new Coupon({
            name: data.couponName,
            createdOn: data.startDate,
            expireOn: data.endDate,
            offerPrice: data.offerPrice,
            minimumPrice: data.minimumPrice,
        });

        await newCoupon.save();
        res.status(201).send("Coupon created successfully.");
    } catch (error) {
        console.error("Error creating coupon:", error);
        res.redirect("pageerror");
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
      const { couponName, startDate, endDate, offerPrice, minimumPrice } = req.body;
      if (!couponName || !startDate || !endDate || !offerPrice || !minimumPrice) {
        return res.status(400).send("All fields (couponName, startDate, endDate, offerPrice, minimumPrice) are required.");
      }
  
      // Prepare data for update
      const updateData = {
        name: couponName,
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