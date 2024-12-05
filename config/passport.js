const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy
const User = require("../models/userModel")
const env = require("dotenv").config();


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    passReqToCallback  : true
},
async (request,accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            return done(null, user);
        } else {
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id
            });
            console.log("usersaving")
            await user.save();
            console.log("user saved`")
            return done(null, user);
        }
    } catch (error) {
        return done(error, null);
    }
}));



passport.serializeUser((user,done)=>{
    done(null,user)
})

passport.deserializeUser(async(userData,done)=>{
    
    try{

        const user = await User.findById(userData._id)
        done(null,user)
    }catch(err){
        done(err,null)

    }

})

module.exports = passport