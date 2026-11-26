require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

/* =========================
   CONFIGURATION
========================= */

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SESSION_SECRET = ADMIN_PASSWORD;

const SESSION_TTL = 8 * 60 * 60 * 1000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase environment variables.");
}

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
    throw new Error(
        "ADMIN_PASSWORD must be configured with at least 16 characters."
    );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

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
                reject(new Error("Request body too large."));
                req.destroy();
            }
        });

        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Invalid JSON body."));
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

function safeAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return Number(amount.toFixed(2));
}

function generateReference() {
    return (
        "AT" +
        Date.now().toString(36).toUpperCase() +
        crypto.randomBytes(3).toString("hex").toUpperCase()
    );
}

function generatePackageId(name) {
    return (
        safeText(name, 80)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") +
        "-" +
        crypto.randomBytes(2).toString("hex")
    );
}

function handleDatabaseError(error, res) {
    console.error("Supabase error:", error);

    return send(res, 500, {
        error: "A database operation failed. Please try again."
    });
}

/* =========================
   DATABASE MAPPERS
========================= */

function mapPackage(item) {
    const price = Number(item.price_kes);

    return {
        id: item.id,
        name: item.name,
        description: item.description || "",
        data: item.data,
        validity: item.validity,
        baseKES: price,
        priceKES: price,
        active: item.active !== false
    };
}

function mapOrder(item) {
    return {
        id: item.id,
        reference: item.reference,
        customerName: item.customer_name,
        phone: item.phone,
        packageId: item.package_id,
        packageName: item.package_name,
        packageData: item.package_data,
        validity: item.validity,
        currency: item.currency,
        amount: Number(item.amount),
        paymentStatus: item.payment_status,
        status: item.payment_status,
        note: item.note || "",
        createdAt: item.created_at,
        timestamp: item.created_at
    };
}

/* =========================
   COOKIE / ADMIN AUTH
========================= */

function parseCookies(header = "") {
    const cookies = {};

    header.split(";").forEach(part => {
        const item = part.trim();
        if (!item) return;

        const index = item.indexOf("=");

        if (index < 0) return;

        const key = item.slice(0, index);
        const value = item.slice(index + 1);

        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
    });

    return cookies;
}

function safeCompare(a, b) {
    const first = Buffer.from(String(a));
    const second = Buffer.from(String(b));

    return (
        first.length === second.length &&
        crypto.timingSafeEqual(first, second)
    );
}

function createSessionToken() {
    const payload = Buffer.from(
        JSON.stringify({
            expires: Date.now() + SESSION_TTL
        })
    ).toString("base64url");

    const signature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== "string") {
        return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return false;
    }

    const [payload, suppliedSignature] = parts;

    const expectedSignature = crypto
        .createHmac("sha256", SESSION_SECRET)
        .update(payload)
        .digest("base64url");

    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);

    if (
        supplied.length !== expected.length ||
        !crypto.timingSafeEqual(supplied, expected)
    ) {
        return false;
    }

    try {
        const session = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
        );

        return (
            Number.isFinite(session.expires) &&
            session.expires > Date.now()
        );
    } catch {
        return false;
    }
}

function adminSession(req) {
    const token = parseCookies(
        req.headers.cookie
    ).admin_session;

    return verifySessionToken(token);
}

function sessionCookie(token) {
    const production =
        process.env.NODE_ENV === "production" ||
        Boolean(process.env.VERCEL);

    return (
        `admin_session=${encodeURIComponent(token)}` +
        `; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}` +
        (production ? "; Secure" : "")
    );
}

function expiredSessionCookie() {
    const production =
        process.env.NODE_ENV === "production" ||
        Boolean(process.env.VERCEL);

    return (
        "admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" +
        (production ? "; Secure" : "")
    );
}

/* =========================
   STATIC FILE SERVER
========================= */

function serveStatic(req, res, pathname) {
    let requested =
        pathname === "/" ? "/index.html" : pathname;

    if (requested === "/admin" || requested === "/admin/") {
        requested = "/admin/index.html";
    }

    const target = path.resolve(PUBLIC, "." + requested);

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
   PACKAGE VALIDATION
========================= */

function preparePackage(body, id) {
    const name = safeText(body.name, 80);
    const data = safeText(body.data, 40);
    const validity = safeText(body.validity, 40);

    const priceKES = safeAmount(
        body.baseKES ?? body.priceKES
    );

    if (!name || !data || !validity || priceKES === null) {
        return null;
    }

    return {
        id,
        name,
        description: safeText(body.description, 180),
        data,
        validity,
        price_kes: priceKES,
        active: body.active !== false,
        updated_at: new Date().toISOString()
    };
}

/* =========================
   MAIN REQUEST HANDLER
========================= */

async function handler(req, res) {
    const url = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );

    const route =
        url.pathname === "/api/index" &&
        url.searchParams.has("route")
            ? "/api/" + url.searchParams.get("route")
            : url.pathname;

    try {

        /* HEALTH CHECK */

        if (req.method === "GET" && route === "/api/health") {
            return send(res, 200, {
                ok: true,
                message: "Airtel Packages API is running",
                database: "Supabase"
            });
        }

        /* PUBLIC PACKAGES */

        if (req.method === "GET" && route === "/api/packages") {
            const { data, error } = await supabase
                .from("packages")
                .select("*")
                .eq("active", true)
                .order("created_at", { ascending: true });

            if (error) return handleDatabaseError(error, res);

            return send(res, 200, (data || []).map(mapPackage));
        }

        
/* CREATE ORDER */

if (req.method === "POST" && route === "/api/orders") {
    const body = await readBody(req);

    const packageId = safeText(body.packageId, 100);
    const phone = safeText(body.phone, 32);
    const currency = safeText(body.currency, 3).toUpperCase();
    const amount = safeAmount(body.amount);

    const allowedCurrencies = [
        "USD", "KES", "GBP", "EUR", "UGX",
        "TZS", "RWF", "NGN", "ZAR", "CDF"
    ];

    // Validate phone number
    if (!/^\+?[0-9\s()-]{7,25}$/.test(phone)) {
        return send(res, 400, {
            error: "Please provide a valid mobile number."
        });
    }

    // Validate order details
    if (
        !packageId ||
        !allowedCurrencies.includes(currency) ||
        amount === null
    ) {
        return send(res, 400, {
            error: "Please provide valid order details."
        });
    }

    // Verify package exists and is active
    const {
        data: selected,
        error: packageError
    } = await supabase
        .from("packages")
        .select("id, name, active")
        .eq("id", packageId)
        .eq("active", true)
        .maybeSingle();

    if (packageError) {
        console.error("Package lookup error:", packageError);
        return handleDatabaseError(packageError, res);
    }

    if (!selected) {
        return send(res, 400, {
            error: "Please select a valid package."
        });
    }

    // Create demo order
    const orderData = {
        reference: generateReference(),
        customer_name: null,
        phone,
        package_id: selected.id,
        currency,
        amount,
        payment_status: "DEMO_PENDING"
    };

    const {
        data: order,
        error: orderError
    } = await supabase
        .from("orders")
        .insert(orderData)
        .select("*")
        .single();

    if (orderError) {
        console.error("Order insertion error:", orderError);
        return handleDatabaseError(orderError, res);
    }

    return send(res, 201, {
        success: true,
        message: "Demo order recorded successfully.",
        order: {
            id: order.id,
            reference: order.reference,
            phone: order.phone,
            amount: Number(order.amount),
            currency: order.currency,
            paymentStatus: order.payment_status
        }
    });
}


        /* ADMIN LOGIN */

        if (req.method === "POST" && route === "/api/admin/login") {
            const body = await readBody(req);

            const userOk = safeCompare(
                ADMIN_USERNAME,
                body.username || ""
            );

            const passwordOk = safeCompare(
                ADMIN_PASSWORD,
                body.password || ""
            );

            if (!userOk || !passwordOk) {
                return send(res, 401, {
                    error: "Incorrect username or password."
                });
            }

            return send(
                res,
                200,
                { ok: true },
                {
                    "Set-Cookie": sessionCookie(createSessionToken())
                }
            );
        }

        /* CHECK ADMIN SESSION */

        if (req.method === "GET" && route === "/api/admin/session") {
            return send(res, 200, {
                authenticated: adminSession(req)
            });
        }

        /* LOGOUT */

        if (req.method === "POST" && route === "/api/admin/logout") {
            return send(
                res,
                200,
                { ok: true },
                {
                    "Set-Cookie": expiredSessionCookie()
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
                const { data, error } = await supabase
                    .from("orders")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(1000);

                if (error) return handleDatabaseError(error, res);

                return send(res, 200, (data || []).map(mapOrder));
            }

            /* GET PACKAGES */

            if (
                req.method === "GET" &&
                route === "/api/admin/packages"
            ) {
                const { data, error } = await supabase
                    .from("packages")
                    .select("*")
                    .order("created_at", { ascending: true });

                if (error) return handleDatabaseError(error, res);

                return send(res, 200, (data || []).map(mapPackage));
            }

            /* CREATE PACKAGE */

            if (
                req.method === "POST" &&
                route === "/api/admin/packages"
            ) {
                const body = await readBody(req);

                const id =
                    safeText(body.id, 100) ||
                    generatePackageId(body.name);

                const item = preparePackage(body, id);

                if (!item) {
                    return send(res, 400, {
                        error: "Enter valid package details."
                    });
                }

                const { data, error } = await supabase
                    .from("packages")
                    .insert(item)
                    .select("*")
                    .single();

                if (error) {
                    console.error("Package creation error:", error);

                    return send(res, error.code === "23505" ? 409 : 500, {
                        error: error.code === "23505"
                            ? "A package with this ID already exists."
                            : "Unable to create package."
                    });
                }

                return send(res, 201, mapPackage(data));
            }

            /* UPDATE PACKAGE */

            const updateMatch = route.match(
                /^\/api\/admin\/packages\/([^/]+)$/
            );

            if (req.method === "PUT" && updateMatch) {
                const id = decodeURIComponent(updateMatch[1]);
                const body = await readBody(req);

                const item = preparePackage(body, id);

                if (!item) {
                    return send(res, 400, {
                        error: "Enter valid package details."
                    });
                }

                delete item.id;

                const { data, error } = await supabase
                    .from("packages")
                    .update(item)
                    .eq("id", id)
                    .select("*")
                    .maybeSingle();

                if (error) return handleDatabaseError(error, res);

                if (!data) {
                    return send(res, 404, {
                        error: "Package not found."
                    });
                }

                return send(res, 200, mapPackage(data));
            }

            /* DELETE PACKAGE */

            const deleteMatch = route.match(
                /^\/api\/admin\/packages\/([^/]+)$/
            );

            if (req.method === "DELETE" && deleteMatch) {
                const id = decodeURIComponent(deleteMatch[1]);

                const { data, error } = await supabase
                    .from("packages")
                    .delete()
                    .eq("id", id)
                    .select("id");

                if (error) return handleDatabaseError(error, res);

                if (!data || data.length === 0) {
                    return send(res, 404, {
                        error: "Package not found."
                    });
                }

                return send(res, 200, { ok: true });
            }
        }

        /* UNKNOWN API ROUTE */

        if (route.startsWith("/api/")) {
            return send(res, 404, {
                error: "API endpoint not found."
            });
        }

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
        console.log(
            `Airtel Packages running at http://localhost:${PORT}`
        );

        console.log(
            `Admin dashboard: http://localhost:${PORT}/admin/`
        );

        console.log("Database: Supabase");
    });
}

/* =========================
   VERCEL EXPORT
========================= */

module.exports = handler;
