package app.newcloset.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Phone AI credentials and provider requests never cross the WebView bridge. */
class ClosetAi(private val context: Context, private val db: SQLiteDatabase, private val lock: Any) {
    private val connections = ConcurrentHashMap<String, HttpURLConnection>()
    private val cancelled = ConcurrentHashMap.newKeySet<String>()
    private val alias = "closet-model-key-v1"
    private fun text(call: PluginCall, name: String) = call.getString(name) ?: throw IOException("缺少参数: $name")
    private fun document(key: String): JSONObject? = synchronized(lock) {
        db.rawQuery("SELECT value FROM documents WHERE key=?", arrayOf(key)).use { row ->
            if (!row.moveToFirst()) return@synchronized null
            val value = StringBuilder(row.getString(0))
            db.rawQuery("SELECT value FROM document_chunks WHERE key=? ORDER BY part", arrayOf(key)).use { chunks -> while (chunks.moveToNext()) value.append(chunks.getString(0)) }
            JSONObject(value.toString())
        }
    }
    private fun owner(call: PluginCall): String {
        val owner = text(call, "owner")
        require(owner.matches(Regex("[a-fA-F0-9-]{36}"))) { "标识无效" }
        require(document("root")?.optString("current") == owner) { "账号已切换，请重新载入" }
        return owner
    }
    private fun store(owner: String, value: JSONObject?) = synchronized(lock) {
        val key = "ai:$owner"
        db.beginTransaction()
        try {
            val revision = db.rawQuery("SELECT revision FROM documents WHERE key=?", arrayOf(key)).use { if (it.moveToFirst()) it.getInt(0) else 0 }
            if (value == null) db.delete("documents", "key=?", arrayOf(key))
            else db.execSQL("INSERT OR REPLACE INTO documents VALUES (?,?,?)", arrayOf(key, revision + 1, value.toString()))
            db.delete("document_chunks", "key=?", arrayOf(key)); db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    private fun secretKey(): SecretKey = synchronized(lock) {
        val store = KeyStore.getInstance("AndroidKeyStore"); store.load(null)
        if (store.containsAlias(alias)) return@synchronized store.getKey(alias, null) as SecretKey
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        generator.generateKey()
    }
    private fun encrypt(owner: String, value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey()); cipher.updateAAD(owner.toByteArray())
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }
    private fun decrypt(owner: String, value: String): String {
        val parts = value.split('.')
        val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))); cipher.updateAAD(owner.toByteArray())
        return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    }
    private fun publicSettings(value: JSONObject) = JSObject().put("provider", value.getString("provider")).put("baseUrl", value.getString("baseUrl")).put("model", value.getString("model")).put("hasKey", true).put("scopes", value.getJSONArray("scopes"))
    fun settings(call: PluginCall) { val owner = owner(call); val value = document("ai:$owner"); call.resolve(JSObject().put("settings", value?.let { publicSettings(it) } ?: JSONObject.NULL)) }
    private fun checkedUrl(value: String): URI {
        val uri = URI(value)
        require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null) { "请输入有效的模型服务地址" }
        require(uri.scheme == "https" || (uri.scheme == "http" && InetAddress.getAllByName(uri.host).all { it.isSiteLocalAddress || it.isLoopbackAddress || it.isLinkLocalAddress })) { "模型服务需使用 HTTPS；本机或局域网模型可使用 HTTP" }
        return uri
    }
    fun saveSettings(call: PluginCall) {
        val owner = owner(call); val input = call.getObject("settings") ?: throw IOException("缺少模型设置")
        val provider = input.getString("provider") ?: throw IOException("模型接口类型无效"); require(provider in listOf("openai", "anthropic")) { "模型接口类型无效" }
        val url = (input.getString("baseUrl") ?: throw IOException("请填写服务地址")).trim().trimEnd('/'); require(url.length <= 1000); checkedUrl(url)
        val model = (input.getString("model") ?: throw IOException("请填写模型名")).trim(); require(model.isNotEmpty() && model.length <= 200) { "请填写模型名" }
        val scopes = input.getJSONArray("scopes"); val scopeList = (0 until scopes.length()).map { scopes.getString(it) }
        require(scopeList.size in 1..4 && scopeList.distinct().size == scopeList.size && "read" in scopeList && scopeList.all { it in listOf("read", "photos", "sizes", "write") }) { "需保留读取资料权限，权限不能重复" }
        val old = document("ai:$owner"); val key = input.optString("apiKey", "").trim(); require(key.length <= 4000)
        require(key.all { it.code in 33..126 }) { "API Key 需为一串可见字符，不能包含空白或换行" }
        require(key.isNotEmpty() || (old?.optString("provider") == provider && old?.optString("baseUrl") == url)) { "首次配置或更换服务地址时，请填写 API Key；无密钥的本机服务可填写 local" }
        val encrypted = if (key.isNotEmpty()) encrypt(owner, key) else old!!.getString("encryptedKey")
        val value = JSONObject().put("provider", provider).put("baseUrl", url).put("model", model).put("scopes", scopes).put("encryptedKey", encrypted)
        store(owner, value); call.resolve(JSObject().put("settings", publicSettings(value)))
    }
    fun clearSettings(call: PluginCall) { store(owner(call), null); call.resolve() }
    fun cancel(call: PluginCall) { val id = text(call, "requestId"); cancelled.add(id); connections.remove(id)?.disconnect(); call.resolve() }
    fun request(call: PluginCall) {
        val owner = owner(call); val id = text(call, "requestId"); require(id.matches(Regex("[a-fA-F0-9-]{36}"))) { "请求编号无效" }
        var connection: HttpURLConnection? = null
        try {
            require(!cancelled.contains(id)) { "请求已停止" }
            val settings = document("ai:$owner") ?: throw IOException("请先配置模型服务")
            val provider = settings.getString("provider"); val key = decrypt(owner, settings.getString("encryptedKey"))
            val url = checkedUrl(settings.getString("baseUrl") + if (provider == "openai") "/chat/completions" else "/messages")
            val body = JSONObject(text(call, "body")).put("model", settings.getString("model")).toString().toByteArray(); require(body.size <= 16 * 1024 * 1024) { "模型请求过大，请分批查看照片" }
            val c = url.toURL().openConnection() as HttpURLConnection; connection = c; connections[id] = c
            require(!cancelled.contains(id)) { "请求已停止" }
            c.requestMethod = "POST"; c.instanceFollowRedirects = false; c.connectTimeout = 10000; c.readTimeout = 180000; c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            if (provider == "openai") c.setRequestProperty("Authorization", "Bearer $key") else { c.setRequestProperty("x-api-key", key); c.setRequestProperty("anthropic-version", "2023-06-01") }
            c.setFixedLengthStreamingMode(body.size); c.outputStream.use { it.write(body) }
            val status = c.responseCode; val output = ByteArrayOutputStream()
            (if (status in 200..299) c.inputStream else c.errorStream)?.use { stream -> val buffer = ByteArray(65536); while (true) { val count = stream.read(buffer); if (count < 0) break; require(output.size() + count <= 2 * 1024 * 1024) { "模型返回内容过大" }; output.write(buffer, 0, count) } }
            require(!cancelled.contains(id)) { "请求已停止" }; owner(call)
            call.resolve(JSObject().put("status", status).put("body", if (status in 200..299) output.toString("UTF-8") else ""))
        } finally { connections.remove(id); connection?.disconnect(); cancelled.remove(id) }
    }
    fun preview(call: PluginCall) {
        val owner = owner(call); val scopes = document("ai:$owner")?.getJSONArray("scopes") ?: throw IOException("请先配置模型服务")
        require((0 until scopes.length()).any { scopes.getString(it) == "photos" }) { "此连接没有照片权限" }
        val hash = text(call, "hash"); require(hash.matches(Regex("[a-f0-9]{64}"))) { "图片标识无效" }
        val size = call.getInt("size") ?: 1024; require(size in listOf(1024, 1536)) { "预览尺寸无效" }
        val file = File(File(File(context.filesDir, "media"), owner), hash); require(file.isFile) { "原图暂时不可用" }
        val digest = MessageDigest.getInstance("SHA-256"); file.inputStream().use { stream -> val buffer = ByteArray(65536); while (true) { val n = stream.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) } }
        require(digest.digest().joinToString("") { "%02x".format(it) } == hash) { "原图校验失败" }
        val decoded = ImageDecoder.decodeBitmap(ImageDecoder.createSource(file)) { decoder, info, _ ->
            require(info.size.width.toLong() * info.size.height <= 40_000_000) { "图片尺寸过大，请先裁剪" }
            val scale = minOf(1.0, size.toDouble() / maxOf(info.size.width, info.size.height)); decoder.setTargetSize(maxOf(1, (info.size.width * scale).toInt()), maxOf(1, (info.size.height * scale).toInt())); decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        try {
            val bitmap = Bitmap.createBitmap(decoded.width, decoded.height, Bitmap.Config.ARGB_8888)
            try { val canvas = Canvas(bitmap); canvas.drawColor(Color.WHITE); canvas.drawBitmap(decoded, 0f, 0f, null); val output = ByteArrayOutputStream(); require(bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output)); require(output.size() <= 1500 * 1024) { "图片预览过大，请改用 1024 尺寸" }; owner(call); call.resolve(JSObject().put("mimeType", "image/jpeg").put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP))) }
            finally { bitmap.recycle() }
        } finally { decoded.recycle() }
    }
}
