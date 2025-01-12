const mongoose = require("mongoose");
const {Schema} = mongoose;


const userSchema = new Schema({
    name : {
        type:String,
        required : true
    },
    email: {
        type : String,
        required:true,
        unique: true,
    },
    phone : {
        type : String,
        required: false,
        unique: true,
        sparse:true,
        default:null
    },
    googleId: {
        type : String,
        unique:true
        
    },
    password : {
        type:String,
        required :false
    },
    isBlocked: {
        type : Boolean,
        default:false
    },
    isAdmin : {
        type: Boolean,
        default:false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref:"Cart",
    }],
    wallet: {
        type: Number,
        default: 0
    },
    walletHistory: [{
        type: {
            type: String,
            enum: ['credit', 'debit'],
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    wishlist:[{
        type:Schema.Types.ObjectId,
        ref:"Wishlist"
    }],
    orderHistory:[{
        type:Schema.Types.ObjectId,
        ref:"Order"
    }],
    createdOn : {
        type:Date,
        default:Date.now,
    },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref:"Category",
        },
        brand: {
            type : String
        },
        searchOn : {
            type: Date,
            default: Date.now
        }
    }],
    coupons: [{
        couponName: {
            type: String,
            required: true
        },
        usedAt: {
            type: Date,
            default: Date.now
        }
    }]
   
})


const User = mongoose.model("User",userSchema);

module.exports = User;