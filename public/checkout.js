"use strict";

const params = new URLSearchParams(window.location.search);
const packageId = params.get("package");
const currency = (params.get("currency") || "USD").toUpperCase();

const summary = document.getElementById("packageSummary");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutMessage = document.getElementById("checkoutMessage");
const continueButton = document.getElementById("continueButton");

const phoneInput = document.getElementById("phone");
const pinInput = document.getElementById("demoPin");

let selectedPackage = null;
let convertedAmount = null;
let submitting = false;

const supportedCurrencies = [
    "USD", "KES", "GBP", "EUR", "UGX",
    "TZS", "RWF", "NGN", "ZAR", "CDF"
];

const symbols = {
    USD: "$", KES: "KSh ", GBP: "£", EUR: "€",
    UGX: "USh ", TZS: "TSh ", RWF: "RF ",
    NGN: "₦", ZAR: "R ", CDF: "FC "
};

const fallbackRates = {
    KES: 1,
    USD: 1 / 129,
    GBP: 1 / 165,
    EUR: 1 / 140,
    UGX: 28.5,
    TZS: 20.2,
    RWF: 10.1,
    NGN: 11.5,
    ZAR: 0.14,
    CDF: 21.5
};

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

function showMessage(message, type = "") {
    if (!checkoutMessage) return;

    checkoutMessage.textContent = message;
    checkoutMessage.className = `form-message ${type}`;
    checkoutMessage.hidden = false;
}

function money(amount) {
    const decimals = ["KES", "UGX", "TZS", "RWF", "CDF"].includes(currency) ? 0 : 2;

    return `${symbols[currency] || currency + " "}${Number(amount).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    })}`;
}

async function convertCurrency(amount, target) {
    if (target === "KES") return amount;

    try {
        const response = await fetch("https://open.er-api.com/v6/latest/KES");

        if (!response.ok) throw new Error("Rate unavailable");

        const data = await response.json();
        const rate = Number(data.rates?.[target]);

        if (data.result !== "success" || !Number.isFinite(rate) || rate <= 0) {
            throw new Error("Invalid rate");
        }

        return amount * rate;
    } catch {
        return amount * fallbackRates[target];
    }
}

function renderSummary() {
    if (!selectedPackage || convertedAmount === null) return;

    summary.innerHTML = `
        <div class="summary-product">
            <span class="package-tag">${escapeHtml(selectedPackage.validity)}</span>
            <h3>${escapeHtml(selectedPackage.name)}</h3>
            <p>${escapeHtml(selectedPackage.data)} data</p>
            <p class="muted">${escapeHtml(selectedPackage.description || "")}</p>
        </div>

        <div class="summary-line">
            <span>Package price</span>
            <strong>${money(convertedAmount)}</strong>
        </div>

        <div class="summary-line">
            <span>Currency</span>
            <strong>${currency}</strong>
        </div>

        <div class="summary-line total-line">
            <span>Total</span>
            <strong>${money(convertedAmount)}</strong>
        </div>

        <p class="muted">Indicative currency conversion.</p>
    `;

    const visualData = document.getElementById("packageVisualData");
    const visualValidity = document.getElementById("packageVisualValidity");

    if (visualData) {
        visualData.textContent = `${selectedPackage.name} · ${selectedPackage.data}`;
    }

    if (visualValidity) {
        visualValidity.textContent = selectedPackage.validity;
    }
}

async function initializeCheckout() {
    if (continueButton) continueButton.disabled = true;

    if (!supportedCurrencies.includes(currency)) {
        summary.innerHTML = `<p class="error-text">Unsupported currency.</p>`;
        return;
    }

    if (!packageId) {
        summary.innerHTML = `<p class="error-text">No package selected.</p>`;
        return;
    }

    try {
        const response = await fetch("/api/packages", {
            cache: "no-store"
        });

        if (!response.ok) throw new Error("Could not load packages.");

        const packages = await response.json();

        if (!Array.isArray(packages)) {
            throw new Error("Invalid package data.");
        }

        selectedPackage = packages.find(
            p => String(p.id) === String(packageId)
        );

        if (!selectedPackage) {
            throw new Error("Selected package unavailable.");
        }

        const baseKES = Number(selectedPackage.baseKES);

        if (!Number.isFinite(baseKES) || baseKES <= 0) {
            throw new Error("Invalid package price.");
        }

        convertedAmount = await convertCurrency(baseKES, currency);

        renderSummary();

        if (continueButton) continueButton.disabled = false;

    } catch (error) {
        summary.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    }
}

/* CHECKOUT FORM */

checkoutForm?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedPackage || convertedAmount === null) {
        showMessage("Please wait while your package loads.", "error");
        return;
    }

    const phone = phoneInput?.value.trim() || "";
    const pin = pinInput?.value.trim() || "";

    if (!phone) {
        showMessage("Please enter your mobile number.", "error");
        phoneInput?.focus();
        return;
    }

    const cleanPhone = phone.replace(/[\s()-]/g, "");

    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
        showMessage("Please enter a valid mobile number.", "error");
        phoneInput?.focus();
        return;
    }

    if (!/^[0-9]{4}$/.test(pin)) {
        showMessage("Please enter a valid 4-digit demo PIN.", "error");
        pinInput?.focus();
        return;
    }

    if (submitting) return;

    submitting = true;

    const originalButtonText = continueButton?.textContent;

    if (continueButton) {
        continueButton.disabled = true;
        continueButton.textContent = "Processing...";
    }

    try {
        /*
         * DEMO ONLY:
         * The PIN is validated locally.
         * It is never sent to the server or saved in the database.
         */

        showMessage("Processing your demo order...", "success");

        const countryInput = document.getElementById("country");
        const countryCode = countryInput?.value || "";

        const formattedPhone = countryCode
            ? `${countryCode} ${phone}`
            : phone;


        
        const payload = {
            phone: formattedPhone,
            packageId: selectedPackage.id,
            currency,
            amount: Number(convertedAmount.toFixed(2)),
            paymentStatus: "DEMO_AUTHORIZED",
            note: "Demo checkout. No actual payment was processed."
        };

        const response = await fetch("/api/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Order submission failed.");
        }

        const reference =
            result.order?.reference ||
            result.reference ||
            result.order?.id ||
            "DEMO-" + Date.now();

        checkoutForm.hidden = true;

        showMessage(
            `Your demo order was recorded successfully! Reference: ${reference}. No actual payment was processed.`,
            "success"
        );

        const successContainer = document.getElementById("checkoutSuccess");

        if (successContainer) {
            successContainer.hidden = false;

            const referenceElement = successContainer.querySelector(".order-reference");

            if (referenceElement) {
                referenceElement.textContent = reference;
            }
        }

    } catch (error) {
        console.error("Checkout error:", error);

        showMessage(
            error.message || "Something went wrong. Please try again.",
            "error"
        );

    } finally {
        submitting = false;

        if (continueButton && !checkoutForm.hidden) {
            continueButton.disabled = false;
            continueButton.textContent = originalButtonText || "Continue to Payment";
        }
    }
});

initializeCheckout();
