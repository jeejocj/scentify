const User = require("../../models/userModel");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");



const pageerror = async(req,res)=>{
    res.render("admin-error")
}


const loadLogin = (req,res)=>{
    if(req.session.admin){
        return res.redirect("/admin/dashboard")
    }
    res.render("admin-login",{message:null})
}


const login = async(req,res)=>{
  try{
    const {email,password} = req.body;
    // console.log(email,password)
    const admin = await User.findOne({email,isAdmin:true})
    // console.log(admin)
    if(admin){
        const passwordMatch = bcrypt.compare(password,admin.password)
        if(passwordMatch){
            req.session.admin = true;
            return res.redirect("/admin")
        }else{
            return res.redirect("/admin/login")
        }
    }else{
        return res.redirect("/admin/login")
    }

  }catch(error){
    console.error("login error:",error)
    return res.redirect("/pageerror")

  }
};

const loadDashboard = async(req,res)=>{
    if(req.session.admin){
        // console.log("this")
        try{
            res.render("dashboard");
        }catch(error){
            res.redirect("/pageerror")

        }
    }

    }

    const logout = async(req,res)=>{
        try{
            req.session.destroy(err =>{
                if(err){
                    console.log("Error destroying sesssion",err);
                    return res.redirect("/pageerror")
                }
                res.redirect("/admin/login")
            })
        }catch (error){
            console.log("Unexpected error during logout:",error)
            res.redirect("/pagerror")

        }

    }

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
}