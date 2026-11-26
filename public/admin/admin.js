/* ============================================
   AIRTEL PACKAGES — ADMIN DASHBOARD
============================================ */

/* DOM ELEMENTS */

const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("adminLoginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

const dashboard = document.getElementById("adminDashboard");
const dashboardMessage = document.getElementById("dashboardMessage");

const packagesTable = document.getElementById("packagesTable");
const ordersTable = document.getElementById("ordersTable");
const packageForm = document.getElementById("packageForm");

const refreshButton = document.getElementById("refreshButton");
const adminSidebar = document.getElementById("adminSidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");

/* APPLICATION STATE */

let packages = [];
let orders = [];
let messageTimer;


/* ============================================
   SECURITY: HTML ESCAPING
============================================ */

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


/* ============================================
   API
============================================ */

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        }
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
        showLogin();

        throw new Error(
            result.error ||
            "Your admin session has expired. Please sign in again."
        );
    }

    if (!response.ok) {
        throw new Error(
            result.error ||
            result.message ||
            "Request failed."
        );
    }

    return result;
}


/* ============================================
   AUTHENTICATION DISPLAY
============================================ */

function showLogin() {
    dashboard.hidden = true;
    loginModal.hidden = false;

    const headerStatus =
        document.getElementById("adminHeaderStatus");

    if (headerStatus) {
        headerStatus.textContent = "● Secure administration";
    }

    closeSidebar();
}


function showDashboard() {
    loginModal.hidden = true;
    dashboard.hidden = false;

    const headerStatus =
        document.getElementById("adminHeaderStatus");

    if (headerStatus) {
        headerStatus.textContent =
            "● Administrator session active";
    }
}


function showLoginError(message) {
    loginMessage.textContent = message;
    loginMessage.hidden = false;
    loginMessage.className = "admin-message error";
}


function showDashboardMessage(message, type = "success") {
    dashboardMessage.textContent = message;
    dashboardMessage.hidden = false;
    dashboardMessage.className = `admin-message ${type}`;

    clearTimeout(messageTimer);

    messageTimer = window.setTimeout(() => {
        dashboardMessage.hidden = true;
    }, 5000);
}


/* ============================================
   HELPERS
============================================ */

function unwrapList(result, key) {
    if (Array.isArray(result)) {
        return result;
    }

    if (Array.isArray(result[key])) {
        return result[key];
    }

    return [];
}


function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}


function formatAmount(amount, currency) {
    const number = Number(amount);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return `${currency || "USD"} ${number.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}


/* ============================================
   LOGIN
============================================ */

loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    loginMessage.hidden = true;

    loginButton.disabled = true;
    loginButton.textContent = "Authenticating...";

    const username =
        document.getElementById("adminUsername").value.trim();

    const password =
        document.getElementById("adminPassword").value;

    try {
        await api("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({
                username,
                password
            })
        });

        document.getElementById("adminPassword").value = "";

        showDashboard();

        await loadDashboard();

    } catch (error) {
        showLoginError(error.message);

    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Sign in securely →";
    }
});


/* ============================================
   PASSWORD VISIBILITY
============================================ */

document.getElementById("togglePassword")
    .addEventListener("click", () => {

        const password =
            document.getElementById("adminPassword");

        const button =
            document.getElementById("togglePassword");

        const showing = password.type === "text";

        password.type = showing ? "password" : "text";

        button.textContent = showing ? "Show" : "Hide";
    });


/* ============================================
   LOGOUT
============================================ */

async function logout() {
    const buttons = [
        document.getElementById("logoutButton"),
        document.getElementById("sidebarLogout")
    ];

    buttons.forEach(button => {
        if (button) button.disabled = true;
    });

    try {
        await api("/api/admin/logout", {
            method: "POST"
        });

    } catch (error) {
        console.warn("Logout request:", error.message);

    } finally {
        showLogin();

        loginForm.reset();
        loginMessage.hidden = true;

        buttons.forEach(button => {
            if (button) button.disabled = false;
        });
    }
}


document.getElementById("logoutButton")
    .addEventListener("click", logout);

document.getElementById("sidebarLogout")
    .addEventListener("click", logout);


/* ============================================
   SESSION CHECK
============================================ */

async function checkSession() {
    try {
        const result = await api("/api/admin/session");

        const authenticated =
            result.authenticated === true ||
            result.loggedIn === true ||
            result.success === true;

        if (!authenticated) {
            showLogin();
            return;
        }

        showDashboard();

        await loadDashboard();

    } catch (error) {
        showLogin();
    }
}


/* ============================================
   DASHBOARD DATA
============================================ */

async function loadDashboard() {
    try {
        await Promise.all([
            loadPackages(),
            loadOrders()
        ]);

        updateStatistics();

    } catch (error) {
        showDashboardMessage(error.message, "error");
    }
}


/* ============================================
   REFRESH
============================================ */

refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "↻ Refreshing...";

    try {
        await loadDashboard();

        if (!dashboardMessage.classList.contains("error")) {
            showDashboardMessage(
                "Dashboard data refreshed successfully."
            );
        }

    } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = "↻ Refresh data";
    }
});


/* ============================================
   MOBILE SIDEBAR
============================================ */

function openSidebar() {
    adminSidebar.classList.add("open");
    sidebarBackdrop.classList.add("open");
}


function closeSidebar() {
    adminSidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("open");
}


document.getElementById("mobileMenuBtn")
    .addEventListener("click", openSidebar);

sidebarBackdrop.addEventListener("click", closeSidebar);


/* ============================================
   SIDEBAR NAVIGATION
============================================ */

document.querySelectorAll(".sidebar-link[data-target]")
    .forEach(button => {

        button.addEventListener("click", () => {
            const targetId = button.dataset.target;

            const target =
                document.getElementById(targetId);

            if (!target) return;

            document.querySelectorAll(".sidebar-link")
                .forEach(link => {
                    link.classList.remove("active");
                });

            button.classList.add("active");

            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            closeSidebar();
        });
    });


/* ============================================
   PACKAGES
============================================ */

async function loadPackages() {
    const result = await api("/api/admin/packages");

    packages = unwrapList(result, "packages");

    renderPackages();
}


function renderPackages() {
    if (!packages.length) {
        packagesTable.innerHTML = `
            <tr>
                <td colspan="6"
                    style="text-align:center;padding:30px">
                    No packages found.
                    Create your first data package above.
                </td>
            </tr>
        `;

        return;
    }

    packagesTable.innerHTML = packages.map(item => `
        <tr>
            <td>
                <strong>${escapeHtml(item.name)}</strong>
            </td>

            <td>${escapeHtml(item.data)}</td>

            <td>${escapeHtml(item.validity)}</td>

            <td>
                <strong>
                    KES ${Number(item.baseKES || 0).toLocaleString()}
                </strong>
            </td>

            <td>
                <span class="admin-status ${
                    item.active === false ? "pending" : "success"
                }">
                    ${item.active === false ? "Inactive" : "Active"}
                </span>
            </td>

            <td>
                <button
                    class="admin-btn light"
                    data-edit="${escapeHtml(item.id)}"
                    type="button">
                    ✎ Edit
                </button>

                <button
                    class="admin-btn danger"
                    data-delete="${escapeHtml(item.id)}"
                    type="button">
                    Delete
                </button>
            </td>
        </tr>
    `).join("");

    packagesTable.querySelectorAll("[data-edit]")
        .forEach(button => {
            button.addEventListener("click", () => {
                editPackage(button.dataset.edit);
            });
        });

    packagesTable.querySelectorAll("[data-delete]")
        .forEach(button => {
            button.addEventListener("click", () => {
                deletePackage(button.dataset.delete);
            });
        });
}


/* ============================================
   ADD OR UPDATE PACKAGE
============================================ */

packageForm.addEventListener("submit", async event => {
    event.preventDefault();

    const editId =
        document.getElementById("editPackageId").value;

    const payload = {
        name: document.getElementById("packageName").value.trim(),

        data: document.getElementById("packageData").value.trim(),

        validity: document.getElementById("packageValidity").value.trim(),

        baseKES: Number(
            document.getElementById("packagePrice").value
        ),

        description:
            document.getElementById("packageDescription").value.trim(),

        active:
            document.getElementById("packageActive").value === "true"
    };

    if (
        !payload.name ||
        !payload.data ||
        !payload.validity ||
        !payload.description ||
        !Number.isFinite(payload.baseKES) ||
        payload.baseKES <= 0
    ) {
        showDashboardMessage(
            "Please enter valid package details and a positive KES price.",
            "error"
        );

        return;
    }

    const button =
        document.getElementById("savePackageButton");

    button.disabled = true;

    button.textContent = editId
        ? "Updating package..."
        : "Saving package...";

    try {
        if (editId) {
            await api(
                `/api/admin/packages/${encodeURIComponent(editId)}`,
                {
                    method: "PUT",
                    body: JSON.stringify(payload)
                }
            );

            showDashboardMessage(
                "Package updated successfully."
            );

        } else {
            await api("/api/admin/packages", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showDashboardMessage(
                "New package added successfully."
            );
        }

        resetPackageForm();

        await loadPackages();

        updateStatistics();

    } catch (error) {
        showDashboardMessage(error.message, "error");

    } finally {
        button.disabled = false;
        button.textContent = "＋ Save package";
    }
});


/* ============================================
   EDIT PACKAGE
============================================ */

function editPackage(id) {
    const item = packages.find(
        entry => String(entry.id) === String(id)
    );

    if (!item) return;

    document.getElementById("editPackageId").value = item.id;

    document.getElementById("packageName").value =
        item.name || "";

    document.getElementById("packageData").value =
        item.data || "";

    document.getElementById("packageValidity").value =
        item.validity || "";

    document.getElementById("packagePrice").value =
        item.baseKES ?? "";

    document.getElementById("packageDescription").value =
        item.description || "";

    document.getElementById("packageActive").value =
        item.active === false ? "false" : "true";

    document.getElementById("packageFormTitle").textContent =
        "Edit package";

    document.getElementById("savePackageButton").textContent =
        "Update package";

    document.getElementById("cancelEditButton").hidden = false;

    document.getElementById("packageEditor").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* ============================================
   RESET PACKAGE FORM
============================================ */

function resetPackageForm() {
    packageForm.reset();

    document.getElementById("editPackageId").value = "";

    document.getElementById("packageActive").value = "true";

    document.getElementById("packageFormTitle").textContent =
        "Create a new package";

    document.getElementById("savePackageButton").textContent =
        "＋ Save package";

    document.getElementById("cancelEditButton").hidden = true;
}


document.getElementById("cancelEditButton")
    .addEventListener("click", resetPackageForm);


/* ============================================
   DELETE PACKAGE
============================================ */

async function deletePackage(id) {
    const item = packages.find(
        entry => String(entry.id) === String(id)
    );

    if (!item) return;

    const confirmed = confirm(
        `Are you sure you want to delete the "${item.name}" package?`
    );

    if (!confirmed) return;

    try {
        await api(
            `/api/admin/packages/${encodeURIComponent(id)}`,
            {
                method: "DELETE"
            }
        );

        showDashboardMessage(
            "Package deleted successfully."
        );

        await loadPackages();

        updateStatistics();

    } catch (error) {
        showDashboardMessage(error.message, "error");
    }
}


/* ============================================
   CUSTOMER ORDERS
============================================ */

async function loadOrders() {
    const result = await api("/api/admin/orders");

    orders = unwrapList(result, "orders");

    renderOrders();
}


function renderOrders() {
    if (!orders.length) {
        ordersTable.innerHTML = `
            <tr>
                <td colspan="8"
                    style="text-align:center;padding:30px">
                    No customer orders have been recorded yet.
                </td>
            </tr>
        `;

        return;
    }

    const sorted = [...orders].sort((a, b) => {
        return new Date(b.createdAt || b.timestamp || 0) -
               new Date(a.createdAt || a.timestamp || 0);
    });

    ordersTable.innerHTML = sorted.map(order => {

        const status = String(
            order.paymentStatus ||
            order.status ||
            "DEMO_PENDING"
        );

        const statusClass =
            status === "DEMO_AUTHORIZED"
                ? "success"
                : "pending";

        return `
            <tr>

                <td>
                    <strong>
                        ${escapeHtml(order.reference || "—")}
                    </strong>
                </td>

                <td>
                    ${escapeHtml(order.customerName || "—")}
                </td>

                <td>
                    ${escapeHtml(order.phone || "—")}
                </td>

                <td>
                    ${escapeHtml(
                        order.packageName ||
                        order.packageData ||
                        "—"
                    )}
                </td>

                <td>
                    ${escapeHtml(order.currency || "USD")}
                </td>

                <td>
                    <strong>
                        ${formatAmount(
                            order.amount,
                            order.currency
                        )}
                    </strong>
                </td>

                <td>
                    <span class="admin-status ${statusClass}">
                        ${escapeHtml(status)}
                    </span>

                    <div class="admin-muted">
                        SIMULATION ONLY
                    </div>
                </td>

                <td>
                    ${escapeHtml(
                        formatDate(
                            order.createdAt || order.timestamp
                        )
                    )}
                </td>

            </tr>
        `;
    }).join("");
}


/* ============================================
   STATISTICS
============================================ */

function updateStatistics() {

    const totalOrders =
        document.getElementById("totalOrders");

    const authorizedOrders =
        document.getElementById("authorizedOrders");

    const pendingOrders =
        document.getElementById("pendingOrders");

    const activePackages =
        document.getElementById("activePackages");

    if (totalOrders) {
        totalOrders.textContent = orders.length;
    }

    if (authorizedOrders) {
        authorizedOrders.textContent =
            orders.filter(order =>
                order.paymentStatus === "DEMO_AUTHORIZED" ||
                order.status === "DEMO_AUTHORIZED"
            ).length;
    }

    if (pendingOrders) {
        pendingOrders.textContent =
            orders.filter(order => {

                const status =
                    order.paymentStatus || order.status;

                return (
                    !status ||
                    status === "DEMO_PENDING" ||
                    status === "PAYMENT_PENDING" ||
                    status === "PENDING"
                );
            }).length;
    }

    if (activePackages) {
        activePackages.textContent =
            packages.filter(item => item.active !== false).length;
    }
}


/* ============================================
   START APPLICATION
============================================ */

checkSession();