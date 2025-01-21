const User=require("../../models/userModel");
const Address=require("../../models/addressModel")
const Order = require("../../models/orderModel");
const Wallet = require("../../models/walletModel");
const nodemailer = require("nodemailer");
const bcrypt =require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session");
const { securePassword, generateOtp } = require("./userController");



const sendVerificationEmail =  async(email,otp)=>{
    try{
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            }
        })
        const mailOptions ={
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"your OTP for password reset",
            text:"Your OTP is ${otp}",
            html:`<b><h4>Your OTP :${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);
        return true;
        
    }catch(error){
        console.error("Error sending email",error);
        return false;
    }
};






const getForgotPassPage = async (req,res)=>{
    try {
        res.render("forgot-password")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
};


const forgotEmailValid = async(req,res)=>{
    try {
       const email = req.body.email.trim();
       const findUser=await User.findOne({email:email});
       if(findUser){
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email,otp)
        if(emailSent){
            req.session.userOtp=otp;
            req.session.email = email;
            res.render("forgotPass-otp");
          
            
        }else{
            res.json({success:false,message:"Failed to send OTP .Please try again"})
        }
       }else{
        res.render("forgot-password",{
            message:"User with this email does not exist"
        })
       }
    } catch (error) {
        res.redirect("/pageNotFound")
    }
};



const verifyForgotPassOtp = async (req,res)=>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp===req.session.userOtp){
            res.json({success:true,redirectUrl:"/reset-password"});
        }else{
            res.json({success:false,message:"OTP not matching"})
        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured .Please try again"})
    }
};

const getResetPassPage = async (req, res) => {
    try {
        res.render('reset-password');
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const resendOtp = async (req, res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
    
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
        
            res.status(200).json({ success: true, message: "Resend OTP Successful" });
        } else {
            throw new Error("Failed to send email");
        }
    } catch (error) {
        console.error("Error in resend otp:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const postNewPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;
        const email = req.session.email;
        
        if (!email) {
            return res.render("reset-password", { message: "Session expired. Please try again." });
        }

        // Find the user and their current password
        const user = await User.findOne({ email: email });
        if (!user) {
            return res.render("reset-password", { message: "User not found. Please try again." });
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.render("reset-password", { message: "Passwords do not match" });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(password, user.password);
        if (isSamePassword) {
            return res.render("reset-password", { 
                message: "New password must be different from your current password" 
            });
        }

        // If all checks pass, update the password
        const passwordHash = await securePassword(password);
        await User.updateOne(
            { email: email },
            { $set: { password: passwordHash } }
        );
        res.redirect("/login");
    } catch (error) {
        console.error(error)
        res.redirect("/pageNotFound");
    }
};

const userProfile = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        // Fetch user with populated orderHistory
        const user = await User.findById(userId)
            .populate({
                path: 'orderHistory',
                populate: {
                    path: 'orderedItems.product',
                    model: 'Product',
                    select: 'productName productImage salesPrice'
                },
                options: { sort: { createdOn: -1 } }
            })
            .select('name email phone orderHistory');

        // Fetch wallet data
        const wallet = await Wallet.findOne({ userId: userId });
        
        // Get address data
        const address = await Address.findOne({ userId: userId });
        
        // Map through orders to find matching address from address array
        const ordersWithAddress = user.orderHistory.map(order => {
            const addressDetails = address?.address.find(addr => addr._id.toString() === order.address.toString());
            return {
                ...order.toObject(),
                address: addressDetails || {}
            };
        });

   
        // Prepare user data with wallet information
        const userData = {
            ...user.toObject(),
            wallet: wallet?.balance || 0,
            walletHistory: wallet?.transactions || []
        };

        res.render('profile', {
            user: userData,
            addressData: address || { address: [] },
            orders: ordersWithAddress || []
        });
    } catch (error) {
        console.error('Error in userProfile:', error);
        res.redirect("/pageNotFound");
    }
};


const changeEmail=async (req,res)=>{
    try {
       res.render("change-email") 
    } catch (error) {
        res.redirect("/pageNotFound")
    }
};






const ChangePassword = async (req, res) => {
    try {
        res.render("change-password", { message: '' });
    } catch (error) {
        console.error("Error rendering change password page:", error);
        res.redirect("/pageNotFound");
    }
};

const changePasswordValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.session.user;

        // First check if the entered email matches the user's current email
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.render("change-password", {
                message: "User not found"
            });
        }

        if (currentUser.email !== email) {
            return res.render("change-password", {
                message: "The email you entered does not match your current email"
            });
        }

        // If email matches, proceed with OTP generation and sending
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            req.session.userOtp = otp;
            req.session.email = email;
            res.render("change-password-otp");
         
        } else {
            res.render("change-password", {
                message: "Failed to send verification email. Please try again."
            });
        }
    } catch (error) {
        console.error("Error in change password validation:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyChangepassOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const storedOtp = req.session.userOtp;
        
        if (otp === storedOtp) {
            res.json({ success: true, redirectUrl: '/reset-password' });
        } else {
            res.json({ success: false, message: 'Invalid OTP' });
        }
    } catch (error) {
        console.error("Error in OTP verification:", error);
        res.json({ success: false, message: 'Error verifying OTP' });
    }
};

const resendChangePasswordOtp = async (req, res) => {
    try {
        const email = req.session.email;
        if (!email) {
            return res.json({
                success: false,
                message: "Email not found in session"
            });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        
        if (emailSent) {
            req.session.userOtp = otp;
          
            res.json({
                success: true,
                message: "OTP sent successfully"
            });
        } else {
            res.json({
                success: false,
                message: "Failed to send OTP"
            });
        }
    } catch (error) {
        console.error("Error in resending OTP:", error);
        res.json({
            success: false,
            message: "Error resending OTP"
        });
    }
};

const updatePassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;
        const userId = req.session.user;

        // Basic validation
        if (!password || !confirmPassword) {
            return res.render("reset-password", {
                message: "Please fill in all fields"
            });
        }

        if (password !== confirmPassword) {
            return res.render("reset-password", {
                message: "Passwords do not match"
            });
        }

        if (password.length < 6) {
            return res.render("reset-password", {
                message: "Password must be at least 6 characters long"
            });
        }

        // Get current user with password
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.render("reset-password", {
                message: "User not found"
            });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(password, currentUser.password);
        if (isSamePassword) {
            return res.render("reset-password", {
                message: "New password cannot be the same as your current password"
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update the password
        await User.findByIdAndUpdate(userId, { password: hashedPassword });
        
        // Render with success message
        res.render("reset-password", { 
            success: true 
        });
    } catch (error) {
        console.error("Error updating password:", error);
        res.render("reset-password", {
            message: "An error occurred while updating your password. Please try again."
        });
    }
};




const addAddress = async (req, res) => {
    try {
        const user = req.session.user;
        res.render("add-address", { user: user });

    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId})
        const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;
        console.log(req.body)
        const userAddress = await Address.findOne({ userId: userData._id });
        if (!userAddress) {
            const newAddress = new Address({
                userId: userId,
                address: [{ addressType, name, city, landMark, state, pincode, phone, altPhone }]
            });
            await newAddress.save();
        } else {
            userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone, altPhone });
            await userAddress.save();
        }
        res.redirect('/userProfile') 
    } catch (error) {
        console.error("Error adding address", error);
        res.redirect("/pageNotFound");
    }
};

const editAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user._id;
        const currAddress = await Address.findOne({ "address._id": addressId });
        if (!currAddress) {
            return res.redirect("/pageNotFound");
        }
        const addressData = currAddress.address.find((item) => item._id.toString() === addressId);
        if (!addressData) {
            return res.redirect("/pageNotFound");
        }
        res.render("edit-address", { address: addressData, user: user});
    } catch (error) {
        console.error("Error in edit address", error.message);
        res.redirect("/pageNotFound");
    }
};

const postEditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user= req.session.user;
        const findAddress = await Address.findOne({ "address._id": addressId });
        if (!findAddress) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        await Address.updateOne(
            { "address._id": addressId },
            {
                $set: {
                    "address.$": {
                        _id: addressId,
                        addressType: data.addressType,
                        name: data.name,
                        city: data.city,
                        landMark: data.landMark,
                        state: data.state,
                        pincode: data.pincode,
                        phone: data.phone,
                        altPhone: data.altPhone,
                    },
                },
            }
        );
        res.json({ success: true, message: "Address updated successfully" });

    } catch (error) {
        console.error("Error in edit address", error);
        res.status(500).json({ success: false, message: "Failed to update address" });
    }
};

const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const findAddress = await Address.findOne({ "address._id": addressId });
        if (!findAddress) {
            return res.status(404).send("Address not found");
        }

        await Address.updateOne(
            { "address._id": addressId },
            { $pull: { address: { _id: addressId } } }
        );
        return res.redirect("/userProfile");
    } catch (error) {
        console.error("Error in delete address", error.message);
        res.redirect("/pageNotFound");
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate('orderItems.product');

        if (!order) {
            return res.redirect('/profile');
        }

        res.render('orderDetails', { order });
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        res.redirect("/profile");
    }
};

const cancelOrder = async (req, res) => {
    try {
        const orderId = req.body.orderId;
        const order = await Order.findById(orderId);

        if (!order || order.status !== 'Pending') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order not found or cannot be cancelled' 
            });
        }

        order.status = 'Cancelled';
        await order.save();

        res.status(200).json({ 
            success: true, 
            message: 'Order cancelled successfully' 
        });
    } catch (error) {
        console.error('Error in cancelOrder:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while cancelling the order' 
        });
    }
};




module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    ChangePassword,
    changePasswordValid,
    verifyChangepassOtp,
    resendChangePasswordOtp,
    updatePassword,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,
    getOrderDetails,
    cancelOrder,
};