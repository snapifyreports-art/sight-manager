import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchWeatherForPostcode } from "@/lib/weather";

export const dynamic = "force-dynamic";

// GET /api/weather?postcode=SW1A+1AA
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postcode = req.nextUrl.searchParams.get("postcode");
  if (!postcode) {
    return NextResponse.json(
      { error: "postcode query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const forecast = await fetchWeatherForPostcode(postcode);

    if (!forecast) {
      return NextResponse.json(
        { error: "Invalid postcode or weather fetch failed" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { postcode: postcode.trim().toUpperCase(), forecast },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weather data" },
      { status: 500 }
    );
  }
}
