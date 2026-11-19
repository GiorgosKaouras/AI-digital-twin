# AI Digital Twin

Local prototype of an AI digital twin advisor.

The application reads structured source documents, creates semantic embeddings for document chunks, retrieves the most relevant chunks for a question, and asks a local Ollama model to generate an answer.

## Current architecture

```text
source documents
    -> document chunks
    -> Ollama embeddings
    -> ChromaDB vector search
    -> DeepSeek-R1 through Ollama
    -> Streamlit answer
```

## Local setup

Activate the virtual environment and install the Python dependencies:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

Install the local models:

```bash
ollama pull deepseek-r1:7b
ollama pull nomic-embed-text
```

Run the application:

```bash
streamlit run app.py
```

Open http://localhost:8501 in a browser.

## Data

Place English `.txt` files under `data/`. The application reads files from these folders:

```text
data/
├── notes/
├── emails/
├── messages/
└── documents/
```

The current prototype uses synthetic data.

## Configuration

The default provider is local Ollama. Copy `.env.example` when configuring the project and set environment variables in your shell. The real `.env` file must remain local and must not be committed.

The project can later switch to an OpenAI model by setting `LLM_PROVIDER=openai` and providing `OPENAI_API_KEY`.
