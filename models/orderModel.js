const mongoose = require("mongoose");
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');

const orderSchema = new Schema({
    orderId : {
        type:String,
        default:()=>uuidv4(),
        unique:true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderedItems:[{
        product:{
            type:Schema.Types.ObjectId,
            ref:'Product',
            required:true
        },
        quantity:{
            type:Number,
            required:true
        },
        regularPrice:{
            type:Number,
            required:true
        },
        finalPrice:{
            type:Number,
            required:true
        },
        discountPercentage:{
            type:Number,
            default:0
        },
        offerType:{
            type:String,
            enum:['regular', 'category', 'product', 'sale'],
            default:'regular'
        }
    }],
    totalPrice:{
        type:Number,
        required:true
    },
    discount:{
        type:Number,
        default:0
    },
    finalAmount:{
        type:Number,
        required:true
    },
    address:{
        type:Schema.Types.ObjectId,
        ref:'Address',
        required:true
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'Online Payment', 'Wallet'],
        default: 'COD'
    },
    paymentStatus: {
        type: String,
        enum: ["Pending", "Completed"],
        default: "Completed"
    },
    invoiceDate:{
        type:Date
    },
    status:{
        type:String,
        required:true,
        enum:['Pending','Processing','Shipped','Delivered','Cancelled','Return Pending','Returned'],
        default: 'Pending'
    },
    createdOn :{
        type:Date,
        default:Date.now,
        required:true
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    couponDetails: {
        name: {
            type: String,
            default: null
        },
        discount: {
            type: Number,
            default: 0
        }
    },
    returnReason: {
        type: String,
        default: null
    },
    returnRequestDate: {
        type: Date,
        default: null
    },
    returnRequest: {
        status: {
            type: String,
            enum: ['None', 'Pending', 'Approved', 'Rejected'],
            default: 'None'
        },
        reason: {
            type: String,
            default: ''
        },
        requestDate: {
            type: Date,
            default: null
        },
        actionDate: {
            type: Date,
            default: null
        }
    }
});

const Order = mongoose.model("Order",orderSchema);
module.exports = Order;