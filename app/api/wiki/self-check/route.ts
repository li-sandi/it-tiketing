import { NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return jsonError("Asal permintaan tidak diizinkan.", 403);
      }
    } catch {
      return jsonError("Header asal permintaan tidak valid.", 403);
    }
  }

  const flags = await getFeatureFlags();
  if (!flags.ai_self_check_enabled) {
    return NextResponse.json({ articles: [], aiSummary: null });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Payload tidak valid.", 400);
  }
  if (typeof payload !== "object" || payload === null) {
    return jsonError("Payload tidak valid.", 400);
  }

  const record = payload as Record<string, unknown>;
  const deskripsi =
    typeof record.deskripsi === "string" ? record.deskripsi.trim().slice(0, 500) : "";
  const categoryId =
    typeof record.categoryId === "string" ? record.categoryId : "";
  const grup = typeof record.grup === "string" ? record.grup.trim() : "";

  if (deskripsi.length < 5 && !categoryId) {
    return NextResponse.json({ articles: [], aiSummary: null });
  }

  const admin = createAdminClient();
  const keywords = deskripsi
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);

  let articles: Array<{
    id: string;
    judul: string;
    grup: string;
    masalah: string;
    solusi: string;
  }> = [];

  if (keywords.length > 0) {
    const query = keywords.join(" or ");
    const { data } = await admin
      .from("knowledge_articles")
      .select("id, judul, grup, masalah, solusi")
      .eq("status", "published")
      .textSearch("search_vector", query, { type: "websearch" })
      .limit(4);
    articles = data ?? [];
  }

  if (articles.length === 0 && (categoryId || grup)) {
    let fallbackQuery = admin
      .from("knowledge_articles")
      .select("id, judul, grup, masalah, solusi")
      .eq("status", "published")
      .limit(3);
    if (categoryId) fallbackQuery = fallbackQuery.eq("category_id", categoryId);
    else if (grup) fallbackQuery = fallbackQuery.eq("grup", grup);
    const { data } = await fallbackQuery;
    articles = data ?? [];
  }

  // Optional Gemini RAG synthesis (never sends PII, contacts, or remote credentials)
  let aiSummary: string | null = null;
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey && articles.length > 0 && deskripsi.length >= 8) {
    try {
      const contextText = articles
        .map(
          (a, i) =>
            `[${i + 1}] ${a.judul}\nMasalah: ${a.masalah.slice(0, 250)}\nSolusi: ${a.solusi.slice(0, 500)}`,
        )
        .join("\n\n");

      const prompt = `Kamu adalah asisten IT internal. Berikan 2-4 langkah pemeriksaan mandiri singkat dalam bahasa Indonesia berdasarkan SOP berikut. Jangan mengarang langkah di luar SOP.\n\nKeluhan: ${deskripsi}\n\nSOP Referensi:\n${contextText}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: AbortSignal.timeout(6_000),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        aiSummary =
          json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
      }
    } catch {
      aiSummary = null;
    }
  }

  return NextResponse.json(
    { articles, aiSummary },
    { headers: { "Cache-Control": "no-store" } },
  );
}
