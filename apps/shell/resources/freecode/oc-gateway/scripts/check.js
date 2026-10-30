// Local diagnostic: no inference and no retired SOCKS/rotator probes.
'use strict';
const http = require('http');
const index = process.argv.indexOf('--base-url');
const base = new URL(index >= 0 ? process.argv[index + 1] : 'http://127.0.0.1:8080');
async function get(path) {
  return new Promise((resolve,reject) => {
    const req=http.get(new URL(path,base),{timeout:3000},res=>{
      let body='';res.on('data',chunk=>body+=chunk);
      res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(body)});}catch(error){reject(error);}});
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error('local probe timeout')));req.on('error',reject);
  });
}
(async()=>{
  let failed=0;
  for(const path of ['/livez','/readyz','/healthz']) {
    try {
      const r=await get(path), ok=r.status===200;
      if(!ok)failed++;
      console.log(`${ok?'PASS':'FAIL'} ${path}: HTTP ${r.status}`);
      if(r.body.local_routes)console.log(JSON.stringify({routes:r.body.local_routes,degraded_causes:r.body.degraded_causes,remote_generation:r.body.remote_generation}));
    }catch(error){failed++;console.log(`FAIL ${path}: ${error.message}`);}
  }
  console.log(failed?'LOCAL CHECKS FAILED':'ALL LOCAL CHECKS PASSED (no inference sent)');
  process.exitCode=failed?1:0;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
