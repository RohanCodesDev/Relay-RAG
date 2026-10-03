import requests
import json
import time

API_URL = "http://localhost:8000"
HEADERS = {"X-Tenant-ID": "demo_tenant"}

def test_ingest():
    print("--- Testing /ingest ---")
    data = {
        "text": "Relay is a cutting-edge multi-tenant RAG API. It uses Neon PostgreSQL for storage and Ollama for local LLM inference. It was designed by Rohan Chakraborti."
    }
    response = requests.post(f"{API_URL}/ingest", headers=HEADERS, json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")

def test_chat():
    print("--- Testing /chat (Streaming) ---")
    data = {
        "session_id": "11111111-1111-1111-1111-111111111111",
        "message": "What is Relay and who designed it?"
    }
    
    # We use stream=True to read the SSE stream as it arrives
    with requests.post(f"{API_URL}/chat", headers=HEADERS, json=data, stream=True) as response:
        print(f"Status: {response.status_code}")
        print("AI Response: ", end="", flush=True)
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith("data: "):
                    content = decoded_line[6:]
                    if content == "[DONE]":
                        break
                    try:
                        chunk_data = json.loads(content)
                        if "text" in chunk_data:
                            import sys
                            sys.stdout.buffer.write(chunk_data["text"].encode("utf-8", errors="replace"))
                            sys.stdout.buffer.flush()
                    except json.JSONDecodeError:
                        pass
        print("\n\n--- Test Complete ---")

if __name__ == "__main__":
    try:
        test_ingest()
        time.sleep(1)
        test_chat()
    except Exception as e:
        print(f"Error connecting to server: {e}")
