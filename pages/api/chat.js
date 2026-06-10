export default async function handler(req, res) {
  console.log("[1] Handler called, method:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("[2] Parsing body");
  const { messages, system } = req.body;

  if (!messages || !system) {
    console.log("[3] Missing body fields");
    return res.status(400).json({ error: "Missing messages or system prompt" });
  }

  console.log("[4] Calling Anthropic, messages count:", messages.length);

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system,
        messages,
      }),
    });

    console.log("[5] Anthropic status:", anthropicRes.status);

    const rawText = await anthropicRes.text();
    console.log("[6] Anthropic raw response:", rawText.slice(0, 500));

    const data = JSON.parse(rawText);
    console.log("[7] Parsed successfully");

    return res.status(200).json(data);

  } catch (error) {
    console.error("[ERROR]", error.message);
    return res.status(500).json({ error: error.message });
  }
}
