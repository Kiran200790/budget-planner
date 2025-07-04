from PIL import Image, ImageDraw, ImageFont

def create_modern_icon(size, output_path):
    """
    Creates a modern, gradient-based icon with a stylized letter 'B'.
    """
    # Create a transparent image
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Define a circular mask for a rounded icon shape
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0, size, size), fill=255)

    # Create a new image for the gradient background
    bg = Image.new('RGBA', (size, size))
    bg_draw = ImageDraw.Draw(bg)

    # A nice blue-green to purple gradient
    top_color = (34, 125, 195)   # A vibrant blue
    bottom_color = (85, 58, 140) # A deep purple

    for i in range(size):
        # Linear interpolation between top and bottom colors
        r = int(top_color[0] * (1 - i/size) + bottom_color[0] * (i/size))
        g = int(top_color[1] * (1 - i/size) + bottom_color[1] * (i/size))
        b = int(top_color[2] * (1 - i/size) + bottom_color[2] * (i/size))
        bg_draw.line([(0, i), (size, i)], fill=(r, g, b))

    # Stylized Letter 'B'
    try:
        # Use a modern, clean font. 'Avenir Next' is a good choice on macOS.
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Avenir Next.ttc", int(size * 0.65))
    except IOError:
        try:
            # Fallback for other systems
            font = ImageFont.truetype("arial.ttf", int(size * 0.65))
        except IOError:
            # Last resort: default font
            font = ImageFont.load_default()

    text = "B"
    text_bbox = bg_draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    # Center the text
    text_position = ((size - text_width) / 2, (size - text_height) / 2 * 0.9)

    # Draw a subtle shadow for depth
    shadow_color = (0, 0, 0, 80)
    shadow_offset = int(size * 0.02)
    bg_draw.text((text_position[0] + shadow_offset, text_position[1] + shadow_offset), text, font=font, fill=shadow_color)

    # Draw the main text
    text_color = (255, 255, 255)
    bg_draw.text(text_position, text, font=font, fill=text_color)

    # Apply the circular mask to the background
    img.paste(bg, (0, 0), mask)

    img.save(output_path)

# Generate the icons
create_modern_icon(192, '/Users/k0n05hl/Kiran/Budget/static/icon-192x192.png')
create_modern_icon(512, '/Users/k0n05hl/Kiran/Budget/static/icon-512x512.png')

print("Generated modern icons (192x192 and 512x512).")
