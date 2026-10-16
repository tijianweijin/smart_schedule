"""Extract validated 7z sections from Huawei's signed SDK installer, without running it."""
import mmap
from pathlib import Path
import struct
import subprocess
import zlib

root = Path(__file__).resolve().parents[1]
base = root / '.local/harmony-tools'
installer = base / 'installer/deveco-studio-26.0.0.851.exe'
archive_tool = base / 'archive/full/7z.exe'
parts = base / 'installer/sections'
studio = base / 'studio'
parts.mkdir(parents=True, exist_ok=True)
studio.mkdir(parents=True, exist_ok=True)
with installer.open('rb') as source, mmap.mmap(source.fileno(), 0, access=mmap.ACCESS_READ) as data:
    position, number = 0, 0
    while True:
        position = data.find(b"7z\xbc\xaf\x27\x1c", position)
        if position < 0:
            break
        header = data[position:position + 32]
        if len(header) != 32 or zlib.crc32(header[12:32]) != struct.unpack('<I', header[8:12])[0]:
            position += 6
            continue
        offset, length = struct.unpack('<QQ', header[12:28])
        total = 32 + offset + length
        if position + total > len(data):
            raise RuntimeError('Invalid installer archive boundary')
        target = parts / f'{number:02}.7z'
        if not target.exists() or target.stat().st_size != total:
            with target.open('wb') as output:
                for chunk in range(position, position + total, 8 * 1024 * 1024):
                    output.write(data[chunk:min(position + total, chunk + 8 * 1024 * 1024)])
        listing = subprocess.run([str(archive_tool), 'l', '-slt', str(target)], capture_output=True, check=True).stdout.decode('utf-8', errors='replace')
        names = [line[7:] for line in listing.splitlines() if line.startswith('Path = ')][1:]
        for name in names:
            checked = name.replace('\\', '/')
            if checked.startswith('/') or ':' in checked or '..' in checked.split('/'):
                raise RuntimeError('Unsafe installer archive member')
        print(f'Section {number}: {total} bytes, {len(names)} entries; extracting', flush=True)
        result = subprocess.run([str(archive_tool), 'x', str(target), '-o' + str(studio), '-y', '-aos', '-bso0', '-bsp0'], capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace'))
        position += total
        number += 1
print(f'Extracted {number} validated sections to the project-local studio directory.')
