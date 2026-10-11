package app.newcloset.android

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import android.os.SystemClock
import android.view.MotionEvent
import java.io.File
import java.util.zip.ZipFile
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction

@RunWith(AndroidJUnit4::class)
class ClosetInstrumentedTest {
    private fun eval(scenario:ActivityScenario<MainActivity>,script:String):String {
        val latch=CountDownLatch(1);var result="null"
        scenario.onActivity { it.bridge.webView.evaluateJavascript(script) { value -> result=value;latch.countDown() } }
        assertTrue("WebView evaluation timed out",latch.await(10,TimeUnit.SECONDS));return result
    }
    private fun runJs(scenario:ActivityScenario<MainActivity>,script:String):JSONObject {
        eval(scenario,"window.__closetTestResult=null;(async()=>{$script})().then(value=>window.__closetTestResult={ok:true,value},e=>window.__closetTestResult={ok:false,error:String(e.message||e)});true")
        repeat(300){val result=eval(scenario,"window.__closetTestResult");if(result!="null"){val parsed=JSONObject(result);assertTrue(parsed.optString("error"),parsed.getBoolean("ok"));return parsed};Thread.sleep(100)}
        throw AssertionError("Native call timed out")
    }
    private fun ready(scenario:ActivityScenario<MainActivity>){
        repeat(150){if(eval(scenario,"!!(window.Capacitor && window.Capacitor.Plugins.ClosetStorage && document.querySelector('.topbar')?.innerText.includes('已保存到手机'))")=="true")return;Thread.sleep(100)}
        throw AssertionError("App did not open offline: "+eval(scenario,"document.body.innerText"))
    }
    private fun loadClient(scenario:ActivityScenario<MainActivity>){
        val source=InstrumentationRegistry.getInstrumentation().context.assets.open("client-test.js").bufferedReader().use { it.readText() }
        eval(scenario,source+";true")
    }
    @Test fun offlineAccountAndAllRecordTypes(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario);loadClient(scenario)
            runJs(scenario,"""
                const c=ClosetTest,root=await c.bootstrap(),originalOwner=root.current;let owner=originalOwner;
                const request=async(path,body)=>{const response=await c.androidClient.request(path,{method:body?'POST':'GET',headers:{'X-Closet-Profile':owner},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(value.error);return value};
                const created=await request('/api/profiles',{action:'create',name:'Offline test '+Date.now()});owner=created.profile.id;c.setProfileContext(owner);
                const state=await request('/api/closet');if(state.records.length)throw Error('Account leaked records');
                const raw=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII='),x=>x.charCodeAt(0));
                const photo=await c.androidClient.uploadAsset(new File([raw],'native.png',{type:'image/png'}),owner);
                const image=new Image();image.src=c.localAssetUrl(photo.hash,owner);await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Local photo did not decode'))});const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0);if(canvas.getContext('2d').getImageData(0,0,1,1).data.length!==4)throw Error('Local photo pixels unavailable for color sampling');
                const save=(kind,data,extra={})=>request('/api/closet',{op:'save',kind,data,collectionId:state.collectionId,...extra});
                const item=await save('item',{name:'Original snapshot name',category:'top',color:'',colorStyle:{mode:'solid',values:[{name:'Native violet',hex:'#AABBCC'}]},asset:photo.hash,photos:[photo.hash],seasons:[],occasions:[],notes:'',archived:false,measurements:{chest:91}});
                const outfit=await save('outfit',{name:'Native outfit',itemIds:[item.id],asset:null,occasions:[],notes:'',archived:false});
                await save('calendar',{date:'2026-10-11',status:'worn',outfitId:outfit.id,notes:''});
                await save('subset',{name:'Native group',scope:'item',root:'all',parentId:null,memberIds:[item.id]});
                await save('personalSizes',{measurements:{height:170},shoeSize:{eu:40,cn:250}});
                let saved=await request('/api/closet'),record=saved.records.find(r=>r.id===item.id);await save('item',{...record.data,name:'Changed later'},{id:item.id,version:record.version});
                saved=await request('/api/closet');if(saved.records.length!==5||saved.records.find(r=>r.kind==='calendar').data.snapshot.items[0].data.name!=='Original snapshot name'||!saved.colorLibrary.some(v=>v.name==='Native violet'))throw Error('Offline records or snapshot mismatch');
                const manifest=c.manifestFromState(saved);if(JSON.stringify(manifest).includes('binding'))throw Error('Backup leaked pairing');
                await request('/api/profiles',{action:'select',id:originalOwner});owner=originalOwner;c.setProfileContext(owner);if((await request('/api/closet')).records.some(r=>r.id===item.id))throw Error('Account isolation failed');
                return {records:saved.records.length,photo:photo.hash};
            """.trimIndent())
        }
    }
    @Test fun offlineStorageOriginalBytesAndRestart(){
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario)
            val result=runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage;
                const root=JSON.parse((await n.read({key:'root'})).value);
                const before=await n.read({key:'instrument-large'});
                const value=JSON.stringify({note:'离线📷'.repeat(350000)});
                const saved=await n.write({key:'instrument-large',expected:before.revision,value});
                if((await n.read({key:'instrument-large'})).value!==value)throw Error('Large SQLite document mismatch');
                let stale=false;try{await n.write({key:'instrument-large',expected:before.revision,value:'{}'})}catch{stale=true}
                if(!stale)throw Error('Stale write accepted');
                const {handle}=await n.beginFile({owner:root.current});
                await n.appendFile({handle,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII='});
                const {asset}=await n.finishFile({handle,owner:root.current,name:'原图.png'});
                const bytes=await (await fetch(window.Capacitor.convertFileSrc((await n.read({key:'root'})).filesRoot+'/media/'+root.current+'/'+asset.hash))).arrayBuffer();
                const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
                if(hash!==asset.hash||bytes.byteLength!==asset.size)throw Error('Original bytes changed');
                return {bytes:asset.size,revision:saved.revision};
            """.trimIndent())
            assertTrue(result.getJSONObject("value").getInt("bytes")>0)
            scenario.recreate();ready(scenario)
            runJs(scenario,"const d=await window.Capacitor.Plugins.ClosetStorage.read({key:'instrument-large'});if(JSON.parse(d.value).note.length!==1400000)throw Error('Restart lost SQLite data');return true;")
        }
    }
    @Test fun localNetworkAndImageVerification(){
        val args=InstrumentationRegistry.getArguments();val address=args.getString("closetAddress") ?: return
        val code=args.getString("closetCode")!!
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario);loadClient(scenario)
            runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage,root=JSON.parse((await n.read({key:'root'})).value);
                const address=${JSONObject.quote(address)};
                const paired=await n.http({url:address+'/api/sync/pair',method:'POST',body:JSON.stringify({protocolVersion:1,code:${JSONObject.quote(code)},deviceId:root.deviceId,name:'Android instrumentation'})});
                if(paired.status!==200)throw Error(paired.body);const pair=JSON.parse(paired.body);
                const response=await n.http({url:address+'/api/sync/state',method:'GET',token:pair.token});if(response.status!==200)throw Error(response.body);
                const state=JSON.parse(response.body),asset=state.replica.assets[0];if(!asset)throw Error('No image fixture');
                await n.transfer({url:address+'/api/sync/assets/'+asset.hash,token:pair.token,owner:root.current,asset,direction:'download'});
                await n.transfer({url:address+'/api/sync/assets/'+asset.hash,token:pair.token,owner:root.current,asset,direction:'upload'});
                let rejected=false;try{await n.transfer({url:address+'/api/sync/assets/'+asset.hash,token:pair.token,owner:root.current,asset:{...asset,size:asset.size+1},direction:'download'})}catch{rejected=true}
                if(!rejected)throw Error('Corrupt metadata accepted');
                const c=ClosetTest;await c.bootstrap();c.setProfileContext(root.current);
                await c.updateDocument(root.current,doc=>{doc.binding={...pair,url:address,base:{collections:[],assets:[],colorLibrary:[],tombstones:[]}}});
                await c.synchronize(root.current,()=>{});
                const doc=(await c.readDocument(root.current)).value,collection=doc.replica.collections.find(c=>c.records.some(r=>r.kind==='item'&&r.data.asset===asset.hash)),record=collection.records.find(r=>r.kind==='item'&&r.data.asset===asset.hash);
                const edited=await c.androidClient.request('/api/closet',{method:'POST',headers:{'X-Closet-Profile':root.current},body:JSON.stringify({op:'save',kind:'item',collectionId:collection.id,id:record.id,version:record.version,data:{...record.data,notes:'Native bidirectional sync '+Date.now()}})});if(!edited.ok)throw Error(await edited.text());
                await c.synchronize(root.current,()=>{});if((await c.syncStatus(root.current)).dirty)throw Error('Native sync did not acknowledge changes');
                const confirmed=JSON.parse((await n.http({url:address+'/api/sync/state',method:'GET',token:pair.token})).body);if(!confirmed.replica.collections.flatMap(c=>c.records).some(r=>r.id===record.id&&r.data.notes.startsWith('Native bidirectional sync')))throw Error('PC did not receive local edit');
                return {records:state.replica.collections[0].records.length,hash:asset.hash};
            """.trimIndent())
        }
    }
    @Test fun zipRoundTripThroughDocumentPicker(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val backup=File(context.cacheDir,"instrument-backup.zip")
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK,Intent().setData(Uri.fromFile(backup))))
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK,Intent().setData(Uri.fromFile(backup))))
            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                ready(scenario);loadClient(scenario)
                runJs(scenario,"""
                    const n=window.Capacitor.Plugins.ClosetStorage,root=JSON.parse((await n.read({key:'root'})).value);
                    const {handle}=await n.beginFile({owner:root.current});await n.appendFile({handle,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII='});
                    const {asset}=await n.finishFile({handle,owner:root.current,name:'原图.png'});
                    const now=new Date().toISOString(),record={id:crypto.randomUUID(),kind:'item',version:1,createdAt:now,updatedAt:now,data:{name:'ZIP 原图单品',category:'top',color:'',asset:asset.hash,occasions:[],seasons:[],notes:'',archived:false}};
                    const manifest={format:'new-closet',schemaVersion:9,exportedAt:now,collection:{name:'验收衣橱'},records:[record],assets:[asset],colorLibrary:[]};
                    const saved=await n.exportArchive({owner:root.current,manifest,filename:'instrument-backup.zip'});if(!saved.saved)throw Error('Export cancelled');
                    const checked=await n.pickArchive();if(checked.manifest.assets[0].hash!==asset.hash)throw Error('Manifest changed');
                    const restoredOwner=crypto.randomUUID();await n.importStaged({handle:checked.handle,owner:restoredOwner});
                    const original=await (await fetch(window.Capacitor.convertFileSrc((await n.read({key:'root'})).filesRoot+'/media/'+restoredOwner+'/'+asset.hash))).arrayBuffer();
                    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original))).map(b=>b.toString(16).padStart(2,'0')).join('');
                    if(hash!==asset.hash)throw Error('ZIP changed original bytes');
                    await ClosetTest.bootstrap();const collectionId=await ClosetTest.androidClient.importArchive(checked.handle,checked.manifest,root.current);const restored=(await ClosetTest.readDocument(root.current)).value.replica.collections.find(c=>c.id===collectionId);if(restored.records[0].id!==record.id||restored.records[0].data.asset!==asset.hash)throw Error('ZIP records did not restore to a new wardrobe');return true;
                """.trimIndent())
            }
            ZipFile(backup).use { zip -> assertNotNull(zip.getEntry("manifest.json"));assertEquals(3,zip.size()) }
        } finally { Intents.release() }
    }
    @Test fun saveItemInActualInterface(){
        val itemName="手机离线验收-"+System.currentTimeMillis()
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        Intents.init()
        try {
        intending(hasAction(MediaStore.ACTION_IMAGE_CAPTURE)).respondWithFunction { intent ->
            val uri=intent.getParcelableExtra<Uri>(MediaStore.EXTRA_OUTPUT)!!
            context.contentResolver.openOutputStream(uri)!!.use { it.write(Base64.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWQAAAAASUVORK5CYII=",Base64.DEFAULT)) }
            Instrumentation.ActivityResult(Activity.RESULT_OK,null)
        }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            ready(scenario)
            eval(scenario,"document.querySelector('header button.main-action').click();true")
            runJs(scenario,"for(let i=0;i<100;i++){if(document.querySelector('#item-name')&&document.querySelector('.photo-actions button'))return true;await new Promise(r=>setTimeout(r,100))}throw Error('Item form did not open: '+document.body.innerText);")
            // File inputs require a real user gesture; evaluateJavascript().click() is intentionally blocked.
            eval(scenario,"document.querySelector('.photo-actions button').scrollIntoView({block:'center'});true")
            val point=JSONObject(eval(scenario,"(()=>{const r=document.querySelector('.photo-actions button').getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()"))
            val position=IntArray(2);scenario.onActivity { it.bridge.webView.getLocationOnScreen(position) }
            val time=SystemClock.uptimeMillis();val instrumentation=InstrumentationRegistry.getInstrumentation()
            for(action in listOf(MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP)){val event=MotionEvent.obtain(time,SystemClock.uptimeMillis(),action,position[0]+point.getDouble("x").toFloat(),position[1]+point.getDouble("y").toFloat(),0);instrumentation.sendPointerSync(event);event.recycle()}
            runJs(scenario,"for(let i=0;i<100;i++){if(document.querySelector('.photo-gallery-preview img'))return true;await new Promise(r=>setTimeout(r,100))}throw Error('Camera intent did not return the original photo');")
            Intents.intended(hasAction(MediaStore.ACTION_IMAGE_CAPTURE))
            eval(scenario,"const input=document.querySelector('#item-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,"+JSONObject.quote(itemName)+");input.dispatchEvent(new Event('input',{bubbles:true}));true")
            Thread.sleep(300)
            eval(scenario,"document.querySelector('.item-dialog form').requestSubmit();true")
            runJs(scenario,"""
                const n=window.Capacitor.Plugins.ClosetStorage;
                for(let i=0;i<100;i++){const root=JSON.parse((await n.read({key:'root'})).value);const doc=JSON.parse((await n.read({key:'profile:'+root.current})).value);const record=doc.replica.collections.flatMap(c=>c.records).find(r=>r.data.name===${JSONObject.quote(itemName)});if(record){if(!record.data.asset)throw Error('Camera photo missing from saved item');return true}await new Promise(r=>setTimeout(r,100))}throw Error('UI save did not persist');
            """.trimIndent())
            scenario.recreate();ready(scenario)
            runJs(scenario,"for(let i=0;i<100;i++){if(document.body.innerText.includes("+JSONObject.quote(itemName)+"))return true;await new Promise(r=>setTimeout(r,100))}throw Error('Reload did not show saved item');")
        }
        } finally { Intents.release() }
    }
    @Test fun verifyPreviouslySavedItem(){
        if(InstrumentationRegistry.getArguments().getString("checkUpgrade")!="true")return
        ActivityScenario.launch(MainActivity::class.java).use { scenario -> ready(scenario);runJs(scenario,"const n=window.Capacitor.Plugins.ClosetStorage;const root=JSON.parse((await n.read({key:'root'})).value);const doc=JSON.parse((await n.read({key:'profile:'+root.current})).value);if(!doc.replica.collections.flatMap(c=>c.records).some(r=>r.data.name?.startsWith('手机离线验收-')))throw Error('Upgrade lost previously saved item');return true;") }
    }
}
