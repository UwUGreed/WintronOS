import { AppError } from "./security";
export async function readLimited(request: Request, limit: number) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > limit) throw new AppError("Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new AppError("Request too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function readMultipart(request: Request) {
  const bytes = await readLimited(request, 10 * 1024 * 1024 + 128 * 1024);
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;"))
    throw new AppError("Multipart upload required.");
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": type },
    }).formData();
  } catch {
    throw new AppError("Invalid multipart upload.");
  }
}
