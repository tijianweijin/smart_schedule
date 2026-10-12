"""Rasterize the supplied font; do not distribute/embed the font in the app."""
import hashlib
import io
import json
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageChops
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
ZIP = Path(r'C:\Users\提剑遗金\Downloads\DingLieSongKeTi.zip')
MEMBER = 'DingLieSongKeTi/dingliesongtypeface20241217-2.ttf'
GREEN = (42, 128, 82)
with zipfile.ZipFile(ZIP) as archive:
    data = archive.read(MEMBER)
font = TTFont(io.BytesIO(data))
assert font.sfntVersion == '\x00\x01\x00\x00'
assert ord('刻') in font.getBestCmap()
local = ROOT / '.local' / 'font-icon'
local.mkdir(parents=True, exist_ok=True)
(local / 'dingliesongtypeface20241217-2.ttf').write_bytes(data)
names = sorted({n.toUnicode() for n in font['name'].names if n.nameID in (1, 2, 4, 6)})
print(json.dumps({'format':'TrueType','names':names,'sha256':hashlib.sha256(data).hexdigest()}, ensure_ascii=True))

# Fit actual ink, not font advance metrics, inside the 66/108 adaptive safe zone.
size = 1536
face = ImageFont.truetype(io.BytesIO(data), 1100)
ink = Image.new('L', (size, size))
ImageDraw.Draw(ink).text((100, 0), '刻', fill=255, font=face)
ink = ink.crop(ink.getbbox())
factor = .55 * size / max(ink.size)
ink = ink.resize((round(ink.width * factor), round(ink.height * factor)), Image.Resampling.LANCZOS)
# Small optical correction from the actual ink's centre of mass, bounded to 1%.
pixels = list(ink.getdata()); mass = sum(pixels)
cx = sum((i % ink.width) * p for i,p in enumerate(pixels)) / mass
cy = sum((i // ink.width) * p for i,p in enumerate(pixels)) / mass
dx = max(-size*.01, min(size*.01, (ink.width/2-cx)*.3))
dy = max(-size*.01, min(size*.01, (ink.height/2-cy)*.3))
image = Image.new('RGB', (size, size), GREEN)
image.paste((255,255,255), (round((size-ink.width)/2+dx), round((size-ink.height)/2+dy)), ink)
foreground = Image.new('RGBA', (size, size))
foreground.paste((255,255,255,255), (round((size-ink.width)/2+dx), round((size-ink.height)/2+dy)), ink)
for density, edge in [('mdpi',108),('hdpi',162),('xhdpi',216),('xxhdpi',324),('xxxhdpi',432)]:
    folder = ROOT / 'android/app/src/main/res' / ('drawable-'+density)
    folder.mkdir(parents=True,exist_ok=True)
    image.resize((edge,edge),Image.Resampling.LANCZOS).save(folder/'ic_launcher.png')
    foreground.resize((edge,edge),Image.Resampling.LANCZOS).save(folder/'ic_launcher_foreground.png')

# Actual preview files plus small-size/cropping review sheet, not a new PWA.
for edge in [48,192,512]:
    image.resize((edge,edge),Image.Resampling.LANCZOS).save(local/f'icon-{edge}.png')
sheet = Image.new('RGB',(960,580),'#EEEDE9');draw=ImageDraw.Draw(sheet)
for index,(bg,shape) in enumerate([('#FFFFFF','square'),('#FFFFFF','circle'),('#FFFFFF','rounded'),('#181818','square'),('#181818','circle'),('#181818','rounded')]):
    x=20+(index%3)*320;y=20+(index//3)*280
    draw.rounded_rectangle((x,y,x+300,y+255),radius=12,fill=bg)
    tile=image.resize((180,180),Image.Resampling.LANCZOS);mask=Image.new('L',(180,180),255)
    if shape!='square':
        mask=Image.new('L',(180,180));m=ImageDraw.Draw(mask)
        if shape=='circle':m.ellipse((0,0,179,179),fill=255)
        else:m.rounded_rectangle((0,0,179,179),radius=40,fill=255)
    sheet.paste(tile,(x+60,y+25),mask)
    small=image.resize((32,32),Image.Resampling.LANCZOS);sheet.paste(small,(x+134,y+215))
sheet.save(local/'icon-review.png')
print('Generated five Android density icons and light/dark/crop review sheet; font stays private.')
