
const params = new URLSearchParams(window.location.search);

const packageId = params.get("package");
const currency = (params.get("currency") || "USD").toUpperCase();

const summary = document.getElementById("packageSummary");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutMessage = document.getElementById("checkoutMessage");

const pinModal = document.getElementById("pinModal");
const demoCode = document.getElementById("demoCode");
const demoCodeForm = document.getElementById("demoCodeForm");
const demoCodeError = document.getElementById("demoCodeError");

let selectedPackage = null;
let convertedAmount = null;

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
    if (!checkoutMessage) return;

    checkoutMessage.textContent = message;
    checkoutMessage.className = `form-message ${type}`;
}

function getPackagePrice(item) {
    const price = Number(item.baseKES);

    return Number.isFinite(price) && price > 0
        ? price
        : null;
}

async function convertCurrency(amount, targetCurrency) {
    if (!Number.isFinite(amount)) {
        throw new Error("Invalid package price.");
    }

    if (!supportedCurrencies.includes(targetCurrency)) {
        throw new Error("Unsupported currency selected.");
    }

    if (targetCurrency === "KES") return amount;

    try {
        const response = await fetch(
            "https://open.er-api.com/v6/latest/KES"
        );

        if (!response.ok) throw new Error("Exchange rate unavailable.");

        const data = await response.json();
        const rate = Number(data.rates?.[targetCurrency]);

        if (data.result !== "success" || !Number.isFinite(rate) || rate <= 0) {
            throw new Error("Invalid exchange rate.");
        }

        return amount * rate;

    } catch (error) {
        console.warn("Using approximate fallback exchange rates:", error);

        return amount * fallbackRates[targetCurrency];
    }
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

function renderSummary() {
    if (!selectedPackage || convertedAmount === null) return;

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
            <strong>${currency}</strong>
        </div>

        <div class="summary-line total-line">
            <span>Total</span>
            <strong>${money(convertedAmount)}</strong>
        </div>

        <p class="muted">
            Prices are indicative currency conversions.
        </p>
    `;
}

async function initializeCheckout() {
    if (!supportedCurrencies.includes(currency)) {
        summary.innerHTML = `
            <p class="error-text">Unsupported currency. Return to the packages page.</p>
        `;

        document.getElementById("continueButton").disabled = true;
        return;
    }

    if (!packageId) {
        summary.innerHTML = `
            <p class="error-text">
                No package selected. Return to the packages page.
            </p>
        `;

        document.getElementById("continueButton").disabled = true;
        return;
    }

    try {
        const response = await fetch("/api/packages");

        if (!response.ok) {
            throw new Error("Could not load packages.");
        }

        const packages = await response.json();

        if (!Array.isArray(packages)) {
            throw new Error("Invalid package information received.");
        }

        selectedPackage = packages.find(
            item => String(item.id) === String(packageId)
        );

        if (!selectedPackage) {
            throw new Error("The selected package is unavailable.");
        }

        const baseKES = getPackagePrice(selectedPackage);

        if (baseKES === null) {
            throw new Error("This package does not have a valid price.");
        }

        convertedAmount = await convertCurrency(baseKES, currency);

        renderSummary();

        document.getElementById("continueButton").disabled = false;

    } catch (error) {
        console.error("Checkout initialization failed:", error);

        summary.innerHTML = `
            <p class="error-text">${escapeHtml(error.message)}</p>
        `;

        document.getElementById("continueButton").disabled = true;
    }
}

checkoutForm.addEventListener("submit", event => {
    event.preventDefault();

    if (!checkoutForm.reportValidity()) return;
    if (!selectedPackage || convertedAmount === null) return;

    pinModal.hidden = false;
    demoCode.value = "";
    demoCodeError.textContent = "";
    demoCode.focus();
});

function closeModal() {
    pinModal.hidden = true;
    demoCode.value = "";
}

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelDemo").addEventListener("click", closeModal);

pinModal.addEventListener("click", event => {
    if (event.target === pinModal) closeModal();
});

demoCodeForm.addEventListener("submit", async event => {
    event.preventDefault();

    const fictionalCode = demoCode.value.trim();

    if (!/^\d{4}$/.test(fictionalCode)) {
        demoCodeError.textContent =
            "Enter four digits pin";
        return;
    }

    // This is a fictional simulation only.
    // The code is discarded and never transmitted or stored.
    demoCode.value = "";

    const name = document.getElementById("customerName").value.trim();
    const localPhone = document.getElementById("phone").value.trim();
    const callingCode = document.getElementById("country").value;

    const payload = {
        customerName: name,
        phone: `${callingCode} ${localPhone}`,
        packageId: selectedPackage.id,
        currency: currency,
        amount: convertedAmount,
        paymentStatus: "AUTHORIZED"
    };

    const submitButton = demoCodeForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;
    submitButton.textContent = "Submitting order...";

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
            throw new Error(result.error || "Order submission failed.");
        }

        closeModal();
        checkoutForm.hidden = true;

        showMessage(
            `Order recorded successfully. Reference: ${result.order.reference}. No real payment was processed.`,
            "success"
        );

        summary.insertAdjacentHTML(
            "beforeend",
            `<div class="notice success">
                <strong>Order recorded</strong><br>
                Reference: ${escapeHtml(result.order.reference)}
            </div>`
        );

    } catch (error) {
        demoCodeError.textContent = error.message;

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Simulate authorization";
    }
});

initializeCheckout();
