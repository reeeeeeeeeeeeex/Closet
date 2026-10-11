import { authorizeSync,sha } from "@/lib/sync-server";
import { ApiError,json,failure,digest,sameOrigin } from "@/lib/server";
import { hashSchema, type Asset } from "@/lib/domain";
import { imageMime } from "@/lib/image-type";
type Route={params:Promise<{hash:string}>};
export async function GET(request:Request,route:Route){
  try{
    const hash=hashSchema.parse((await route.params).hash),{db,bucket,owner}=authorizeSync(request);
    const a=db.prepare("SELECT mime,storage_key FROM assets WHERE owner=? AND hash=?").bind(owner,hash).rows<{mime:string;storage_key:string}>()[0];
    const file=a?await bucket.get(a.storage_key):null;if(!a||!file)throw new ApiError(404,"原图不存在");
    return new Response(file.body,{headers:{"Content-Type":a.mime,"Content-Length":String(file.size),"Cache-Control":"no-store"}});
  }catch(e){return failure(e);}
}
export async function PUT(request:Request,route:Route){
  try{
    sameOrigin(request);const hash=hashSchema.parse((await route.params).hash),{db,bucket,owner}=authorizeSync(request);
    const reader=request.body?.getReader();if(!reader)throw new ApiError(400,"图片为空");
    let size=0;const chunks:Uint8Array[]=[];
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20*1024*1024)throw new ApiError(413,"单张图片最多 20 MB");chunks.push(part.value);}}finally{await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const mime=imageMime(bytes);if(!mime||await digest(bytes)!==hash)throw new ApiError(400,"原图校验失败");
    const old=db.prepare("SELECT hash,name,mime,size FROM assets WHERE owner=? AND hash=?").bind(owner,hash).rows<Asset>()[0];
    if(old)return json(old);
    const key=sha(owner)+"/"+hash;await bucket.put(key,bytes.buffer);
    let name=hash;try{name=decodeURIComponent(request.headers.get("x-asset-name")||hash).slice(0,255);}catch{}
    db.prepare("INSERT OR IGNORE INTO assets VALUES (?,?,?,?,?,?,?)").bind(owner,hash,name,mime,size,key,new Date().toISOString()).run();
    return json({hash,name,mime,size});
  }catch(e){return failure(e);}
}
