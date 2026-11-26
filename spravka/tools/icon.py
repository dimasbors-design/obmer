from PIL import Image, ImageDraw
import sys
def make(n, path):
    s=4; N=n*s
    im=Image.new('RGBA',(N,N),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle([0,0,N-1,N-1], radius=int(N*0.22), fill=(31,39,48,255))
    d.rounded_rectangle([int(N*.12),int(N*.12),int(N*.88),int(N*.88)], radius=int(N*.16), fill=(240,138,36,255))
    # молния
    p=[(0.56,0.17),(0.30,0.55),(0.47,0.55),(0.40,0.83),(0.70,0.42),(0.53,0.42),(0.60,0.17)]
    d.polygon([(x*N,y*N) for x,y in p], fill=(255,255,255,255))
    im=im.resize((n,n), Image.LANCZOS); im.save(path)
for n,p in [(192,'icon-192.png'),(512,'icon-512.png'),(64,'icon-64.png')]: make(n, sys.argv[1]+'/'+p)
