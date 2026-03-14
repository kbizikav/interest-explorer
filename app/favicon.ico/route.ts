const ONE_PIXEL_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0,
  255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

export async function GET() {
  return new Response(ONE_PIXEL_GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
