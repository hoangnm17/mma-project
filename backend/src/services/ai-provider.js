import { assert } from "../domain.js";

export function aiConfiguration() {
  const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai")).trim().toLowerCase();
  return { provider,
    apiKey: (provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)?.trim(),
    model: provider === "gemini" ? (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite") : (process.env.OPENAI_MODEL || "gpt-4.1-mini") };
}

export function aiConfigured() {
  const config = aiConfiguration();
  return ["gemini", "openai"].includes(config.provider) && Boolean(config.apiKey);
}

export async function providerStructured(instructions, input, schema, name, fetcher = fetch) {
  const { provider, apiKey, model } = aiConfiguration();
  assert(aiConfigured(), "AI chưa được cấu hình. Vui lòng dùng form thường.", 503);
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(model), "Cấu hình model AI không hợp lệ", 503);
  try {
    const gemini = provider === "gemini";
    const response = await fetcher(gemini
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      : "https://api.openai.com/v1/responses", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", ...(gemini ? { "x-goog-api-key": apiKey } : { Authorization: "Bearer " + apiKey }) },
      body: JSON.stringify(gemini ? {
        store: false,
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: input }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 900, temperature: 0.2 },
      } : {
        model, store: false, max_output_tokens: 900, instructions, input,
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
    });
    // Provider authentication failures must not become user-session 401s, and
    // provider error bodies can contain credentials: never return or log them.
    assert(response.ok, response.status === 429 ? "AI đã đạt giới hạn sử dụng. Vui lòng thử lại sau." : "Dịch vụ AI hiện không khả dụng. Vui lòng dùng form thường.", 503);
    const data = await response.json();
    const output = gemini
      ? data.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join("")
      : data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
    assert(output && (!gemini || data.candidates[0].finishReason === "STOP"), "AI chưa tạo được kết quả đầy đủ. Vui lòng dùng form thường.", 503);
    const result = JSON.parse(output);
    assert(result && typeof result === "object" && !Array.isArray(result), "AI trả dữ liệu chưa hợp lệ", 503);
    return result;
  } catch (error) {
    if (error.status) throw error;
    assert(false, "AI tạm không khả dụng. Vui lòng dùng form thường.", 503);
  }
}
