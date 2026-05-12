//import OpenAI from "openai"; // Required for Azure Open AI
import { GoogleGenAI } from "@google/genai";


const OLLAMA_BASE_URL = 'http://localhost:11434';
const OLLAMA_NUM_CTX = 2048;
const OLLAMA_TOP_P = 0.9;
const OLLAMA_REPEAT_PENALTY = 1.05;
const OLLAMA_KEEP_ALIVE = '20m'
const OLLAMA_AI_PROVIDER = 'ollama';
const OLLAMA_AI_MODEL = 'qwen2.5-coder:3b-instruct-q4_K_M'

const AZURE_ENDPOINT = "https://projectXYZ-resource.cognitiveservices.azure.com/openai/v1/";
const AZURE_API_VERSION = "2025-04-01-preview";
const AZURE_AI_API_KEY = "YOUR_API_KEY"
const AZURE_AI_PROVIDER = "Azure Open AI";
const AZURE_AI_MODEL = "gpt-5.4";

const GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
const GOOGLE_AI_API_KEY = "YOUR_API_KEY"
const GOOGLE_AI_PROVIDER = "Google Gemini";
const GOOGLE_AI_MODEL = "gemini-3.1-flash-lite-preview";

const AI_PROVIDER = GOOGLE_AI_PROVIDER;
const AI_MODEL = GOOGLE_AI_MODEL;
const AI_MAX_TOKENS = parseInt('1024');
const AI_TEMPERATURE = parseFloat('0.2');
const MAX_CONTEXT_DOCS = 2;
const MAX_DOC_CHARS = 800;
const MAX_HISTORY = 4;
const REQUEST_TIMEOUT = 900000; // 15 seconds

const SYSTEM_PROMPT = `You are an expert Al assistant for Mastercard API integration and service development. provide:
- Step-by-step implementation guidance
- Relevant code snippets the documentation
- API endpoints, parameters and examples
- Best and Troubleshooting
Format: Use markdown, bold for terms, code blocks for smippets, numbered/bullet lists.`;

// =======
// Ollama Integration (Local LLM)
// ========

async function callOllama(messages) {

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
            model: AI_MODEL,
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

// =======
// Azure Open AI Integration (Remote LLM)
// ========

async function callAzureOpenAI(messages) {

    if (!AZURE_ENDPOINT) {
        throw new Error('Azure OpenAI endpoint not configured');
    }

    const client = new OpenAI({
        baseURL: AZURE_ENDPOINT,
        apiKey: AZURE_AI_API_KEY
    });

    const response = await client.chat.completions.create({
        messages: messages,
        model: AZURE_AI_MODEL,
    });

    console.log(response.choices[0])
    return response.choices[0].message.content;

}

// =======
// Google Gemini Integration (Remote LLM)
// ========

async function callGoogleGemini(messages) {

    if (!GOOGLE_ENDPOINT) {
        throw new Error('Google Gemini endpoint not configured');
    }

    const ai = new GoogleGenAI({apiKey: GOOGLE_AI_API_KEY});

    const response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: messages,
    });
    
    console.log("Chat response:", response.text);
    return response.text;


}

function isCodeRequest(question = "", conversationHistory = []) {
    const text = [question, ...conversationHistory.slice(-3).map(m => m.content || "")]
    .join(" ")
    .toLowerCase();

    return /(code|example|generate|implementation|integrate|write a function|snippet|debug|refactor|class|api example|javascript|python|java|typescript|swift|ios|android)/i.test(text);
}

async function generateAnswer(question, filteredAnswer, context = [], conversationHistory = []) {
    // Build context from documentation

    const isGoogleGeminiMessage = true

    const trimmedContext = context
    .slice(0, MAX_CONTEXT_DOCS)
    .map((doc) => ({
        title: doc.title || 'Untitled',
        content: String(doc.content || '').slice(0, MAX_DOC_CHARS)
    }));
    const contextText = trimmedContext.map((doc, index) => `**${doc.title}**\n${doc.content}`).join('\n\n');

    // Build conversation context (limit to last 2 messages to avoid token limits)
    const recentHistory = summerizeOldMessages(conversationHistory)
    //conversationHistory.slice(-MAX_HISTORY);

    // Construct messages array for the LLM
    /*
    if (isGoogleGeminiMessage === true) {
    const messages = [
        {
            role: 'system',
            parts: [{ text: SYSTEM_PROMPT}]
        }
    ];
    } else {
    const messages = [
        {
            role: 'system',
            content: SYSTEM_PROMPT
        }
    ];
    }
    */

   // ===================================================================
   // Getting ReferenceError: messages not defined so commented above code and declared messages below
   // For Ollama/AzureAI define messages constant from else block
   // For Google Gemini use messages constant from if block
   // ====================================================================
   const messages = [
        {
            role: 'system',
            parts: [{ text: SYSTEM_PROMPT }]
        }
    ];



    // Add context as a system message if available
    // if (context.length > 0) {
    // messages.push({
    // role: 'system',
    // content: `Here is the relevant documentation context to answer the user's questions:

    // ${contextText}

    // Use this documentation to provide accurate, specific answers. Always cite which section the information comes from.`
    // });
    // }

    const shouldIncludeContext = context.length > 0 && /api|integration|code|error|implement|endpoint|auth|setup|configure/i.test(question);
    if (shouldIncludeContext) {
    if (isGoogleGeminiMessage === true) {
       messages.push({
            role: 'system',
            parts: [{ text: `Documentation: \n\n${contextText}` }]
        });
    } else {
       messages.push({
            role: 'system',
            content: `Documentation: \n\n${contextText}`
        });
    }
 
    }
    // Add conversation history
    if (recentHistory.length > 0) {
        recentHistory.forEach(msg => { 
            if (isGoogleGeminiMessage === true) {
            messages.push({
                    role: msg.role = 'user' ? 'user' : 'assistant',
                    parts: [{ text: `${msg.content}` }] 
                });
               console.log(`${msg.content}`)
            } else {
                messages.push({
                    role: msg.role = 'user' ? 'user' : 'assistant',
                    content: msg.content
                });
            }
        });
    }

    if (filteredAnswer) {
    if (isGoogleGeminiMessage === true) {
        messages.push({
            role: 'assistant',
            parts: [{ text: filteredAnswer }]
        })
    } else {
        messages.push({
            role: 'assistant',
            content: filteredAnswer
        })
    }
    }

    // Add current question
    if (isGoogleGeminiMessage === true) {
        messages.push({
            role: 'user',
            parts: [{ text: question }]
            });
    } else {
        messages.push({
            role: 'user',
            content: question
            });
    }
 
    // Call appropriate AI provider
    // const selectedModel = isCodeRequest(question, conversationHistory) ? AI_CODE_MODEL : AI_MODEL; 
    //let answer = await callOllama(messages);
    // let answer = await callAzureOpenAI(messages);
    let answer = await callGoogleGemini(messages);

    return answer;

}

function summerizeOldMessages(history, keepRecent = 2) {
    if (history.length <= keepRecent) return history;

    const oldMessages = history.slice(0, -keepRecent);
    const recentMessages = history.slice(-keepRecent);

    //Keep recent messages intact, summerize old ones
    if (oldMessages.length > 0) {
        const summary = `Previous discussion covered: ${
            oldMessages.map(m => m.content.slice(0, 50)).join('; ')
        }...`;
        return [{ role: 'system', content: summary }, ...recentMessages];
    }
    return recentMessages;
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