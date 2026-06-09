#!/bin/bash

echo "🛑 Stopping existing instances of Jarvis..."
# Kill any processes running on port 3000 (ai-agent) and 3001 (dashboard)
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null

echo "🧹 Clearing caches..."
rm -rf dashboard/.next
rm -rf dashboard/node_modules/.cache
rm -rf ai-agent/node_modules/.cache

echo "🚀 Starting AI-Agent (Backend)..."
cd ai-agent
npm run dev &
AGENT_PID=$!
cd ..

echo "🚀 Starting Dashboard (Frontend)..."
cd dashboard
npm run dev &
DASHBOARD_PID=$!
cd ..

echo "🌐 Waiting for services to start..."
sleep 5

echo "========================================="
echo "✅ Jarvis is now running!"
echo "   - Dashboard: http://localhost:3001"
echo "   - Backend:   http://localhost:3000"
echo ""
echo "To expose the dashboard to the internet, run this in a new terminal:"
echo "   tailscale funnel 3001"
echo "========================================="
echo "Press [CTRL+C] to stop all services."

# Wait for both background processes
wait $AGENT_PID $DASHBOARD_PID
