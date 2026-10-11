package app.newcloset.android

import android.app.Activity
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import androidx.activity.result.ActivityResult
import com.getcapacitor.*
import com.getcapacitor.annotation.*
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URI
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import android.util.Base64

@CapacitorPlugin(name = "ClosetStorage")
class ClosetStoragePlugin : Plugin() {
    private val workers = Executors.newFixedThreadPool(3)
    private val dbLock = Any()
    private lateinit var db: SQLiteDatabase
    private val imageLimit = 20L * 1024 * 1024
    private val archiveLimit = 2L * 1024 * 1024 * 1024
    override fun load() {
        db = SQLiteDatabase.openOrCreateDatabase(File(context.filesDir, "closet.sqlite"), null)
        db.enableWriteAheadLogging()
        db.execSQL("PRAGMA synchronous=FULL")
        db.execSQL("CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE IF NOT EXISTS document_chunks (key TEXT NOT NULL, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(key,part))")
        // Incomplete image uploads and checked archives are temporary, never the only copy of saved data.
        File(context.cacheDir, "closet").mkdirs()
    }
    private fun run(call: PluginCall, action: () -> Unit) { workers.execute { try { action() } catch (e: Exception) { call.reject(e.message ?: "本地操作失败", e) } } }
    private fun text(call: PluginCall, key: String): String = call.getString(key) ?: throw IOException("缺少参数: $key")
    private fun safeId(value: String): String { require(value.matches(Regex("[a-fA-F0-9-]{36}"))) { "标识无效" }; return value }
    private fun safeHash(value: String): String { require(value.matches(Regex("[a-f0-9]{64}"))) { "图片标识无效" }; return value }
    private fun media(owner: String, hash: String) = File(File(File(context.filesDir,"media"),safeId(owner)),safeHash(hash))
    private fun temp(handle: String) = File(File(context.cacheDir,"closet"),safeId(handle))
    private fun digest(file: File): String { val hash = MessageDigest.getInstance("SHA-256"); file.inputStream().use { input -> val b=ByteArray(65536); while(true){val n=input.read(b);if(n<0)break;hash.update(b,0,n)} }; return hash.digest().joinToString("") { "%02x".format(it) } }
    private fun copyLimited(input: InputStream, output: OutputStream, limit: Long): Long { var total=0L;val b=ByteArray(65536);while(true){val n=input.read(b);if(n<0)break;total+=n;require(total<=limit){"文件大小超出限制"};output.write(b,0,n)};return total }
    private fun install(source: File, target: File) {
        target.parentFile!!.mkdirs()
        if(target.exists()) { require(digest(target)==target.name){"已存储原图校验失败"};return }
        val pending=File(target.parentFile,target.name+"."+UUID.randomUUID()+".tmp")
        try { FileOutputStream(pending).use { out -> source.inputStream().use { copyLimited(it,out,imageLimit) };out.fd.sync() };require(pending.renameTo(target)){"原图写入失败，可能存储空间不足"} } finally { pending.delete() }
    }
    private fun mime(file: File): String {
        val b=ByteArray(16);val size=file.inputStream().use { it.read(b) };require(size>=12){"图片格式无效"}
        fun ascii(a:Int,z:Int)=String(b,a,z-a,Charsets.US_ASCII)
        return when {
            b[0].toInt() and 255==255 && b[1].toInt() and 255==216 && b[2].toInt() and 255==255 -> "image/jpeg"
            b[0].toInt() and 255==137 && ascii(1,4)=="PNG" -> "image/png"
            ascii(0,4)=="RIFF" && ascii(8,12)=="WEBP" -> "image/webp"
            ascii(0,3)=="GIF" -> "image/gif"
            ascii(4,8)=="ftyp" && ascii(8,12) in listOf("avif","avis") -> "image/avif"
            else -> throw IOException("支持 JPG、PNG、WebP、GIF 和 AVIF 原图。HEIC 请先转换。")
        }
    }
    @PluginMethod fun read(call: PluginCall) = run(call) {
        val key=text(call,"key"); synchronized(dbLock) {
            db.rawQuery("SELECT revision,value FROM documents WHERE key=?",arrayOf(key)).use { row ->
                val out=JSObject().put("filesRoot",context.filesDir.absolutePath)
                if(row.moveToFirst()) {
                    val value=StringBuilder(row.getString(1))
                    db.rawQuery("SELECT value FROM document_chunks WHERE key=? ORDER BY part",arrayOf(key)).use { chunks -> while(chunks.moveToNext())value.append(chunks.getString(0)) }
                    out.put("revision",row.getInt(0)).put("value",value.toString())
                } else out.put("revision",0).put("value",JSONObject.NULL)
                call.resolve(out)
            }
        }
    }
    @PluginMethod fun write(call: PluginCall) = run(call) {
        val key=text(call,"key");val expected=call.getInt("expected")!!;val value=text(call,"value")
        require(value.toByteArray().size<=64*1024*1024){"账号资料过大，请拆分账号"}
        val json=JSONObject(value)
        if(key.startsWith("profile:")) {
            val owner=safeId(key.removePrefix("profile:"));val assets=json.getJSONObject("replica").getJSONArray("assets")
            for(i in 0 until assets.length()){val a=assets.getJSONObject(i);val file=media(owner,a.getString("hash"));require(file.isFile && file.length()==a.getLong("size")){"原图尚未完整保存"}}
        }
        synchronized(dbLock) {
            db.beginTransaction()
            try {
                val revision=db.rawQuery("SELECT revision FROM documents WHERE key=?",arrayOf(key)).use { if(it.moveToFirst())it.getInt(0) else 0 }
                require(revision==expected){"本地资料已改变，请重试"}
                db.execSQL("INSERT OR REPLACE INTO documents (key,revision,value) VALUES (?,?,?)",arrayOf(key,revision+1,""))
                db.execSQL("DELETE FROM document_chunks WHERE key=?",arrayOf(key))
                var offset=0;var part=0
                while(offset<value.length){var end=minOf(offset+65536,value.length);if(end<value.length && Character.isHighSurrogate(value[end-1]))end--;db.execSQL("INSERT INTO document_chunks VALUES (?,?,?)",arrayOf(key,part++,value.substring(offset,end)));offset=end}
                db.setTransactionSuccessful()
                // Resolve only after endTransaction has committed.
            } finally { db.endTransaction() }
        }
        call.resolve(JSObject().put("revision",expected+1))
    }
    @PluginMethod fun beginFile(call: PluginCall) = run(call) { safeId(text(call,"owner"));val handle=UUID.randomUUID().toString();temp(handle).createNewFile();call.resolve(JSObject().put("handle",handle)) }
    @PluginMethod fun appendFile(call: PluginCall) = run(call) { val file=temp(text(call,"handle"));require(file.isFile){"临时图片不存在"};val bytes=Base64.decode(text(call,"data"),Base64.DEFAULT);require(bytes.size<=256*1024 && file.length()+bytes.size<=imageLimit){"单张图片最多 20 MB"};FileOutputStream(file,true).use { it.write(bytes) };call.resolve() }
    @PluginMethod fun finishFile(call: PluginCall) = run(call) {
        val file=temp(text(call,"handle"));try { val type=mime(file);val hash=digest(file);install(file,media(text(call,"owner"),hash));call.resolve(JSObject().put("asset",JSObject().put("hash",hash).put("mime",type).put("size",file.length()).put("name",text(call,"name").take(255)))) } finally { file.delete() }
    }
    @PluginMethod fun pickArchive(call: PluginCall) {
        val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/zip","application/octet-stream","application/x-zip-compressed"))
        startActivityForResult(call,intent,"archiveSelected")
    }
    @ActivityCallback private fun archiveSelected(call: PluginCall?,result: ActivityResult) {
        if(call==null)return
        if(result.resultCode!=Activity.RESULT_OK || result.data?.data==null){call.resolve(JSObject().put("cancelled",true));return}
        run(call) {
            val uri=result.data!!.data!!;val handle=UUID.randomUUID().toString();val directory=temp(handle);directory.mkdirs()
            try {
                val names=HashSet<String>();var total=0L;var count=0
                context.contentResolver.openInputStream(uri)!!.use { raw -> ZipInputStream(BufferedInputStream(raw)).use { zip ->
                    while(true){val entry=zip.nextEntry ?: break;count++;require(count<=4002 && names.add(entry.name)){"备份文件重复或过多"}
                        require(entry.name=="manifest.json" || entry.name=="README.txt" || entry.name=="assets/" || entry.name.matches(Regex("assets/[a-f0-9]{64}\\.(jpeg|png|webp|gif|avif)"))){"备份含有无法识别的文件路径"}
                        if(entry.name=="assets/"){zip.closeEntry();continue}
                        val limit=if(entry.name=="manifest.json")3L*1024*1024 else if(entry.name=="README.txt")65536L else imageLimit
                        val target=File(directory,entry.name);target.parentFile!!.mkdirs();FileOutputStream(target).use { total+=copyLimited(zip,it,limit);require(total<=archiveLimit){"备份解压大小超出限制"} };zip.closeEntry()
                    }
                } }
                val manifest=JSONObject(File(directory,"manifest.json").readText());val assets=manifest.getJSONArray("assets");require(assets.length()<=2000){"备份原图过多"}
                val expected=HashSet<String>()
                for(i in 0 until assets.length()){val a=assets.getJSONObject(i);val hash=safeHash(a.getString("hash"));val name="assets/$hash.${a.getString("mime").substringAfter('/')}";expected.add(name);val file=File(directory,name);require(file.isFile && file.length()==a.getLong("size") && digest(file)==hash && mime(file)==a.getString("mime")){"备份原图缺失或 SHA-256 校验失败"}}
                require(expected.size==assets.length() && names.filter { it.startsWith("assets/") && it!="assets/" }.toSet()==expected){"图片清单与实际文件数量不一致"}
                call.resolve(JSObject().put("handle",handle).put("manifest",JSObject(manifest.toString())))
            }catch(e:Exception){directory.deleteRecursively();throw e}
        }
    }
    @PluginMethod fun importStaged(call: PluginCall) = run(call) {
        val directory=temp(text(call,"handle"));val owner=text(call,"owner");val assets=JSONObject(File(directory,"manifest.json").readText()).getJSONArray("assets")
        for(i in 0 until assets.length()){val a=assets.getJSONObject(i);val hash=safeHash(a.getString("hash"));val file=File(directory,"assets/$hash.${a.getString("mime").substringAfter('/')}");require(digest(file)==hash){"备份原图校验失败"};install(file,media(owner,hash))};call.resolve()
    }
    private fun offerSave(call:PluginCall,file:File,name:String,type:String) {
        call.data.put("saveSource",file.absolutePath);call.data.put("saveTemporary",file.parentFile==File(context.cacheDir,"closet"))
        val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type).putExtra(Intent.EXTRA_TITLE,name)
        activity.runOnUiThread { startActivityForResult(call,intent,"fileDestination") }
    }
    @PluginMethod fun exportArchive(call:PluginCall)=run(call){
        val owner=text(call,"owner");val manifest=call.getObject("manifest")!!;val assets=manifest.getJSONArray("assets");val file=temp(UUID.randomUUID().toString())
        try {
            FileOutputStream(file).use { stream -> ZipOutputStream(BufferedOutputStream(stream)).use { zip ->
                fun entry(name:String,bytes:ByteArray){zip.putNextEntry(ZipEntry(name));zip.write(bytes);zip.closeEntry()}
                entry("manifest.json",manifest.toString().toByteArray());entry("README.txt","New Closet backup v9. Original images retain exact bytes. No pairing credentials included.\n".toByteArray())
                var total=0L
                for(i in 0 until assets.length()){val a=assets.getJSONObject(i);val hash=a.getString("hash");val source=media(owner,hash);require(source.length()==a.getLong("size") && digest(source)==hash){"原图校验失败，备份已停止"};zip.putNextEntry(ZipEntry("assets/$hash.${a.getString("mime").substringAfter('/')}"));source.inputStream().use{total+=copyLimited(it,zip,imageLimit)};require(total<=archiveLimit){"首版支持 2 GB 以内的备份包"};zip.closeEntry()}
            } }
            offerSave(call,file,text(call,"filename"),"application/zip")
        }catch(e:Exception){file.delete();throw e}
    }
    @PluginMethod fun saveAsset(call:PluginCall)=run(call){val a=JSONObject(call.getObject("asset")!!.toString());val file=media(text(call,"owner"),a.getString("hash"));require(file.isFile && digest(file)==a.getString("hash")){"原图校验失败"};offerSave(call,file,a.getString("name"),a.getString("mime"))}
    @ActivityCallback private fun fileDestination(call:PluginCall?,result:ActivityResult){
        if(call==null)return
        run(call){val file=File(text(call,"saveSource"));try{val uri=result.data?.data;if(result.resultCode!=Activity.RESULT_OK || uri==null){call.resolve(JSObject().put("saved",false));return@run};context.contentResolver.openOutputStream(uri,"wt")!!.use { out -> file.inputStream().use { copyLimited(it,out,archiveLimit+4*1024*1024) };out.flush() };call.resolve(JSObject().put("saved",true))}finally{if(call.getBoolean("saveTemporary",false)==true)file.delete()}}
    }
    private fun connection(call:PluginCall):HttpURLConnection {
        val uri=URI(text(call,"url"));require(uri.scheme in listOf("http","https") && uri.userInfo==null && uri.fragment==null && uri.host!=null){"请输入有效的局域网电脑地址"}
        require(InetAddress.getAllByName(uri.host).all { it.isSiteLocalAddress || it.isLinkLocalAddress || it.isLoopbackAddress }){"首版只支持局域网地址"}
        val connection=uri.toURL().openConnection() as HttpURLConnection;connection.instanceFollowRedirects=false;connection.connectTimeout=10000;connection.readTimeout=60000
        call.getString("token")?.let { connection.setRequestProperty("Authorization","Bearer $it") };return connection
    }
    @PluginMethod fun http(call:PluginCall)=run(call){
        val c=connection(call);try{c.requestMethod=text(call,"method");call.getString("body")?.let { body -> c.doOutput=true;c.setRequestProperty("Content-Type","application/json");val bytes=body.toByteArray();require(bytes.size<=32*1024*1024){"同步清单过大"};c.setFixedLengthStreamingMode(bytes.size);c.outputStream.use { it.write(bytes) } }
            val status=c.responseCode;val out=ByteArrayOutputStream();(if(status in 200..299)c.inputStream else c.errorStream)?.use { copyLimited(it,out,32L*1024*1024) };call.resolve(JSObject().put("status",status).put("body",out.toString("UTF-8")))
        }finally{c.disconnect()}
    }
    @PluginMethod fun transfer(call:PluginCall)=run(call){
        val a=JSONObject(call.getObject("asset")!!.toString());val hash=safeHash(a.getString("hash"));val file=media(text(call,"owner"),hash);val direction=text(call,"direction");val c=connection(call)
        try{
            if(direction=="upload"){
                require(file.isFile && file.length()==a.getLong("size") && digest(file)==hash){"本地原图校验失败"};c.requestMethod="PUT";c.doOutput=true;c.setRequestProperty("Content-Type",a.getString("mime"));c.setRequestProperty("X-Asset-Name",java.net.URLEncoder.encode(a.getString("name"),"UTF-8").replace("+","%20"));c.setFixedLengthStreamingMode(file.length());c.outputStream.use { out -> file.inputStream().use { copyLimited(it,out,imageLimit) } };require(c.responseCode in 200..299){"原图上传失败 (${c.responseCode})"}
            }else{
                c.requestMethod="GET";require(c.responseCode==200){"原图下载失败 (${c.responseCode})"};val pending=temp(UUID.randomUUID().toString());try{FileOutputStream(pending).use{out->c.inputStream.use{copyLimited(it,out,imageLimit)};out.fd.sync()};require(pending.length()==a.getLong("size") && digest(pending)==hash && mime(pending)==a.getString("mime")){"收到的原图校验失败"};install(pending,file)}finally{pending.delete()}
            };call.resolve()
        }finally{c.disconnect()}
    }
}
