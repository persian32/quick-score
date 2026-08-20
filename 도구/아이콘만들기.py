# -*- coding: utf-8 -*-
"""
홈 화면 아이콘 PNG를 만든다.  실행: python3 아이콘만들기.py [이름]

외부 라이브러리 없이 zlib + struct 만으로 PNG를 쓴다.
4배로 크게 그린 뒤 평균을 내어 줄이는 방식으로 계단현상을 없앤다.
모서리는 둥글게 하지 않는다 — iOS와 안드로이드가 알아서 깎는다.
"""

import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))  # 저장소 루트 기준

import sys, zlib, struct

# 앱 화면의 보라(#6c4ed9)보다 진한 남보라. 금색 대비가 살고 밝은 홈 화면에서도 또렷하다
BG     = (0x35, 0x27, 0x7a)
WHITE  = (0xff, 0xff, 0xff)
GOLD   = (0xf5, 0xbe, 0x1a)

S = 4       # 확대 배율
U = 1024    # 기준 좌표계


# ── 그리기 도구 ────────────────────────────────
def blank(n, color):
    return [[color] * n for _ in range(n)]

def rect(buf, x0, y0, x1, y1, color, r=0):
    n = len(buf); k = n / U
    X0, Y0, X1, Y1, R = x0*k, y0*k, x1*k, y1*k, r*k
    for y in range(max(0, int(Y0)), min(n, int(Y1)+1)):
        for x in range(max(0, int(X0)), min(n, int(X1)+1)):
            if R:
                cx = X0+R if x < X0+R else (X1-R if x > X1-R else x)
                cy = Y0+R if y < Y0+R else (Y1-R if y > Y1-R else y)
                if (x-cx)**2 + (y-cy)**2 > R*R:
                    continue
            buf[y][x] = color

def circle(buf, cx, cy, rad, color):
    n = len(buf); k = n / U
    CX, CY, R = cx*k, cy*k, rad*k
    for y in range(max(0, int(CY-R)), min(n, int(CY+R)+1)):
        dy = y - CY
        w = (R*R - dy*dy)
        if w <= 0: continue
        w = w ** 0.5
        for x in range(max(0, int(CX-w)), min(n, int(CX+w)+1)):
            buf[y][x] = color

def poly(buf, pts, color):
    """볼록·오목 상관없이 스캔라인으로 채운다"""
    n = len(buf); k = n / U
    P = [(x*k, y*k) for x, y in pts]
    ys = [p[1] for p in P]
    for y in range(max(0, int(min(ys))), min(n, int(max(ys))+1)):
        xs = []
        for i in range(len(P)):
            x0, y0 = P[i]; x1, y1 = P[(i+1) % len(P)]
            if (y0 <= y < y1) or (y1 <= y < y0):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            for x in range(max(0, int(xs[i])), min(n, int(xs[i+1])+1)):
                buf[y][x] = color


# ── 후보 ──────────────────────────────────────
def bars(n):
    """막대 — 그룹별 점수 비교"""
    buf = blank(n, BG)
    base = 852
    rect(buf, 168, 592, 344, base, WHITE, r=24)
    rect(buf, 424, 464, 600, base, WHITE, r=24)
    rect(buf, 680, 264, 856, base, GOLD,  r=24)
    rect(buf, 136, base, 888, base+52, WHITE, r=26)
    return buf

def medal(n):
    """금메달 1등"""
    buf = blank(n, BG)
    poly(buf, [(330, 120), (470, 120), (560, 430), (420, 470)], WHITE)
    poly(buf, [(554, 120), (694, 120), (604, 470), (464, 430)], WHITE)
    circle(buf, 512, 640, 268, WHITE)
    circle(buf, 512, 640, 220, GOLD)
    rect(buf, 470, 500, 554, 780, WHITE, r=16)      # 숫자 1 세로획
    poly(buf, [(392, 566), (470, 500), (470, 580), (430, 610)], WHITE)  # 1 삐침
    rect(buf, 402, 748, 622, 792, WHITE, r=16)      # 1 받침
    return buf

VARIANTS = {'bars': bars, 'medal': medal}


# ── PNG 쓰기 ───────────────────────────────────
def downsample(buf, out):
    f = len(buf) // out
    rows = []
    for oy in range(out):
        row = bytearray()
        for ox in range(out):
            r = g = b = 0
            for dy in range(f):
                src = buf[oy*f+dy]
                for dx in range(f):
                    c = src[ox*f+dx]; r += c[0]; g += c[1]; b += c[2]
            t = f*f
            row += bytes((r//t, g//t, b//t))
        rows.append(row)
    return rows

def write_png(path, size, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


pick = sys.argv[1] if len(sys.argv) > 1 else None

if pick:                      # 고른 하나를 실제 아이콘으로
    fn = VARIANTS[pick]
    for size in (32, 180, 192, 512):
        write_png(f'docs/icon-{size}.png', size, downsample(fn(size*S), size))
        print(f'✅ docs/icon-{size}.png  ({pick})')
else:                         # 후보 전부를 골라보기용으로
    for name, fn in VARIANTS.items():
        for size in (180, 512):
            write_png(f'/tmp/cand-{name}-{size}.png', size, downsample(fn(size*S), size))
        print(f'✅ /tmp/cand-{name}-*.png')
