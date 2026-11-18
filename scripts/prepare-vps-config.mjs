import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
const path='dist/server/wrangler.json';
const config=JSON.parse(readFileSync(path,'utf8'));
const db=config.d1_databases?.find(db=>db.binding==='DB');
const bucket=config.r2_buckets?.find(bucket=>bucket.binding==='BUCKET');
if(!db || !bucket) throw new Error('Expected DB (D1) and BUCKET (R2) in the generated Wrangler config; inspect the build output.');
// Generated config lives in dist/server; copy migrations alongside it so
// Wrangler discovers them at a stable path, without directory traversal.
mkdirSync('dist/server/migrations',{recursive:true});
const files=readdirSync('drizzle').filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
if(files.length===0)throw new Error('No SQL migrations found in drizzle/');
for(const name of files)copyFileSync('drizzle/'+name,'dist/server/migrations/'+name);
db.migrations_dir='migrations';
// Use the local D1/R2 bindings in the container (no Cloudflare account required).
config.send_metrics=false;
writeFileSync(path,JSON.stringify(config,null,2)+'\n');
console.log('Prepared Khotwa local D1 migrations config.');
