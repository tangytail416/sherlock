#!/bin/bash

# Development setup script for Agentic SOC

set -e

echo "🚀 Agentic SOC - Development Setup"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local from .env.example..."
    cp .env.example .env.local
    echo "⚠️  Please edit .env.local and add your API keys!"
    echo ""
fi

# Start PostgreSQL
echo "🐘 Starting PostgreSQL database..."
docker-compose up postgres -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npm run db:generate

# Push database schema
echo "📊 Pushing database schema..."
npm run db:push || echo "⚠️  Database push failed. Make sure PostgreSQL is running."

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development server, run:"
echo "  npm run dev"
echo ""
echo "To stop the database, run:"
echo "  docker-compose down"
echo ""
echo "The app will be available at: http://localhost:3000"
