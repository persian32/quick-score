# -*- coding: utf-8 -*-
"""
홈 화면 아이콘 PNG를 만든다.  실행: python3 아이콘만들기.py

외부 라이브러리 없이 zlib + struct 만으로 PNG를 쓴다.
4배로 크게 그린 뒤 평균을 내어 줄이는 방식으로 계단현상을 없앤다.

디자인: 채점표. 보라 바탕 위 흰 종이, 금색 머리띠, 3x3 칸,
        오른쪽 아래 한 칸이 금색 = 1등 그룹.
모서리는 둥글게 하지 않는다 — iOS와 안드로이드가 알아서 깎는다.
"""
import zlib, struct

PURPLE = (0x6c, 0x4e, 0xd9)
WHITE  = (0xff, 0xff, 0xff)
GOLD   = (0xf2, 0xb7, 0x05)
INK    = (0x21, 0x1b, 0x33)

S = 4            # 확대 배율
U = 1024         # 기준 좌표계

def blank(size, color):
    return [[color] * size for _ in range(size)]

def rect(buf, x0, y0, x1, y1, color, r=0):
    """모서리 반경 r 인 사각형. 좌표는 U 기준."""
    n = len(buf)
    k = n / U
    X0, Y0, X1, Y1, R = x0*k, y0*k, x1*k, y1*k, r*k
    for y in range(max(0, int(Y0)), min(n, int(Y1)+1)):
        for x in range(max(0, int(X0)), min(n, int(X1)+1)):
            if R:
                # 네 모서리 안쪽 원 밖이면 건너뛴다
                cx = X0+R if x < X0+R else (X1-R if x > X1-R else x)
                cy = Y0+R if y < Y0+R else (Y1-R if y > Y1-R else y)
                if (x-cx)**2 + (y-cy)**2 > R*R:
                    continue
            buf[y][x] = color

def downsample(buf, out_size):
    n = len(buf)
    f = n // out_size
    out = []
    for oy in range(out_size):
        row = bytearray()
        for ox in range(out_size):
            r = g = b = 0
            for dy in range(f):
                src = buf[oy*f+dy]
                for dx in range(f):
                    c = src[ox*f+dx]
                    r += c[0]; g += c[1]; b += c[2]
            t = f*f
            row += bytes((r//t, g//t, b//t))
        out.append(row)
    return out

def write_png(path, size, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)   # 8비트 RGB
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def draw(size):
    n = size * S
    buf = blank(n, PURPLE)

    # 흰 종이
    rect(buf, 148, 108, 876, 916, WHITE, r=72)
    # 금색 머리띠 (원본 채점표의 SCORE 제목 칸)
    rect(buf, 148, 108, 876, 300, GOLD, r=72)
    rect(buf, 148, 240, 876, 300, GOLD)        # 아래쪽 둥근 모서리 메우기

    # 3x3 칸 — 보라 선으로 나눈다
    gx0, gy0, gx1, gy1 = 212, 372, 812, 852
    t = 26                                      # 선 두께
    for i in range(4):                          # 세로선
        x = gx0 + (gx1-gx0) * i // 3
        rect(buf, x - t//2, gy0, x + t//2, gy1, PURPLE)
    for i in range(4):                          # 가로선
        y = gy0 + (gy1-gy0) * i // 3
        rect(buf, gx0, y - t//2, gx1, y + t//2, PURPLE)

    # 오른쪽 아래 칸을 금색으로 = 1등 그룹
    cw, ch = (gx1-gx0)//3, (gy1-gy0)//3
    rect(buf, gx0 + 2*cw + t//2, gy0 + 2*ch + t//2, gx1 - t//2, gy1 - t//2, GOLD)

    return downsample(buf, size)

for size in (32, 180, 192, 512):
    write_png(f'docs/icon-{size}.png', size, draw(size))
    print(f'✅ docs/icon-{size}.png')
