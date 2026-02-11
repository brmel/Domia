#!/bin/bash
# Quick Start Script for Platform Tests
# Run this script to execute platform integration tests

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════╗"
echo "║     Domia Platform Tests - Quick Start           ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check for API key
if [ -z "$GOOGLE_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ Error: GOOGLE_API_KEY not set"
    echo ""
    echo "Please set your API key:"
    echo "  export GOOGLE_API_KEY=your-key-here"
    echo ""
    echo "Or add it to .env file:"
    echo "  echo 'GOOGLE_API_KEY=your-key' >> .env"
    echo ""
    exit 1
fi

echo "✅ API key found"
echo ""

# Show menu
echo "Select tests to run:"
echo "  1) All tests (Web + Electron)"
echo "  2) Web tests only"
echo "  3) Electron tests only"
echo "  4) Web tests (watch mode)"
echo "  5) Exit"
echo ""

read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Running all platform tests..."
        echo ""
        npm run test:platforms
        ;;
    2)
        echo ""
        echo "🌐 Running web platform tests..."
        echo ""
        npm run test:platforms -- web
        ;;
    3)
        echo ""
        echo "⚡ Running Electron platform tests..."
        echo ""
        echo "NOTE: Make sure:"
        echo "  - For CDP tests: 'npm run dev' is running"
        echo "  - For Executable tests: 'npm run build' was completed"
        echo ""
        read -p "Press Enter to continue..."
        npm run test:platforms -- electron
        ;;
    4)
        echo ""
        echo "👀 Running web tests in watch mode..."
        echo ""
        npm run test:platforms -- web --watch
        ;;
    5)
        echo "Goodbye!"
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "═════════════════════════════════════════════════════"
echo "Tests complete!"
echo "═════════════════════════════════════════════════════"
