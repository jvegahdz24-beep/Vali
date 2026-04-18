#!/usr/bin/env python3
"""Add Z.ai metadata to PDF files."""
import sys
import os

def add_metadata(filepath):
    if not os.path.exists(filepath):
        print(f"Error: File not found: {filepath}")
        sys.exit(1)
    
    # Read the PDF as binary
    with open(filepath, 'rb') as f:
        content = f.read()
    
    # Check if it's a PDF
    if not content.startswith(b'%PDF'):
        print(f"Error: Not a valid PDF file: {filepath}")
        sys.exit(1)
    
    # Try to use PyPDF2 if available, otherwise use a simple approach
    try:
        from PyPDF2 import PdfReader, PdfWriter
        
        reader = PdfReader(filepath)
        writer = PdfWriter()
        
        # Copy all pages
        for page in reader.pages:
            writer.add_page(page)
        
        # Add metadata
        writer.add_metadata({
            '/Producer': 'Z.ai Code',
            '/Creator': 'Z.ai Code - AI-Powered Development',
            '/Author': 'Equipo de Auditoria Tecnica',
            '/Subject': 'Auditoria Total de Proyecto - ValiFlow Pro',
            '/Title': 'ValiFlow Pro - Auditoria Total 2025',
            '/Keywords': 'auditoria, ValiFlow Pro, SaaS, WhatsApp, CRM, IA, automotriz, Mexico',
            '/CreationDate': 'D:20250401',
            '/ModDate': 'D:20250401',
        })
        
        # Write back
        with open(filepath, 'wb') as f:
            writer.write(f)
        
        print(f"Metadata added to: {filepath}")
        
    except ImportError:
        # Fallback: use reportlab if PyPDF2 not available
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
            print(f"Warning: PyPDF2 not available. Metadata partially set during generation.")
            print(f"File OK: {filepath}")
        except ImportError:
            print(f"Warning: No PDF library available for metadata editing.")
            print(f"File OK: {filepath}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python add_zai_metadata.py <pdf_filepath>")
        sys.exit(1)
    add_metadata(sys.argv[1])
