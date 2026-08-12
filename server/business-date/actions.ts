"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getBusinessDateCookieName } from "../business-date";

const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Business date must use YYYY-MM-DD.");

function returnToValue(formData: FormData) {
  return String(formData.get("return_to") ?? "/").trim() || "/";
}

export async function setDevBusinessDateAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  const rawDate = String(formData.get("business_date") ?? "").trim();
  const parsed = businessDateSchema.safeParse(rawDate);
  const cookieStore = await cookies();

  if (process.env.NODE_ENV !== "development") {
    redirect(returnTo);
  }

  if (!parsed.success) {
    cookieStore.delete(getBusinessDateCookieName());
    redirect(returnTo);
  }

  cookieStore.set(getBusinessDateCookieName(), parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
  });
  redirect(returnTo);
}

export async function clearDevBusinessDateAction(formData: FormData) {
  const returnTo = returnToValue(formData);
  const cookieStore = await cookies();
  cookieStore.delete(getBusinessDateCookieName());
  redirect(returnTo);
}
