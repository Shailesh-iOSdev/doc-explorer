import express from "express"; 
import cors from "cors"; 
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js"; 
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import aiService from "./ai-service.js"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use (express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, "public")));

let mcpClient = null;

async function connectMcp() {
    const serverScript = path.resolve(__dirname, "../chatbot-backend/server.mjs");
    mcpClient = new Client({ name: "mc-doc-explorer-local-ui", version: "1.0.0" });
    const transport = new StdioClientTransport ({
        command: "node", 
        args: [serverScript]
    });
    await mcpClient.connect(transport);
    const { tools } = await mcpClient.listTools();
    tools.forEach(tool => {
        console.log('\n=== Tool:', tool.name, '===');
        console.log('\nDescription:', tool.description);
        console.log('\nInput Scheme:', JSON.stringify(tool.inputSchema, null, 2));
    });
    console.log(" [Bridge] Tools:", tools.map(t => t.name));
    console.log(" [Bridge] Connected to MCP server Document Explorer");
}

app.get ("/api/tools", async (_, res) => {
    try {
      const { tools } = await mcpClient.listTools();
      res.json({ tools });
    } catch (e) {
        console.error(e);
        res.status (500).json({ error: String(e) });
    }
});


app.post("/api/call", async (req, res) => {
try {
    const { name, arguments: args } = req.body || {};
    if (!name) return res.status (400).json({ error: "Missing tool-name" });
    const result = await mcpClient.callTool({ name, arguments: args || {} });
    res.json(result);
} catch (e) {
    console.error (e);
    res.status (500).json({ error: String(e) });
}
});

// REST-style API endpoints for easier integration
app.get ("/healthz", (_, res) => { 
    res.json({ status: "ok" });
});


app.get("/api/mcp/docs-overview", async (req, res) => {
    try {
        const { serviceId } = req.query;


        console.log('=== /api/mcp/docs-overview DEBUG ===');
        console.log('1. Query Params', req.query);
        console.log('2. Extracted Service Id:', serviceId);


        // When server has fixed service URL, serviceId might not be needed
        const args = serviceId ? { serviceId } : {};

        console.log('3. Argument to send:', JSON.stringify(args, null, 2));

        console.log('4. Calling mcp tool');

        const result = await mcpClient.callTool({
            name: "get-documentation", 
            arguments: args
        });

        console.log('5. MCP Response:', JSON.stringify(result, null, 2));


        // Parse the MCP tool result
        if (result.content && result.content[0]) {
            const text = result.content[0].text;

            // Check if it's an error message
            if (text.startsWith('MCP error') || text.startsWith('Error') || text.startsWith('Request failed')) {
                return res.status(500).json({ error: text });
            }

            // Try parsing as JSON first
            try {
                const content = JSON.parse(text);
                return res.json({ sections: content.sections || [] });
            } catch (parseError) {
            // If not JSON, parse markdown links
                const sections = [];
                const linkRegex = /^-\s+\[([^\]]+)\]\(([^\)]+)\)/gm;
                let match;
                while ((match = linkRegex.exec(text)) !== null) {
                sections.push({
                    id: match[2], // URL as ID 
                    title: match[1], 
                    link: match[2]
                });
                }
                return res.json({ sections });
            } 
        } else {
            res. json({ sections: [] });
        } 
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});



app.get ("/api/mcp/docs-section", async (req, res) => {
try {
    const { serviceId, sectionId } = req.query;
    if (!sectionId) {
        return res.status(400).json({ error: "Missing sectionId parameter" });
    }

    // Extract page path from URL (e.g., https://developer.mastercard.com/send/documentation/index.md - /send/documentation/index.md)
    const pagePath = sectionId.includes('developer.mastercard.com')
    ? sectionId.split('developer.mastercard.com')[1] 
    : sectionId;

    // Try get-documentation-page first
    const result = await mcpClient.callTool({
        name: "get-documentation-page", 
        arguments: { pagePath }
    });

    // Parse the MCP tool result
    if (result.content && result.content [0]) {
        const text = result.content[0].text;

        // Check if it's an error message
        if (text.startsWith( 'MCP error') || text.startsWith( 'Error') || text.startsWith( 'Request failed')) {
            return res.status (500).json({ error: text });
        }
        // Try parsing as JSON first
        try {
            const content = JSON.parse(text);
            return res.json({
                contentType: "markdown",
                body: content.content || content.markdown || "",
                sectionLink: content.link || content.url || sectionId
            });
        } catch (parseError) {
            // If not JSON, treat the text as markdown content
            return res.json({
            contentType: "markdown",
            body: text, 
            sectionLink: sectionId
        });
    }
    } else {
        res.status(404).json({ error: "Section not found" }) ;
    }
} catch (e) {
    console.error(e);
    res. status (500).json({ error: String(e) });
}
});


app.get ("/api/mcp/services", async (req, res) => {
try {
    // Call the get-services-list MCP tool,
    const result = await mcpClient.callTool({
        name: "get-services-list", 
        arguments: {}
    });
    // Parse the MCP tool result
    if (result.content && result.content[0]) {
        const text = result.content[0].text;

        // Check if it's an error message
        if (text.startsWith( 'MCP error') || text.startsWith('Error')) {
            console.error('[Services] MCP error:', text); 
            return res.status(500).json({ error: text });
        }

        // Parse the markdown content to extract serviceIds*
        const services = [];
        const serviceIdRegex = /serviceId:\s*([^\s\n]+)/g;
        let match;
        while ((match = serviceIdRegex.exec(text)) !== null) {
            const serviceId = match[1].trim();
            if (serviceId && !services.includes(serviceId)) {
                services.push(serviceId);
            }
        }
        console.log(' [Services] Found ${services.length) services');

        //const topFive = services.slice(0, 5);

        res.json({ services: services.sort() });
    } else {
        console.warn(' [Services] Empty response from MCP');
        res.json({ services: [] });
    }
} catch (e) {
    console.error(' [Services] Error:', e);
    res.status(500).json({ error: String(e) });
}
});


app.get ("/api/mcp/api-ops", async (req, res) => {
try {
    const { serviceId } = req.query;

    // The MCP tool requires apiSpecificationPath, not serviceId
    // For Mastercard services, the path format is typically the service ID
    const result = await mcpClient.callTool({
        name: "get-api-operation-list",
        arguments: {
        apiSpecificationPath: serviceId
        }
    });

    // Parse the MCP tool result
    if (result.content && result.content[0]) {
        const text = result.content[0].text

        // Check if it's an error message
        if (text.startsWith( 'MCP error') || text.startsWith('Error')) {
            console.error(' [API Ops] MCP error for $(serviceId):', text); 
            return res.status (500) -json({ error: text });
        } 

        try {
            const content = JSON.parse(text);
            const operations = content-operations || [];

            // Log empty results for debugging
            if (operations.length === 0) {
            console.warn(' [API Ops] No operations found for service: ${serviceId} '); 
                console.warn(' [API Ops] This service may not have an OpenAPI specification available');
            } else {
            console.log(' [API Ops] Found ${operations.length} operations for ${serviceId}');
            }
            res.json ({ operations });
        } catch (parseError) {
            console.error("Failed to parse MCP response:", text);
            res.status(500).json({ error: "Invalid JSON response from MCP tool", raw: text });
        }
    } else {
        console.warn(' [API Ops] Empty response for ${serviceId} '); 
        res.json({ operations: [] });
    }
} catch (e) {
    console.error("[API Ops] Error for ${serviceId}:", e);
    res.status(500).json({ error: String(e) });
}
});


/** 
* Note: AI service is disabled. Use template-based answers in frontend instead.
* This endpoint returns a fallback message.
*/ -
app.post("/api/chat", async (req, res) => {
    try {

    console.log('Connect chat API--', req.body);
    const body = req.body || {};
    const question = String(body.question || '').trim();
    const filteredAnswer = String(body.filteredAnswer || '').trim();
    const context = Array.isArray(body.context) ? body.context : []
    const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory :[]

    if (!question) {
        return res.status(400).json({ error: 'missing question parameter'})
    }
    // const { question, filteredAnswer, context, conversationHistory } = req.body;
    console.log({ question, filteredAnswer, context, conversationHistory });
   
    console.log(`Using LLM for AI generation`);
    const answer = await aiService.generateAnswer(question, filteredAnswer, context || [], conversationHistory || []);

    console.log(` LLM Response - ${answer} `);

    res.json({ answer, provider: aiService.getConfig().provider, model: aiService.getConfig().model });

    } catch (e) {
        console.log(`LLM error`, e);
        res.status(500).json({ error: String(e) });
    }
        
});

/**
* GET /api/chat/config
*
* Returns AI service status (currently disabled)
*/
app.get ("/api/chat/config", (req, res) => {
    const config = aiService.getConfig();
    res.json ({
        provider: config.provider,
        model: config.model,
        configured: true,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        message: 'Ollama AI service enabled'
    });
});

app.get ("/", (_, res) => {
    res. sendFile(path, join(_dirname, "public", "index,html"));
});

const PORT = process.env.PORT || 5055;
connectMcp()
.then(() => app.listen (PORT, () => console.log(`Bridge/UI on http://localhost:${PORT}`)))
.catch((err) => { console.error("Failed to connect MCP:", err); process.exit(1); });