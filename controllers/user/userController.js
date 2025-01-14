const User = require("../../models/userModel");
const Category = require("../../models/categoryModel");
const Product = require("../../models/productModel");
const Order = require("../../models/orderModel");
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");



const loadHomepage = async (req, res) => {
  try {
      const user = req.session?.user;
      const categories = await Category.find({isListed:true});
      let productData = await Product.find({
        isBlocked:false,
        category:{$in:categories.map(category=>category._id)}
        // ,quantity:{$gt:0}
      })
   

productData.sort((a,b)=>new Date(b.createdOn));
productData = productData.slice(0,4);



      if(user){
        const userData = await User.findOne({_id:user._id});
        res.render("home",{user:userData,products:productData})
      }else{
        return res.render("home",{products:productData});
      }
  
    } catch (error) {
      console.log(error);
      res.status(500).send("Sever error")
    }
  };

  const loadSignup = async (req, res) => {
    try {
  
      res.render("signup");
    } catch (error) {
      res.status(500).send("Sever error")
    }
  };


function generateOtp(){
  return Math.floor(100000 + Math.random()*900000).toString();
}

async function sendVerificationEmail(email,otp) {
  try{
    const transporter = nodemailer.createTransport({
      service:"gmail",
      port:587,
      secure:false,
      requireTLS:true,
      auth:{
        user:process.env.NODEMAILER_EMAIL,
        pass:process.env.NODEMAILER_PASSWORD
      }
    })

    const info = await transporter.sendMail({
      from:process.env.NODEMAILER_EMAIL,
      to:email,
      subject:"Verify your account",
      text:`Your OTP is ${otp}`,
      html:`<b>Your OTP:${otp}</b>`
    })
    
    return info.accepted.length > 0
  } catch (error){
    console.error("Error sending email", error);
    return false


  }
}

  const Signup = async (req, res) => {
    try {
      const {name,phone,email,password,cPassword} = req.body;
      if(password !== cPassword){
       
        return res.render("signup",{message:"Password do not match"});
      }
      const findUser = await User.findOne({email});
      if(findUser){
      
        return res.render("signup",{message:"User with this mail already exists"})
      }
      const otp = generateOtp();
      
      const emailSent = await sendVerificationEmail(email,otp);
      if(!emailSent){
        return res.json({ error: "email-error" });
      }
     
      req.session.userOtp = otp;
      req.session.userData = {name,phone,email,password};
      res.render("verify-otp");
      console.log("OTP Sent",otp);
    } catch (error) {
      console.error("signup error:", error);
      res.redirect("/pageNotFound")


    }
  };

  const loadShopping = async (req, res) => {
    try {
      res.render("shopping");
    } catch (error) {
      console.error("shopping page not loading:", error);
      res.status(500).send("Sever error")
    }
  };


  const pageNotFound = async (req, res) => {
    try {
      res.render("page-404");
    } catch (error) {
      res.redirect("/pageNotFound")   
    }
  };


  const securePassword = async(password)=>{
    try{
      const passwordHash = await bcrypt.hash(password,10)
      return passwordHash
    }catch(error){

    }
  };


  const verifyOtp = async (req, res) => {
    try {
      const {otp} = req.body;
     
      if(otp === req.session.userOtp){
        const user = req.session.userData
        const passwordHash = await securePassword(user.password)
        const saveUserData = new User({
          name:user.name,
          email:user.email,
          phone:user.phone,
          password:passwordHash
        })
        await saveUserData.save();
        res.json({success:true, redirectUrl:"/login"})
      }else{
        res.status(400).json({success:false,message:"Invalid OTP,Please try again"})
      }
    } catch (error) {
      console.error("Error Verifying OTP", error);
      res.status(400).json({success:false,message:"An error occured"})   
    }
  };


  const resendOtp = async(req,res)=>{
    try{
     const {email} = req.session.userData;
     if(!email){
      return res.status(400).json({success:false,message:"Email not found in session"})
     }
     const otp = generateOtp();
     req.session.userOtp = otp;
     const emailSent = await sendVerificationEmail(email,otp);
     if(emailSent){
      console.log("Resend OTP:",otp);
      return res.status(200).json({success:true,message:"OTP Resend Successfully"})
     }else{
      return res.status(500).json({success:false,message:"Failed to Resend OTP. Please try again"});
     } 
    }catch(error){
      console.error("Error resending OTP:",error)
      return res.status(500).json({success:false,message:"Internal Sever Error. Please try again"});
    }
  };
  
  const loadLogin = async (req, res) => {
    try {
      if(!req.session.user){
        const error = req.session.error_message || req.session.loginError;
        req.session.error_message = '';
        req.session.loginError = '';
        
        return res.render("login", { message: error });
      } else {
        res.redirect("/");
      }
    } catch (error) {
      res.redirect("/pageNotFound");
    }
  };

  const login = async(req,res)=>{
    try{
      const {email,password} = req.body;
      const findUser = await User.findOne({isAdmin:0,email:email});
      if(!findUser){
        req.session.loginError = "User not found";
        return res.redirect("/login")
      }
      if(findUser.isBlocked){
        return res.render("login",{message:"User is blocked by admin"})
      }

      const passwordMatch = await bcrypt.compare(password,findUser.password);
      if(!passwordMatch){
        return res.render("login",{message:"Incorrect password"})
      }
     
      req.session.user = findUser;
      res.redirect("/")

    }catch(error){
      console.error("login error",error)
      res.render("login",{message:"login failed. Please try again later"})

    }
  };
  
  const logout = async(req,res)=>{
    try{
    req.session.destroy((err)=>{
      if(err){
        console.log("Seesion destructure error",err.message)
        return res.redirect("/pageNotFound")
      }
      return res.redirect("/login")
    })
    }catch(error){
      console.log("logout error",error);
      res.redirect("/PageNotFound")

    }
  };

  const submitReturnRequest = async (req, res) => {
    try {
        const { orderId, returnReason } = req.body;
        
        // Check if user is logged in
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Please login to submit a return request'
            });
        }

        const sessionUser = req.session.user;
        const userId = sessionUser._id; // Get the user ID from the session user object

      

        if (!orderId || !returnReason) {
            return res.status(400).json({
                success: false,
                message: 'Order ID and return reason are required'
            });
        }

        // Find the order and validate ownership
        const order = await Order.findOne({
            orderId: orderId
        }).populate('userId');

    
        if (!order) {
         
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Validate order ownership after finding the order
        const orderUserId = order.userId._id || order.userId;
        if (orderUserId.toString() !== userId.toString()) {
          
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to return this order'
            });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered orders can be returned'
            });
        }

        // Update order status and add return details
        order.status = 'Return Request';
        order.returnReason = returnReason;
        order.returnRequestDate = new Date();

        const savedOrder = await order.save();
      

        res.status(200).json({
            success: true,
            message: 'Return request submitted successfully'
        });

    } catch (error) {
        console.error('Error in submitReturnRequest:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
  };

  const loadProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const addresses = await Address.find({ userId: userId });
        const orders = await Order.find({ userId: userId })
            .populate('orderedItems.product')
            .populate('address')
            .sort({ createdOn: -1 });

      

        res.render('user/profile', { 
            user, 
            addresses, 
            orders,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).render('error', { 
            message: 'Error loading profile', 
            error 
        });
    }
  };

  module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadShopping,
    Signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    securePassword,
    generateOtp,
    submitReturnRequest,
    loadProfile
  };