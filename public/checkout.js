"use strict";

const params = new URLSearchParams(window.location.search);
const packageId = params.get("package");
const currency = (params.get("currency") || "USD").toUpperCase();

const summary = document.getElementById("packageSummary");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutMessage = document.getElementById("checkoutMessage");
const pinModal = document.getElementById("pinModal");
const continueButton = document.getElementById("continueButton");

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
    KES: 1, USD: 1 / 129, GBP: 1 / 165, EUR: 1 / 140,
    UGX: 28.5, TZS: 20.2, RWF: 10.1, NGN: 11.5,
    ZAR: 0.14, CDF: 21.5
};

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    })[c]);
}

function showMessage(message, type = "") {
    if (!checkoutMessage) return;
    checkoutMessage.textContent = message;
    checkoutMessage.className = `form-message ${type}`;
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
            <span>Package price</span><strong>${money(convertedAmount)}</strong>
        </div>
        <div class="summary-line">
            <span>Currency</span><strong>${currency}</strong>
        </div>
        <div class="summary-line total-line">
            <span>Total</span><strong>${money(convertedAmount)}</strong>
        </div>
        <p class="muted">Indicative currency conversion.</p>
    `;

    const visualData = document.getElementById("packageVisualData");
    const visualValidity = document.getElementById("packageVisualValidity");

    if (visualData) visualData.textContent = `${selectedPackage.name} · ${selectedPackage.data}`;
    if (visualValidity) visualValidity.textContent = selectedPackage.validity;
}

async function initializeCheckout() {
    continueButton.disabled = true;

    if (!supportedCurrencies.includes(currency)) {
        summary.innerHTML = `<p class="error-text">Unsupported currency.</p>`;
        return;
    }

    if (!packageId) {
        summary.innerHTML = `<p class="error-text">No package selected.</p>`;
        return;
    }

    try {
        const response = await fetch("/api/packages", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load packages.");

        const packages = await response.json();
        if (!Array.isArray(packages)) throw new Error("Invalid package data.");

        selectedPackage = packages.find(p => String(p.id) === String(packageId));
        if (!selectedPackage) throw new Error("Selected package unavailable.");

        const baseKES = Number(selectedPackage.baseKES);
        if (!Number.isFinite(baseKES) || baseKES <= 0) {
            throw new Error("Invalid package price.");
        }

        convertedAmount = await convertCurrency(baseKES, currency);
        renderSummary();
        continueButton.disabled = false;

    } catch (error) {
        summary.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    }
}

/* OPEN POPUP */

checkoutForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!checkoutForm.reportValidity()) return;

    if (!selectedPackage || convertedAmount === null) {
        showMessage("Package is still loading.", "error");
        return;
    }

    pinModal.hidden = false;
});

/* CLOSE POPUP */

function closeModal() {
    pinModal.hidden = true;
}

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("cancelDemo").addEventListener("click", closeModal);

pinModal.addEventListener("click", event => {
    if (event.target === pinModal) closeModal();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
});

/* DEMO AUTHORIZATION */

const demoButton = document.createElement("button");
demoButton.type = "button";
demoButton.className = "btn btn-full";
demoButton.textContent = "Simulate payment";
document.getElementById("cancelDemo").insertAdjacentElement("beforebegin", demoButton);

demoButton.addEventListener("click", async () => {
    if (submitting || !selectedPackage) return;

    const name = document.getElementById("customerName").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const code = prompt("Educational demo only. Enter demo code 1234 to simulate authorization:");

    if (code === null) return;

    if (code !== "1234") {
        alert("Demo declined. Use the designated demo code to simulate success.");
        return;
    }

    submitting = true;
    demoButton.disabled = true;
    demoButton.textContent = "Processing...";

    try {
        const payload = {
            customerName: name,
            phone: `${document.getElementById("country").value} ${phone}`,
            packageId: selectedPackage.id,
            currency,
            amount: convertedAmount,
            paymentStatus: "PAYMENT_PENDING"
        };

        const response = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Order failed.");

        closeModal();
        checkoutForm.hidden = true;

        showMessage(
            `Order recorded. Reference: ${result.order.reference}. No payment was processed.`,
            "success"
        );

    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        submitting = false;
        demoButton.disabled = false;
        demoButton.textContent = "Simulate payment";
    }
});

initializeCheckout();