const User = require("../../models/userModel")

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || "";
        let page = parseInt(req.query.page) || 1; 
        if (page < 1) page = 1; 
        const limit = 3; 
        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        }).countDocuments();
        res.render("customers", {
            data: userData,
            totalpages: Math.ceil(count / limit), 
            currentPage: page, 
            searchTerm: search, 
        });
    } catch (error) {
        console.error("Error in customerInfo:", error);
        res.redirect("/pageerror");
    }
};


const customerBlocked = async (req, res) => {
    try {
        const customerId = req.query.id;
        await User.findByIdAndUpdate(customerId, { isBlocked: true });

        const page = req.query.page || 1;
        const search = req.query.search || "";

        res.redirect(`/admin/users?page=${page}&search=${search}`);
    } catch (error) {
        console.error("Error blocking customer:", error);
        res.redirect("/pageerror");
    }
};


const customerunBlocked = async (req, res) => {
    try {
        const customerId = req.query.id;
        await User.findByIdAndUpdate(customerId, { isBlocked: false });

        const page = req.query.page || 1;
        const search = req.query.search || "";

        res.redirect(`/admin/users?page=${page}&search=${search}`);
    } catch (error) {
        console.error("Error unblocking customer:", error);
        res.redirect("/pageerror");
    }
};


module.exports = {
    customerInfo,
    customerBlocked,
    customerunBlocked,
}