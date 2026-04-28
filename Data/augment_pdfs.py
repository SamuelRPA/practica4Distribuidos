import os
import uuid
import random
from pathlib import Path
from pdf2image import convert_from_path
import cv2
import numpy as np
from PIL import Image, ImageDraw

def add_noise(image_path, output_path, is_overwritten_case=False):
    # Cargar imagen
    img = cv2.imread(image_path)
    if img is None:
        return False
        
    h, w = img.shape[:2]
    
    # 1. Agregar manchas (stains) - simulando cafe o suciedad
    num_stains = random.randint(1, 4)
    for _ in range(num_stains):
        cx = random.randint(0, w)
        cy = random.randint(0, h)
        radius = random.randint(20, 80)
        color = (random.randint(150, 200), random.randint(180, 220), random.randint(200, 240)) # Color BGR (algo amarillento/cafe)
        overlay = img.copy()
        cv2.circle(overlay, (cx, cy), radius, color, -1)
        cv2.addWeighted(overlay, 0.3, img, 0.7, 0, img)

    # 2. Agregar arrugas (wrinkles)
    num_wrinkles = random.randint(3, 8)
    for _ in range(num_wrinkles):
        x1, y1 = random.randint(0, w), random.randint(0, h)
        x2, y2 = random.randint(0, w), random.randint(0, h)
        # Lineas delgadas irregulares
        color = (random.randint(100, 150), random.randint(100, 150), random.randint(100, 150))
        thickness = random.randint(1, 2)
        cv2.line(img, (x1, y1), (x2, y2), color, thickness)
        
    # 3. Caso especial: Sobrescritura en números (Acta 10304001115004)
    if is_overwritten_case:
        # Simulamos una sobrescritura en la parte central derecha (donde suelen estar los números)
        cx, cy = int(w * 0.7), int(h * 0.5)
        overlay = img.copy()
        # Dibujamos un garabato negro como si hubieran sobreescrito
        cv2.putText(overlay, "88", (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, 3, (0, 0, 0), 10)
        cv2.putText(overlay, "93", (cx-10, cy+5), cv2.FONT_HERSHEY_SIMPLEX, 3, (50, 50, 50), 5)
        cv2.addWeighted(overlay, 0.8, img, 0.2, 0, img)
        
    cv2.imwrite(output_path, img)
    return True

def process_pdfs():
    base_dir = Path(__file__).parent.resolve()
    pdf_dir = base_dir / 'pdf'
    output_dir = base_dir / 'augmented_pdfs'
    output_dir.mkdir(exist_ok=True)
    
    if not pdf_dir.exists():
        print(f"Directory {pdf_dir} does not exist.")
        return

    mapping_file = output_dir / 'filename_mapping.txt'
    
    with open(mapping_file, 'w', encoding='utf-8') as mf:
        mf.write("Original_Name,Random_Name\n")
        
        for pdf_file in pdf_dir.glob('*.pdf'):
            try:
                print(f"Processing {pdf_file.name}...")
                
                # Convert PDF to images
                images = convert_from_path(str(pdf_file))
                if not images:
                    continue
                    
                random_name = str(uuid.uuid4())
                is_special_case = '10304001115004' in pdf_file.name
                
                # Save first page as image to process
                temp_img_path = str(output_dir / f"temp_{random_name}.jpg")
                images[0].save(temp_img_path, 'JPEG')
                
                # Add noise
                processed_img_path = str(output_dir / f"processed_{random_name}.jpg")
                add_noise(temp_img_path, processed_img_path, is_special_case)
                
                # Convert back to PDF
                processed_img = Image.open(processed_img_path)
                final_pdf_path = output_dir / f"{random_name}.pdf"
                processed_img.save(final_pdf_path, "PDF", resolution=100.0)
                
                # Clean temp images
                os.remove(temp_img_path)
                os.remove(processed_img_path)
                
                # Write mapping
                mf.write(f"{pdf_file.name},{random_name}.pdf\n")
                print(f"Saved as {random_name}.pdf")
                
            except Exception as e:
                print(f"Error processing {pdf_file.name}: {e}")

if __name__ == '__main__':
    process_pdfs()
