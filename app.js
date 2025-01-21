const express = require("express");
const app = express();
const path = require("path")
const env = require("dotenv").config();
const sesssion = require("express-session")
const passport = require("./config/passport")
const db = require("./config/db")
const nocache = require("nocache")
const userRoute = require("./routes/userRoute");
const adminRoute = require("./routes/adminRoute");
db()


app.use(nocache())
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(sesssion({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
}))

app.use(passport.initialize());
app.use(passport.session());




app.set("view engine",'ejs');
app.set("views", [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.use(express.static(path.join(__dirname, 'public')));



app.use('/',userRoute);
app.use("/admin",adminRoute);

const PORT = process.env.PORT
app.listen(PORT, ()=>{
    console.log(`server running at port ${PORT}`);
})

module.exports = app;