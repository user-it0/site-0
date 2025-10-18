import fetch from "node-fetch";

export default async function handler(req, res) {
  const event = req.body?.events?.[0];
  if (!event || event.type !== "message") return res.status(200).send("OK");

  const userText = event.message.text;

  // --- Hugging Faceの無料AIを呼び出す ---
  const hfRes = await fetch("https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: userText,
      parameters: { max_new_tokens: 100 },
    }),
  });

  const data = await hfRes.json();
  const aiText =
    data?.[0]?.generated_text?.replace(userText, "")?.trim() ||
    "すみません、理解できませんでした。";

  // --- LINEに返信 ---
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: aiText }],
    }),
  });

  res.status(200).send("OK");
}
