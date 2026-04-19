const AI_PROVIDER = 'ollama';
const AI_MODEL = 'llama3.2:1b';
const AI_CODE_MODEL = 'qwen2.5-coder:3b-instruct-q4_K_M'
const AI_MAX_TOKENS = parseInt('1024');
const AI_TEMPERATURE = parseFloat('0.2');
const OLLAMA_BASE_URL = 'http://localhost:11434';
const MAX_CONTEXT_DOCS = 3;
const MAX_DOC_CHARS = 1200;
const MAX_HISTORY = 6;
const OLLAMA_NUM_CTX = 2048;
const OLLAMA_TOP_P = 0.9;
const OLLAMA_REPEAT_PENALTY = 1.05;
const OLLAMA_KEEP_ALIVE = '20m'
const REQUEST_TIMEOUT = 900000; // 15 seconds

const SYSTEM_PROMPT = `You are an expert Al assistant for Mastercard API integration and service development. Your role is to help developers integrate Mastercard services by providing:

1. **Step-by-step implementation guidance** with clear, actionable instructions
2. **Relevant code snippets** extracted from the documentation
3. **Specific API endpoints and parameters** with examples
4. **Best practices** for security, error handling, and performance
5. **Troubleshooting help** for common integration issues

Response format:
- Use markdown for formatting
- Use **bold** for important terms
- Use \'code\` for inline code references
- Use code blocks with language tags for larger snippets
- Use numbered lists for sequential steps
- Use bullet lists for non-sequential items
`;
// const SYSTEM_PROMPT = `You are an expert Al assistant for Mastercard API integration and service development. Your role is to help developers integrate Mastercard services by providing:

// 1. **Step-by-step implementation guidance** with clear, actionable instructions
// 2. **Relevant code snippets** extracted from the documentation
// 3. **Specific API endpoints and parameters** with examples
// 4. **Best practices** for security, error handling, and performance
// 5. **Troubleshooting help** for common integration issues

// Guidelines:
// - Always base your answers on the provided documentation context
// - If information is not in the documentation, clearly state that and suggest where to find it
// - Provide complete, working code examples when possible
// - Format code snippets with proper syntax highlighting (use markdown code blocks)
// - Include error handling in code examples
// - Reference specific sections of the documentation with citations
// - Be concise but thorough
// - Use a helpful, professional tone

// When answering integration questions:
// - Break down complex processes into numbered steps
// - Highlight prerequisites and dependencies
// - Mention authentication requirements
// - Note environment-specific configurations (sandbox vs production)
// - Warn about common pitfalls

// Response format:
// - Use markdown for formatting
// - Use **bold** for important terms
// - Use \'code\` for inline code references
// - Use code blocks with language tags for larger snippets
// - Use numbered lists for sequential steps
// - Use bullet lists for non-sequential items
// `;

// =======
// Ollama Integration (Local LLM)
// ========

async function callOllama(messages, model) {

    console.log('Model', model);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    console.log('Sending message to ollama - ', messages);
    try{
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
    model: model,
    messages: messages,
    stream: false,
    keep_alive: OLLAMA_KEEP_ALIVE,
    options: {
    temperature: AI_TEMPERATURE,
    num_predict: AI_MAX_TOKENS,
    num_ctx: OLLAMA_NUM_CTX,
    top_p: OLLAMA_TOP_P,
    repeat_penalty: OLLAMA_REPEAT_PENALTY
    }
    }),
    signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('data -', data);
    if (data.done_reason && data.done_reason !== 'stop') {
        console.warn('[OLLAMA] done_reason:', data.done_reason);
    }
    return data.message.content;
    // const data = await response.json();
    // if (data.done_reason && data.done_reason !== 'stop') {
    //     console.warn('[OLLAMA] done_reason:', data.done_reason);
    // }
    //return (data.messages && data.messages.content ? data.message.content : '').trim();
} catch (error) {
    clearTimeout(timeoutId);
    if (error.name == 'AbortError') {
        throw new Error('Ollama request timeout after 60 secs');
    }
    throw error;
}
}

function isCodeRequest(question = "", conversationHistory = []) {
    const text = [question, ...conversationHistory.slice(-3).map(m => m.content || "")]
    .join(" ")
    .toLowerCase();

    return /(code|example|generate|implementation|integrate|write a function|snippet|debug|refactor|class|api example|javascript|python|java|typescript|swift|ios|android)/i.test(text);
}

async function generateAnswer(question, filteredAnswer, context = [], conversationHistory = []) {
    // Build context from documentation
    const trimmedContext = context
    .slice(0, MAX_CONTEXT_DOCS)
    .map((doc) => ({
        title: doc.title || 'Untitled',
        content: String(doc.content || '').slice(0, MAX_DOC_CHARS)
    }));
    const contextText = trimmedContext.map((doc, index) => {
    return `
    ## Document ${index + 1}: ${doc.title}

    ${doc.content}

    ---
    `;
    }).join('\n');


    // Build conversation context (limit to last 10 messages to avoid token limits)
    const recentHistory = conversationHistory.slice(-MAX_HISTORY);

    // Construct messages array for the LLM
    const messages = [
        {
            role: 'system',
            content: SYSTEM_PROMPT
        }
    ];


    // Add context as a system message if available
    if (context.length > 0) {
    messages.push({
    role: 'system',
    content: `Here is the relevant documentation context to answer the user's questions:

    ${contextText}

    Use this documentation to provide accurate, specific answers. Always cite which section the information comes from.`
    });
    }
    // Add conversation history
    if (recentHistory.length > 0) {
    recentHistory.forEach(msg => { 
        messages.push({
    role: msg.role = 'user' ? 'user' : 'assistant',
    content: msg.content
    });
    });
    }

    if (filteredAnswer) {
        messages.push({
            role: 'assistant',
            content: filteredAnswer
        })
    }

    // Add current question
    messages.push({
    role: 'user',
    content: question
    });
    // Call appropriate AI provider
    // const selectedModel = isCodeRequest(question, conversationHistory) ? AI_CODE_MODEL : AI_MODEL; 
    let answer = await callOllama(messages, AI_CODE_MODEL);
    return answer;

}

function getConfig() {
    return {
    provider: AI_PROVIDER,
    model: AI_MODEL,
    maxTokens: AI_MAX_TOKENS,
    temperature: AI_TEMPERATURE
    };
}

export default {
    generateAnswer,
    getConfig
};