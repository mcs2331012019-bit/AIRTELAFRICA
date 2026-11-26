"use strict";

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const ALLOWED_CURRENCIES = [
    "USD", "KES", "GBP", "EUR", "UGX",
    "TZS", "RWF", "NGN", "ZAR", "CDF"
];

function validPhone(value) {
    const phone = String(value || "").trim();

    if (!/^\+?[0-9\s()-]{7,25}$/.test(phone)) {
        return null;
    }

    return phone;
}

function validAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return Number(amount.toFixed(2));
}

function generateReference() {
    return (
        "AIR-" +
        Date.now() +
        "-" +
        crypto.randomBytes(3).toString("hex").toUpperCase()
    );
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");

        return res.status(405).json({
            error: "Method not allowed."
        });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey =
            process.env.SUPABASE_SECRET_KEY ||
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({
                error: "Database configuration is incomplete."
            });
        }

        const supabase = createClient(
            supabaseUrl,
            supabaseKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        const body = req.body || {};

        const phone = validPhone(body.phone);
        const packageId = String(body.packageId || "").trim();
        const currency = String(body.currency || "").toUpperCase();
        const amount = validAmount(body.amount);

        if (!phone) {
            return res.status(400).json({
                error: "Please provide a valid mobile number."
            });
        }

        if (!packageId) {
            return res.status(400).json({
                error: "Please select a valid package."
            });
        }

        if (!ALLOWED_CURRENCIES.includes(currency)) {
            return res.status(400).json({
                error: "Unsupported currency."
            });
        }

        if (amount === null) {
            return res.status(400).json({
                error: "Please provide a valid amount."
            });
        }

        const {
            data: selectedPackage,
            error: packageError
        } = await supabase
            .from("packages")
            .select("id, name, active")
            .eq("id", packageId)
            .eq("active", true)
            .maybeSingle();

        if (packageError) {
            console.error("Package lookup error:", packageError);

            return res.status(500).json({
                error: "Unable to verify the selected package."
            });
        }

        if (!selectedPackage) {
            return res.status(404).json({
                error: "Selected package was not found or is inactive."
            });
        }

        const orderRecord = {
            reference: generateReference(),
            customer_name: null,
            phone,
            package_id: selectedPackage.id,
            currency,
            amount,
            payment_status: "DEMO_PENDING"
        };

        const {
            data: order,
            error: orderError
        } = await supabase
            .from("orders")
            .insert(orderRecord)
            .select("id, reference, phone, package_id, currency, amount, payment_status, created_at")
            .single();

        if (orderError) {
            console.error("Order insertion error:", orderError);

            return res.status(500).json({
                error: "Unable to save order. Please try again."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Demo order recorded successfully.",
            order: {
                id: order.id,
                reference: order.reference,
                phone: order.phone,
                packageId: order.package_id,
                amount: Number(order.amount),
                currency: order.currency,
                paymentStatus: order.payment_status,
                createdAt: order.created_at
            }
        });

    } catch (error) {
        console.error("Orders API error:", error);

        return res.status(500).json({
            error: "Something went wrong while processing your order."
        });
    }
};