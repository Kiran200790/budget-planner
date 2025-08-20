from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

def create_backup_style_with_plus(size, shape='rounded_square'):
    """
    Creates a professional PWA icon with blue gradient background and white + symbol.
    """
    # Create image with 4x supersampling for smooth quality
    scale = 4
    work_size = size * scale
    
    # Create clean white background
    bg = Image.new('RGBA', (work_size, work_size), (248, 250, 252, 255))
    draw = ImageDraw.Draw(bg)
    
    # FAB button size
    fab_size = int(work_size * 0.65)
    fab_x = (work_size - fab_size) // 2
    fab_y = (work_size - fab_size) // 2
    
    # Create the blue gradient: linear-gradient(135deg, #1e40af, #3b82f6, #60a5fa)
    fab_img = Image.new('RGBA', (fab_size, fab_size), (0, 0, 0, 0))
    fab_draw = ImageDraw.Draw(fab_img)
    
    # Gradient colors
    colors = [
        (30, 64, 175),   # #1e40af
        (59, 130, 246),  # #3b82f6
        (96, 165, 250)   # #60a5fa
    ]
    
    # Create smooth 135-degree gradient
    for y in range(fab_size):
        for x in range(fab_size):
            diag_pos = (x + y) / (2 * fab_size)
            
            if diag_pos <= 0.5:
                t = diag_pos * 2
                r = int(colors[0][0] * (1-t) + colors[1][0] * t)
                g = int(colors[0][1] * (1-t) + colors[1][1] * t)
                b = int(colors[0][2] * (1-t) + colors[1][2] * t)
            else:
                t = (diag_pos - 0.5) * 2
                r = int(colors[1][0] * (1-t) + colors[2][0] * t)
                g = int(colors[1][1] * (1-t) + colors[2][1] * t)
                b = int(colors[1][2] * (1-t) + colors[2][2] * t)
            
            fab_draw.point((x, y), (r, g, b, 255))
    
    # Make it perfectly circular
    circle_mask = Image.new('L', (fab_size, fab_size), 0)
    circle_draw = ImageDraw.Draw(circle_mask)
    circle_draw.ellipse([(0, 0), (fab_size, fab_size)], fill=255)
    
    # Apply circular mask
    fab_final = Image.new('RGBA', (fab_size, fab_size), (0, 0, 0, 0))
    fab_final.paste(fab_img, (0, 0), circle_mask)
    
    # Create sophisticated shadow layers for depth
    shadow_layers = [
        {'offset': (int(work_size * 0.024), int(work_size * 0.024)), 'blur': int(work_size * 0.08), 'color': (30, 64, 175, 100)},
        {'offset': (int(work_size * 0.012), 0), 'blur': int(work_size * 0.06), 'color': (59, 130, 246, 80)},
        {'offset': (int(work_size * 0.008), int(work_size * 0.008)), 'blur': int(work_size * 0.04), 'color': (0, 0, 0, 60)}
    ]
    
    # Draw sophisticated shadows
    for shadow in shadow_layers:
        shadow_img = Image.new('RGBA', (work_size, work_size), (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow_img)
        
        sx = fab_x + shadow['offset'][0]
        sy = fab_y + shadow['offset'][1]
        shadow_draw.ellipse([(sx, sy), (sx + fab_size, sy + fab_size)], fill=shadow['color'])
        
        shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(radius=shadow['blur']//4))
        bg = Image.alpha_composite(bg, shadow_img)
    
    # Paste the main FAB button
    bg.paste(fab_final, (fab_x, fab_y), fab_final)
    
    # Add white border
    border_width = max(2, int(work_size * 0.008))
    draw.ellipse(
        [(fab_x - border_width//2, fab_y - border_width//2), 
         (fab_x + fab_size + border_width//2, fab_y + fab_size + border_width//2)],
        outline=(255, 255, 255, 51), width=border_width
    )
    
    # Add inner highlight
    highlight_offset = int(work_size * 0.01)
    highlight_size = fab_size - highlight_offset * 2
    draw.arc(
        [(fab_x + highlight_offset, fab_y + highlight_offset), 
         (fab_x + highlight_size, fab_y + int(fab_size * 0.6))],
        start=0, end=180, fill=(255, 255, 255, 102), width=int(work_size * 0.008)
    )
    
    # Apply shape mask and resize with high quality
    if shape == 'circle':
        mask = Image.new('L', (work_size, work_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse([(0, 0), (work_size, work_size)], fill=255)
    else:
        mask = Image.new('L', (work_size, work_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        corner_radius = int(work_size * 0.22)
        mask_draw.rounded_rectangle([(0, 0), (work_size, work_size)], radius=corner_radius, fill=255)
    
    # Apply mask and resize
    final_img = Image.new('RGBA', (work_size, work_size), (0, 0, 0, 0))
    final_img.paste(bg, (0, 0), mask)
    final_img = final_img.resize((size, size), Image.Resampling.LANCZOS)
    
    # Add the + symbol on the final resized image
    final_draw = ImageDraw.Draw(final_img)
    
    # Calculate positions for the final size
    fab_size_final = int(size * 0.65)
    fab_x_final = (size - fab_size_final) // 2
    fab_y_final = (size - fab_size_final) // 2
    center_x_final = fab_x_final + fab_size_final // 2
    center_y_final = fab_y_final + fab_size_final // 2
    
    # + symbol with ultra-smooth curved edges
    plus_thickness = max(int(fab_size_final * 0.08), 5)
    plus_length = int(fab_size_final * 0.28)
    corner_radius = min(plus_thickness // 2, plus_thickness * 0.45)  # Ultra-smooth curves
    
    # Draw + symbol shadow for depth
    shadow_offset = max(1, int(size * 0.008))
    shadow_alpha = 80
    
    # Shadow for horizontal bar
    final_draw.rounded_rectangle([
        (center_x_final - plus_length//2 + shadow_offset, center_y_final - plus_thickness//2 + shadow_offset),
        (center_x_final + plus_length//2 + shadow_offset, center_y_final + plus_thickness//2 + shadow_offset)
    ], radius=corner_radius, fill=(0, 0, 0, shadow_alpha))
    
    # Shadow for vertical bar
    final_draw.rounded_rectangle([
        (center_x_final - plus_thickness//2 + shadow_offset, center_y_final - plus_length//2 + shadow_offset),
        (center_x_final + plus_thickness//2 + shadow_offset, center_y_final + plus_length//2 + shadow_offset)
    ], radius=corner_radius, fill=(0, 0, 0, shadow_alpha))
    
    # Draw horizontal bar of + with ultra-smooth rounded corners
    final_draw.rounded_rectangle([
        (center_x_final - plus_length//2, center_y_final - plus_thickness//2),
        (center_x_final + plus_length//2, center_y_final + plus_thickness//2)
    ], radius=corner_radius, fill=(255, 255, 255, 255))
    
    # Draw vertical bar of + with ultra-smooth rounded corners
    final_draw.rounded_rectangle([
        (center_x_final - plus_thickness//2, center_y_final - plus_length//2),
        (center_x_final + plus_thickness//2, center_y_final + plus_length//2)
    ], radius=corner_radius, fill=(255, 255, 255, 255))
    
    return final_img

def generate_essential_icons():
    """Generate professional PWA icons with blue gradient and + symbol"""
    base_path = '/Users/k0n05hl/Kiran/Budget/static'
    
    # Essential PWA icons
    icon_192 = create_backup_style_with_plus(192, 'rounded_square')
    icon_192.save(f'{base_path}/icon-192x192.png', 'PNG', quality=95, optimize=True)
    print('✅ Created icon-192x192.png')
    
    icon_512 = create_backup_style_with_plus(512, 'rounded_square')
    icon_512.save(f'{base_path}/icon-512x512.png', 'PNG', quality=95, optimize=True)
    print('✅ Created icon-512x512.png')
    
    # Maskable icon for Android
    icon_maskable = create_backup_style_with_plus(192, 'circle')
    icon_maskable.save(f'{base_path}/icon-192x192-round.png', 'PNG', quality=95, optimize=True)
    print('✅ Created icon-192x192-round.png')
    
    print("\n🎉 Generated professional PWA icons!")

if __name__ == "__main__":
    generate_essential_icons()
