const mongoose = require("mongoose");

const {Schema} = mongoose;

const couponSchema = new mongoose.Schema({
    name:{
        type:String,
        required:true,
        unique:true
    },
    type: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    createdOn :{
        type:Date,
        default:Date.now,
        requried:true
    },
    expireOn :{
        type:Date,
        required:true
    },
    offerPrice:{
        type:Number,
        required:true
    },
    minimumPrice:{
        type:Number,
        required:true
    },
    isList:{
        type:Boolean,
        default:true
    },
    userId:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User'
    }]


})

const Coupon = mongoose.model("Coupon",couponSchema);

module.exports = Coupon;