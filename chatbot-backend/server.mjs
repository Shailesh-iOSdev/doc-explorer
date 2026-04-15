import { MastercardDevelopersAgentToolkit } from "@mastercard/developers-agent-toolkit/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new MastercardDevelopersAgentToolkit({
  configuration: {}
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mastercard Developers MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});