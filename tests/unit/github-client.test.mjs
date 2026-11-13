import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubClient,parseShared,encodeContent,decodeContent,MAX_SHARED_BYTES} from '../../src/sync/github-client.mjs';
const config={owner:'example',repo:'ot-fixture',branch:'main',path:'data/shared-ot.json'},sha='a'.repeat(40);
const empty={format:'ot-management-shared',schemaVersion:1,initialized:false,revision:'initial',updatedAt:null,backup:null};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('Public GitHub reads preserve UTF-8, use an exact blob above 1 MB and never send viewer credentials',async()=>{
 assert.equal(decodeContent(encodeContent('Nguyễn Giả lập · 000001')),'Nguyễn Giả lập · 000001');const calls=[];
 const client=createGitHubClient(config,{fetcher:async(url,options)=>{calls.push({url,options});if(url.includes('/git/blobs/'))return new Response(JSON.stringify(empty));return json({type:'file',sha,size:1100000,encoding:'none',content:''});}});
 const result=await client.read();assert.equal(result.sha,sha);assert.deepEqual(result.data,empty);assert.equal(calls.length,2);assert(calls[1].url.endsWith('/git/blobs/'+sha));assert(calls.every(c=>!c.options.headers.Authorization));assert(calls.every(c=>c.options.credentials==='omit'));
});
test('GitHub writes include the expected SHA and branch, keep token solely in the authorization header and reject conflicts',async()=>{
 let request;const client=createGitHubClient(config,{fetcher:async(url,options)=>{request={url,options};return json({content:{sha:'b'.repeat(40)}});}});
 await client.write(empty,{token:'SYNTH_TOKEN',sha});const body=JSON.parse(request.options.body);assert.equal(body.sha,sha);assert.equal(body.branch,'main');assert.equal(request.options.headers.Authorization,'Bearer SYNTH_TOKEN');assert.equal(request.options.body.includes('SYNTH_TOKEN'),false);assert.deepEqual(JSON.parse(decodeContent(body.content)),empty);
 const conflict=createGitHubClient(config,{fetcher:async()=>json({},409)});await assert.rejects(conflict.write(empty,{token:'SYNTH_TOKEN',sha}),e=>e.code==='conflict');await assert.rejects(client.write(empty,{token:'',sha}),e=>e.code==='access');
});
test('Invalid or oversized shared data fail closed; API access failures may fall back to the deployed public JSON',async()=>{
 assert.throws(()=>parseShared('bad json'));assert.throws(()=>parseShared(JSON.stringify({...empty,format:'wrong'})));assert.throws(()=>parseShared(JSON.stringify({...empty,initialized:true})));assert.throws(()=>parseShared(' '.repeat(MAX_SHARED_BYTES+1)));
 let apiStatus=403;const client=createGitHubClient(config,{fallbackURL:'https://example.invalid/data/shared-ot.json',fetcher:async url=>url.startsWith('https://api.github.com')?json({},apiStatus):json(empty)});
 await assert.rejects(client.read(),e=>e.code==='access');const result=await client.read({allowFallback:true});assert.equal(result.fallback,true);assert.equal(result.sha,null);assert.deepEqual(result.data,empty);apiStatus=404;assert.equal((await client.read({allowFallback:true})).fallback,true);
});

test('Provider failures distinguish credentials, rate limits, invalid payloads and protected branches without echoing secrets',async()=>{
 const cases=[
  [401,{message:'Bad credentials'}, {},'access',/hết hạn/],
  [403,{message:'Forbidden'}, {},'access',/Contents: Read and write/],
  [403,{message:'API rate limit exceeded'},{'x-ratelimit-remaining':'0','retry-after':'7'},'rate-limit',/7 giây/],
  [429,{}, {'retry-after':'2'},'rate-limit',/2 giây/],
  [422,{message:'Validation Failed',errors:[{field:'content'},{field:'SYNTH_SECRET'}]}, {},'rejected',/trường content/],
  [403,{message:'Changes must be made through a pull request'}, {},'protected',/Nhánh GitHub/],
 ];
 for(const [status,body,headers,code,pattern] of cases){const client=createGitHubClient(config,{fetcher:async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}})});await assert.rejects(client.write(empty,{token:'SYNTH_SECRET',sha}),error=>error.code===code&&pattern.test(error.message)&&!error.message.includes('SYNTH_SECRET'));}
});
