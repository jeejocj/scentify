const Razorpay = require('razorpay');
const User = require('../../models/userModel');
const Wallet = require('../../models/walletModel');
const env = require("dotenv").config();
const crypto = require('crypto');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Get wallet details
const getWalletDetails = async (req, res) => {
    try {
        const userId = req.session.user._id;
        let wallet = await Wallet.findOne({ userId }).populate('transactions.orderId');
        
        if (!wallet) {
            wallet = await new Wallet({ userId, balance: 0 }).save();
        }

        res.status(200).json({
            success: true,
            wallet: {
                balance: wallet.balance,
                transactions: wallet.transactions
            }
        });
    } catch (error) {
        console.error('Error fetching wallet details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching wallet details'
        });
    }
};

// Create Razorpay order for wallet recharge
const createWalletRechargeOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user._id;

        // Validate amount
        if (!amount || amount < 1) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid amount'
            });
        }

        // Create shorter receipt ID
        const timestamp = Date.now().toString().slice(-8);
        const shortUserId = userId.toString().slice(-4);
        const receipt = `w_${timestamp}${shortUserId}`;

        // Create Razorpay order
        const options = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: receipt,
            notes: {
                userId: userId.toString()
            }
        };

        const order = await razorpay.orders.create(options);
        res.status(200).json({
            success: true,
            order,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error in wallet recharge:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Verify and process wallet recharge
const verifyWalletRecharge = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount
        } = req.body;

        // Verify signature
        const sign = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(sign)
            .digest('hex');

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        const userId = req.session.user._id;
        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0 });
        }

        // Add transaction
        const transaction = {
            amount: Number(amount),
            type: 'credit',
            description: 'Wallet recharge',
            paymentId: razorpay_payment_id,
            date: new Date()
        };

        wallet.balance += Number(amount);
        wallet.transactions.push(transaction);
        await wallet.save();

        // Update user reference
        const user = await User.findById(userId);
        if (!user.wallet) {
            user.wallet = wallet._id;
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Wallet recharged successfully',
            newBalance: wallet.balance
        });
    } catch (error) {
        console.error('Error verifying wallet recharge:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing wallet recharge'
        });
    }
};

// Add refund to wallet
const addRefundToWallet = async (userId, amount, orderId, description = 'Order refund') => {
    try {
        console.log('Starting refund process for user:', userId, 'amount:', amount);
        
        let wallet = await Wallet.findOne({ userId });
        console.log('Found wallet:', wallet);

        if (!wallet) {
            console.log('Creating new wallet for user:', userId);
            wallet = new Wallet({ userId, balance: 0 });
        }

        // Ensure amount is a valid number
        const refundAmount = Number(amount);
        if (isNaN(refundAmount) || refundAmount <= 0) {
            throw new Error('Invalid refund amount');
        }

        // Add transaction with order reference
        const transaction = {
            amount: refundAmount,
            type: 'credit',
            description: description,
            orderId: orderId,
            date: new Date()
        };

        console.log('Adding transaction:', transaction);

        // Update wallet balance and add transaction
        wallet.balance = Number(wallet.balance || 0) + refundAmount;
        wallet.transactions.push(transaction);
        await wallet.save();
        console.log('Wallet updated. New balance:', wallet.balance);

        // Update user reference if needed
        const user = await User.findById(userId);
        if (!user.wallet) {
            console.log('Updating user wallet reference');
            user.wallet = wallet._id;
            await user.save();
        }

        return {
            success: true,
            newBalance: wallet.balance,
            transaction: transaction
        };
    } catch (error) {
        console.error('Error adding refund to wallet:', error);
        throw error;
    }
};

module.exports = {
    getWalletDetails,
    createWalletRechargeOrder,
    verifyWalletRecharge,
    addRefundToWallet
};