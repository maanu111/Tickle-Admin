import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * City names, from Google.
 *
 * Scoping a promo code to a city means writing a name into
 * promo_codes.city, which redeem_promo() compares to profiles.city as
 * lowercase text. Both sides therefore have to spell the place the same
 * way, and a free-text box is the one thing guaranteed not to —
 * "Bengaluru" and "Bangalore" are the same city and two different codes.
 *
 * The app already fills profiles.city from the same Google lookup, so
 * asking Google here is what makes the two strings match.
 *
 * This is a thin proxy over the places-nearby Edge Function, which
 * restricts results to `locality` — the reason a search for Delhi comes
 * back as the city rather than a hundred shops with Delhi in the name.
 * The function requires a signed-in user, so the admin's own token is
 * forwarded rather than the service key.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

    // Google charges per call. Two characters is the shortest query
    // worth spending one on.
    if (query.length < 2) return NextResponse.json({ cities: [] });

    const token = request.headers.get("authorization")?.replace("Bearer ", "");

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/places-nearby`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kind: "cities", query }),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not reach the city lookup." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      cities?: { id: string; name: string; region: string }[];
    };

    return NextResponse.json({ cities: payload.cities ?? [] });
  } catch (error) {
    return failed(error, "City lookup failed.");
  }
}
