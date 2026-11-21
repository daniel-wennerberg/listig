import { bad, json, str } from "@/lib/server";
import { unfurl } from "@/lib/unfurl";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const info = await unfurl(str(body.url, 2000));
  if (!info) return bad("Kunde inte läsa sidan", 422);
  return json(info);
}
