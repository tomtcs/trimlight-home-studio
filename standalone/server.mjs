import http from 'node:http';
import {credentialStore,configureCredentials,credentialsApi} from './credentials.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createAuth,authorize} from './auth.mjs';
import {openDatabase} from './database.mjs';
import {handleApi,tick,trim,readState} from '../shared/service.mjs';
const dataDir=process.env.DATA_DIR||'/data';fs.mkdirSync(dataDir,{recursive:true});
const env={...process.env,DB:openDatabase(path.join(dataDir,'roofline.sqlite')),LOCAL_RUNNER:true};
const credentials=credentialStore(dataDir);configureCredentials(env,credentials);
let auth;try{auth=await createAuth(env.DB.sqlite,process.env)}catch(e){console.error(e.message);process.exit(1)}
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.zip':'application/zip','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host||'localhost';const url=new URL(req.url,'http://'+host);
  if(req.method==='POST'&&req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==host){res.writeHead(403);res.end('Origin not permitted');return}}
  if(url.pathname.startsWith('/api/')){
   res.setHeader('Cache-Control','no-store');
   const user=auth.user(req);
   if(req.method!=='GET'&&req.method!=='POST'){res.writeHead(405);res.end();return}
   if(req.method==='POST'&&!(req.headers['content-type']||'').startsWith('application/json')){res.writeHead(415);res.end(JSON.stringify({error:'JSON requests required.'}));return}
   if(!user&&!['/api/auth/login','/api/auth/session'].includes(url.pathname)){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Please sign in.'}));return}

   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1900000){res.writeHead(413);res.end('Request too large');return}chunks.push(c)}
   const body=Buffer.concat(chunks);const parsed=body.length?JSON.parse(body.toString()):{};
   if(url.pathname.startsWith('/api/auth/')||url.pathname==='/api/users'){
    try{const result=await auth.route(req,url.pathname,parsed,user);res.writeHead(200,{'Content-Type':'application/json',...(result.cookie?{'Set-Cookie':result.cookie}:{})});res.end(JSON.stringify(result.data));}catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
   }
   try{authorize(user,url.pathname,req.method,parsed,url.pathname==='/api/state'&&req.method==='POST'?(await readState(env)).state:null)}catch(e){res.writeHead(e.status||403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));return}
   const r=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
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
