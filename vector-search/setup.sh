#!/bin/bash

# Setup Script for Vector Search Service
echo "==============================="
echo "Vector Search Service Setup"
echo "============================"

# Check Python version
echo " Checking Python version..."
python3 --version

if ! command -v python3 &> /dev/null; then
    echo " Python 3 is not installed"
    exit 1
fi

# Create virtual environment
echo" Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo" Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo " Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo " Installing dependencies (this may take 2-3 minutes)..."
echo " - scikit-learn (machine learning)"
echo " - fastapi (web framework)"
echo " - numpy (numerical computing)"
pip install -r requirements.txt

# Verify installation
echo ""
echo "Verifying installation..."
python -c "import sklearn; print('scikit-learn:', sklearn.__version__)"
python -c "import numpy; print('numpy:', numpy.__version__)" 
python -c "import fastapi; print('fastapi:', fastapi.__version__)"
python -c "import uvicorn; print('uvicorn: OK')"

echo ""
echo "============================"
echo "Setup Complete!"
echo "============================="
echo ""
echo "To start the service:"
echo " ./start.sh"
echo ""
echo "Or manually:"
echo " source venv/bin/activate"
echo " python app.py"
echo "===================================================="