import {readOnlyWriteResponse} from '../lib/access-policy';
import {registrarName} from "../lib/registrar-name";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ROLE_HEADER = "oai-authenticated-user-role";
const USER_SCHOOL_HEADER = "oai-authenticated-user-school-id";
const USER_PARENT_PHONE_HEADER = "oai-authenticated-user-parent-phone";
const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/login";
const SIGN_OUT_PATH = "/logout";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: registrarName(fullName ?? email,email),
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function getKhotwaAccess(): Promise<{role:'main_admin'|'deputy'|'manager'|'parent';schoolId:string;parentPhone:string}|null> {
 const h=await headers();
 const role=h.get(USER_ROLE_HEADER),schoolId=h.get(USER_SCHOOL_HEADER);
 if((role!=='main_admin'&&role!=='deputy'&&role!=='manager'&&role!=='parent')||!schoolId)return null;
 return {role,schoolId,parentPhone:h.get(USER_PARENT_PHONE_HEADER)||''};
}

// Call before reading a write payload or touching storage / upstream services.
// Service callers without a visitor identity still use their existing secret checks.
export async function denyReadOnlyWrite(): Promise<Response | null> {
  const user = await getChatGPTUser();
  const access=await getKhotwaAccess();
  return access?.role==='deputy'||access?.role==='main_admin'?null:readOnlyWriteResponse(user?.email);
}
