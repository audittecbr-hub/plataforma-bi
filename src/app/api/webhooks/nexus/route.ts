import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Whitelist of allowed columns per table — prevents unknown fields from being inserted
const ALLOWED_FIELDS: Record<string, Set<string>> = {
    nexus_unidades: new Set(["id", "codigo", "nome", "ativo", "cidade", "estado", "cnpj", "tipo"]),
    nexus_modelos: new Set(["id", "unidade", "unidade_id", "nome", "cancelamento", "status", "tipo", "data_inicio", "data_fim", "valor"]),
    nexus_participantes: new Set(["id", "nome", "cpf", "email", "telefone", "unidade", "unidade_id", "status", "cargo"]),
    nexus_jobs: new Set(["id", "status", "tipo", "unidade", "unidade_id", "descricao", "data_inicio", "data_fim"]),
};

const ALLOWED_TABLES = Object.keys(ALLOWED_FIELDS);

function verifyToken(incomingToken: string | null, secret: string, rawBody: string): boolean {
    // Support HMAC-SHA256 (X-Hub-Signature-256: sha256=<hex>) or plain token
    if (incomingToken?.startsWith("sha256=")) {
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");
        return crypto.timingSafeEqual(
            Buffer.from(incomingToken.slice(7)),
            Buffer.from(expectedSignature)
        );
    }
    // Plain token fallback (constant-time compare)
    try {
        return crypto.timingSafeEqual(
            Buffer.from(incomingToken ?? ""),
            Buffer.from(secret)
        );
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();

    // 1. Read raw body first (needed for HMAC verification)
    const rawBody = await req.text();

    // 2. Security: Validate Token
    const incomingToken = req.headers.get("X-Hub-Signature-256")
        || req.headers.get("X-Hub-Signature")
        || req.nextUrl.searchParams.get("token");
    const secret = process.env.NEXUS_WEBHOOK_SECRET;

    if (!secret) {
        console.warn("⚠ NEXUS_WEBHOOK_SECRET not set. Webhook validation disabled (unsafe).");
    } else if (!verifyToken(incomingToken, secret, rawBody)) {
        return NextResponse.json({ error: "Unauthorized: Invalid Token" }, { status: 401 });
    }

    // 3. Parse Body
    let body;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 4. Determine Table
    const tableName = req.nextUrl.searchParams.get("table");

    if (!tableName || !ALLOWED_TABLES.includes(tableName)) {
        return NextResponse.json({ error: "Invalid or Missing Table Name" }, { status: 400 });
    }

    // 5. Handle Payload Structure
    // Nexus sometimes sends wrapped data: { "event": "update", "data": {...} } or just {...}
    const payload = body.data || body;
    const id = payload.id || payload.codigo;

    if (!id) {
        return NextResponse.json({ error: "Missing ID/Codigo in payload" }, { status: 400 });
    }

    // 6. Whitelist-only field mapping — unknown fields are silently dropped
    const allowedFields = ALLOWED_FIELDS[tableName];
    const upsertData: Record<string, unknown> = {
        id,
        updated_at: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(payload)) {
        if (key === "id" || key === "codigo") continue;
        const cleanKey = key.replace(/ /g, "_");
        if (allowedFields.has(cleanKey)) {
            upsertData[cleanKey] = value;
        }
    }

    // 7. Table-specific derived fields
    if (tableName === "nexus_modelos") {
        if (payload.unidade != null) upsertData["unidade"] = payload.unidade;
        if (payload.unidade_id != null) upsertData["unidade_id"] = payload.unidade_id;
        upsertData["status"] = payload.cancelamento === 1 ? "Cancelado" : "Ativo";
    }

    // 8. Perform UPSERT
    const { error } = await supabase.from(tableName).upsert(upsertData);

    if (error) {
        console.error("Webhook upsert error:", error.message);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
}
