const User = require("../../models/userModel");
const Product = require("../../models/productModel");
const Cart = require("../../models/cartModel");
const Address = require("../../models/addressModel");
const Order = require('../../models/orderModel');







const getcheckoutPage = async (req, res) => {
    console.log("Fetching cart details...");
    try {
        const user = req.session.user;
        const productId = req.query.id || null;
        const quantity = parseInt(req.query.quantity) || 1;

        if (!user) {
            return res.redirect("/login");
        }

        // Fetch the user's address
        const address = await Address.findOne({ userId: user._id });
        
        // If no address found, set it to an empty object to avoid null issues
        const addressData = address || { address: [] };

        // If no specific product is queried, show cart items
        if (!productId) {
            const cart = await Cart.findOne({ userId: user._id }).populate("items.productId");

            if (!cart || !cart.items || cart.items.length === 0) {
                return res.redirect("/");
            }

            // Map cart items to extract product details
            const products = cart.items
                .filter(item => item.productId !== null) // Filter out null products
                .map(item => {
                    const product = item.productId;
                    if (!product) {
                        return null; // Skip invalid products
                    }
                    const productImage = product.productImage || [];
                    return {
                        _id: product._id,
                        productName: product.productName,
                        productImage: productImage.length > 0 ? productImage : ["default-image.jpg"],
                        salesPrice: product.salePrice || 0,
                        quantity: item.quantity || 1,
                    };
                })
                .filter(item => item !== null); // Remove any null items

            if (products.length === 0) {
                // If no valid products in cart after filtering
                return res.redirect("/");
            }

            const subtotal = products.reduce((sum, item) => {
                return sum + item.salesPrice * item.quantity;
            }, 0);
            console.log("rendering checkout")
            console.log({ 
                user, 
                product: products, 
                subtotal, 
                quantity: null, 
                addressData 
            })
            return res.render("checkout", { 
                user, 
                product: products, 
                subtotal, 
                quantity: null, 
                addressData 
            });
        }

        // If a specific product is queried
        if (productId) {
            const product = await Product.findById(productId);
            if (!product) {
                return res.redirect("/pageNotFound");
            }

            console.log("Single product details:", product);

            const productData = {
                _id: product._id,
                productName: product.productName,
                productImage: product.productImage?.length > 0 ? product.productImage : ["default-image.jpg"],
                salePrice: product.salesPrice || 0,
                quantity: quantity // Use the quantity from the query
            };

            const subtotal = productData.salePrice * quantity;
            console.log("reder", { 
                user, 
                product: productData, 
                subtotal, 
                quantity, 
                addressData 
            })
            return res.render("checkout", { 
                user, 
                product: productData, 
                subtotal, 
                quantity, 
                addressData 
            });

        }
    } catch (error) {
        console.error("Error fetching checkout page:", error.message);
        return res.redirect("/pageNotFound");
    }
};





const postCheckout = async (req, res) => {
    try {
        const userId = req.session.user._id;

        if (!userId) {
            return res.redirect("/login");
        }

        const { address: addressId, products, subtotal, total, paymentMethod } = req.body;
        console.log("Checkout Request Body:", req.body);
        console.log("Selected Address ID:", addressId);
        console.log("Payment Method:", paymentMethod);

        if (!Array.isArray(JSON.parse(products)) || products.length === 0) {
            return res.status(400).json({ success: false, message: "No products provided" });
        }

        // Validate payment method
        const validPaymentMethods = ['COD', 'Online Payment', 'Wallet'];
        if (!validPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: "Invalid payment method" });
        }

        // Check if the address exists in the user's address document
        const addressDoc = await Address.findOne({ userId: userId });
        console.log("Found address document:", addressDoc);

        if (!addressDoc) {
            return res.status(400).json({ success: false, message: "No address document found" });
        }

        // Find the specific address in the array
        const selectedAddress = addressDoc.address.find(addr => addr._id.toString() === addressId);
        console.log("Selected address from document:", selectedAddress);

        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: "Selected address not found in address list" });
        }

        // Check stock and reduce quantity
        for (let product of JSON.parse(products)) {
            console.log("Processing product:", product);

            if (product.quantity > product.stock) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for product: ${product.productName}`,
                });
            }

            // Update product stock in database
            await Product.findByIdAndUpdate(product._id, {
                $inc: { quantity: -product.quantity }
            });
        }

        const orderedItems = JSON.parse(products).map(product => ({
            product: product._id,
            quantity: product.quantity,
            price: product.salesPrice
        }));

        // Create a new order with the address ID from the array and payment method
        const newOrder = new Order({
            orderId: require('uuid').v4(),
            orderedItems: orderedItems,
            address: selectedAddress._id,
            paymentMethod: paymentMethod,
            totalPrice: subtotal,
            finalAmount: total,
            discount: subtotal - total,
            status: "Pending",
            createdOn: new Date()
        });

        console.log("Creating order with:", {
            addressId: selectedAddress._id,
            addressDetails: selectedAddress,
            paymentMethod: paymentMethod
        });

        // Save the order
        const savedOrder = await newOrder.save();
        console.log("Saved order:", savedOrder);

        if (savedOrder) {
            // Add order to user's orderHistory
            await User.findByIdAndUpdate(userId, {
                $push: { orderHistory: savedOrder._id }
            });

            // Clear the user's cart
            await Cart.findOneAndUpdate(
                { userId: userId },
                { $set: { items: [] } }
            );

            return res.status(200).json({
                success: true,
                message: "Order placed successfully",
                orderId: savedOrder.orderId
            });
        } else {
            return res.status(400).json({
                success: false,
                message: "Error saving order"
            });
        }

    } catch (error) {
        console.error("Error placing order:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};





const  orderConfirm = async(req,res)=>{
    const userId=req.session.user;
    const userData= await User.findById(userId);
    const orderId = req.query.id;
    try {
        if(!req.session.user){
            return res.redirect("/signup");
        }
      return  res.render("orderConfirmation",{
        user:userData, 
      });
        
    } catch (error) {
        console.log("error in loading confirmation page ",error.message);
        return res.redirect("/pageNotFound")
    }
}



module.exports = {
    getcheckoutPage,
    postCheckout,
    orderConfirm,
};