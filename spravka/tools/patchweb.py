# Replace/add go:embed web/ files in a Go PE exe.
# New/changed data and (if needed) a new sorted file table go into a trailing ".dpweb" section;
# file structs or the embed slice header are repointed. Unchanged files keep their original bytes.
import sys, os, struct, pefile
sys.path.insert(0, os.path.dirname(__file__))
import embedfs

def align(x, a): return (x + a - 1) // a * a

def split(name):
    n = name.rstrip('/')
    i = n.rfind('/')
    return (n[:i], n[i + 1:]) if i >= 0 else ('.', n)

def find_slice_hdr(d, base, pe, files):
    o0 = files[0][0]
    for s in pe.sections:
        if s.PointerToRawData <= o0 < s.PointerToRawData + s.SizeOfRawData:
            va = base + s.VirtualAddress + (o0 - s.PointerToRawData)
    pat = struct.pack('<QQQ', va, len(files), len(files))
    i = d.find(pat)
    if i < 0 or d.find(pat, i + 1) >= 0: raise SystemExit('embed slice header not found uniquely')
    return i

def patch(exe_in, webroot, exe_out):
    pe0, d, base, va2off, files = embedfs.find_files(exe_in)
    pe = pefile.PE(exe_in)
    fa = pe.OPTIONAL_HEADER.FileAlignment; sa = pe.OPTIONAL_HEADER.SectionAlignment
    secs = sorted(pe.sections, key=lambda s: s.VirtualAddress)
    reuse = secs[-1].Name.rstrip(b'\0') == b'.dpweb' and secs[-1].PointerToRawData + secs[-1].SizeOfRawData >= len(d) - fa
    if reuse:
        old = secs[-1]; ov0 = base + old.VirtualAddress; ov1 = ov0 + old.Misc_VirtualSize
        new_va = old.VirtualAddress; hdr_off = old.get_file_offset(); trunc = old.PointerToRawData
    else:
        last = secs[-1]; ov0 = ov1 = -1
        new_va = align(last.VirtualAddress + max(last.Misc_VirtualSize, last.SizeOfRawData), sa)
        hdr_off = pe.sections[-1].get_file_offset() + 40; trunc = len(d)
    first_raw = min(s.PointerToRawData for s in pe.sections if s.PointerToRawData)
    if not reuse and hdr_off + 40 > first_raw: raise SystemExit('no room for section header')
    # entries: name -> [name_ptr, name_len, data_ptr, data_len, struct_off or None]
    ent = {}
    for o, n, dp, dl in files:
        np_, nl = struct.unpack_from('<QQ', d, o)
        ent[n] = [np_, nl, dp, dl, o]
    root = os.path.dirname(os.path.abspath(webroot))
    disk = {}
    for r, dirs, fs in os.walk(webroot):
        rel = os.path.relpath(r, root).replace(os.sep, '/')
        disk[rel + '/'] = None
        for f in fs: disk[rel + '/' + f] = os.path.join(r, f)
    blob = bytearray()
    def put(b, al=16):
        while len(blob) % al: blob.append(0)
        at = base + new_va + len(blob); blob.extend(b); return at
    changed, added = [], []
    in_old = lambda v: ov0 <= v < ov1
    orig = {n: (e[0], e[2], e[3]) for n, e in ent.items()}
    def cur_bytes(n):
        _, dp, dl = orig[n]
        if not dl: return b''
        off = va2off(dp); return bytes(d[off:off + dl])
    for n, path in sorted(disk.items()):
        if n in ent: continue
        data = b'' if path is None else open(path, 'rb').read()
        nb = n.encode()
        ent[n] = [put(nb, 1), len(nb), put(data) if data else 0, len(data), None]
        added.append(n)
    for n in list(orig):
        e = ent[n]; np0, dp0, dl0 = orig[n]
        if in_old(np0): e[0] = put(n.encode(), 1)
        path = disk.get(n)
        if path:
            data = open(path, 'rb').read()
            if data != cur_bytes(n):
                e[2] = put(data); e[3] = len(data); changed.append(n); continue
        if dl0 and in_old(dp0): e[2] = put(cur_bytes(n))
    removed = [n for n in ent if n not in disk]
    if removed: raise SystemExit('files missing on disk: %s' % removed[:5])
    out = bytearray(d[:trunc])
    if True:  # always write a fresh sorted table and repoint the embed slice header
        order = sorted(ent, key=split)
        arr = bytearray()
        for n in order:
            e = ent[n]; arr += struct.pack('<QQQQ', e[0], e[1], e[2], e[3]) + bytes(16)
        av = put(bytes(arr), 8)
        so = find_slice_hdr(d, base, pe, files)
        struct.pack_into('<QQQ', out, so, av, len(order), len(order))
        # базовые поправки (relocations) для указателей новой таблицы: Go-exe собран с ASLR,
        # без них Windows сдвигает образ, а указатели таблицы остаются старыми — программа падает
        fields = []
        for i, n in enumerate(order):
            e = ent[n]; r = av - base + i * 48
            if e[0]: fields.append(r)
            if e[2]: fields.append(r + 16)
        dd = pe.OPTIONAL_HEADER.DATA_DIRECTORY[5]
        rel = bytearray(d[va2off(base + dd.VirtualAddress):va2off(base + dd.VirtualAddress) + dd.Size])
        pages = {}
        for r in sorted(fields): pages.setdefault(r & ~0xFFF, []).append(r & 0xFFF)
        for pg, offs in sorted(pages.items()):
            ents = [(10 << 12) | o for o in offs]
            if len(ents) % 2: ents.append(0)
            rel += struct.pack('<II', pg, 8 + 2 * len(ents)) + struct.pack('<%dH' % len(ents), *ents)
        rv = put(bytes(rel), 4) - base
        opt0 = pe.OPTIONAL_HEADER.get_file_offset()
        struct.pack_into('<II', out, opt0 + 112 + 5 * 8, rv, len(rel))
    if not blob: blob.append(0)
    raw_ptr = align(len(out), fa); raw_size = align(len(blob), fa)
    out += bytes(raw_ptr - len(out)) + blob + bytes(raw_size - len(blob))
    out[hdr_off:hdr_off + 40] = struct.pack('<8sIIIIIIHHI', b'.dpweb\0\0', len(blob), new_va, raw_size, raw_ptr, 0, 0, 0, 0, 0x40000040)
    coff = pe.FILE_HEADER.get_file_offset()
    if not reuse: struct.pack_into('<H', out, coff + 2, pe.FILE_HEADER.NumberOfSections + 1)
    opt = pe.OPTIONAL_HEADER.get_file_offset()
    struct.pack_into('<I', out, opt + 56, align(new_va + len(blob), sa))
    struct.pack_into('<I', out, opt + 64, 0)
    # образ грузится по своему базовому адресу (без ASLR); поправки выше нужны, если система всё же сдвинет его
    struct.pack_into('<H', out, opt + 70, pe.OPTIONAL_HEADER.DllCharacteristics & ~0x0060)
    open(exe_out, 'wb').write(out)
    print('changed:', len(changed), changed[:40]); print('added:', added)

if __name__ == '__main__': patch(*sys.argv[1:4])
