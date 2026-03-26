# 🎨 AI Art Assistant

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://vercel.com/)
[![Ollama](https://img.shields.io/badge/LLM-Ollama-blue)](https://ollama.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

An AI-powered art-focused chatbot designed for creative inspiration, art education, and visual prompt generation.

---

## 🚀 Overview

The **AI Art Assistant** is a web-based chatbot that:

- Answers questions about **artists, art history, and visual styles**
- Generates **creative and structured art prompts**
- Provides **visual inspiration and concept development**
- Uses a **smart classifier** to ensure responses stay art-related
- Enhances responses with **dynamic image search**

---

## 🧠 System Architecture

This project uses a **two-step AI pipeline**:

### 1. Prompt Classification
- Determines if a prompt is art-related  
- Categorizes the request (artist, style, prompt, etc.)  
- Generates an optimized image search query  

### 2. Response Generation
- Uses an LLM to generate structured responses  
- Applies controlled system prompts for **art-only output**

---

## 🛠️ Tech Stack

| Layer        | Technology |
|-------------|-----------|
| Frontend     | Next.js (React) |
| Backend      | Next.js API Routes |
| LLM          | Ollama Cloud (`gpt-oss:120b`) |
| Voice Input  | Web Speech API |
| Image Search | Google Custom Search API |
| Deployment   | Vercel |

---

## 🎯 Features

- 💬 Chat-based UI  
- 🎨 Art-only intelligent responses  
- 🧠 Prompt classification system  
- 🖼️ Context-aware image retrieval  
- 🎙️ Voice input (speech-to-text)  
- ⏱️ Delayed responses for realism  

---

## 📸 Demo

🔗 **Live App:**  
https://ai-art-agent-llm.vercel.app

---

## ⚙️ Local Setup

### 1. Clone the repository
```bash
git clone https://github.com/ElijahBallou/ai-art-agent_LLM.git
cd ai-art-agent_LLM
