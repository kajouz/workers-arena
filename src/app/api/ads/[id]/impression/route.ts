import { NextResponse } from "next/server";

/**
 * Email impression tracking endpoint.
 * Returns a 1x1 transparent GIF pixel for tracking email ad views.
 * This is called when an email is opened and the tracking pixel loads.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  // Log the impression (in production, save to database)
  console.log(`[Email Ad Impression] Ad ${id} viewed at ${new Date().toISOString()}`);
  
  // Try to increment impression count in the ads store
  try {
    // In production, this would update the database:
    // await prisma.campaign.update({ where: { id }, data: { impressions: { increment: 1 } } });
  } catch (error) {
    console.error("Failed to track email impression:", error);
  }

  // Return a 1x1 transparent GIF
  const pixel = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, // 1x1 pixel
    0x80, 0x00, // Global color table flag
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Color table
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Color table
    0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, // Graphic control extension
    0x2C, 0x00, 0x00, 0x00, 0x00, // Image descriptor
    0x01, 0x00, 0x01, 0x00, // 1x1 pixel
    0x00, // No local color table
    0x02, 0x02, 0x44, 0x01, 0x00, // LZW minimum code size + data
    0x3B, // Trailer
  ]);

  return new NextResponse(pixel, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
