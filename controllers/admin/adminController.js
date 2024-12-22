const User = require("../../models/userModel");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const pageerror = async (req, res) => {
  try {
    res.render("admin-error");
  } catch (error) {
    console.error(error);
  }
};


const loadLogin = (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    const error = req.session.adminError;
    req.session.adminError = null;
    res.render("admin-login", { message: error });
  } catch (error) {
    console.error(error);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });
    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = true;
        return res.redirect("/admin");
      } else {
        req.session.adminError = "Incorrect Password";
        return res.redirect("/admin/login");
      }
    } else {
      req.session.adminError = "Admin not found";
      return res.redirect("/admin/login");
    }
  } catch (error) {
    console.error("login error:", error);
    return res.redirect("/pageerror");
  }
};

const loadDashboard = async (req, res) => {
  try {
    res.render("dashboard");
  } catch (error) {
    res.redirect("/pagerror");
  }
};

const logout = async (req, res) => {
  try {
    req.session.admin = false;
    res.redirect("/admin/login");
  } catch (error) {
    console.error(error);
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  pageerror,
  logout,
};
