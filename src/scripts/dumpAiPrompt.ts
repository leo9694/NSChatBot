import fs from "fs";
import path from "path";
import { buildConversationAiPromptDebug } from "../services/ai-agent.service";

async function main() {
  const conversationId = String(process.argv[2] || "").trim();
  const outputPathArg = String(process.argv[3] || "").trim();

  if (!conversationId) {
    console.error("Uso: npx ts-node src/scripts/dumpAiPrompt.ts <conversationId> [arquivo-saida]");
    process.exit(1);
  }

  const debug = await buildConversationAiPromptDebug(conversationId, {
    forceLatestCustomerMessage: true,
  });

  const text = [
    `conversationId: ${debug.conversationId}`,
    `accountId: ${debug.accountId || "-"}`,
    `model: ${debug.model}`,
    "",
    "=== GROUNDING NOTES ===",
    debug.groundingNotes.length ? debug.groundingNotes.join("\n- ").replace(/^/, "- ") : "(nenhuma)",
    "",
    "=== SYSTEM MESSAGE ===",
    debug.messages.find((item) => item.role === "system")?.content || "",
    "",
    "=== USER MESSAGE ===",
    debug.messages.find((item) => item.role === "user")?.content || "",
    "",
    "=== JSON ===",
    JSON.stringify(debug, null, 2),
  ].join("\n");

  if (outputPathArg) {
    const resolved = path.resolve(process.cwd(), outputPathArg);
    fs.writeFileSync(resolved, text, "utf8");
    console.log(`Prompt salvo em: ${resolved}`);
    return;
  }

  console.log(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
