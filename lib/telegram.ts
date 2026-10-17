const TELEGRAM_API = "https://api.telegram.org";

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: {
      id: number;
      type: string;
    };
  };
};

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN belum diset.");
  return value;
}

async function telegramRequest<T>(
  method: string,
  options?: { body?: Record<string, unknown>; query?: URLSearchParams },
): Promise<T> {
  const url = new URL(`${TELEGRAM_API}/bot${token()}/${method}`);
  options?.query?.forEach((value, key) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    method: options?.body ? "POST" : "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} gagal (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as TelegramApiResponse<T>;
  if (!payload.ok) throw new Error(`Telegram ${method} mengembalikan error.`);
  return payload.result;
}

export async function kirimPesan(chatId: number, text: string) {
  return telegramRequest<{ message_id: number }>("sendMessage", {
    body: { chat_id: chatId, text, parse_mode: "HTML" },
  });
}

export async function ambilUpdate(offset?: number) {
  const query = new URLSearchParams({
    timeout: "0",
    allowed_updates: JSON.stringify(["message"]),
  });
  if (offset !== undefined) query.set("offset", String(offset));
  return telegramRequest<TelegramUpdate[]>("getUpdates", { query });
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}
