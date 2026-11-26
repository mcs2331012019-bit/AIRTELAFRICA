"use strict";

const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({
            error: "Method not allowed."
        });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({
                error: "Database configuration is incomplete."
            });
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        const {
            phone,
            packageId,
            currency,
            amount,
            note
        } = req.body || {};

        // Validate mobile number
        const cleanPhone = String(phone || "").trim();

        if (!/^\+?[0-9\s()-]{7,25}$/.test(cleanPhone)) {
            return res.status(400).json({
                error: "Please provide a valid mobile number."
            });
        }

        // Validate package
        if (
            packageId === undefined ||
            packageId === null ||
            String(packageId).trim() === ""
        ) {
            return res.status(400).json({
                error: "Please select a valid package."
            });
        }

        // Validate currency
        const allowedCurrencies = [
            "USD", "KES", "GBP", "EUR", "UGX",
            "TZS", "RWF", "NGN", "ZAR", "CDF"
        ];

        const selectedCurrency = String(currency || "").toUpperCase();

        if (!allowedCurrencies.includes(selectedCurrency)) {
            return res.status(400).json({
                error: "Unsupported currency."
            });
        }

        // Validate amount
        const orderAmount = Number(amount);

        if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
            return res.status(400).json({
                error: "Please provide a valid amount."
            });
        }

        // Retrieve package from Supabase
        const { data: selectedPackage, error: packageError } =
            await supabase
                .from("packages")
                .select("*")
                .eq("id", packageId)
                .single();

        if (packageError || !selectedPackage) {
            console.error("Package error:", packageError);

            return res.status(404).json({
                error: "Selected package was not found."
            });
        }

        // Generate order reference
        const reference =
            "AIR-" +
            Date.now() +
            "-" +
            Math.random().toString(36).substring(2, 7).toUpperCase();

        // Save order without customer name, email or PIN
        const orderRecord = {
            reference,
            phone: cleanPhone,
            package_id: selectedPackage.id,
            currency: selectedCurrency,
            amount: Number(orderAmount.toFixed(2)),
            payment_status: "DEMO_AUTHORIZED",
            note: String(
                note || "Demo checkout. No actual payment was processed."
            ),
            created_at: new Date().toISOString()
        };

        const { data: order, error: orderError } =
            await supabase
                .from("orders")
                .insert(orderRecord)
                .select("*")
                .single();

        if (orderError) {
            console.error("Order insertion error:", orderError);

            return res.status(500).json({
                error: "Unable to save order. Please check your database schema."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Demo order recorded successfully.",
            order: {
                id: order.id,
                reference: order.reference,
                amount: order.amount,
                currency: order.currency,
                paymentStatus: order.payment_status
            }
        });

    } catch (error) {
        console.error("Orders API error:", error);

        return res.status(500).json({
            error: "Something went wrong while processing your order."
        });
    }
};
