# Jarvis Installation & Setup Guide

This guide covers setting up the Jarvis AI Agent, Next.js Dashboard, Ollama, and exposing the service securely via Tailscale.

## 1. Install Ollama & Models
Download and install Ollama from [ollama.com](https://ollama.com/download).

Once installed, open your terminal and pull your desired Gemma model. You can choose based on your VM/Machine specs:

```bash
# Gemma 2 (9B) - Recommended for highly capable reasoning (Requires ~8-16GB RAM)
ollama run gemma2

# Gemma (7B) - Standard model
ollama run gemma:7b

# Gemma 2 (2B) - Lightweight and fast for smaller VMs (Requires ~4-8GB RAM)
ollama run gemma2:2b
```
*Note: Make sure your `.env` file in the `ai-agent` directory has `OLLAMA_MODEL` set to the exact model name you downloaded (e.g., `OLLAMA_MODEL=gemma2`).*

## 2. Install Project Dependencies
If you haven't already, install the necessary NPM packages for both the backend and frontend:

```bash
# Setup backend
cd ai-agent
npm install
npx prisma generate
cd ..

# Setup frontend
cd dashboard
npm install
cd ..
```

## 3. Running Jarvis (Using run.sh)
We have provided a `run.sh` script in the root directory that automatically kills old instances, clears the Next.js cache, and starts both the `ai-agent` and `dashboard` simultaneously.

Make the script executable (only needed once):
```bash
chmod +x ./run.sh
```

Run the script to start the entire system:
```bash
./run.sh
```

## 4. Expose Dashboard to the Internet (Tailscale Funnel)
If you want to access your Jarvis dashboard remotely from anywhere securely over the internet, you can use Tailscale Funnel.

1. Install [Tailscale](https://tailscale.com/) on your machine and log in.
2. Enable "Funnel" in your Tailscale admin console (Access Controls).
3. Open a **new terminal window** and run the following command to expose the dashboard (which runs on port `3001`):

```bash
tailscale funnel 3001
```

Tailscale will provide you with a secure public URL (e.g., `https://your-machine.tailscale.net`) that you can use to access Jarvis from your phone or another computer.
