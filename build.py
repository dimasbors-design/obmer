s=open('src/page.html',encoding='utf8').read()
for k,f in [('CATALOG','catalog.js'),('WORKS','works.js'),('CORE','core.js'),('APP','app.js')]:
    s=s.replace('/*'+k+'*/',open('src/'+f,encoding='utf8').read())
open('site/index.html','w',encoding='utf8').write(s)
