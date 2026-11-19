import json
import os
import re
import unicodedata
from pathlib import Path

import chromadb
from ollama import embed
from openai import OpenAI
import streamlit as st


DATA_DIR = Path("data")
EMBEDDING_MODEL = "nomic-embed-text"
VECTOR_STORE_PATH = "vector_store"
COLLECTION_NAME = "advisor_chunks"
RELEVANCE_THRESHOLD = float(os.getenv("RELEVANCE_THRESHOLD", "0.65"))
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "is",
    "of",
    "on",
    "the",
    "to",
    "what",
    "when",
    "where",
    "which",
    "who",
    "with",
}


# Read every text file under data/ and keep its text and source path together.
def load_documents() -> list[dict[str, str]]:
    documents = []

    for path in sorted(DATA_DIR.rglob("*.txt")):
        documents.append(
            {
                "text": path.read_text(encoding="utf-8"),
                "source": str(path.relative_to(DATA_DIR)),
                "type": path.parent.name,
            }
        )

    return documents


# Split each document into small overlapping chunks for precise retrieval.
def create_chunks(
    documents: list[dict[str, str]],
    chunk_size: int = 80,
    overlap: int = 15,
) -> list[dict[str, str]]:
    chunks = []

    for document in documents:
        words = document["text"].split()
        start = 0
        chunk_number = 0

        while start < len(words):
            chunk_words = words[start : start + chunk_size]
            chunks.append(
                {
                    "id": f"{document['source']}::{chunk_number}",
                    "text": " ".join(chunk_words),
                    "source": document["source"],
                    "type": document["type"],
                }
            )
            chunk_number += 1

            if start + chunk_size >= len(words):
                break

            start += chunk_size - overlap

    return chunks


# Lowercase text and remove accents before comparing words.
def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join(
        character
        for character in normalized
        if unicodedata.category(character) != "Mn"
    )


# Convert text into a set of meaningful words for the profile fallback.
def tokenize(text: str) -> set[str]:
    words = re.findall(r"\w+", normalize_text(text), flags=re.UNICODE)
    return {word for word in words if word not in STOP_WORDS}


# Build a small, inspectable profile from all loaded documents.
def build_profile(documents: list[dict[str, str]]) -> dict[str, str]:
    all_text = "\n".join(document["text"] for document in documents)
    text_lower = all_text.lower()

    if "morning" in text_lower:
        meeting_preference = "Prefers morning meetings."
    else:
        meeting_preference = "Meeting time preference is unknown."

    if "short" in text_lower and "clear" in text_lower:
        communication_style = "Prefers short and clear answers."
    else:
        communication_style = "Communication style is unknown."

    return {
        "Meeting preference": meeting_preference,
        "Communication style": communication_style,
    }


# Generate one embedding vector for a text chunk with the local Ollama model.
def create_embedding(text: str) -> list[float]:
    response = embed(model=EMBEDDING_MODEL, input=text)
    return response.embeddings[0]


# Create or rebuild the local Chroma collection from the current chunks.
@st.cache_resource
def build_vector_store(chunks_json: str):
    chunks = json.loads(chunks_json)
    client = chromadb.PersistentClient(path=VECTOR_STORE_PATH)

    try:
        client.delete_collection(name=COLLECTION_NAME)
    except Exception:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    embeddings = [create_embedding(chunk["text"]) for chunk in chunks]

    collection.add(
        ids=[chunk["id"] for chunk in chunks],
        documents=[chunk["text"] for chunk in chunks],
        embeddings=embeddings,
        metadatas=[
            {
                "source": chunk["source"],
                "type": chunk["type"],
            }
            for chunk in chunks
        ],
    )

    return collection


# Search the vector database for the chunks closest to the user's question.
def search_chunks(collection, question: str, top_k: int = 3) -> list[dict[str, str]]:
    results = collection.query(
        query_embeddings=[create_embedding(question)],
        n_results=min(top_k, collection.count()),
    )

    matches = []
    for index, text in enumerate(results["documents"][0]):
        distance = results["distances"][0][index]

        # Ignore chunks whose semantic distance is above the configured threshold.
        if distance > RELEVANCE_THRESHOLD:
            continue

        matches.append(
            {
                "text": text,
                "source": results["metadatas"][0][index]["source"],
                "type": results["metadatas"][0][index]["type"],
                "distance": str(distance),
            }
        )

    return matches


# Create a client for the provider selected in the environment.
def create_llm_client() -> OpenAI:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    if provider == "ollama":
        return OpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama",
        )

    if provider == "openai":
        return OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    raise ValueError("Unsupported LLM_PROVIDER. Use 'ollama' or 'openai'.")


# Select the model name for the active provider.
def get_model_name() -> str:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    if provider == "ollama":
        return os.getenv("OLLAMA_MODEL", "deepseek-r1:7b")

    if provider == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-6-luna")

    raise ValueError("Unsupported LLM_PROVIDER. Use 'ollama' or 'openai'.")


# Ask the selected model to answer using only the retrieved context.
def generate_answer(
    question: str,
    profile: dict[str, str],
    matching_chunks: list[dict[str, str]],
) -> str:
    profile_text = "\n".join(
        f"- {category}: {information}"
        for category, information in profile.items()
    )
    context_text = "\n".join(
        f"- Source: {chunk['source']}\n  {chunk['text']}"
        for chunk in matching_chunks
    )

    client = create_llm_client()
    response = client.chat.completions.create(
        model=get_model_name(),
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Sofia's digital twin. Answer in English. "
                    "Use only the profile and retrieved source chunks. "
                    "If the information is not enough, say so clearly."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Profile:\n{profile_text}\n\n"
                    f"Retrieved source chunks:\n{context_text}\n\n"
                    f"Question:\n{question}"
                ),
            },
        ],
    )

    return response.choices[0].message.content or "The model returned an empty answer."


# Create the Streamlit page.
st.title("AI Digital Twin")
st.write("Ask a question about Sofia and get an answer from the local model.")

# Load documents, split them into chunks, and create the vector index.
documents = load_documents()
chunks = create_chunks(documents)
chunks_json = json.dumps(chunks, sort_keys=True)
vector_store = build_vector_store(chunks_json)
profile = build_profile(documents)

with st.expander("Show source documents"):
    for document in documents:
        st.markdown(f"**{document['source']}**")
        st.text(document["text"])

st.subheader("Sofia's profile")

# Display each profile category.
for category, information in profile.items():
    st.write(f"**{category}:** {information}")

question = st.text_input("Ask a question")

if question:
    try:
        # Retrieve the chunks that are semantically closest to the question.
        matching_chunks = search_chunks(vector_store, question)

        if matching_chunks:
            answer = generate_answer(question, profile, matching_chunks)

            st.subheader("Twin answer")
            st.write(answer)

            with st.expander("Show retrieved chunks"):
                for chunk in matching_chunks:
                    st.write(f"**{chunk['source']}**")
                    st.write(chunk["text"])
                    st.caption(f"Vector distance: {chunk['distance']}")
        else:
            st.info("I don't have enough relevant information to answer this question.")
    except Exception as error:
        st.error(
            "The local retrieval or model service could not be reached. "
            "Make sure Ollama is running and both models are installed."
        )
        st.caption(str(error))
