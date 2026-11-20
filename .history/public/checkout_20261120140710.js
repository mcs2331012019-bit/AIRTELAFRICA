"use strict";

/* =========================
   CHECKOUT INITIALIZATION
========================= */

const params = new URLSearchParams(window.location.search);

const packageId = params.get("package");
const currency = (params.get("currency") || "USD").toUpperCase();

const summary = document.getElementById("packageSummary");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutMessage = document.getElementById("checkoutMessage");
const continueButton = document.getElementById("continueButton");

const pinModal = document.getElementById("pinModal");
const closeModalButton = document.getElementById("closeModal");
const cancelDemoButton = document.getElementById("cancelDemo");

let selectedPackage = null;
let convertedAmount = null;
let submitting = false;

const supportedCurrencies = [
    "USD", "KES", "GBP", "EUR", "UGX",
    "TZS", "RWF", "NGN", "ZAR", "CDF"
];

const symbols = {
    USD: "$",
    KES: "KSh ",
    GBP: "£",
    EUR: "€",
    UGX: "USh ",
    TZS: "TSh ",
    RWF: "RF ",
    NGN: "₦",
    ZAR: "R ",
    CDF: "FC "
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

/* =========================
   HELPERS
========================= */

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showMessage(message, type = "") {
    checkoutMessage.textContent = message;
    checkoutMessage.className = `form-message ${type}`;
}

function getPackagePrice(item) {
    const price = Number(item.baseKES);

    return Number.isFinite(price) && price > 0
        ? price
        : null;
}

function money(amount) {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
        return "Price unavailable";
    }

    const decimals = ["KES", "UGX", "TZS", "RWF", "CDF"].includes(currency)
        ? 0
        : 2;

    return `${symbols[currency] || currency + " "}${numericAmount.toLocaleString(
        undefined,
        {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }
    )}`;
}

/* =========================
   CURRENCY CONVERSION
========================= */

async function convertCurrency(amount, targetCurrency) {
    if (!Number.isFinite(amount)) {
        throw new Error("Invalid package price.");
    }

    if (!supportedCurrencies.includes(targetCurrency)) {
        throw new Error("Unsupported currency.");
    }

    if (targetCurrency === "KES") {
        return amount;
    }

    try {
        const response = await fetch(
            "https://open.er-api.com/v6/latest/KES"
        );

        if (!response.ok) {
            throw new Error("Exchange rate unavailable.");
        }

        const data = await response.json();
        const rate = Number(data.rates?.[targetCurrency]);

        if (
            data.result !== "success" ||
            !Number.isFinite(rate) ||
            rate <= 0
        ) {
            throw new Error("Invalid exchange rate.");
        }

        return amount * rate;

    } catch (error) {
        console.warn("Using fallback currency rate:", error);

        const fallback = fallbackRates[targetCurrency];

        if (!Number.isFinite(fallback)) {
            throw new Error("Currency conversion unavailable.");
        }

        return amount * fallback;
    }
}

/* =========================
   PACKAGE SUMMARY
========================= */

function renderSummary() {
    if (!selectedPackage || convertedAmount === null) {
        return;
    }

    summary.innerHTML = `
        <div class="summary-product">

            <span class="package-tag">
                ${escapeHtml(selectedPackage.validity)}
            </span>

            <h3>${escapeHtml(selectedPackage.name)}</h3>

            <p>${escapeHtml(selectedPackage.data)} data</p>

            <p class="muted">
                ${escapeHtml(selectedPackage.description || "")}
            </p>

        </div>

        <div class="summary-line">
            <span>Package price</span>
            <strong>${money(convertedAmount)}</strong>
        </div>

        <div class="summary-line">
            <span>Selected currency</span>
            <strong>${escapeHtml(currency)}</strong>
        </div>

        <div class="summary-line total-line">
            <span>Total</span>
            <strong>${money(convertedAmount)}</strong>
        </div>

        <p class="muted">
            Prices are indicative currency conversions.
        </p>
    `;

    // Update the red package card as well.
    const visualData = document.getElementById("packageVisualData");
    const visualValidity = document.getElementById("packageVisualValidity");

    if (visualData) {
        visualData.textContent =
            `${selectedPackage.name} · ${selectedPackage.data}`;
    }

    if (visualValidity) {
        visualValidity.textContent =
            `${selectedPackage.validity} validity`;
    }
}

/* =========================
   LOAD SELECTED PACKAGE
========================= */

async function initializeCheckout() {
    continueButton.disabled = true;

    if (!supportedCurrencies.includes(currency)) {
        summary.innerHTML = `
            <p class="error-text">
                Unsupported currency. Return to the packages page.
            </p>
        `;
        return;
    }

    if (!packageId) {
        summary.innerHTML = `
            <p class="error-text">
                No package selected. Return to the packages page.
            </p>
        `;
        return;
    }

    try {
        const response = await fetch("/api/packages", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Packages could not be loaded (${response.status}).`
            );
        }

        const packages = await response.json();

        if (!Array.isArray(packages)) {
            throw new Error("Invalid package data received.");
        }

        selectedPackage = packages.find(
            item => String(item.id) === String(packageId)
        );

        if (!selectedPackage) {
            throw new Error("The selected package is unavailable.");
        }

        const baseKES = getPackagePrice(selectedPackage);

        if (baseKES === null) {
            throw new Error("Package price is missing.");
        }

        convertedAmount = await convertCurrency(baseKES, currency);

        renderSummary();

        continueButton.disabled = false;

    } catch (error) {
        console.error("Checkout error:", error);

        summary.innerHTML = `
            <p class="error-text">
                ${escapeHtml(error.message)}
            </p>
        `;

        continueButton.disabled = true;
    }
}

/* =========================
   PAYMENT MODAL
========================= */

function openModal() {
    if (!selectedPackage || convertedAmount === null) {
        showMessage("Please wait for your package to load.", "error-text");
        return;
    }

    pinModal.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeModal() {
    pinModal.hidden = true;
    document.body.style.overflow = "";
}

checkoutForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!checkoutForm.reportValidity()) {
        return;
    }

    if (!selectedPackage || convertedAmount === null) {
        showMessage("Your package has not loaded yet.", "error-text");
        return;
    }

    openModal();
});

closeModalButton.addEventListener("click", closeModal);
cancelDemoButton.addEventListener("click", closeModal);

pinModal.addEventListener("click", event => {
    if (event.target === pinModal) {
        closeModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !pinModal.hidden) {
        closeModal();
    }
});

/* =========================
   DEMO ORDER SUBMISSION
   NO PIN OR OTP COLLECTION
========================= */

const demoSubmitButton = document.createElement("button");

demoSubmitButton.type = "button";
demoSubmitButton.className = "btn btn-full";
demoSubmitButton.textContent = "Submit demo order";

cancelDemoButton.insertAdjacentElement(
    "beforebegin",
    demoSubmitButton
);

demoSubmitButton.addEventListener("click", async () => {
    if (submitting) return;

    if (!selectedPackage || convertedAmount === null) {
        return;
    }

    const name = document.getElementById("customerName").value.trim();
    const localPhone = document.getElementById("phone").value.trim();
    const callingCode = document.getElementById("country").value;

    if (!name || !localPhone) {
        closeModal();
        showMessage("Please enter your name and phone number.", "error-text");
        return;
    }

    const payload = {
        customerName: name,
        phone: `${callingCode} ${localPhone}`,
        packageId: selectedPackage.id,
        currency: currency,
        amount: convertedAmount,
        paymentStatus: "PAYMENT_PENDING"
    };

    submitting = true;
    demoSubmitButton.disabled = true;
    cancelDemoButton.disabled = true;
    demoSubmitButton.textContent = "Submitting order...";

    try {
        const response = await fetch("/api/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Could not submit order."
            );
        }

        closeModal();

        checkoutForm.hidden = true;

        showMessage(
            `Your order has been recorded. Reference: ${result.order.reference}. No real payment was processed.`,
            "success"
        );

        summary.insertAdjacentHTML(
            "beforeend",
            `
                <div class="notice warning">
                    <strong>Demo order recorded</strong>
                    Reference: ${escapeHtml(result.order.reference)}<br>
                    Payment: Pending
                </div>
            `
        );

    } catch (error) {
        console.error("Order submission failed:", error);

        showMessage(error.message, "error-text");
        closeModal();

    } finally {
        submitting = false;
        demoSubmitButton.disabled = false;
        cancelDemoButton.disabled = false;
        demoSubmitButton.textContent = "Submit demo order";
    }
});

/* =========================
   START
========================= */

initializeCheckout();