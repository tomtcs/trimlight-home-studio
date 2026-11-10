import http from 'node:http';
import {credentialStore,configureCredentials,credentialsApi} from './credentials.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {openDatabase} from './database.mjs';
import {handleApi,tick,trim,readState} from '../shared/service.mjs';
const dataDir=process.env.DATA_DIR||'/data';fs.mkdirSync(dataDir,{recursive:true});
if(!process.env.APP_PASSWORD||process.env.APP_PASSWORD.length<16){console.error('Set APP_PASSWORD to at least 16 characters before starting.');process.exit(1)}
const env={...process.env,DB:openDatabase(path.join(dataDir,'roofline.sqlite')),LOCAL_RUNNER:true};
const credentials=credentialStore(dataDir);configureCredentials(env,credentials);
const expected=Buffer.from('Basic '+Buffer.from((process.env.APP_USER||'admin')+':'+process.env.APP_PASSWORD).toString('base64'));
function authenticated(req){const actual=Buffer.from(req.headers.authorization||'');return actual.length===expected.length&&timingSafeEqual(actual,expected)}
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.zip':'application/zip','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!authenticated(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Trimlight Home Studio"','Cache-Control':'no-store'});res.end('Sign in to Trimlight Home Studio.');return}
  const host=req.headers.host||'localhost';const url=new URL(req.url,'http://'+host);
  if(req.method==='POST'&&req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==host){res.writeHead(403);res.end('Origin not permitted');return}}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1900000){res.writeHead(413);res.end('Request too large');return}chunks.push(c)}
   const body=Buffer.concat(chunks);const r=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
   const response=url.pathname==='/api/credentials'?await credentialsApi(r,env,credentials):await handleApi(r,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const root=path.resolve('standalone-dist');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(500);res.end('Server request failed. Check the container log.');}
});
let running=false;
async function heartbeat(){if(running)return;running=true;try{await tick(env)}catch(e){console.error('Scheduler:',e.message)}finally{running=false}}
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{console.log('Trimlight Home Studio is listening on port '+(process.env.PORT||8080));heartbeat()});
const timer=setInterval(heartbeat,30000);
async function shutdown(){clearInterval(timer);try{const {state}=await readState(env);if(state.settings.schedulerEnabled||state.runtime.preview)await trim(env,'update',{switchState:2})}catch(e){console.error('Could not restore Timer Mode:',e.message)}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),35000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
