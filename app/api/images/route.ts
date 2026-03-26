import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ images: [] }, { status: 400 });
    }

    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(
      query
    )}&engine=bing_images&api_key=${process.env.SERPAPI_KEY}`;

    const res = await fetch(url);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("SerpApi error:", errorText);
      return NextResponse.json({ images: [] }, { status: 500 });
    }

    const data = await res.json();

    const images =
      data.images_results?.slice(0, 4).map((img: any) => ({
        url: img.thumbnail,
        title: img.title,
      })) || [];

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Image route error:", error);
    return NextResponse.json({ images: [] }, { status: 500 });
  }
}