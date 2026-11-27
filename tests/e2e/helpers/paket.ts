import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { expect } from "vitest";
import { CdpBrowser } from "./browser";
import {
  fetchManual,
  fetchRsc,
  hasAuthSessionSetCookie,
  parseJsonSafe,
  type HttpResponseResult,
} from "./http";
import {
  NONEXISTENT_UUID,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
} from "./routes";
import { startE2eServer, type E2eServerHandle } from "./server";

export {
  CdpBrowser,
  NONEXISTENT_UUID,
  fetchManual,
  fetchRsc,
  hasAuthSessionSetCookie,
  hasSensitiveDataLeak,
  hasStackTrace,
  isUnauthenticatedRedirectToLogin,
  parseJsonSafe,
  startE2eServer,
  type E2eServerHandle,
  type HttpResponseResult,
};

export const IS_LIVE_DB = process.env.E2E_REQUIRE_LIVE_DB === "1";
export const SOFT_NAV_BUDGET_MS = 3_000;
export const WARM_RSC_LATENCY_BUDGET_MS = 1_500;

export const DROPZONE_SELECTORS = [
  '[data-image-dropzone="true"]',
  '[data-testid="image-dropzone"]',
  'main form [role="button"]:has(input[type="file"])',
  'main form label:has(input[type="file"])',
] as const;

export type RoleName = "user" | "it" | "ga" | "admin" | "any";

export type RoleCredentials = {
  role: RoleName;
  email: string;
  password: string;
};

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type ContrastSample = {
  selector: string;
  text: string;
  fg: string;
  bg: string;
  fontSizePx: number;
  fontWeight: number;
  ratio: number;
  required: number;
};

export type LaporFormMeta = {
  siteId: string;
  hasSiteSelect: boolean;
  categoryId: string;
  photoCategoryId: string;
  p0CategoryId: string;
  procurementCategoryId: string;
};

export type CreatedPublicTicket = {
  id: string;
  nomorTiket: string;
  token: string;
  status: string;
  prioritas: string;
};

export type CreatePublicTicketOptions = {
  mode?: "default" | "photo" | "p0" | "procurement";
  withImage?: boolean;
  nama?: string;
  kontak?: string;
  deskripsi?: string;
  penanganan?: "onsite" | "remote";
  jumlahTask?: number;
  jumlahUser?: number;
};

function readEnvPair(
  emailKey: string,
  passwordKey: string,
  role: RoleName,
): RoleCredentials | null {
  const email = process.env[emailKey]?.trim() ?? "";
  const password = process.env[passwordKey]?.trim() ?? "";
  if (!email || !password) return null;
  return { role, email, password };
}

export function resolveRoleCredentials(role: RoleName): RoleCredentials | null {
  switch (role) {
    case "user":
      return readEnvPair("E2E_USER_EMAIL", "E2E_USER_PASSWORD", "user");
    case "it":
      return readEnvPair("E2E_IT_EMAIL", "E2E_IT_PASSWORD", "it");
    case "ga":
      return readEnvPair("E2E_GA_EMAIL", "E2E_GA_PASSWORD", "ga");
    case "admin":
      return readEnvPair("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "admin");
    case "any":
      return (
        readEnvPair("E2E_TEST_EMAIL", "E2E_TEST_PASSWORD", "any") ??
        readEnvPair("E2E_IT_EMAIL", "E2E_IT_PASSWORD", "it") ??
        readEnvPair("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD", "admin") ??
        readEnvPair("E2E_GA_EMAIL", "E2E_GA_PASSWORD", "ga") ??
        readEnvPair("E2E_USER_EMAIL", "E2E_USER_PASSWORD", "user")
      );
  }
}

export async function clearBrowserCookies(browser: CdpBrowser): Promise<void> {
  await browser.send("Network.clearBrowserCookies");
}

export async function loginViaBrowser(
  browser: CdpBrowser,
  baseUrl: string,
  email: string,
  password: string,
): Promise<void> {
  await clearBrowserCookies(browser);
  await browser.goto(`${baseUrl}/login`);
  await browser.waitForSelector('#login-email, input[type="email"]', {
    visible: true,
  });
  await browser.fillInput('#login-email, input[type="email"]', email);
  await browser.fillInput(
    '#login-password, input[autocomplete="current-password"]',
    password,
  );
  await browser.click('main form button[type="submit"], button[type="submit"]');

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const state = await browser.evalJs<{
      pathname: string;
      readyState: string;
      alertText: string;
    }>(
      `({
        pathname: window.location.pathname,
        readyState: document.readyState,
        alertText: (document.querySelector('[role="alert"]')?.textContent ?? "").trim(),
      })`,
    );
    if (state.pathname !== "/login" && state.readyState === "complete") {
      return;
    }
    if (state.alertText) {
      throw new Error(`Login failed for ${email}: ${state.alertText}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for login redirect for ${email}`);
}

export async function getBrowserCookieHeader(
  browser: CdpBrowser,
): Promise<string> {
  const result = await browser.send("Network.getCookies");
  const rawCookies = Array.isArray(result.cookies) ? result.cookies : [];
  const pairs: string[] = [];
  for (const item of rawCookies) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name === "string" && typeof rec.value === "string") {
      pairs.push(`${rec.name}=${rec.value}`);
    }
  }
  return pairs.join("; ");
}

export async function loginForCookies(
  browser: CdpBrowser,
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  await loginViaBrowser(browser, baseUrl, email, password);
  const cookieHeader = await getBrowserCookieHeader(browser);
  if (!cookieHeader) {
    throw new Error(`No cookies obtained after browser login for ${email}`);
  }
  return cookieHeader;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] ?? 0;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return chunk;
}

export function createMinimalPngBytes(): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  // 1x1 RGBA PNG
  const ihdrData = new Uint8Array([
    0, 0, 0, 1, // width = 1
    0, 0, 0, 1, // height = 1
    8, // bit depth = 8
    6, // color type = RGBA
    0, // compression
    0, // filter
    0, // interlace
  ]);
  // Real zlib-deflated scanline: filter 0 + RGBA(29, 78, 216, 255)
  const idatData = new Uint8Array(
    deflateSync(Uint8Array.from([0, 29, 78, 216, 255])),
  );
  const ihdr = pngChunk("IHDR", ihdrData);
  const idat = pngChunk("IDAT", idatData);
  const iend = pngChunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(
    signature.length + ihdr.length + idat.length + iend.length,
  );
  let offset = 0;
  out.set(signature, offset);
  offset += signature.length;
  out.set(ihdr, offset);
  offset += ihdr.length;
  out.set(idat, offset);
  offset += idat.length;
  out.set(iend, offset);
  return out;
}

export function createInvalidPolyglotBytes(): Uint8Array {
  return new TextEncoder().encode(
    "<html><body><script>alert('xss')</script></body></html>",
  );
}

export function createOversizedBytes(
  sizeBytes = 5 * 1024 * 1024 + 1,
): Uint8Array {
  const buf = new Uint8Array(sizeBytes);
  // Prefix with PNG magic header to test size limit specifically even if magic checked first
  const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < pngMagic.length && i < buf.length; i++) {
    buf[i] = pngMagic[i] ?? 0;
  }
  return buf;
}

export function computeRelativeLuminance(
  r: number,
  g: number,
  b: number,
): number {
  const toLinear = (channel: number): number => {
    const s = Math.max(0, Math.min(255, channel)) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function parseCssColor(colorStr: string): RgbaColor | null {
  const trimmed = colorStr.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/,
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith("%")
        ? Number(rgbMatch[4].slice(0, -1)) / 100
        : Number(rgbMatch[4]);
    }
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a: Math.max(0, Math.min(1, a)) };
  }

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a =
        hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  return null;
}

export function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const alpha = fg.a + bg.a * (1 - fg.a);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha,
    a: alpha,
  };
}

export function resolveOpaqueBackground(
  bgChain: string[],
  fallbackBase: RgbaColor = { r: 255, g: 255, b: 255, a: 1 },
): RgbaColor {
  let acc: RgbaColor = { ...fallbackBase, a: 1 };
  for (let i = bgChain.length - 1; i >= 0; i--) {
    const parsed = parseCssColor(bgChain[i] ?? "");
    if (!parsed || parsed.a <= 0) continue;
    acc = parsed.a >= 1 ? parsed : compositeOver(parsed, acc);
  }
  return acc;
}

export function computeContrastRatio(
  fgRgba: RgbaColor,
  bgRgba: RgbaColor,
  backdropRgba: RgbaColor = { r: 255, g: 255, b: 255, a: 1 },
): number {
  const effectiveBg: RgbaColor =
    bgRgba.a < 1 ? compositeOver(bgRgba, backdropRgba) : bgRgba;
  const effectiveFg: RgbaColor =
    fgRgba.a < 1 ? compositeOver(fgRgba, effectiveBg) : fgRgba;

  const l1 = computeRelativeLuminance(
    effectiveFg.r,
    effectiveFg.g,
    effectiveFg.b,
  );
  const l2 = computeRelativeLuminance(
    effectiveBg.r,
    effectiveBg.g,
    effectiveBg.b,
  );
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

const DECORATIVE_EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

export function assertNoLegacyUiMarkers(
  htmlOrText: string,
  options: {
    checkClasses?: boolean;
    checkRawPunctuation?: boolean;
    checkEmojis?: boolean;
  } = {},
): void {
  const {
    checkClasses = true,
    checkRawPunctuation = true,
    checkEmojis = true,
  } = options;

  if (checkClasses) {
    expect(htmlOrText).not.toMatch(/(?:^|[\s"'`:])bg-yellow-50(?:$|[\s"'`])/);
    expect(htmlOrText).not.toMatch(/(?:^|[\s"'`:])bg-black(?:$|[\s"'`])/);
  }
  if (checkRawPunctuation) {
    expect(htmlOrText).not.toContain("\u2014");
    expect(htmlOrText).not.toContain("\u2026");
  }
  if (checkEmojis) {
    expect(DECORATIVE_EMOJI_RE.test(htmlOrText)).toBe(false);
  }
}

export function assertNoBrowserErrors(browser: CdpBrowser): void {
  expect(browser.pageErrors).toEqual([]);
  expect(browser.consoleErrors).toEqual([]);
  expect(browser.serverErrors).toEqual([]);
}

export function assertNoStore(res: HttpResponseResult): void {
  expect(res.cacheControl.toLowerCase()).toContain("no-store");
}

export async function setBrowserTheme(
  browser: CdpBrowser,
  theme: "light" | "dark",
): Promise<void> {
  await browser.evalJs(
    `(() => {
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
      window.localStorage.setItem("it-ticketing-theme", ${JSON.stringify(theme)});
    })()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 120));
}

export async function setBrowserViewport(
  browser: CdpBrowser,
  width: number,
  height: number,
): Promise<void> {
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 640,
  });
}

export async function resetBrowserViewport(browser: CdpBrowser): Promise<void> {
  await browser.send("Emulation.clearDeviceMetricsOverride");
}

export async function pressKeyCombo(
  browser: CdpBrowser,
  key: string,
  options: { ctrl?: boolean; meta?: boolean } = {},
): Promise<void> {
  const modifiers = (options.ctrl ? 2 : 0) | (options.meta ? 4 : 0);
  const code =
    key === "Escape"
      ? "Escape"
      : key.length === 1
        ? `Key${key.toUpperCase()}`
        : key;
  const windowsVirtualKeyCode =
    key === "Escape" ? 27 : key.toUpperCase().charCodeAt(0);

  await browser.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
  });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
  });
}

export async function measureContrastSamples(
  browser: CdpBrowser,
  selectors: string[],
): Promise<ContrastSample[]> {
  const raw = await browser.evalJs<
    Array<{
      selector: string;
      text: string;
      fg: string;
      bgChain: string[];
      isDark: boolean;
      fontSizePx: number;
      fontWeight: number;
    }>
  >(
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      const isDark = document.documentElement.dataset.theme === "dark";
      const results = [];
      function resolveBgChain(el) {
        const chain = [];
        let cur = el;
        while (cur) {
          const cs = window.getComputedStyle(cur);
          const bg = cs.backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            chain.push(bg);
          }
          cur = cur.parentElement;
        }
        return chain;
      }
      for (const sel of selectors) {
        const nodes = Array.from(document.querySelectorAll(sel));
        const el = nodes.find((n) => {
          const cs = window.getComputedStyle(n);
          return cs.display !== "none" && cs.visibility !== "hidden" && n.getClientRects().length > 0;
        });
        if (!el) continue;
        const cs = window.getComputedStyle(el);
        const fontSizePx = Number.parseFloat(cs.fontSize) || 14;
        const fontWeight = Number.parseInt(cs.fontWeight, 10) || 400;
        results.push({
          selector: sel,
          text: (el.textContent ?? "").trim().slice(0, 60),
          fg: cs.color,
          bgChain: resolveBgChain(el),
          isDark,
          fontSizePx,
          fontWeight,
        });
      }
      return results;
    })()`,
  );

  return raw.map((item) => {
    const fallbackBase: RgbaColor = item.isDark
      ? { r: 15, g: 23, b: 42, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };
    const fgRgba = parseCssColor(item.fg) ?? { r: 15, g: 23, b: 42, a: 1 };
    const bgRgba = resolveOpaqueBackground(item.bgChain, fallbackBase);
    const bgLabel = `rgb(${Math.round(bgRgba.r)}, ${Math.round(bgRgba.g)}, ${Math.round(bgRgba.b)})`;
    const isLarge =
      item.fontSizePx >= 24 ||
      (item.fontSizePx >= 18.66 && item.fontWeight >= 700);
    return {
      selector: item.selector,
      text: item.text,
      fg: item.fg,
      bg: bgLabel,
      fontSizePx: item.fontSizePx,
      fontWeight: item.fontWeight,
      ratio: computeContrastRatio(fgRgba, bgRgba, fallbackBase),
      required: isLarge ? 3.0 : 4.5,
    };
  });
}

export function listMigrationFiles(): string[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function readRepoTextFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

export function repoFileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

export function readNextManifestSafe<T>(relativePath: string): T | null {
  const fullPath = path.join(process.cwd(), ".next", relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

export async function dispatchSyntheticFileDrop(
  browser: CdpBrowser,
  dropzoneSelector: string | readonly string[] = DROPZONE_SELECTORS,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const selectors =
    typeof dropzoneSelector === "string"
      ? [dropzoneSelector]
      : [...dropzoneSelector];
  const byteArray = Array.from(bytes);
  return browser.evalJs<boolean>(
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      let target = null;
      for (const sel of selectors) {
        try {
          const found = document.querySelector(sel);
          if (found) {
            target = found;
            break;
          }
        } catch {
          // Ignore unsupported selector syntax
        }
      }
      if (!target) return false;
      const file = new File([new Uint8Array(${JSON.stringify(byteArray)})], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mimeType)} });
      const dt = new DataTransfer();
      dt.items.add(file);
      const evt = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(evt);
      return true;
    })()`,
  );
}

export async function dispatchSyntheticPaste(
  browser: CdpBrowser,
  targetSelector: string | readonly string[] = DROPZONE_SELECTORS,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const selectors =
    typeof targetSelector === "string" ? [targetSelector] : [...targetSelector];
  const byteArray = Array.from(bytes);
  return browser.evalJs<boolean>(
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      let target = null;
      for (const sel of selectors) {
        try {
          const found = document.querySelector(sel);
          if (found) {
            target = found;
            break;
          }
        } catch {
          // Ignore unsupported selector syntax
        }
      }
      if (!target) {
        target = document.querySelector("main form") ?? document.body;
      }
      if (!target) return false;
      if (target instanceof HTMLElement) target.focus();
      const file = new File([new Uint8Array(${JSON.stringify(byteArray)})], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mimeType)} });
      const dt = new DataTransfer();
      dt.items.add(file);
      const evt = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(evt, "clipboardData", { value: dt });
      target.dispatchEvent(evt);
      return true;
    })()`,
  );
}

export async function closeModalDialog(
  browser: CdpBrowser,
  labelPattern: RegExp = /tutup|close/i,
): Promise<boolean> {
  return browser.evalJs<boolean>(
    `(() => {
      const pattern = new RegExp(${JSON.stringify(labelPattern.source)}, ${JSON.stringify(labelPattern.flags)});
      const buttons = Array.from(
        document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button'),
      ).filter((el) => {
        if (!(el instanceof HTMLButtonElement)) return false;
        const cs = window.getComputedStyle(el);
        return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0;
      });
      const target = buttons.find((btn) => {
        const label = (btn.getAttribute("aria-label") ?? "").trim();
        const text = (btn.textContent ?? "").trim();
        return pattern.test(label) || pattern.test(text);
      });
      if (!target) return false;
      target.scrollIntoView({ block: "center" });
      target.click();
      return true;
    })()`,
  );
}

type RscCategoryRecord = {
  id: string;
  nama: string;
  prioritas_default?: string;
  prioritas_naik?: unknown;
  butuh_aset?: boolean;
  butuh_foto?: boolean;
  bisa_remote?: boolean;
  stock_kode?: string | null;
};

function extractJsonArrayAfterKey<T>(text: string, key: string): T[] | null {
  const marker = `"${key}":[`;
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(parsed) ? (parsed as T[]) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function extractLaporMeta(
  baseUrl: string,
): Promise<LaporFormMeta | null> {
  const res = await fetchManual(baseUrl, "/lapor");
  if (res.status !== 200) return null;

  const siteSelectMatch = res.body.match(
    /<select[^>]*id="public-site"[^>]*>([\s\S]*?)<\/select>/i,
  );
  const hasSiteSelect = Boolean(siteSelectMatch);
  let siteId =
    siteSelectMatch?.[1]?.match(/<option[^>]*value="([0-9a-f-]{36})"/i)?.[1] ??
    "";

  let unescapedBody = res.body.replace(/\\"/g, '"');
  if (!siteId) {
    const sitesFromHtml = extractJsonArrayAfterKey<{ id?: string }>(
      unescapedBody,
      "sites",
    );
    siteId = sitesFromHtml?.find((s) => typeof s.id === "string")?.id ?? "";
  }
  if (!siteId) {
    siteId =
      unescapedBody.match(
        /"sites":\[\s*\{\s*"id":"([0-9a-f-]{36})"/i,
      )?.[1] ?? "";
  }
  if (!siteId) {
    const rscRes = await fetchRsc(baseUrl, "/lapor");
    if (rscRes.status === 200) {
      const unescapedRsc = rscRes.body.replace(/\\"/g, '"');
      unescapedBody = `${unescapedBody}\n${unescapedRsc}`;
      const sitesFromRsc = extractJsonArrayAfterKey<{ id?: string }>(
        unescapedRsc,
        "sites",
      );
      siteId =
        sitesFromRsc?.find((s) => typeof s.id === "string")?.id ??
        unescapedRsc.match(
          /"sites":\[\s*\{\s*"id":"([0-9a-f-]{36})"/i,
        )?.[1] ??
        "";
    }
  }

  const catBlock =
    res.body.match(
      /<select[^>]*id="public-category"[^>]*>([\s\S]*?)<\/select>/i,
    )?.[1] ?? "";
  const catOpts = Array.from(
    catBlock.matchAll(
      /<option[^>]*value="([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/option>/gi,
    ),
  );

  const rscCategories =
    extractJsonArrayAfterKey<RscCategoryRecord>(unescapedBody, "categories") ??
    [];

  let categoryId = "";
  let photoCategoryId = "";
  let p0CategoryId = "";
  let procurementCategoryId = "";

  if (rscCategories.length > 0) {
    categoryId =
      rscCategories.find(
        (c) =>
          !c.butuh_aset &&
          !c.butuh_foto &&
          !c.prioritas_naik &&
          !c.stock_kode,
      )?.id ??
      rscCategories.find(
        (c) => !c.butuh_aset && !c.butuh_foto && !c.stock_kode,
      )?.id ??
      "";
    photoCategoryId =
      rscCategories.find(
        (c) =>
          Boolean(c.butuh_foto) &&
          !c.butuh_aset &&
          !c.prioritas_naik &&
          !c.stock_kode,
      )?.id ??
      rscCategories.find((c) => Boolean(c.butuh_foto) && !c.butuh_aset)?.id ??
      "";
    p0CategoryId =
      rscCategories.find(
        (c) =>
          c.prioritas_default === "P0" && !c.butuh_aset && !c.butuh_foto,
      )?.id ??
      rscCategories.find((c) => c.prioritas_default === "P0")?.id ??
      "";
    procurementCategoryId =
      rscCategories.find((c) => c.stock_kode === "kabel_power")?.id ??
      rscCategories.find((c) => Boolean(c.stock_kode) && !c.butuh_aset)?.id ??
      "";
  }

  if (!categoryId) {
    categoryId =
      catOpts.find((m) => /instalasi/i.test(m[2] ?? ""))?.[1] ??
      catOpts.find((m) => /email/i.test(m[2] ?? ""))?.[1] ??
      catOpts[0]?.[1] ??
      "";
  }
  if (!photoCategoryId) {
    photoCategoryId =
      catOpts.find((m) => /error aplikasi kerja/i.test(m[2] ?? ""))?.[1] ??
      catOpts.find((m) => /masalah vpn/i.test(m[2] ?? ""))?.[1] ??
      categoryId;
  }
  if (!p0CategoryId) {
    p0CategoryId =
      catOpts.find((m) => /internet down|isp down/i.test(m[2] ?? ""))?.[1] ??
      categoryId;
  }
  if (!procurementCategoryId) {
    procurementCategoryId =
      catOpts.find((m) => /kabel power/i.test(m[2] ?? ""))?.[1] ?? categoryId;
  }

  if (!siteId || !categoryId) return null;

  return {
    siteId,
    hasSiteSelect,
    categoryId,
    photoCategoryId,
    p0CategoryId,
    procurementCategoryId,
  };
}

export async function createPublicTicket(
  baseUrl: string,
  options: CreatePublicTicketOptions = {},
): Promise<CreatedPublicTicket | null> {
  const meta = await extractLaporMeta(baseUrl);
  if (!meta) return null;

  const mode = options.mode ?? "default";
  const categoryId =
    mode === "p0"
      ? meta.p0CategoryId
      : mode === "procurement"
        ? meta.procurementCategoryId
        : mode === "photo" || options.withImage
          ? meta.photoCategoryId
          : meta.categoryId;

  const needsImage =
    Boolean(options.withImage) ||
    mode === "photo" ||
    mode === "procurement";

  const form = new FormData();
  form.set("nama", options.nama ?? "Pelapor E2E");
  form.set("kontak", options.kontak ?? "081234567890");
  form.set("siteId", meta.siteId);
  form.set("categoryId", categoryId);
  form.set(
    "deskripsi",
    options.deskripsi ??
      `Pengujian otomatis opaque-box layanan IT (${Date.now()}).`,
  );
  form.set("penanganan", options.penanganan ?? "onsite");
  if (options.jumlahTask !== undefined) {
    form.set("jumlahTask", String(options.jumlahTask));
  }
  if (options.jumlahUser !== undefined) {
    form.set("jumlahUser", String(options.jumlahUser));
  }
  if (needsImage) {
    const png = createMinimalPngBytes();
    const copy = new Uint8Array(png.byteLength);
    copy.set(png);
    form.set(
      "file",
      new Blob([copy.buffer], { type: "image/png" }),
      "e2e-shot.png",
    );
  }

  const res = await fetchManual(baseUrl, "/api/tiket/publik", {
    method: "POST",
    headers: { Origin: baseUrl },
    body: form,
  });
  if (res.status !== 201) return null;

  const json = parseJsonSafe<{
    id?: string;
    nomorTiket?: string;
    token?: string;
    status?: string;
    prioritas?: string;
  }>(res.body);
  if (!json?.id || !json?.token) return null;

  return {
    id: json.id,
    nomorTiket: json.nomorTiket ?? "",
    token: json.token,
    status: json.status ?? "baru",
    prioritas: json.prioritas ?? "P3",
  };
}

export async function claimTicketViaUi(
  browser: CdpBrowser,
  baseUrl: string,
  ticketId: string,
): Promise<void> {
  await browser.goto(`${baseUrl}/tiket/${ticketId}`);
  await browser.waitForSelector("main");
  const clicked = await browser.evalJs<boolean>(
    `(() => {
      const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
        /ambil tiket|mulai proses/i.test(b.textContent ?? "")
      );
      if (!(btn instanceof HTMLButtonElement)) return false;
      btn.click();
      return true;
    })()`,
  );
  if (clicked) {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const ready = await browser.evalJs<boolean>(
        `Array.from(document.querySelectorAll("main button")).some((b) =>
          /ubah ke selesai/i.test(b.textContent ?? "")
        )`,
      );
      if (ready) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

export async function moveTicketToMenungguUserViaUi(
  browser: CdpBrowser,
  baseUrl: string,
  ticketId: string,
  reason: string,
): Promise<void> {
  await claimTicketViaUi(browser, baseUrl, ticketId);
  await browser.evalJs(
    `(() => {
      const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
        /ubah ke menunggu user|menunggu user/i.test(b.textContent ?? "")
      );
      if (btn instanceof HTMLButtonElement) btn.click();
    })()`,
  );
  await new Promise((r) => setTimeout(r, 250));
  await browser.evalJs(
    `(() => {
      const input = document.querySelector(
        '[role="dialog"] textarea, [role="alertdialog"] textarea, main textarea[name*="alasan" i], main textarea[placeholder*="alasan" i], main textarea[placeholder*="pesan" i], main textarea'
      );
      if (input instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(input, ${JSON.stringify(reason)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const submit = Array.from(
        document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button, main button')
      ).find((b) =>
        /kirim|simpan|konfirmasi|lanjutkan/i.test(b.textContent ?? "")
      );
      if (submit instanceof HTMLButtonElement) submit.click();
    })()`,
  );
  await new Promise((r) => setTimeout(r, 900));
}

export async function completeTicketViaUi(
  browser: CdpBrowser,
  baseUrl: string,
  ticketId: string,
  solutionText: string,
  difficulty = "2",
): Promise<void> {
  await claimTicketViaUi(browser, baseUrl, ticketId);
  const openedForm = await browser.evalJs<boolean>(
    `(() => {
      const btn = Array.from(document.querySelectorAll("main button")).find((b) =>
        /ubah ke selesai|selesaikan/i.test(b.textContent ?? "")
      );
      if (!(btn instanceof HTMLButtonElement)) return false;
      btn.click();
      return true;
    })()`,
  );
  if (!openedForm) {
    throw new Error(`Unable to open completion form for ticket ${ticketId}`);
  }
  await browser.waitForSelector("#solution-note, main textarea", {
    visible: true,
  });
  const hasDifficulty = await browser.evalJs<boolean>(
    `Boolean(document.querySelector("#difficulty-points"))`,
  );
  if (hasDifficulty) {
    await browser.selectOption("#difficulty-points", difficulty);
  }
  const hasSolutionNote = await browser.evalJs<boolean>(
    `Boolean(document.querySelector("#solution-note"))`,
  );
  await browser.fillInput(
    hasSolutionNote
      ? "#solution-note"
      : 'main textarea[placeholder*="solusi" i], main textarea',
    solutionText,
  );
  await browser.evalJs(
    `(() => {
      const submit = Array.from(document.querySelectorAll("main button")).find((b) =>
        /selesaikan tiket|simpan solusi|konfirmasi selesai/i.test(b.textContent ?? "")
      );
      if (submit instanceof HTMLButtonElement) submit.click();
    })()`,
  );
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const done = await browser.evalJs<boolean>(
      `!document.querySelector("#solution-note") || /tiket.*selesai|berhasil/i.test(document.body.innerText)`,
    );
    if (done) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 250));
}

export async function closePublicTicketViaApi(
  baseUrl: string,
  token: string,
  rating = 5,
): Promise<HttpResponseResult> {
  return fetchManual(baseUrl, `/api/tiket/publik/${token}/rating`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ rating }),
  });
}

export async function resolveAndCloseTicketViaUi(
  browser: CdpBrowser,
  baseUrl: string,
  ticket: CreatedPublicTicket,
  solutionText = "Selesai untuk pembersihan data pengujian E2E.",
): Promise<void> {
  await completeTicketViaUi(browser, baseUrl, ticket.id, solutionText, "2");
  await closePublicTicketViaApi(baseUrl, ticket.token, 5);
}

export type StockItemRecord = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  jumlah_stok: number;
  stok_minimum: number;
};

export async function getStockItems(
  baseUrl: string,
  cookie: string,
): Promise<StockItemRecord[]> {
  const res = await fetchManual(baseUrl, "/api/stok", {
    headers: { Cookie: cookie },
  });
  if (res.status !== 200) return [];
  const json = parseJsonSafe<{ stocks?: StockItemRecord[] }>(res.body);
  return Array.isArray(json?.stocks) ? json.stocks : [];
}

export async function adjustStockViaApi(
  baseUrl: string,
  cookie: string,
  payload: {
    kode: string;
    delta: number;
    jenis?: "masuk" | "keluar" | "penyesuaian";
    ticketId?: string | null;
    catatan?: string | null;
  },
): Promise<HttpResponseResult> {
  return fetchManual(baseUrl, "/api/stok/adjust", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: cookie,
    },
    body: JSON.stringify(payload),
  });
}

export async function ensureTicketFormDropzoneVisible(
  browser: CdpBrowser,
): Promise<void> {
  const hasDropzoneInitially = await browser.evalJs<boolean>(
    `Boolean(document.querySelector('[data-image-dropzone="true"], [data-testid="image-dropzone"]'))`,
  );
  if (hasDropzoneInitially) return;

  const photoCatId = await browser.evalJs<string>(
    `(() => {
      const sel = document.querySelector('#category, main select[id*="category" i], main select');
      if (!(sel instanceof HTMLSelectElement)) return "";
      const opts = Array.from(sel.options).filter((o) => o.value);
      const match =
        opts.find((o) => /error aplikasi kerja|masalah vpn|foto/i.test(o.textContent ?? "")) ??
        opts[0];
      return match ? match.value : "";
    })()`,
  );
  if (photoCatId) {
    await browser.selectOption(
      '#category, main select[id*="category" i], main select',
      photoCatId,
    );
    await new Promise((r) => setTimeout(r, 150));
  }
}
