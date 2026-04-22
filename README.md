# Mastercard Documentation Explorer

Copilot-style interface for exploring 84 Mastercard API services with instant QnA, intelligent search, and contexual follow-up suggestions.

## Prerequisites

- **Node.js** 16+ (For all services)
- **Python 3.11.x** For Vector Service

## Quick Start

### 1. Install Dependencies (One-Time SetUp)

```bash
# Install OLLAMA from site https://ollama.com/
# Install Model qwen2.5-coder:3b-instruct-q4_K_M - https://ollama.com/library/qwen2.5

# Install all Node.js dependencies
npm install
cd chatbot-backend && npm install &&  cd ..
cd chatbot-frontend && npm install &&  cd ..

cd vector-search
./setup.sh
cd..

NOTES:
# If there is any issue running set up please install packages mentioned in requirements.txt
# Supporting python version
Python 3.11.7
# Supporting npm version
11.11.0
```

### 2. Manual Start (3 terminal)

Terminal 1 - Backend:
```
cd chatbot-backend
npm start
```

Terminal 2 - Frontend:
```
cd chatbot-frontend
npm run dev
```

Terminal 3 - Vector Search:
```
cd vector-search
python app.py
```

### 3. Open the app

```
http://localhost:3000
```
(or the port shown in terminal - may be 3001, 3002 if 3000 is busy)


**Built for Mastercard Developers** | Powered by MCP, scikit-learn and OLLAMA