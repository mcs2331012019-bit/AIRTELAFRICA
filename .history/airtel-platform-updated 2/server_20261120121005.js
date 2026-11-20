const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");

const PORT = Number(process.env.PORT || 3000);

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "ChangeThisToA_StrongPassword!";

const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions = new Map();

/* =========================
   JSON STORAGE
========================= */

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    fs.writeFileSync(
        file,
        JSON.stringify(value, null, 2) + "\n"
    );
}

/* =========================
   RESPONSE HELPERS
========================= */

function send(res, status, payload, headers = {}) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...headers
    });

    res.end(JSON.stringify(payload));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;

            if (body.length > 1000000) {
                reject(new Error("Request body too large"));
                req.destroy();
            }
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Invalid JSON body"));
            }
        });

        req.on("error", reject);
    });
}

function safeText(value, max = 160) {
    return String(value ?? "")
        .trim()
        .replace(/[<>]/g, "")
        .slice(0, max);
}

/* =========================
   COOKIE / ADMIN SESSIONS
========================= */

function parseCookies(header = "") {
    const cookies = {};

    header.split(";").forEach(part => {
        const item = part.trim();
        if (!item) return;

        const i = item.indexOf("=");

        if (i < 0) return;

        const key = item.slice(0, i);
        const value = item.slice(i + 1);

        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
    });

    return cookies;
}

function adminSession(req) {
    const token = parseCookies(req.headers.cookie).admin_session;
    const session = token && sessions.get(token);

    if (!session || session.expires < Date.now()) {
        if (token) sessions.delete(token);
        return false;
    }

    session.expires = Date.now() + SESSION_TTL;
    return true;
}

/* =========================
   STATIC FILE SERVER
========================= */

function serveStatic(req, res, pathname) {
    let requested = pathname === "/" ? "/index.html" : pathname;

    if (requested === "/admin" || requested === "/admin/") {
        requested = "/admin/index.html";
    }

    const target = path.resolve(PUBLIC, "." + requested);

    // Prevent access outside the public directory.
    if (
        target !== PUBLIC &&
        !target.startsWith(PUBLIC + path.sep)
    ) {
        res.writeHead(403);
        return res.end("Forbidden");
    }

    fs.readFile(target, (error, data) => {
        if (error) {
            res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8"
            });
            return res.end("Not found");
        }

        const ext = path.extname(target).toLowerCase();

        const types = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".ico": "image/x-icon"
        };

        res.writeHead(200, {
            "Content-Type":
                types[ext] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff"
        });

        res.end(data);
    });
}

/* =========================
   MAIN REQUEST HANDLER
========================= */

async function handler(req, res) {
    const url = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );

    const route = url.pathname;

    try {

        /* HEALTH CHECK */

        if (req.method === "GET" && route === "/api/health") {
            return send(res, 200, {
                ok: true,
                message: "Airtel Africa API is running"
            });
        }

        /* PUBLIC PACKAGES */

        if (req.method === "GET" && route === "/api/packages") {
            const packages = readJson(
                path.join(DATA, "packages.json"),
                []
            );

            return send(
                res,
                200,
                packages.filter(item => item.active !== false)
            );
        }

        /* CREATE CUSTOMER ORDER */

        if (req.method === "POST" && route === "/api/orders") {
            const body = await readBody(req);

            const packages = readJson(
                path.join(DATA, "packages.json"),
                []
            );

            const selected = packages.find(item =>
                String(item.id) === String(body.packageId) &&
                item.active !== false
            );

            if (!selected) {
                return send(res, 400, {
                    error: "Please select a valid package."
                });
            }

            const customerName = safeText(body.customerName, 100);
            const phone = safeText(body.phone, 32);
            const currency = safeText(body.currency, 3).toUpperCase();
            const amount = Number(body.amount);

            const allowedCurrencies = [
                "USD", "KES", "GBP", "EUR", "UGX",
                "TZS", "RWF", "NGN", "ZAR", "CDF"
            ];

            if (
                !customerName ||
                !phone ||
                !allowedCurrencies.includes(currency) ||
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                return send(res, 400, {
                    error: "Please provide valid order details."
                });
            }

            const paymentStatus =
                body.paymentStatus === "DEMO_AUTHORIZED"
                    ? "DEMO_AUTHORIZED"
                    : "PAYMENT_PENDING";

            const order = {
                id: crypto.randomUUID(),

                reference:
                    "AT" +
                    Date.now().toString(36).toUpperCase() +
                    crypto.randomBytes(2).toString("hex").toUpperCase(),

                createdAt: new Date().toISOString(),

                customerName,
                phone,

                packageId: selected.id,
                packageName: selected.name,
                packageData: selected.data,
                validity: selected.validity,

                currency,
                amount: Number(amount.toFixed(2)),

                paymentStatus,

                note: "Demonstration order. No real payment processed."
            };

            const orders = readJson(
                path.join(DATA, "orders.json"),
                []
            );

            orders.unshift(order);

            writeJson(
                path.join(DATA, "orders.json"),
                orders
            );

            return send(res, 201, {
                message: "Order request received.",
                order: {
                    reference: order.reference,
                    paymentStatus
                }
            });
        }

        /* ADMIN LOGIN */

        if (req.method === "POST" && route === "/api/admin/login") {
            const body = await readBody(req);

            const username = String(body.username || "");
            const password = String(body.password || "");

            const expectedUser = Buffer.from(ADMIN_USERNAME);
            const suppliedUser = Buffer.from(username);

            const expectedPassword = Buffer.from(ADMIN_PASSWORD);
            const suppliedPassword = Buffer.from(password);

            const userOk =
                expectedUser.length === suppliedUser.length &&
                crypto.timingSafeEqual(expectedUser, suppliedUser);

            const passwordOk =
                expectedPassword.length === suppliedPassword.length &&
                crypto.timingSafeEqual(
                    expectedPassword,
                    suppliedPassword
                );

            if (!userOk || !passwordOk) {
                return send(res, 401, {
                    error: "Incorrect username or password."
                });
            }

            const token = crypto.randomBytes(32).toString("hex");

            sessions.set(token, {
                expires: Date.now() + SESSION_TTL
            });

            const isProduction =
                process.env.NODE_ENV === "production" ||
                Boolean(process.env.VERCEL);

            return send(
                res,
                200,
                { ok: true },
                {
                    "Set-Cookie":
                        `admin_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}` +
                        (isProduction ? "; Secure" : "")
                }
            );
        }

        /* CHECK ADMIN SESSION */

        if (req.method === "GET" && route === "/api/admin/session") {
            return send(res, 200, {
                authenticated: adminSession(req)
            });
        }

        /* ADMIN LOGOUT */

        if (req.method === "POST" && route === "/api/admin/logout") {
            const token = parseCookies(req.headers.cookie).admin_session;

            if (token) sessions.delete(token);

            const isProduction =
                process.env.NODE_ENV === "production" ||
                Boolean(process.env.VERCEL);

            return send(
                res,
                200,
                { ok: true },
                {
                    "Set-Cookie":
                        "admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" +
                        (isProduction ? "; Secure" : "")
                }
            );
        }

        /* PROTECTED ADMIN ROUTES */

        if (route.startsWith("/api/admin/")) {

            if (!adminSession(req)) {
                return send(res, 401, {
                    error: "Please sign in again."
                });
            }

            /* GET ORDERS */

            if (
                req.method === "GET" &&
                route === "/api/admin/orders"
            ) {
                return send(
                    res,
                    200,
                    readJson(path.join(DATA, "orders.json"), [])
                );
            }

            /* GET ALL PACKAGES */

            if (
                req.method === "GET" &&
                route === "/api/admin/packages"
            ) {
                return send(
                    res,
                    200,
                    readJson(path.join(DATA, "packages.json"), [])
                );
            }

            /* CREATE OR UPDATE PACKAGE */

            if (
                req.method === "POST" &&
                route === "/api/admin/packages"
            ) {
                const body = await readBody(req);

                const name = safeText(body.name, 80);
                const data = safeText(body.data, 40);
                const validity = safeText(body.validity, 40);
                const priceKES = Number(body.priceKES);

                if (
                    !name ||
                    !data ||
                    !validity ||
                    !Number.isFinite(priceKES) ||
                    priceKES <= 0
                ) {
                    return send(res, 400, {
                        error: "Enter valid package details."
                    });
                }

                const packages = readJson(
                    path.join(DATA, "packages.json"),
                    []
                );

                const id =
                    safeText(body.id, 60) ||
                    name.toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "") +
                    "-" +
                    crypto.randomBytes(2).toString("hex");

                const item = {
                    id,
                    name,
                    description: safeText(body.description, 180),
                    data,
                    validity,
                    priceKES: Number(priceKES.toFixed(2)),
                    active: body.active !== false
                };

                const index = packages.findIndex(p => p.id === id);

                if (index >= 0) {
                    packages[index] = item;
                } else {
                    packages.push(item);
                }

                writeJson(
                    path.join(DATA, "packages.json"),
                    packages
                );

                return send(res, 200, item);
            }

            /* DELETE PACKAGE */

            const deleteMatch = route.match(
                /^\/api\/admin\/packages\/([^/]+)$/
            );

            if (req.method === "DELETE" && deleteMatch) {
                const id = decodeURIComponent(deleteMatch[1]);

                const packages = readJson(
                    path.join(DATA, "packages.json"),
                    []
                );

                writeJson(
                    path.join(DATA, "packages.json"),
                    packages.filter(item =>
                        String(item.id) !== String(id)
                    )
                );

                return send(res, 200, { ok: true });
            }
        }

        /* UNKNOWN API ROUTE */

        if (route.startsWith("/api/")) {
            return send(res, 404, {
                error: "API endpoint not found."
            });
        }

        /* WEBSITE / STATIC FILES */

        return serveStatic(req, res, route);

    } catch (error) {
        console.error("Server error:", error);

        if (!res.headersSent) {
            return send(res, 500, {
                error: "Something went wrong on the server."
            });
        }

        res.end();
    }
}

/* =========================
   LOCAL DEVELOPMENT
========================= */

if (!process.env.VERCEL) {
    const server = http.createServer(handler);

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Airtel Packages running at http://localhost:${PORT}`);
        console.log(`Admin dashboard: http://localhost:${PORT}/admin/`);

        if (ADMIN_PASSWORD === "ChangeThisToA_StrongPassword!") {
            console.warn(
                "WARNING: Change the default admin password before public deployment."
            );
        }
    });
}

/* =========================
   VERCEL EXPORT
========================= */

module.exports = handler;