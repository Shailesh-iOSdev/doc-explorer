#!/bin/bash

# Vector Search Service Startup Script
echo "==========================="
echo "Vector Search Service"
echo "============================"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
echo " Virtual environment not found!"
echo "Please run setup.sh first"
exit 1
fi

# Activate virtual environment
echo " Activating virtual environment..."
source venv/bin/activate

# Check if dependencies are installed
if ! python -c "import sentence_transformers" 2>/dev/null; then
echo " Dependencies not installed!"
echo "Please run: pip install -r requirements.txt"
exit 1
fi

# Start the service
echo " Starting Vector Search Service on http://localhost:8000"
echo " API Documentation: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the service"
echo "==========================================="

python app.py