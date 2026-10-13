"""ovl.py JOBS.json : render caption and box overlays as transparent 1920x1080 PNGs without a browser (supersampled).
jobs: [{scene:'caption', cues:{text}, out}, {scene:'box', cues:{box:[x,y,w,h], label, err}, out}]"""
import json, math, sys, pathlib
from PIL import Image, ImageDraw, ImageFont
HERE = pathlib.Path(__file__).parent
S = 2
def oklch(L, C, h, a=255):
    hr = math.radians(h); A = C*math.cos(hr); B = C*math.sin(hr)
    l_ = L + 0.3963377774*A + 0.2158037573*B; m_ = L - 0.1055613458*A - 0.0638541728*B; s_ = L - 0.0894841775*A - 1.2914855480*B
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s; g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s; b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    f = lambda x: round(255*max(0, min(1, 12.92*x if x <= 0.0031308 else 1.055*x**(1/2.4)-0.055)))
    return (f(r), f(g), f(b), a)
ACC = oklch(.85, .16, 165); ERR = oklch(.71, .19, 22); INK = oklch(.96, .006, 250); PANEL = oklch(.12, .02, 258, 220)
def font(name, px): return ImageFont.truetype(str(HERE/'fonts'/name), int(px*S))
def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur+' '+w).strip()
        if d.textlength(t, font=f) > maxw and cur: lines.append(cur); cur = w
        else: cur = t
    if cur: lines.append(cur)
    return lines
def caption(c):
    im = Image.new('RGBA', (1920*S, 1080*S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = font('instrument600.ttf', 36); maxw = (1540-60)*S
    lines = wrap(d, c['text'], f, maxw); lh = 46*S
    w = max(d.textlength(l, font=f) for l in lines) + 60*S; h = lh*len(lines) + 34*S
    x0 = (1920*S - w)/2; y1 = (1080-c.get('bottom', 44))*S; y0 = y1 - h
    d.rounded_rectangle([x0, y0, x0+w, y1], 18*S, fill=PANEL, outline=(255, 255, 255, 26), width=S)
    for i, l in enumerate(lines):
        d.text((1920*S/2, y0 + 17*S + i*lh + lh/2 - 2*S), l, font=f, fill=INK, anchor='mm')
    return im
def box(c):
    im = Image.new('RGBA', (1920*S, 1080*S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x, y, w, h = c['box']; pad = 8; col = ERR if c.get('err') else ACC
    r = [(x-pad)*S, (y-pad)*S, (x+w+pad)*S, (y+h+pad)*S]
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle([r[0]-6*S, r[1]-6*S, r[2]+6*S, r[3]+6*S], 16*S, outline=col[:3]+(46,), width=6*S); im.alpha_composite(glow)
    d.rounded_rectangle(r, 12*S, outline=col, width=3*S)
    lab = c.get('label', '')
    if lab:
        f = font('instrument600.ttf', 24); tw = d.textlength(lab, font=f); px, py = 16*S, 8*S; bh = 24*S*1.2 + 2*py
        lx = max(12*S, r[0]); above = y > 90 and c.get('pos', 'above') != 'below'
        ly = r[1] - 12*S - bh if above else r[3] + 12*S
        lx = min(lx, 1920*S - tw - 2*px - 12*S)
        d.rounded_rectangle([lx, ly, lx+tw+2*px, ly+bh], 10*S, fill=col)
        d.text((lx+px, ly+bh/2 - S), lab, font=f, fill=oklch(.2, .04, 22 if c.get('err') else 165), anchor='lm')
    return im
for j in json.load(open(sys.argv[1])):
    im = {'caption': caption, 'box': box}[j['scene']](j['cues']).resize((1920, 1080), Image.LANCZOS)
    im.save(j['out']); print(j['out'])
