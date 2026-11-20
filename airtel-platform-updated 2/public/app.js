
const currencySelect = document.getElementById("currencyDisplay");
const packagesGrid = document.getElementById("packagesGrid");
const rateNotice = document.getElementById("rateNotice");

let packages = [];
let selectedCurrency = "USD";

let rates = {
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

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function getPackagePrice(item) {
    const price = Number(item.baseKES);

    if (!Number.isFinite(price) || price <= 0) {
        console.error("Invalid package price:", item);
        return null;
    }

    return price;
}

function formatMoney(amount, currency) {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
        return "Price unavailable";
    }

    const rate = Number(rates[currency]);

    if (!Number.isFinite(rate) || rate <= 0) {
        return "Price unavailable";
    }

    const converted = numericAmount * rate;

    const decimals = ["KES", "UGX", "TZS", "RWF", "CDF"].includes(currency)
        ? 0
        : 2;

    return `${symbols[currency] || currency + " "}${converted.toLocaleString(
        undefined,
        {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }
    )}`;
}

async function loadExchangeRates() {
    try {
        const response = await fetch(
            "https://open.er-api.com/v6/latest/KES"
        );

        if (!response.ok) {
            throw new Error("Exchange rates unavailable");
        }

        const data = await response.json();

        if (data.result !== "success" || !data.rates) {
            throw new Error("Invalid exchange-rate response");
        }

        rates = data.rates;

        if (rateNotice) {
            rateNotice.textContent =
                "Prices use the latest available indicative exchange rates.";
        }
    } catch (error) {
        console.warn("Using fallback exchange rates:", error);

        if (rateNotice) {
            rateNotice.textContent =
                "Using approximate fallback exchange rates. Prices are indicative.";
        }
    }
}

function renderPackages() {
    const currency = currencySelect.value || "USD";

    if (!packages.length) {
        packagesGrid.innerHTML =
            '<div class="panel">No packages are currently available.</div>';
        return;
    }

    packagesGrid.innerHTML = packages.map(item => {
        const baseKES = getPackagePrice(item);

        return `
            <article class="package">
                <div class="package-top">
                    <span class="package-tag">
                        ${escapeHtml(item.validity)}
                    </span>

                    <span class="package-data">
                        ${escapeHtml(item.data)}
                    </span>
                </div>

                <h3>${escapeHtml(item.name)}</h3>

                <p>${escapeHtml(item.description)}</p>

                <div class="price">
                    ${baseKES === null
                        ? "Price unavailable"
                        : formatMoney(baseKES, currency)}
                </div>

                

                <button
                    class="btn btn-full"
                    type="button"
                    data-package="${escapeHtml(item.id)}"
                    ${baseKES === null ? "disabled" : ""}>
                    Choose package
                </button>
            </article>
        `;
    }).join("");

    packagesGrid.querySelectorAll("[data-package]").forEach(button => {
        button.addEventListener("click", () => {
            const selected = packages.find(
    item => String(item.id) === button.dataset.package
);

            if (!selected) return;

            const params = new URLSearchParams({
                package: selected.id,
                currency: currency
            });

            window.location.href =
                `/checkout.html?${params.toString()}`;
        });
    });
}

async function initializeStore() {
    currencySelect.value = "USD";

    try {
        const response = await fetch("/api/packages");

        if (!response.ok) {
            throw new Error("Could not load packages: " + response.status);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Package API did not return an array");
        }

        packages = data;

        await loadExchangeRates();

        renderPackages();
    } catch (error) {
        console.error("Store initialization failed:", error);

        packagesGrid.innerHTML = `
            <div class="panel error">
                Could not load packages. ${escapeHtml(error.message)}
            </div>
        `;
    }
}

currencySelect.addEventListener("change", renderPackages);

initializeStore();
