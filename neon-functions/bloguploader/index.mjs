import { createHash, createHmac, randomUUID } from "node:crypto";
const BUCKET = process.env.BLOG_MEDIA_BUCKET || "apokolips-blog-media";
const DATA_API = (process.env.BLOG_DATA_API_URL || "https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1").replace(/\/+$/, "");
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://apokolips.xyz,https://www.apokolips.xyz").split(",").map(x => x.trim()).filter(Boolean);
const IMAGES = new Set(["image/jpeg","image/png","image/webp","image/avif","image/gif"]);
const VIDEOS = new Set(["video/mp4","video/webm","video/quicktime","video/x-m4v","video/ogg"]);
const EXT = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif","image/gif":"gif","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/x-m4v":"m4v","video/ogg":"ogv"};
function cors(origin) {
 const h={"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type, X-Neon-Token","Access-Control-Max-Age":"86400","Vary":"Origin"};
 if(origin&&ORIGINS.includes(origin))h["Access-Control-Allow-Origin"]=origin;
 return h;
}
function json(data,status,headers={}) {
 return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
}
function hash(v){return createHash("sha256").update(v).digest("hex");}
function mac(k,v,encoding){return createHmac("sha256",k).update(v).digest(encoding);}
function signingKey(secret,date,region){
 const a=mac("AWS4"+secret,date),b=mac(a,region),c=mac(b,"s3");
 return mac(c,"aws4_request");
}
async function storage(method,key,body,type){
 const access=process.env.AWS_ACCESS_KEY_ID,secret=process.env.AWS_SECRET_ACCESS_KEY;
 let endpoint=process.env.AWS_ENDPOINT_URL_S3||"";
 while(endpoint.endsWith("/"))endpoint=endpoint.slice(0,-1);
 const region=process.env.AWS_REGION||"ap-southeast-1";
 if(!access||!secret||!endpoint)throw new Error("Neon object storage is not configured for this service.");
 const url=new URL(endpoint+"/"+BUCKET+"/"+key);
 const iso=new Date().toISOString();
 const amz=iso.slice(0,19).replace(/[-:]/g,"")+"Z";
 const date=amz.slice(0,8),bytes=body||new Uint8Array(),payloadHash=hash(bytes);
 const headers={host:url.host,"x-amz-content-sha256":payloadHash,"x-amz-date":amz};
 if(type)headers["content-type"]=type;
 const names=Object.keys(headers).sort();
 const canonicalHeaders=names.map(k=>k+":"+String(headers[k]).trim()+"\n").join("");
 const signed=names.join(";");
 const canonical=[method,url.pathname,"",canonicalHeaders,signed,payloadHash].join("\n");
 const scope=date+"/"+region+"/s3/aws4_request";
 const toSign=["AWS4-HMAC-SHA256",amz,scope,hash(canonical)].join("\n");
 const sig=mac(signingKey(secret,date,region),toSign,"hex");
 const auth="AWS4-HMAC-SHA256 Credential="+access+"/"+scope+", SignedHeaders="+signed+", Signature="+sig;
 const h={"x-amz-content-sha256":payloadHash,"x-amz-date":amz,"Authorization":auth};
 if(type)h["Content-Type"]=type;
 const response=await fetch(url,{method,headers:h,body:method==="PUT"?bytes:undefined});
 if(!response.ok)throw new Error("Media storage rejected the file ("+response.status+"): "+(await response.text().catch(()=>"")).slice(0,350));
}
async function rpc(name,body,jwt){
 const r=await fetch(DATA_API+"/rpc/"+name,{method:"POST",headers:{"Authorization":"Bearer "+jwt,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(body)});
 const t=await r.text();
 if(!r.ok)throw new Error("Database request failed ("+r.status+"): "+t.slice(0,450));
 if(!t)return null;
 try{return JSON.parse(t);}catch{return t;}
}
function sessionToken(req){
 const h=req.headers.get("Authorization")||"";
 return h.startsWith("Bearer ")?h.slice(7).trim():"";
}
function safeFilename(value){
 return String(value||"upload").split("/").pop().split("\\").pop().replace(/[^A-Za-z0-9._ -]/g,"_").slice(0,220)||"upload";
}
async function publish(req){
 const token=sessionToken(req),jwt=req.headers.get("X-Neon-Token")||"";
 if(!token||token.length!==64||!jwt)return json({error:"Your login session is missing. Please log in again."},401);
 const ok=await rpc("bloguploader_check_session",{input_token:token},jwt);
 if(!(ok===true||(Array.isArray(ok)&&ok[0]===true)))return json({error:"Your login session has expired. Please log in again."},401);
 let form;
 try{form=await req.formData();}catch{return json({error:"Could not read the upload form. Please try again."},400);}
 const type=String(form.get("type")||""),description=String(form.get("description")||"").trim();
 if(!["image","video","text"].includes(type))return json({error:"Choose a valid post type."},400);
 if(!description||description.length>20000)return json({error:"Add a description (maximum 20,000 characters)."},400);
 const file=form.get("file");
 let filename=null,mediaKey=null,mediaUrl=null,contentType=null,mediaSize=null;
 if(type==="text"){
  if(file&&typeof file.arrayBuffer==="function"&&file.size>0)return json({error:"Text posts do not need a media file."},400);
 }else{
  if(!file||typeof file.arrayBuffer!=="function"||typeof file.size!=="number"||file.size<1)return json({error:"Choose an image or video file first."},400);
  if(file.size>MAX_FILE_BYTES)return json({error:"Media file is too large. Maximum size is 80 MB."},413);
  contentType=String(file.type||"").toLowerCase();
  if((type==="image"&&!IMAGES.has(contentType))||(type==="video"&&!VIDEOS.has(contentType)))return json({error:"This format is not supported for the selected post type."},415);
  filename=safeFilename(file.name);mediaSize=file.size;
  mediaKey="posts/"+new Date().toISOString().slice(0,10)+"-"+randomUUID()+"."+EXT[contentType];
  mediaUrl="https://br-silent-frost-b3chnc64.storage.c-4.ap-southeast-1.aws.neon.tech/"+BUCKET+"/"+mediaKey;
  await storage("PUT",mediaKey,new Uint8Array(await file.arrayBuffer()),contentType);
 }
 try{
  const rows=await rpc("bloguploader_publish",{input_token:token,input_type:type,input_description:description,input_filename:filename,input_media_key:mediaKey,input_media_url:mediaUrl,input_content_type:contentType,input_media_size:mediaSize},jwt);
  const row=Array.isArray(rows)?rows[0]:rows;
  if(!row||!row.slug)throw new Error("The database did not return the saved post record.");
  return json({ok:true,slug:row.slug,filename:row.filename||row.slug},201);
 }catch(error){
  if(mediaKey){try{await storage("DELETE",mediaKey,new Uint8Array(),null);}catch(cleanup){console.error("Cleanup after publish failure:",cleanup);}}
  throw error;
 }
}
export default {async fetch(request){
 const origin=request.headers.get("Origin")||"";
 if(origin&&!ORIGINS.includes(origin))return json({error:"Origin not allowed."},403);
 const headers=cors(origin);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 let path=new URL(request.url).pathname;
 while(path.length>1&&path.endsWith("/"))path=path.slice(0,-1);
 if(request.method==="GET"&&path==="/health"){
  const ready=Boolean(process.env.AWS_ACCESS_KEY_ID&&process.env.AWS_SECRET_ACCESS_KEY&&process.env.AWS_ENDPOINT_URL_S3);
  return json({ok:true,storageConfigured:ready,githubRequired:false,maxFileBytes:MAX_FILE_BYTES},200,headers);
 }
 if(request.method==="POST"&&path==="/publish"){
  try{const result=await publish(request);return json(await result.json(),result.status,headers);}
  catch(error){console.error("Blog publish failed:",error);return json({error:error?.message||"Publishing failed. Please try again."},500,headers);}
 }
 return json({error:"Not found."},404,headers);
}};
