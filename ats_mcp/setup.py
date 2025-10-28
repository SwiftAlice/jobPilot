#!/usr/bin/env python3
"""
Setup script for ATS Scoring MCP Server
Handles installation and dependency management with fallbacks
"""

import sys
import subprocess
import os
import logging

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 10):
        print(f"⚠️  Warning: MCP SDK requires Python 3.10+")
        print(f"Current version: {sys.version}")
        print("\nOptions:")
        print("1. Upgrade to Python 3.10+ for full MCP server functionality")
        print("2. Use the standalone version (works with Python 3.8+)")
        print("\nTo upgrade Python:")
        print("• macOS: brew install python@3.10")
        print("• Ubuntu: sudo apt install python3.10")
        print("• Windows: Download from https://python.org")
        return False
    else:
        print(f"✅ Python {sys.version.split()[0]} - Compatible with MCP SDK")
        return True

def install_package(package, description=""):
    """Install a package with error handling"""
    try:
        print(f"Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        print(f"✅ {package} installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Failed to install {package}: {e}")
        if description:
            print(f"   Note: {description}")
        return False

def setup_nltk_data():
    """Download required NLTK data"""
    try:
        import nltk
        print("Downloading NLTK data...")
        nltk.download('punkt', quiet=True)
        nltk.download('stopwords', quiet=True)
        print("✅ NLTK data downloaded")
        return True
    except Exception as e:
        print(f"⚠️  NLTK data download failed: {e}")
        return False

def setup_spacy_model():
    """Download spaCy English model"""
    try:
        subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
        print("✅ spaCy English model downloaded")
        return True
    except subprocess.CalledProcessError:
        print("⚠️  spaCy model download failed (optional - server will work without it)")
        return False

def install_mcp_sdk():
    """Install MCP SDK from GitHub"""
    try:
        print("Installing MCP SDK from GitHub...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", 
            "git+https://github.com/modelcontextprotocol/python-sdk.git"
        ])
        print("✅ MCP SDK installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install MCP SDK: {e}")
        print("\nTry installing manually:")
        print("pip3 install git+https://github.com/modelcontextprotocol/python-sdk.git")
        return False

def main():
    """Main setup function"""
    print("🚀 ATS Scoring Server Setup")
    print("=" * 40)
    
    # Check Python version
    python_compatible = check_python_version()
    
    if not python_compatible:
        print("\n🔧 Setting up standalone version instead...")
        print("The standalone version provides core ATS scoring without MCP integration.")
        
        # Just install optional dependencies for standalone version
        print("\n📦 Installing optional dependencies for enhanced features...")
        
        optional_packages = [
            ("nltk>=3.8", "Enhanced text processing"),
            ("scikit-learn>=1.3.0", "Advanced keyword extraction"),
            ("PyPDF2>=3.0.0", "PDF processing"),
            ("python-docx>=0.8.11", "DOCX processing"),
        ]
        
        installed = []
        for package, description in optional_packages:
            if install_package(package, description):
                installed.append(package.split(">=")[0])
        
        if "nltk" in installed:
            setup_nltk_data()
        
        print("\n" + "=" * 40)
        print("📋 Standalone Setup Complete!")
        print("✅ Core ATS scoring: Ready")
        if installed:
            print(f"✅ Enhanced features: {', '.join(installed)}")
        
        print("\n🎯 Usage:")
        print("python3 ats_standalone_scorer.py --resume resume.txt --job job.txt")
        print("OR")
        print("python3 ats_standalone_scorer.py  # Interactive mode")
        
        return
    
    # Full MCP setup for Python 3.10+
    print("\n📦 Installing MCP SDK...")
    if not install_mcp_sdk():
        print("\n❌ MCP SDK installation failed")
        print("Falling back to standalone version...")
        return
    
    # Optional dependencies for enhanced functionality
    optional_packages = [
        ("nltk>=3.8", "Enhanced text processing and tokenization"),
        ("scikit-learn>=1.3.0", "Advanced keyword extraction using TF-IDF"),
        ("PyPDF2>=3.0.0", "PDF resume processing support"),
        ("python-docx>=0.8.11", "DOCX resume processing support"),
        ("spacy>=3.6.0", "Advanced natural language processing"),
        ("numpy>=1.24.0", "Numerical operations support")
    ]
    
    installed_optional = []
    failed_optional = []
    
    for package, description in optional_packages:
        if install_package(package, description):
            installed_optional.append(package.split(">=")[0])
        else:
            failed_optional.append(package.split(">=")[0])
    
    # Setup NLTK data if available
    if "nltk" in installed_optional:
        setup_nltk_data()
    
    # Setup spaCy model if available
    if "spacy" in installed_optional:
        setup_spacy_model()
    
    print("\n" + "=" * 40)
    print("📋 Setup Summary:")
    print(f"✅ Core functionality: Ready")
    if installed_optional:
        print(f"✅ Enhanced features: {', '.join(installed_optional)}")
    if failed_optional:
        print(f"⚠️  Optional features unavailable: {', '.join(failed_optional)}")
        print("   (Server will work with reduced functionality)")
    
    print("\n🎯 Next Steps:")
    print("1. Run the server: python3 ats_scorer_server.py")
    print("2. Add to your MCP client configuration")
    print("3. Test with: calculate_ats_score tool")
    
    if failed_optional:
        print(f"\n💡 To enable all features later:")
        for pkg in failed_optional:
            print(f"   pip3 install {pkg}")

if __name__ == "__main__":
    main()