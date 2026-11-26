import pefile, struct, sys
def load(path):
    pe=pefile.PE(path, fast_load=True); d=bytearray(open(path,'rb').read())
    base=pe.OPTIONAL_HEADER.ImageBase
    def off2va(o):
        for s in pe.sections:
            if s.PointerToRawData<=o<s.PointerToRawData+s.SizeOfRawData: return base+s.VirtualAddress+(o-s.PointerToRawData)
    def va2off(v):
        r=v-base
        for s in pe.sections:
            if s.VirtualAddress<=r<s.VirtualAddress+max(s.Misc_VirtualSize,s.SizeOfRawData): return s.PointerToRawData+(r-s.VirtualAddress)
    return pe,d,base,off2va,va2off
def find_files(path, probe=b'web/app.js'):
    pe,d,base,off2va,va2off=load(path)
    # find struct: ptr(name) len(name) ptr(data) len(data) hash16  = 48 bytes
    cands=[]
    i=-1
    while True:
        i=d.find(probe,i+1)
        if i<0: break
        va=off2va(i)
        if va is None: continue
        pat=struct.pack('<QQ',va,len(probe))
        j=-1
        while True:
            j=d.find(pat,j+1)
            if j<0: break
            cands.append(j)
    if not cands: return None
    # walk back/forward in 48-byte steps
    def rd(o):
        if o<0 or o+32>len(d): return None
        np,nl,dp,dl=struct.unpack_from('<QQQQ',d,o)
        no=va2off(np) if np else None
        if no is None or nl>300: return None
        name=bytes(d[no:no+nl])
        try: name=name.decode()
        except: return None
        return name,dp,dl
    best=None
    for res in cands:
        s=res
        while rd(s-48): s-=48
        files=[];o=s
        while True:
            r=rd(o)
            if not r: break
            files.append((o,)+r); o+=48
        va=off2va(s)
        if d.find(struct.pack('<QQQ',va,len(files),len(files)))>=0: return pe,d,base,va2off,files
        best=best or files
    return pe,d,base,va2off,best
if __name__=='__main__':
    pe,d,base,va2off,files=find_files(sys.argv[1])
    for o,n,dp,dl in files: print(o,n,dl)

def extract(path, outdir):
    import os
    pe,d,base,va2off,files=find_files(path)
    for o,n,dp,dl in files:
        if n.endswith('/'): continue
        p=os.path.join(outdir,n); os.makedirs(os.path.dirname(p),exist_ok=True)
        off=va2off(dp); open(p,'wb').write(d[off:off+dl])
